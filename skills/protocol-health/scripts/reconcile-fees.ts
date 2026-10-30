import {join} from 'node:path';
import {Cache,readJSON,save} from './io';
import {multicall} from './rpc-evidence';
import {pad,uint} from './treasury';
// Only exact transaction matches to harvest/report events are fees. Ordinary deposits into fee custodians are excluded.
export async function reconcileFees(output:string,cache:Cache){
 const cohort=await readJSON(join(output,'vaults-reconciled.json')),obs=await readJSON(join(output,'vault-observations.json')),mints=await readJSON(join(output,'fee-mints.json')),collection=await readJSON(join(output,'collection.json'));
 if(mints.errors.length)throw Error('Fee mint collection incomplete');
 const metadata=new Map(cohort.metadata.map((m:any)=>[m.id,m])),points=new Map<string,any>();
 for(const part of obs.months)for(const p of (await readJSON(part.file)).points)if(metadata.has(p.id))points.set(p.id+'@'+p.date.slice(0,10),p);
 const reports=new Map<string,any[]>(),deposits=new Set<string>();
 for(const s of collection.sources.filter((s:any)=>s.name==='kong-events'))for(const r of (await readJSON(join(cache.directory,s.id+'.json'))).data){
  const id=r.chain_id+':'+r.address.toLowerCase(),key=id+':'+r.transaction_hash;
  if(!metadata.has(id))continue;
  if(['StrategyReported','Reported','Harvested'].includes(r.event_name)){const list=reports.get(key)??[];list.push({...r,evidence:s.id});reports.set(key,list);}
  if(r.event_name==='Deposit')deposits.add(key);
 }
 const registry=await readJSON(join(import.meta.dir,'../references/treasury-addresses.json')),controlled=new Set<string>();
 for(const [chain,owners] of Object.entries(registry.addresses) as any)for(const a of owners)if(['headline','inflight'].includes(a.tier))controlled.add(chain+':'+a.address.toLowerCase());
 // Reviewed routing: Yearn Accountant -> Dumper; Curve factory governance -> yLockers Safe.
 controlled.add('1:0x5a74cb32d36f2f517db6f7b0a0591e09b22cde69');controlled.add('1:0x044f9c86a0da637a235e83564215dc271bc0defc');
 const routes=await readJSON(join(output,'fee-routing.json')).catch((e:any)=>{if(e.code==='ENOENT')return {rows:[],docs:[]};throw e;}),routingEvidence=new Map<string,string[]>();
 const provenCustodies=new Set(['0x590dd9399bb53f1085097399c3265c7137c1c4cf','0xbe7c7efc1ef3245d37e3157f76a512108d6d7ae6','0x01fe3347316b2223961b20689c65eaea71348e93','0x16388000546eded4d476bd2a4a374b5a16125bc1','0x1deb47dcc9a35ad454bf7f0fcdb03c09792c08c1']);
 for(const r of routes.rows){const route=r.routes.find((x:any)=>x.method==='feeRecipient');if(provenCustodies.has(route?.address)){controlled.add(r.id);routingEvidence.set(r.id,[route.evidence,...routes.docs]);}}
 const customerRoutes=new Set(['1:0x53acebb9470cfc9d231075154f5dcf1586a4c6fa','1:0xe5387cd454dcc542421c069c009d915ab9efaafd','1:0xaaafea48472f77563961cdb53291dedfb46f9040']);
 const shareQuotes=new Map<string,any>(),jobs:any[]=[];
 for(const chain of Object.values(mints.chains) as any[])for(const mint of chain.logs){const id=mint.chain+':'+mint.vault,m:any=metadata.get(id);if(!m||!reports.has(id+':'+mint.tx)||deposits.has(id+':'+mint.tx))continue;let p=points.get(id+'@'+mint.at.slice(0,10));if(!p&&mint.at.slice(0,10)===cache.cutoff.slice(0,10))p=obs.current.find((x:any)=>x.id===id);if(!p?.price)continue;if(p.pps>0)continue;jobs.push({mint,id,m,p});}
 let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<jobs.length){const {mint,id,m,p}=jobs[cursor++];const response=(await multicall(mint.chain,[{target:mint.vault,data:m.v3?'0x07a2d13a'+pad(10n**BigInt(m.decimals)):'0x99530b06'}],mint.block,cache))[0];try{if(response.success){const pps=Number(uint(response.data))/10**m.decimals;shareQuotes.set(id+':'+mint.block,{...p,pps,evidence:[...p.evidence,response.evidence]});}}catch{}}}));
 const fees:any[]=[],unresolved:any[]=[],excluded:any[]=[],recipients=new Map<string,number>();
 for(const chain of Object.values(mints.chains) as any[])for(const mint of chain.logs){
  const id=mint.chain+':'+mint.vault;if(!metadata.has(id))continue;
  const key=id+':'+mint.tx,events=reports.get(key);
  if(!events?.length){excluded.push({id,tx:mint.tx,reason:'No exact harvest/report event match; not asserted to be a fee'});continue;}
  if(deposits.has(key)){unresolved.push({id,tx:mint.tx,reason:'Transaction contains both deposit and harvest; fee mint attribution ambiguous'});continue;}
  const m:any=metadata.get(id),p=shareQuotes.get(id+':'+mint.block)??points.get(id+'@'+mint.at.slice(0,10));
  if(!p||!(p.pps>0)||!(p.price>0)){unresolved.push({id,tx:mint.tx,reason:'Matched fee mint lacks daily share valuation'});continue;}
  const usd=Number(BigInt(mint.raw))/10**m.decimals*p.pps*p.price;
  if(!Number.isFinite(usd)||usd>1e7){unresolved.push({id,tx:mint.tx,reason:'Fee valuation quality bound failed'});continue;}
  const recipient=mint.chain+':'+mint.recipient;recipients.set(recipient,(recipients.get(recipient)??0)+usd);
  if(customerRoutes.has(recipient)){excluded.push({id,tx:mint.tx,usd,reason:'Customer yield/recovery destination, not retained protocol fees'});continue;}
  if(!controlled.has(recipient)){unresolved.push({id,tx:mint.tx,recipient,usd,reason:'Recipient protocol ownership not established'});continue;}
  fees.push({id:mint.chain+':'+mint.tx+':'+mint.index,at:mint.at,vaultId:id,kind:'vault',basis:'retained-mint',grossUsd:null,retainedUsd:usd,distributedUsd:null,evidence:[...new Set([mint.evidence,...p.evidence,...events.map(e=>e.evidence),...(routingEvidence.get(recipient)??[])])]});
 }
 const result={cutoff:cache.cutoff,fees,unresolved,excluded,recipients:[...recipients].map(([id,usd])=>({id,usd})).sort((a,b)=>b.usd-a.usd),methodology:'Verified fee shares minted to proven Yearn fee custodians in exact harvest/report transactions. Valued at same-day share price and asset quote, with exact-mint-block share conversion when the daily share quote is absent; cutoff-day asset quotes use the prior completed day. These are retained protocol fee mints before intra-Yearn allocations, not gross fees charged to all users or DAO treasury receipts. Unknown recipients, ambiguous deposit+harvest transactions and unpriced fee mints are excluded and disclosed. Fee efficiency is an identified-fee lower bound, not full fee yield; yLockers income excluded. Source minted amounts are not added to the separate protocol-wide TeamAccountant ledger.'};
 await save(join(output,'fees-reconciled.json'),result);console.log(JSON.stringify({fees:fees.length,usd:fees.reduce((s,f)=>s+f.retainedUsd,0),unresolved:unresolved.length,excluded:excluded.length,recipients:result.recipients.slice(0,12)}));return result;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await reconcileFees(out,new Cache(join(out,'cache'),run.cutoff));}
