import { SQL } from 'bun';
import { join } from 'node:path';
import { Cache, ROOT, readJSON, save, gh, ghPages, json, request } from './io';
import { periods, within } from './periods';
import {trafficEnd,trafficQuery} from './traffic';
import { secondaryFromEvidence } from './secondary';
import { pin, call, uint, pad, rpc, hex, resolveShare, historicalPrice } from './treasury';
export async function database() {
  const db=new SQL(process.env.KONG_PROD_RO_REPLICA_DB!,{max:1,connectionTimeout:15,idleTimeout:0});
  return db;
}
export async function preflight(output:string,cutoff:string,publish:boolean,offline=false) {
  const cfg=await readJSON(join(ROOT,'references/sources.json'));
  const required=['KONG_PROD_RO_REPLICA_DB','YEARN_PRICES_API_TOKEN',...Object.keys(cfg.chains).map(c=>'RPC_URL_'+c)];
  if(publish) required.push('ARTIFACTS_API_KEY');
  const secondary=['PLAUSIBLE_API_TOKEN','LINEAR_API_TOKEN','ENVIO_HYPERSYNC_API_KEY'];
  const result:any={cutoff,checkedAt:new Date().toISOString(),offline,credentials:{},access:[],errors:[],gaps:[]};
  if(!offline) {
    for(const name of [...required,...secondary]) {
      const present=!!process.env[name];result.credentials[name]=present?'present':'missing';
      if(!present) (required.includes(name)?result.errors:result.gaps).push(`Missing ${name}. Relaunch with openv codex (or openv claude), select ${name}, then resume this output directory. Running openv inside this session cannot update its environment.`);
    }
    if(!result.errors.length) {
      const checks=await Promise.allSettled([
        (async()=>{const db=await database();try{await db`select 1 as ok`;return 'Kong read access'}finally{await db.close({timeout:1})}})(),
        gh('user').then(()=> 'GitHub authentication'),
        gh(`repos/${cfg.budgetRepository}`).then(()=> 'Budget repository access'),
        ...Object.keys(cfg.chains).map(async c=>{if(Number(BigInt(await rpc(+c,'eth_chainId',[])))!==+c)throw Error(`Wrong RPC chain ${c}`);return `RPC_URL_${c} read access`;}),
        json(`${cfg.prices}/api/prices/historical/${Math.floor(+new Date(cutoff)/1000)}/ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`,{headers:{Authorization:`Bearer ${process.env.YEARN_PRICES_API_TOKEN}`}}).then(j=>{if(!Object.keys(j.coins??{}).length)throw Error('Yearn historical pricing returned no coverage');return 'Yearn historical pricing';})
      ]);
      checks.forEach((check,i)=>{
        const names=['Kong database','GitHub','Budget repository',...Object.keys(cfg.chains).map(c=>'RPC_URL_'+c),'Yearn pricing'];
        if(check.status==='fulfilled')result.access.push(check.value);
        else result.errors.push(`${names[i]} unavailable (${check.reason?.code||'request failed'}). Verify service access/network and credentials; resume with --output ${output}.`);
      });
    }
  }
  result.ok=!result.errors.length;await save(join(output,'preflight.json'),result);return result;
}
export async function collect(output:string,cutoff:string,cache:Cache) {
  const cfg=await readJSON(join(ROOT,'references/sources.json')),p=periods(cutoff),start=p[0].start;
  const sources:any[]=[];const gaps:any[]=[];
  const progress=()=>save(join(output,'collection-progress.json'),{cutoff,sources,gaps,updatedAt:new Date().toISOString(),status:'collecting'});
  const run=async(name:string,params:unknown,fn:()=>Promise<unknown>,core=false)=>{
    try {const record=await cache.get(name,params,fn);sources.push({name,id:record.id,retrievedAt:record.retrievedAt,digest:record.digest,core});await progress();console.log(JSON.stringify({collected:name,cache:record.id}));return record.data;}
    catch(e:any){gaps.push({source:name,core,scope:(params as any)?.chain??(params as any)?.args??(params as any)?.path,reason:cache.offline?e.message:(e.code||String(e.message||'Collection failed').replace(/https?:\/\/\S+/g,'[URL redacted]'))});await progress();console.log(JSON.stringify({failed:name,code:e.code||'collection-failed'}));return null;}
  };
  const query=async(sql:string,args:unknown[])=>{
    // Isolate connections so a closed socket cannot poison subsequent cached batches.
    const db=await database();
    try {
      return await db.begin('READ ONLY',async tx=>{await tx`SET LOCAL statement_timeout = '45000'`;return Array.from(await tx.unsafe(sql,args));});
    } finally {await db.close({timeout:1});}
  };
  const sqlTasks=[
    ['kong-universe',`SELECT chain_id,address,label,defaults FROM thing WHERE label IN ('vault','strategy','erc20') ORDER BY chain_id,address,label`,[]],
    ['kong-snapshots',`SELECT chain_id,address,snapshot,hook,block_number,block_time FROM snapshot WHERE block_time <= $1`,[cutoff]],
    ['kong-output-schema',`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='output'`,[]]
  ] as const;
  {
    for(const [name,sql,args] of sqlTasks) await run(name,{sql,args},()=>query(sql,[...args]),true);
    // Month-sized caches retain successful history even if another month's query fails.
    for(const m of p) {
      const args=[m.start,m.end];
      const outputSQL=`SELECT DISTINCT ON (chain_id,address,label,component,date_trunc('day',block_time AT TIME ZONE 'UTC')) chain_id,address,label,component,value,block_number,block_time FROM output WHERE block_time >= $1 AND block_time < $2 AND ((label = 'tvl-c' AND component IN ('tvl','totalAssets','priceUsd','delegated')) OR (label = 'apy-bwd-delta-pps' AND component = 'net')) ORDER BY chain_id,address,label,component,date_trunc('day',block_time AT TIME ZONE 'UTC'),block_time DESC`;
      await run('kong-series',{sql:outputSQL,args},()=>query(outputSQL,args),true);
      // Chain-sized batches follow the event/chain/time index and avoid one enormous transfer result.
      const logsSQL=`SELECT chain_id,address,event_name,args,hook,block_number,block_time,log_index,transaction_hash FROM evmlog WHERE block_time >= $1 AND block_time < $2 AND chain_id = $3 AND event_name IN ('StrategyReported','Reported','Harvested','Deposit','Withdraw') ORDER BY block_number,log_index`;
      for(const chain of Object.keys(cfg.chains).map(Number)) {
        const eventArgs=[...args,chain];
        await run('kong-events',{sql:logsSQL,args:eventArgs},()=>query(logsSQL,eventArgs),true);
      }
    }
  }
  // Raw org evidence remains private. Only reviewed aggregates may enter normalized inputs.
  const [repos]=await Promise.all([
    run('github-repositories',{org:cfg.githubOrg},()=>ghPages(`orgs/${cfg.githubOrg}/repos?type=all`)),
    run('budget-issues',{repo:cfg.budgetRepository,since:start},()=>ghPages(`repos/${cfg.budgetRepository}/issues?state=all&since=${start}`),true),
    ...cfg.organizationPaths.map((path:string)=>run('organization-document',{repo:cfg.organizationRepository,path},()=>gh(`repos/${cfg.organizationRepository}/contents/${path}`))),
    ...cfg.publicOrganizationSources.map((url:string)=>run('public-organization-source',{url},async()=>({url,body:await(await request(url)).text()}))),
    run('macro-fed',{start,cutoff},async()=>{
      const url=`${cfg.fedCSV}?id=DFF&cosd=${start.slice(0,10)}&coed=${cutoff.slice(0,10)}`;
      // FRED's CSV export is retrieved directly; never infer rates from a page description.
      return {url,body:await(await request(url)).text()};
    }),
    run('macro-stablecoins',{url:cfg.stablecoins},()=>json(cfg.stablecoins)),
    run('macro-defi-tvl',{url:cfg.defiTvl},()=>json(cfg.defiTvl))
  ]);
  if(repos) {
    // Pull requests are listed per repository, avoiding GitHub Search's 1,000-result cap.
    for(const repo of repos.filter((r:any)=>r.pushed_at>=start&&!r.fork)) {
      await run('github-pulls',{repo:repo.full_name,start,cutoff},async()=>{
        const result:any[]=[];
        for(let page=1;;page++) {
          const rows=await gh(`repos/${repo.full_name}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
          result.push(...rows.filter((r:any)=>r.merged_at&&within(r.merged_at,start,cutoff)));
          if(rows.length<100||rows.at(-1).updated_at<start)break;
        }return result;
      });
    }
  }
  if(process.env.LINEAR_API_TOKEN||cache.offline) await run('linear-issues',{start,cutoff},async()=>{
    const all:any[]=[];let after:string|null=null;
    do {
      const q=`query($after:String){ issues(first:100,after:$after,filter:{completedAt:{gte:"${start}",lt:"${cutoff}"}}){nodes{id completedAt createdAt updatedAt team{id name} labels{nodes{name}}} pageInfo{hasNextPage endCursor}}}`;
      const j=await json(cfg.linear,{method:'POST',headers:{Authorization:process.env.LINEAR_API_TOKEN!,'content-type':'application/json'},body:JSON.stringify({query:q,variables:{after}})});
      if(j.errors)throw Error('Linear query failed');all.push(...j.data.issues.nodes);
      after=j.data.issues.pageInfo.hasNextPage?j.data.issues.pageInfo.endCursor:null;
    }while(after);return all;
  });else gaps.push({source:'Linear',core:false,reason:'Missing LINEAR_API_TOKEN'});
  for(const m of p) {
    if(process.env.PLAUSIBLE_API_TOKEN||cache.offline) await run('plausible-month',{site:cfg.plausibleSite,...m,apiEnd:trafficEnd(m.end)},()=>trafficQuery(cfg,m));
  }
  if(!process.env.PLAUSIBLE_API_TOKEN&&!cache.offline)gaps.push({source:'Plausible',core:false,reason:'Missing PLAUSIBLE_API_TOKEN'});
  // Enumerate candidates afresh, then read actual balances at a block <= cutoff. Enumeration is not valuation.
  const addressCfg=await readJSON(join(ROOT,'references/treasury-addresses.json'));
  for(const [cid,accounts] of Object.entries(addressCfg.addresses)) {
    const chain=+cid;
    await run('treasury-balances',{chain,accounts,cutoff,pricingVersion:3},async()=>{
      const block=await pin(chain,cutoff,cache),rows:any[]=[],errors:any[]=[];
      const hosts:Record<number,string>={1:'https://eth.blockscout.com',10:'https://optimism.blockscout.com',8453:'https://base.blockscout.com',42161:'https://arbitrum.blockscout.com',137:'https://polygon.blockscout.com',100:'https://gnosis.blockscout.com'};
      for(const a of accounts as any[]) {
        if(!['headline','inflight','contingent'].includes(a.tier))continue;
        const candidates=new Set<string>([...(addressCfg.supplementTokens?.[cid]??[]),...(a.supplementTokens??[])].map(t=>t.toLowerCase()));
        let enumerationComplete=false;
        if(hosts[chain]) {
          let next:any=null;
          do {
            const params={chain,owner:a.address,next};
            const j=(await cache.get('treasury-token-enumeration',params,()=>json(`${hosts[chain]}/api/v2/addresses/${a.address}/tokens?${new URLSearchParams({type:'ERC-20',...(next??{})})}`))).data;
            for(const item of j.items??[]) candidates.add(item.token.address_hash.toLowerCase());
            next=j.next_page_params;
          }while(next);enumerationComplete=true;
        }
        const native=(await cache.get('native-balance',{chain,owner:a.address,block:block.number},()=>rpc(chain,'eth_getBalance',[a.address,hex(block.number)]))).data;
        rows.push({owner:a.address,tier:a.tier,token:'native',raw:native,block: block.number,enumerationComplete});
        for(const token of candidates) {
          try {
            const raw=uint(await call(chain,token,'0x70a08231'+pad(a.address),block.number,cache));
            if(raw===0n)continue;
            const decimals=Number(uint(await call(chain,token,'0x313ce567',block.number,cache)));
            if(decimals>36)throw Error('Unsupported token decimals');
            const resolved=await resolveShare(chain,token,raw,decimals,block.number,cache);
            let price:any=null;try{price=await historicalPrice(cfg.chains[cid],token,cutoff,cache,cfg.prices)}catch{}
            rows.push({owner:a.address,tier:a.tier,token,raw:raw.toString(),decimals,resolved,price,block:block.number,enumerationComplete});
          } catch(e:any) {
            errors.push({owner:a.address,token,reason:String(e.message||'Token read failed').replace(/https?:\/\/\S+/g,'[URL redacted]')});
          }
        }
      }return {block,rows,errors,coverage:'Current-token enumeration misses tokens disposed after a historical cutoff; reconcile against transfer logs before approving completeness.'};
    },true);
  }
  const result={cutoff,sources,gaps,completedAt:new Date().toISOString()};
  await save(join(output,'collection.json'),result);
  const candidate=await secondaryFromEvidence(result,cache.directory);
  await save(join(output,'secondary-candidates.json'),candidate);
  result.gaps.push(...candidate.gaps);await save(join(output,'collection.json'),result);return result;
}
