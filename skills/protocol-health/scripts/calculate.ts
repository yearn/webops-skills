import { periods, quarters, within } from './periods';
export type Ref={evidence:string[]};
export type Holding=Ref & {id:string;usd:number;observedAt:string;block:number;overlaps:{target:string;usd:number;kind:'nested-vault'|'wrapper'|'curation'}[]};
export type Fee=Ref & {id:string;at:string;vaultId:string|null;kind:'vault'|'ylockers';basis?:'retained-mint';grossUsd:number|null;retainedUsd:number;distributedUsd:number|null};
export type Cash=Ref & {id:string;at:string;usd:number;from:string;to:string;daoCashSettlement?:boolean;kind:'spending'|'receipt'|'internal'|'asset-swap'};
export type Budget=Ref & {id:string;team:string;line:string;start:string;end:string;usd:number;approvedAt:string;supersedes?:string[]};
export type Treasury=Ref & {id:string;usd:number|null;liquid:boolean;committed:boolean;ownToken:boolean;observedAt:string;valuedAt:string;block:number;valuationGap?:string;representationOf?:string};
export type Inputs={
  version:1;cutoff:string;
  vaults:{id:string;activation:string;excluded?:string}[];
  current:Holding[];
  daily:{date:string;holdings:Holding[]}[];
  fees:Fee[];cash:Cash[];budgets:Budget[];treasury:Treasury[];
  accountingPeriods?:(Ref & {id:number;label:string;start:string;end:string;complete:boolean;protocolRevenueUsd:number;recordedCostsUsd:number})[];
  reportScope?:{vaults:any;fees:any;treasury:any;methodology:string;publicSources:{title:string;url:string}[]};
  controlledAccounts:string[];
  coverage:{feesThrough:string;cashThrough:string;budgetsThrough:string;treasuryEnumerationComplete:boolean;reviewNotes:Ref & {methodology:string}};
  secondary?:{
    visitors?:{month:string;value:number;evidence:string[]}[];
    mergedPRs?:{at:string;evidence:string[]}[];
    linearDone?:{at:string;evidence:string[]}[];
    apy?:{vaultId:string;value:number;evidence:string[]}[];
    depositors?:Ref & {count:number;top10Share:number;coveredVaults:string[];methodology:string};
    flows?: (Ref & {id:string;at:string;vaultId:string;kind:'deposit'|'withdrawal';usd:number;internal:boolean})[];
    macro?:{at:string;fed:number|null;stableSupplyUsd:number|null;defiTvlUsd:number|null;evidence:string[]}[];
    partners?:Ref & {count:number;methodology:string};
  };
};
export function finite(value:unknown,name:string,nonnegative=true):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value)||(nonnegative&&value<0))throw Error(`Invalid ${name}`);
}
export function unique(values:string[],name:string) {if(new Set(values).size!==values.length)throw Error(`Duplicate ${name}`);}
export function deduplicate(holdings:Holding[]) {
  unique(holdings.map(x=>x.id),'holding');const byId=new Map(holdings.map(x=>[x.id,x])), incoming=new Map<string,number>();
  let gross=0,overlap=0;const graph=new Map<string,string[]>();
  for(const h of holdings) {
    finite(h.usd,'holding USD');gross+=h.usd;let outgoing=0;
    unique(h.overlaps.map(e=>e.target),'overlap edge');
    for(const edge of h.overlaps) {
      if(!['nested-vault','wrapper','curation'].includes(edge.kind))throw Error('Unknown overlap kind');
      finite(edge.usd,'overlap USD');if(!byId.has(edge.target)||edge.target===h.id)throw Error('Invalid overlap target');
      outgoing+=edge.usd;incoming.set(edge.target,(incoming.get(edge.target)??0)+edge.usd);overlap+=edge.usd;
    }
    if(outgoing>h.usd+0.01)throw Error('Overlap exceeds holding');graph.set(h.id,h.overlaps.map(e=>e.target));
  }
  for(const [id,usd] of incoming)if(usd>byId.get(id)!.usd+0.01)throw Error('Overlap exceeds target');
  const done=new Set<string>(),active=new Set<string>();
  function visit(id:string){if(active.has(id))throw Error('Nested holding cycle');if(done.has(id))return;active.add(id);for(const to of graph.get(id)??[])visit(to);active.delete(id);done.add(id);}
  for(const id of byId.keys())visit(id);
  return {gross,overlap,net:gross-overlap};
}
export function activeBudgets(budgets:Budget[],cutoff:string) {
  unique(budgets.map(b=>b.id),'budget');
  const approved=budgets.filter(b=>+new Date(b.approvedAt)<=+new Date(cutoff));
  const superseded=new Set(approved.flatMap(b=>b.supersedes??[]));
  for(const id of superseded)if(!approved.some(b=>b.id===id))throw Error('Unknown superseded budget');
  const active=approved.filter(b=>!superseded.has(b.id));
  for(const b of active) {
    finite(b.usd,'budget USD');if(!(Date.parse(b.end)>Date.parse(b.start)))throw Error('Invalid budget interval');
    for(const other of active)if(other.id!==b.id&&other.team===b.team&&other.line===b.line&&Math.max(Date.parse(other.start),Date.parse(b.start))<Math.min(Date.parse(other.end),Date.parse(b.end)))throw Error('Overlapping budget periods; reconcile revisions first');
  }
  return active;
}
export function accrual(budgets:Budget[],start:string,end:string) {
  return budgets.reduce((s,b)=>s+b.usd*Math.max(0,Math.min(Date.parse(end),Date.parse(b.end))-Math.max(Date.parse(start),Date.parse(b.start)))/(Date.parse(b.end)-Date.parse(b.start)),0);
}
export function efficiency(feesUsd:number,averageTvlUsd:number) {
  finite(feesUsd,'retained vault fees');finite(averageTvlUsd,'average TVL');
  return averageTvlUsd>0?feesUsd/averageTvlUsd:null; // USD / USD, per period, never annualized.
}
export function calculate(input:Inputs) {
  const p=periods(input.cutoff),universe=input.vaults.filter(v=>!v.excluded),current=deduplicate(input.current);
  const budgets=activeBudgets(input.budgets,input.cutoff);
  const dayValues=input.daily.map(d=>({date:d.date,...deduplicate(d.holdings)}));
  const sum=(items:any[],key:string)=>items.reduce((s,x)=>s+x[key],0);
  const monthly=p.map(m=>{
    const fees=input.fees.filter(f=>within(f.at,m.start,m.end)),vaultFees=fees.filter(f=>f.kind==='vault'),lock=fees.filter(f=>f.kind==='ylockers');
    const cash=input.cash.filter(c=>within(c.at,m.start,m.end));
    const days=dayValues.filter(d=>within(d.date,m.start,m.end));
    const elapsedDay=m.complete?0:(Date.parse(m.end)-Date.parse(m.end.slice(0,10)+'T00:00:00.000Z'))/86400000;
    const weight=days.length+elapsedDay;
    const avg=weight>0?(sum(days,'net')+current.net*elapsedDay)/weight:null;
    const flows=input.secondary?.flows?.filter(f=>within(f.at,m.start,m.end)&&!f.internal);
    const macro=(input.secondary?.macro?.filter(v=>within(v.at,m.start,m.end))??[]).sort((a,b)=>a.at.localeCompare(b.at));
    const last=<T>(key:string)=>((macro.filter(v=>(v as any)[key]!=null).at(-1) as any)?.[key]??null) as T;
    const fed=macro.filter(v=>v.fed!=null);
    return {...m,tvlUsd:m.complete?(days.at(-1)?.net??null):current.net,averageTvlUsd:avg,averageTvlMethod:'Daily closing observations, equal day weights; cutoff TVL weighted by elapsed fraction of current UTC day',
      grossVaultFeesUsd:input.reportScope?.fees?.basis==='identified-retained-mints'?null:sum(vaultFees,'grossUsd'),retainedVaultFeesUsd:sum(vaultFees,'retainedUsd'),retainedYlockersUsd:input.accountingPeriods?null:sum(lock,'retainedUsd'),
      protocolRevenueUsd:input.accountingPeriods?null:sum(fees,'retainedUsd'),treasuryReceiptsUsd:sum(cash.filter(c=>c.kind==='receipt'),'usd'),daoCashSettlementsUsd:sum(cash.filter(c=>c.daoCashSettlement),'usd'),
      cashSpendingUsd:sum(cash.filter(c=>c.kind==='spending'),'usd'),accrualExpensesUsd:accrual(budgets,m.start,m.end),
      feePerDollar:avg==null?null:efficiency(sum(vaultFees,'retainedUsd'),avg),
      netDepositsUsd:flows?flows.reduce((s,f)=>s+(f.kind==='deposit'?1:-1)*f.usd,0):null,
      visitors:input.secondary?.visitors?.find(v=>v.month===m.label)?.value??null,
      mergedPRs:input.secondary?.mergedPRs?.filter(v=>within(v.at,m.start,m.end)).length??null,
      linearDone:input.secondary?.linearDone?.filter(v=>within(v.at,m.start,m.end)).length??null,
      fed:fed.length?fed.reduce((s,v)=>s+v.fed!,0)/fed.length:null,
      stableSupplyUsd:last<number|null>('stableSupplyUsd'),defiTvlUsd:last<number|null>('defiTvlUsd'),
      dailyObservations:days.length};
  });
  const quarter=quarters(input.cutoff).map(q=>{
    const months=monthly.filter(m=>q.months.includes(m.label));
    const sumKey=(key:string)=>months.reduce((s,m)=>s+(m as any)[key],0);
    return {...q,protocolRevenueUsd:input.accountingPeriods?null:sumKey('protocolRevenueUsd'),treasuryReceiptsUsd:sumKey('treasuryReceiptsUsd'),cashSpendingUsd:sumKey('cashSpendingUsd'),accrualExpensesUsd:sumKey('accrualExpensesUsd')};
  });
  const latest=quarter.filter(q=>q.complete).at(-1),accounting=input.accountingPeriods?.filter(p=>p.complete).at(-1),cover=accounting?(accounting.recordedCostsUsd>0?accounting.protocolRevenueUsd/accounting.recordedCostsUsd:null):latest&&latest.accrualExpensesUsd>0?latest.protocolRevenueUsd!/latest.accrualExpensesUsd:null;
  const liquid=input.treasury.filter(t=>t.liquid&&!t.committed&&!t.ownToken).reduce((s,t)=>s+(t.usd??0),0);
  const owned=input.treasury.reduce((s,t)=>s+(t.usd??0),0);
  const cashBurn=latest?latest.cashSpendingUsd/3:null;
  const apy=input.secondary?.apy,apyDenom=apy?.reduce((s,a)=>s+(input.current.find(h=>h.id===a.vaultId)?.usd??0),0)??0;
  const apyValue=apyDenom>0?apy!.reduce((s,a)=>s+a.value*(input.current.find(h=>h.id===a.vaultId)?.usd??0),0)/apyDenom:null;
  return {version:1,accountingPeriods:input.accountingPeriods??null,reportScope:input.reportScope??null,coveragePeriod:accounting??latest,cutoff:input.cutoff,universeCount:universe.length,current,monthly,quarters:quarter,
    treasury:{ownedUsd:input.treasury.some(t=>t.usd===null)?null:owned,reviewedPricedInventoryUsd:owned,unpricedPositions:input.treasury.filter(t=>t.usd===null).length,liquidUsd:liquid,runwayMonths:cashBurn&&cashBurn>0?liquid/cashBurn:null,runwayMethod:'Liquid treasury / average monthly gross cash spending in latest completed quarter; excludes committed and own-token inventory'},
    coverageRatio:cover,health:cover==null?'pending':cover>=1?'good':cover>=0.6?'warn':'bad',
    apy:apyValue,apyCoverage:current.gross>0?apyDenom/current.gross:null,
    depositors:input.secondary?.depositors?{count:input.secondary.depositors.count,top10Share:input.secondary.depositors.top10Share,coveredVaultCount:input.secondary.depositors.coveredVaults.length,methodology:input.secondary.depositors.methodology}:null,
    partners:input.secondary?.partners?{count:input.secondary.partners.count,methodology:input.secondary.partners.methodology}:null};
}
