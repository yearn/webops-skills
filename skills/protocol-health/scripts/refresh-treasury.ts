import {join} from 'node:path';
import {Cache,readJSON,save,ROOT} from './io';
import {imported} from './reuse';
import {multicall} from './rpc-evidence';
import {pad,uint,pin,rpc,hex,historicalPrice,resolveShare} from './treasury';
const NATIVE:Record<number,string>={1:'0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',10:'0x4200000000000000000000000000000000000006',137:'0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',250:'0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83',8453:'0x4200000000000000000000000000000000000006',42161:'0x82af49447d8a07e3bd95bd0d56f35241523fbab1',747474:'0xee7d8bcfb72bc1880d0cf19822eb0a2e6577ab62'};
const CORE=['0xfeb4acf3df3cdea7399794d0869ef76a6efaff52','0x93a62da5a14c80f265dabc077fcee437b1a0efde','0xef77cc176c748d291efb6cdc982c5744fc7211c8'];
export const CASH_STABLES=new Set(['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48','0xdac17f958d2ee523a2206206994597c13d831ec7','0x6b175474e89094c44da98b954eedeac495271d0f','0xdc035d45d973e3ec169d2276ddab16f1e407384f']);
export const LIQUID_WRAPPERS=new Set(['0xa3931d71877c0e7a3148cb7eb4463524fec27fbd','0xbe53a109b494e5c9f97b9cd39fe969be68bf6204','0x696d02db93291651ed510704c9b286841d506987','0x863687e4e9751b57f38b4b0eba04744c72d0f7b8','0x028ec7330ff87667b6dfb0d94b954c820195336c','0xbf319ddc2edc1eb6fdf9910e39b37be221c8805f','0x92545bce636e6ee91d88d2d017182cd0bd2fc22e','0xae7d8db82480e6d8e3873ecbf22cf17b3d8a7308','0x182863131f9a4630ff9e27830d945b1413e347e8','0x19d3364a399d251e894ac732651be8b0e4e85001','0xa354f35829ae975e850e23e9615b11da1b3dc4de','0x3b27f92c0e212c671ea351827edf93db27cc0c65','0xda816459f1ab5631232fe5e97a05bbbb94970c95']);
export async function refreshTreasury(output:string,cache:Cache) {
  const prior=await imported(output,cache,'snapshot-latest.json'),positions=await imported(output,cache,'positions.json'),config=await readJSON(join(ROOT,'references/sources.json')),delta=await readJSON(join(output,'delta.json'));
  if(delta.errors.length)throw Error('Cannot refresh an incomplete transfer delta');
  const candidates=prior.data.rows.filter((r:any)=>!r.spamSuspect&&['headline','inflight','contingent'].includes(r.tier));
  const known=new Map(candidates.map((r:any)=>[`${r.chainId}:${r.account.toLowerCase()}:${r.token.toLowerCase()}:${r.kind}`,r]));
  const newTokens:any[]=[];
  for(const [cid,change] of Object.entries(delta.chains) as any)for(const log of change.logs)for(const owner of change.owners)if(log.from===owner||log.to===owner){
    if(!candidates.some((r:any)=>r.chainId===+cid&&r.account.toLowerCase()===owner&&r.token.toLowerCase()===log.token))newTokens.push({chain:+cid,owner,token:log.token,evidence:log.evidence});
  }
  const rows:any[]=[],errors:any[]=[],priceCache=new Map<string,any>();
  async function quote(chain:number,token:string) {
    const key=chain+':'+token.toLowerCase();if(priceCache.has(key))return priceCache.get(key);
    let p:any=null;try{p=await historicalPrice(config.chains[chain],token,cache.cutoff,cache,config.prices);}catch{}
    priceCache.set(key,p);return p;
  }
  for(const cid of [...new Set(candidates.map((r:any)=>r.chainId))] as number[]) {
    const block=await pin(cid,cache.cutoff,cache),part=candidates.filter((r:any)=>r.chainId===cid),calls:any[]=[];
    for(const r of part) {
      if(r.kind==='native')calls.push(null);
      else calls.push(r.kind==='splits-warehouse'?{target:'0x8fb66f38cf86a3d5e8768f8f1754a24a6c661fb8',data:'0x00fdd58e'+pad(r.account)+pad(BigInt(r.token))}:{target:r.token,data:'0x70a08231'+pad(r.account)});
    }
    const responses=await multicall(cid,calls.filter(Boolean),block.number,cache);let idx=0;
    for(let i=0;i<part.length;i++) {
      const old=part[i];let raw:bigint,readEvidence:string;
      try {
        if(!calls[i]){const r=await cache.get('native-balance',{chain:cid,owner:old.account,block:block.number},()=>rpc(cid,'eth_getBalance',[old.account,hex(block.number)]));raw=BigInt(r.data);readEvidence=r.id;}
        else{const r=responses[idx++];if(!r.success)throw Error('Balance read reverted');raw=uint(r.data);readEvidence=r.evidence;}
      }catch(e:any){errors.push({chain:cid,owner:old.account,token:old.token,reason:e.message});continue;}
      if(raw===0n)continue;
      const amount=Number(raw)/10**(old.decimals??18),token=old.kind==='native'?NATIVE[cid]:old.token;
      let price=await quote(cid,token),usd=price?amount*price.price:null,method=price?.valuationBasis;
      // Resolve at the new pinned block, never scale an old underlying/PPS ratio forward.
      let resolved:any=null;
      if(!price&&old.resolved&&old.kind!=='native') {
        try{
          resolved=await resolveShare(cid,old.token,raw,old.decimals,block.number,cache);
          for(let node=resolved?.underlying;node;node=node.underlying){const p=await quote(cid,node.token);if(p){usd=Number(BigInt(node.raw))/10**node.decimals*p.price;price=p;method='pinned wrapper conversion × '+p.valuationBasis;break;}}
        }catch{}
      }
      const ownership=old.usd>0&&old.headlineUsd>0?old.headlineUsd/old.usd:old.tier==='headline'?1:old.inflightShare??0;
      const committed=!!old.committed||old.tier==='contingent';
      const coreStable=cid===1&&CORE.includes(old.account.toLowerCase())&&(CASH_STABLES.has(old.token.toLowerCase())||LIQUID_WRAPPERS.has(old.token.toLowerCase()))&&!committed;
      let redeemable=1,liquidityEvidence:string|null=null;
      if(coreStable&&LIQUID_WRAPPERS.has(old.token.toLowerCase())) {
        const r=(await multicall(cid,[{target:old.token,data:'0xd905777e'+pad(old.account)}],block.number,cache))[0]; // maxRedeem(address)
        liquidityEvidence=r.evidence;
        if(r.success){try{redeemable=Math.min(1,Number(uint(r.data))/Number(raw));}catch{redeemable=0;}}
        else {
          const v2=(await multicall(cid,[{target:old.token,data:'0x75de2902'}],block.number,cache))[0];liquidityEvidence=v2.evidence;
          if(v2.success){try{redeemable=Math.min(1,Number(uint(v2.data))/Number(raw));}catch{redeemable=0;}}else redeemable=0;
        }
      }
      rows.push({chain:cid,owner:old.account,token:old.token,symbol:old.symbol,kind:old.kind,raw:raw.toString(),amount,decimals:old.decimals??18,assetClass:old.assetClass,tier:old.tier,ownership,committed,coreStable,redeemable,usd,price,method,observedAt:block.timestamp,block:block.number,blockHash:block.hash,evidence:[prior.evidence,readEvidence,...(price?[price.evidence]:[]),...(liquidityEvidence?[liquidityEvidence]:[])]});
    }
    await save(join(output,'treasury-refreshed.json'),{cutoff:cache.cutoff,rows,errors,newTokens});console.log(JSON.stringify({treasuryChain:cid,positions:rows.filter(r=>r.chain===cid).length,errors:errors.length}));
  }
  const summary={cutoff:cache.cutoff,rows,errors,newTokens,liquidCoreUsd:rows.filter(r=>r.coreStable&&r.usd!=null).reduce((s,r)=>s+r.usd*r.ownership*r.redeemable,0),liquidUnpriced:rows.filter(r=>r.coreStable&&r.usd==null).map(r=>({chain:r.chain,token:r.token,symbol:r.symbol})),ownedPricedUsd:rows.filter(r=>!r.committed&&r.usd!=null).reduce((s,r)=>s+r.usd*r.ownership,0)};
  await save(join(output,'treasury-refreshed.json'),summary);return summary;
}
if(import.meta.main){const output=process.argv[2],run=await readJSON(join(output,'run.json'));const keep=setInterval(()=>{},1000);try{await refreshTreasury(output,new Cache(join(output,'cache'),run.cutoff));}finally{clearInterval(keep)}}
