import {periods} from './periods';
import {join} from 'node:path';
import {Cache,readJSON,save,ROOT} from './io';
import {rpc,hex,uint,pin} from './treasury';
import {multicall} from './rpc-evidence';
import {batchPrices} from './prices';
export async function observations(output:string,cache:Cache) {
  const prep=await readJSON(join(output,'vault-preparation.json')),metadata=prep.metadata.filter((m:any)=>!m.excluded),meta=new Map(metadata.map((m:any)=>[m.id,m]));
  const blockAudit=await readJSON(join(output,'block-audit.json')),blocks=new Map<string,any>();
  for(const batch of blockAudit.references)for(const b of batch.blocks)blocks.set(batch.chain+':'+b.number,{...b,evidence:batch.id});
  const points=new Map<string,any>(),seeds=new Map<string,any>(),pricesByDay=new Map<string,any>();let reclassified=0;
  for(const part of prep.series)for(const p of (await readJSON(part.file)).points) {
    const m:any=meta.get(p.id);if(!m||p.usd==null||p.valuationError)continue;
    const b=blocks.get(m.chain+':'+p.block);if(!b)continue;
    const actualDay=b.timestamp.slice(0,10);
    if(p.price>0&&p.usd<=1e10){const pk=m.chain+':'+m.asset+'@'+actualDay,prior=pricesByDay.get(pk);if(!prior||prior.observedAt<b.timestamp)pricesByDay.set(pk,{price:p.price,observedAt:b.timestamp,evidence:p.evidence,valuationDate:actualDay});}if(actualDay!==p.date.slice(0,10))reclassified++;
    if(actualDay>=cache.cutoff.slice(0,10))continue;
    const id=p.id+'@'+actualDay,old=points.get(id);
    if(!old||old.observedAt<b.timestamp)points.set(id,{...p,date:actualDay+'T00:00:00.000Z',valuationDate:p.date.slice(0,10),observedAt:b.timestamp,blockHash:b.hash,evidence:[...p.evidence,b.evidence]});
    seeds.set(m.chain+':'+actualDay,b);
  }
  function fallbackPrice(m:any,day:string){for(const date of [day,new Date(Date.parse(day)-86400000).toISOString().slice(0,10)]){const p=pricesByDay.get(m.chain+':'+m.asset+'@'+date);if(p)return {...p,method:'Kong daily historical quote, valuation day '+date};}return null;}
  const config=await readJSON(join(ROOT,'references/sources.json'));
  const genesis=Date.parse(periods(cache.cutoff)[0].start),lastDay=Date.parse(cache.cutoff.slice(0,10)),missing=new Map<string,any>();
  for(let t=genesis;t<lastDay;t+=86400000)for(const m of metadata) {
    if(Date.parse(m.activation)>t+86400000-1)continue;const day=new Date(t).toISOString().slice(0,10),k=m.id+'@'+day;
    if(!points.has(k)){const groupKey=m.chain+':'+day,group=missing.get(groupKey)??{chain:m.chain,day,metadata:[]};group.metadata.push(m);missing.set(groupKey,group);}
  }
  await save(join(output,'observation-progress.json'),{cutoff:cache.cutoff,reclassified,existing:points.size,missingGroups:missing.size,missingVaultDays:[...missing.values()].reduce((s,g)=>s+g.metadata.length,0)});
  const blockByDay=new Map<string,any>();
  async function atDay(chain:number,day:string) {
    const groupKey=chain+':'+day;if(blockByDay.has(groupKey))return blockByDay.get(groupKey);
    const record=await cache.get('historical-day-block',{chain,day},async()=>{
      const target=Date.parse(day+'T23:59:59.000Z')/1000,closest=[...seeds.entries()].filter(([k])=>k.startsWith(chain+':')).map(([,v])=>v).sort((a,b)=>Math.abs(Date.parse(a.timestamp)/1000-target)-Math.abs(Date.parse(b.timestamp)/1000-target))[0];
      const head=await pin(chain,cache.cutoff,cache);let guess=closest?.number??head.number;
      const stepSeconds:Record<number,number>={1:12,10:2,100:5,137:2,146:0.5,8453:2,42161:0.25,747474:1};
      if(closest)guess=Math.max(1,Math.min(head.number,Math.round(closest.number+(target-Date.parse(closest.timestamp)/1000)/(stepSeconds[chain]??2))));
      const get=async(n:number)=>{const existing=blocks.get(chain+':'+n);if(existing)return {number:n,timestamp:Date.parse(existing.timestamp)/1000,hash:existing.hash};const r=await cache.get('block-reference',{chain,number:n},()=>rpc(chain,'eth_getBlockByNumber',[hex(n),false]));return {number:n,timestamp:Number(BigInt(r.data.timestamp)),hash:r.data.hash};};
      const gb=await get(guess);if(gb.timestamp<=target){const next=guess===head.number?null:await get(guess+1);if(!next||next.timestamp>target)return {number:guess,timestamp:new Date(gb.timestamp*1000).toISOString(),hash:gb.hash};}
      let width=1000,lo=Math.max(0,guess-width),hi=Math.min(head.number,guess+width);
      while((await get(lo)).timestamp>target){width*=2;lo=Math.max(0,guess-width);}
      while(hi<head.number&&(await get(hi)).timestamp<=target){width*=2;hi=Math.min(head.number,guess+width);}
      while(lo<hi){const mid=Math.ceil((lo+hi)/2),b=await get(mid);if(b.timestamp<=target)lo=mid;else hi=mid-1;}
      const b=await get(lo);return {number:lo,timestamp:new Date(b.timestamp*1000).toISOString(),hash:b.hash};
    });const b={...record.data,evidence:record.id};blockByDay.set(groupKey,b);return b;
  }
  const jobs=[...missing.values()],errors:any[]=[];let cursor=0,done=0;
  async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];try{
    const b=await atDay(job.chain,job.day),calls=job.metadata.map((m:any)=>({target:m.address,data:'0x01e1d114'})),values=await multicall(job.chain,calls,b.number,cache),priceRequests:any[]=[];
    for(let i=0;i<job.metadata.length;i++){
      const m=job.metadata[i],r=values[i];
      if(!r.success||r.data==='0x') {
        const code=(await cache.get('code-at-block',{chain:m.chain,address:m.address,block:b.number},()=>rpc(m.chain,'eth_getCode',[m.address,hex(b.number)]))).data;
        if(code==='0x'){points.set(m.id+'@'+job.day,{id:m.id,date:job.day+'T00:00:00.000Z',assets:0,usd:0,price:null,observedAt:b.timestamp,block:b.number,blockHash:b.hash,evidence:[b.evidence,r.evidence],zeroReason:'Contract not deployed at this block'});continue;}
        errors.push({id:m.id,date:job.day,reason:'Historical asset read unavailable'});continue;
      }
      const assets=Number(uint(r.data))/10**m.decimals;
      points.set(m.id+'@'+job.day,{id:m.id,date:job.day+'T00:00:00.000Z',assets,usd:assets===0?0:null,price:null,observedAt:b.timestamp,block:b.number,blockHash:b.hash,evidence:[b.evidence,r.evidence]});
      if(assets>0&&m.asset)priceRequests.push({key:config.chains[m.chain]+':'+m.asset,timestamp:Date.parse(job.day)/1000+86399});
    }
    const quotes=await batchPrices(priceRequests,cache);
    for(const m of job.metadata){const p=points.get(m.id+'@'+job.day);if(!p||p.assets===0||p.usd!=null)continue;const q=quotes.get(config.chains[m.chain]+':'+m.asset+':'+(Date.parse(job.day)/1000+86399));if(q){p.usd=p.assets*q.price;p.price=q.price;p.evidence.push(q.evidence);}else {const fallback=fallbackPrice(m,job.day);if(fallback){p.usd=p.assets*fallback.price;p.price=fallback.price;p.evidence.push(...fallback.evidence);p.priceFallback=fallback.method;}else errors.push({id:m.id,date:job.day,reason:'Historical price unavailable',assets:p.assets,asset:m.asset});}}
  }catch(e:any){errors.push({chain:job.chain,date:job.day,reason:e.message});}done++;if(done%10===0){console.log(JSON.stringify({patchedGroups:done,total:jobs.length,errors:errors.length}));await save(join(output,'observation-progress.json'),{cutoff:cache.cutoff,reclassified,existing:points.size,patchedGroups:done,totalGroups:jobs.length,errors});}}}
  await Promise.all(Array.from({length:4},worker));
  const current:any[]=[],currentErrors:any[]=[];
  for(const chain of [...new Set(metadata.map((m:any)=>m.chain))] as number[]) {
    const group=metadata.filter((m:any)=>m.chain===chain),b=await pin(chain,cache.cutoff,cache),results=await multicall(chain,group.map((m:any)=>({target:m.address,data:'0x01e1d114'})),b.number,cache);
    const requests:any[]=[];
    for(let i=0;i<group.length;i++){const m=group[i],r=results[i];if(!r.success||r.data==='0x'){currentErrors.push({id:m.id,reason:'Cutoff totalAssets read unavailable'});continue;}const assets=Number(uint(r.data))/10**m.decimals;current.push({id:m.id,assets,usd:assets===0?0:null,price:null,observedAt:b.timestamp,block:b.number,blockHash:b.hash,evidence:[r.evidence]});if(assets>0)requests.push({key:config.chains[chain]+':'+m.asset,timestamp:Math.floor(Date.parse(cache.cutoff)/86400000)*86400-1});}
    const quotes=await batchPrices(requests,cache);
    for(const p of current.filter(p=>(meta.get(p.id) as any).chain===chain&&p.assets>0)){const m:any=meta.get(p.id),q=quotes.get(config.chains[chain]+':'+m.asset+':'+(Math.floor(Date.parse(cache.cutoff)/86400000)*86400-1));if(q){p.usd=p.assets*q.price;p.price=q.price;p.valuedAt=new Date(q.timestamp*1000).toISOString();p.evidence.push(q.evidence);}else {const fallback=fallbackPrice(m,new Date(Math.floor(Date.parse(cache.cutoff)/86400000)*86400000-1).toISOString().slice(0,10));if(fallback){p.usd=p.assets*fallback.price;p.price=fallback.price;p.valuedAt=fallback.valuationDate+'T23:59:59.000Z';p.priceFallback=fallback.method;p.evidence.push(...fallback.evidence);}else currentErrors.push({id:p.id,reason:'Cutoff valuation unavailable',assets:p.assets,asset:m.asset});}}
    console.log(JSON.stringify({currentChain:chain,read:group.length,errors:currentErrors.length}));
  }
  const months:any[]=[];for(const ym of prep.series.map((s:any)=>s.period)){const list=[...points.values()].filter(p=>p.date.startsWith(ym));const file=join(output,'vault-observations',ym+'.json');await save(file,{points:list});months.push({period:ym,file,count:list.length});}
  const result={cutoff:cache.cutoff,metadata:prep.metadata,months,current,errors,currentErrors,reclassified};await save(join(output,'vault-observations.json'),result);return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await observations(out,new Cache(join(out,'cache'),run.cutoff));}
