import {periods} from './periods';
import {join} from 'node:path';
import {Cache,readJSON,save} from './io';
import {pad,pin,hex,rpc} from './treasury';
import {multicall} from './rpc-evidence';
const id=(chain:number,a:string)=>chain+':'+a.toLowerCase();
export async function normalizeVaults(output:string,cache:Cache) {
  const data=await readJSON(join(output,'vault-observations.json')),metadata=data.metadata,byMeta=new Map(metadata.map((m:any)=>[m.id,m])),excluded=new Map<string,string>();
  for(const m of metadata)if(m.excluded)excluded.set(m.id,m.excluded);
  for(const e of data.errors)if(e.id)excluded.set(e.id,'Incomplete historical valuation coverage: '+e.reason);
  for(const e of data.currentErrors)excluded.set(e.id,'Cutoff valuation unavailable; excluded consistently from the historical matched cohort');
  const rawPoints:any[]=[];for(const part of data.months)rawPoints.push(...(await readJSON(part.file)).points);
  const allByKey=new Map(rawPoints.map(p=>[p.id+'@'+p.date.slice(0,10),p]));
  const since=Date.parse(periods(cache.cutoff)[0].start),end=Date.parse(cache.cutoff.slice(0,10));
  for(const m of metadata)if(!excluded.has(m.id))for(let t=since;t<end;t+=86400000){if(Date.parse(m.activation)>t+86400000-1)continue;const p:any=allByKey.get(m.id+'@'+new Date(t).toISOString().slice(0,10));if(!p||p.usd==null||!Number.isFinite(p.usd)||p.usd<0||p.usd>1e10){excluded.set(m.id,'Historical daily observations or valuation failed coverage/quality checks');break;}}
  const included=metadata.filter((m:any)=>!excluded.has(m.id)),includedIds=new Set(included.map((m:any)=>m.id));
  const points=rawPoints.filter(p=>includedIds.has(p.id)),current=data.current.filter((p:any)=>includedIds.has(p.id));
  const catalogRef=await readJSON(join(output,'catalog-reference.json')),catalog=(await readJSON(join(cache.directory,catalogRef.id+'.json'))).data;
  const targets=new Map<string,string>();for(const r of catalog){const target=r.hook?.aggregateTvlTarget;if(target?.address&&target?.chainId)targets.set(id(r.chain_id,r.address),id(target.chainId,target.address));}
  targets.set('1:0x36822d0b11f4594380181ce6e76bd4986d46c389','1:0xa354f35829ae975e850e23e9615b11da1b3dc4de');
  targets.set('1:0x9084b5a98e3b4b257affd82ae4a1753f87906dce','1:0x5b8c556b8b2a78696f0b9b830b3d67623122e270');
  function targetFor(chain:number,strategy:string):string|null {
    let target=id(chain,strategy),visited=new Set<string>();
    while(!visited.has(target)) {visited.add(target);const m:any=byMeta.get(target);if(m?.wrapperTarget){target=m.wrapperTarget;continue;}if(includedIds.has(target))return target;const next=targets.get(target);if(!next)return null;target=next;}
    return null;
  }
  const manifest=await readJSON(join(output,'collection.json')),debtRef=await readJSON(join(output,'debt-history-reference.json'));
  const debt=(await readJSON(join(cache.directory,debtRef.id+'.json'))).data;
  const events=new Map<string,any[]>(),pairs=new Map<string,any>();
  function add(r:any,evidence:string,kind:string){const parent=id(r.chain_id,r.address);if(!includedIds.has(parent)||!r.args?.strategy)return;const borrower=r.args.strategy.toLowerCase(),target=targetFor(r.chain_id,borrower);if(!target||target===parent)return;
    const key=parent+':'+borrower;pairs.set(key,{key,parent,chain:r.chain_id,borrower,target});
    const amount=kind==='DebtUpdated'?r.args.new_debt:(r.args.current_debt??r.args.totalDebt);
    if(amount==null)return;const list=events.get(parent)??[];list.push({borrower,raw:amount,block:Number(r.block_number),index:r.log_index,evidence});events.set(parent,list);
  }
  for(const r of debt)add(r,debtRef.id,'DebtUpdated');
  for(const s of manifest.sources.filter((s:any)=>s.name==='kong-events')){const record=await readJSON(join(cache.directory,s.id+'.json'));for(const r of record.data)if(r.event_name==='StrategyReported')add(r,s.id,'StrategyReported');}
  for(const r of catalog){const parent=id(r.chain_id,r.address);if(!includedIds.has(parent))continue;for(const d of r.hook?.debts??[]){if(!d.strategy)continue;const target=targetFor(r.chain_id,d.strategy);if(target&&target!==parent){const borrower=d.strategy.toLowerCase(),key=parent+':'+borrower;pairs.set(key,{key,parent,chain:r.chain_id,borrower,target});}}}
  const opening=new Map<string,any>(),closing=new Map<string,any>(),errors:any[]=[];
  function debtWord(m:any,data:string) {const word=m.v3?2:(/^0\.2\./.test(m.apiVersion??'')?5:6);const body=data.slice(2);if(body.length<(word+1)*64)throw Error('Debt tuple too short');return BigInt('0x'+body.slice(word*64,(word+1)*64)).toString();}
  for(const chain of [...new Set(included.map((m:any)=>m.chain))] as number[]) {
    const group=[...pairs.values()].filter(p=>p.chain===chain),first=await pin(chain,periods(cache.cutoff)[0].start,cache),last=await pin(chain,cache.cutoff,cache);
    for(const [block,dest] of [[first,opening],[last,closing]] as any[]) {
      const calls=group.map(p=>({target:(byMeta.get(p.parent) as any).address,data:'0x39ebf823'+pad(p.borrower)})),rows=await multicall(chain,calls,block.number,cache);
      group.forEach((p,i)=>{const m:any=byMeta.get(p.parent),r=rows[i];if(!r.success||r.data==='0x'){if(block===first&&Date.parse(m.activation)>Date.parse(first.timestamp))dest.set(p.key,{raw:'0',evidence:r.evidence});else errors.push({parent:p.parent,borrower:p.borrower,block:block.number,reason:'Debt read unavailable'});}else{try{dest.set(p.key,{raw:debtWord(m,r.data),evidence:r.evidence});}catch(e:any){errors.push({parent:p.parent,borrower:p.borrower,block:block.number,reason:e.message});}}});
    }
  }
  if(errors.length)await save(join(output,'debt-read-errors.json'),errors);
  const overlapByPoint=new Map<string,any[]>();
  for(const m of included) {
    const refs=[...pairs.values()].filter(p=>p.parent===m.id),list=(events.get(m.id)??[]).sort((a,b)=>a.block-b.block||a.index-b.index),state=new Map<string,any>();let cursor=0;
    for(const p of refs)state.set(p.borrower,opening.get(p.key)??{raw:'0',evidence:null});
    const samples=points.filter(p=>p.id===m.id).sort((a,b)=>a.block-b.block);
    for(const p of samples){while(cursor<list.length&&list[cursor].block<=p.block){const e=list[cursor++];state.set(e.borrower,e);}
      const deductions:any[]=[];for(const route of refs){const debt=state.get(route.borrower);if(!debt?.evidence||!p.price)continue;const usd=Number(BigInt(debt.raw))/10**m.decimals*p.price;if(usd>0)deductions.push({target:route.target,usd,kind:'nested-vault',evidence:debt.evidence,method:targets.has(id(m.chain,route.borrower))?'Reviewed indirect target; debt-value overlap estimate':'Direct vault debt'});}overlapByPoint.set(m.id+'@'+p.date.slice(0,10),deductions);
    }
  }
  // V2 withdrawals update strategy debt without a StrategyReported event. Read every sampled V2 book debt at the exact observation block.
  const archiveGroups=new Map<string,{chain:number;block:number;items:any[]}>();
  for(const p of points){const m:any=byMeta.get(p.id);if(m.v3)continue;const routes=[...pairs.values()].filter(r=>r.parent===p.id);if(!routes.length)continue;const k=m.chain+':'+p.block,g=archiveGroups.get(k)??{chain:m.chain,block:p.block,items:[]};for(const route of routes)g.items.push({p,m,route});archiveGroups.set(k,g);}
  const tasks=[...archiveGroups.values()];let next=0,finished=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<tasks.length){const g=tasks[next++],responses=await multicall(g.chain,g.items.map(({m,route})=>({target:m.address,data:'0x39ebf823'+pad(route.borrower)})),g.block,cache),perPoint=new Map<string,any[]>();g.items.forEach(({p,m,route},i)=>{const r=responses[i],k=p.id+'@'+p.date.slice(0,10),list=perPoint.get(k)??[];try{if(!r.success)throw Error('Historical V2 debt unavailable');const raw=debtWord(m,r.data),usd=Number(BigInt(raw))/10**m.decimals*p.price;if(usd>0)list.push({target:route.target,usd,kind:'nested-vault',evidence:r.evidence});}catch(e:any){errors.push({parent:m.id,block:g.block,reason:e.message});}perPoint.set(k,list);});for(const [k,list] of perPoint)overlapByPoint.set(k,list);if(++finished%50===0)console.log(JSON.stringify({v2DebtBlocks:finished,total:tasks.length}));}}));
  const byDate=new Map<string,any[]>();for(const p of points){const list=byDate.get(p.date)??[];list.push(p);byDate.set(p.date,list);}
  const caps:any[]=[];
  function holdings(samples:any[],date:string,current=false) {
    const result=samples.map(p=>({id:p.id,usd:p.usd,observedAt:p.observedAt,block:p.block,overlaps:[] as any[],evidence:[...new Set(p.evidence)]}));const rows=new Map(result.map(h=>[h.id,h])),incoming=new Map<string,number>();
    for(const p of samples){const m:any=byMeta.get(p.id),row=rows.get(p.id)!;let candidates=overlapByPoint.get(p.id+'@'+date.slice(0,10))??[];
      if(current){candidates=[];for(const route of pairs.values())if(route.parent===p.id){const d=closing.get(route.key);if(d&&p.price)candidates.push({target:route.target,usd:Number(BigInt(d.raw))/10**m.decimals*p.price,kind:'nested-vault',evidence:d.evidence});}}
      const aggregate=new Map<string,any>();for(const e of candidates){if(!rows.has(e.target)||e.usd<=0)continue;const old=aggregate.get(e.target)??{target:e.target,usd:0,kind:'nested-vault',evidence:[]};old.usd+=e.usd;old.evidence.push(e.evidence);aggregate.set(e.target,old);}
      let available=row.usd;
      for(const e of aggregate.values()) {const target=rows.get(e.target)!,targetLeft=Math.max(0,target.usd-(incoming.get(e.target)??0)),usd=Math.max(0,Math.min(e.usd,available,targetLeft));if(usd<e.usd-0.01)caps.push({date,parent:p.id,target:e.target,requested:e.usd,applied:usd});if(usd>0){row.overlaps.push({target:e.target,usd,kind:e.kind});row.evidence.push(...e.evidence);incoming.set(e.target,(incoming.get(e.target)??0)+usd);available-=usd;}}
      row.evidence=[...new Set(row.evidence)];
    }return result;
  }
  const daily=[...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,list])=>({date,holdings:holdings(list,date)}));
  const result={cutoff:cache.cutoff,vaults:metadata.map((m:any)=>({id:m.id,activation:m.activation,...(excluded.has(m.id)?{excluded:excluded.get(m.id)}:{})})),metadata:included,current:holdings(current,cache.cutoff,true),daily,coverage:{registryCount:metadata.length,includedCount:included.length,excluded:[...excluded].map(([id,reason])=>({id,reason})),historicalUnavailableVaultDays:data.errors.length,currentUnvaluedVaults:data.currentErrors.length,debtRoutes:pairs.size,cappedOverlapObservations:caps.length,methodology:'Matched cohort excludes every vault with unresolved cutoff or historical valuation, bridge/pre-deposit placeholders, external framework projects, redundant wrappers and legacy Fantom. Historical points use verified actual block timestamps. Nested exposure uses historical V3 debt events, cutoff/opening debt reads, and reviewed target mappings. Deductions are bounded by included parent and target balances; no standalone curation headline TVL is added. Historical cohort totals are not full-protocol TVL.'},debtErrors:errors,overlapCaps:caps};
  await save(join(output,'vaults-reconciled.json'),result);console.log(JSON.stringify({cohort:included.length,excluded:excluded.size,debtRoutes:pairs.size,caps:caps.length,debtErrors:errors.length}));return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await normalizeVaults(out,new Cache(join(out,'cache'),run.cutoff));}
