import {periods} from './periods';
import {join} from 'node:path';
import {Cache,readJSON,save,json} from './io';
import {pin,pad} from './treasury';
import {TRANSFER} from './rpc-evidence';
const ZERO='0x'+'0'.repeat(64);
export async function collectFeeMints(output:string,cache:Cache) {
  const catalog=await readJSON(join(cache.directory,(await readJSON(join(output,'catalog-reference.json'))).id+'.json'));
  const sources=await readJSON(join(output,'collection.json')),ur=await readJSON(join(cache.directory,sources.sources.find((s:any)=>s.name==='kong-universe').id+'.json'));
  const vaults=ur.data.filter((r:any)=>r.label==='vault'&&(r.defaults.yearn||r.defaults.origin==='yearn'));
  const byId=new Map(catalog.data.map((r:any)=>[r.chain_id+':'+r.address.toLowerCase(),r]));
  const addresses=await readJSON(join(import.meta.dir,'../references/treasury-addresses.json'));
  const config=await readJSON(join(import.meta.dir,'../references/sources.json'));
  const result:any={cutoff:cache.cutoff,chains:{},errors:[]};
  for(const cid of Object.keys(config.chains)) {
    const chain=+cid,part=vaults.filter((r:any)=>r.chain_id===chain),end=await pin(chain,cache.cutoff,cache);
    const recipients=new Set<string>((addresses.addresses[cid]??[]).filter((a:any)=>['headline','inflight'].includes(a.tier)).map((a:any)=>a.address.toLowerCase()));
    for(const v of part){const s:any=(byId.get(chain+':'+v.address.toLowerCase()) as any)?.snapshot??{};for(const name of ['accountant','rewards','performanceFeeRecipient'])if(s[name]&&!/^0x0{40}$/i.test(s[name]))recipients.add(s[name].toLowerCase());}
    // Use block timestamps already present in the first month's vault observations to bound the start.
    let from=0;const first=await readJSON(join(cache.directory,sources.sources.find((s:any)=>s.name==='kong-series').id+'.json'));
    const firstBlocks=first.data.filter((r:any)=>r.chain_id===chain).map((r:any)=>Number(r.block_number));
    if(!firstBlocks.length){result.errors.push({chain,reason:'No starting block coverage'});continue;}
    // Include the whole opening UTC day; a binary-search pin avoids dropping early-day harvests.
    from=(await pin(chain,periods(cache.cutoff)[0].start,cache)).number;
    const logs:any[]=[];const evidence:string[]=[];
    try {
      for(let cursor=from;cursor<=end.number;) {
        const body={from_block:cursor,to_block:end.number+1,logs:[{address:part.map((v:any)=>v.address.toLowerCase()),topics:[[TRANSFER],[ZERO],[...recipients].map(a=>'0x'+pad(a))]}],field_selection:{log:['block_number','transaction_hash','log_index','address','topic1','topic2','topic3','data'],block:['number','timestamp']}};
        const record=await cache.get('fee-share-mints',{chain,body},()=>json(`https://${chain}.hypersync.xyz/query`,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${process.env.ENVIO_HYPERSYNC_API_KEY}`},body:JSON.stringify(body)}));evidence.push(record.id);
        const times=new Map();for(const chunk of record.data.data??[])for(const b of chunk.blocks??[])times.set(b.number,Number(BigInt(b.timestamp)));
        for(const chunk of record.data.data??[])for(const l of chunk.logs??[])if(!l.topic3)logs.push({chain,vault:l.address.toLowerCase(),recipient:'0x'+l.topic2.slice(-40).toLowerCase(),raw:BigInt(l.data).toString(),block:l.block_number,at:new Date(Number(times.get(l.block_number))*1000).toISOString(),tx:l.transaction_hash,index:l.log_index,evidence:record.id});
        const next=record.data.next_block;if(!(next>cursor))throw Error('Fee mint scan did not advance');cursor=next;
      }
      result.chains[cid]={recipients:[...recipients],logs,evidence};
    }catch(e:any){result.errors.push({chain,reason:e.message});}
    await save(join(output,'fee-mints.json'),result);console.log(JSON.stringify({feeMintChain:chain,records:logs.length,errors:result.errors.length}));
  }
  return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json')),keep=setInterval(()=>{},1000);try{await collectFeeMints(out,new Cache(join(out,'cache'),run.cutoff));}finally{clearInterval(keep)}}
