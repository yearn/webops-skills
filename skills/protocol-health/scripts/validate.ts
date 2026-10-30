import { join } from 'node:path';
import { readJSON, hash } from './io';
import { calculate, finite, unique, type Inputs } from './calculate';
import { periods } from './periods';
export async function validate(input:Inputs,cutoff:string,cacheDirectory:string,collection:any) {
  const checks:{name:string;ok:boolean;error?:string}[]=[];
  async function check(name:string,fn:()=>unknown|Promise<unknown>){try{await fn();checks.push({name,ok:true});}catch(e:any){checks.push({name,ok:false,error:e.message});}}
  const epoch=(ts:string)=>{const t=Date.parse(ts);if(!Number.isFinite(t))throw Error('Invalid observation timestamp');return t;};
  const end=epoch(cutoff),p=periods(cutoff),start=epoch(p[0].start);
  const eligible=(ts:string)=>input.vaults.filter(v=>!v.excluded&&epoch(v.activation)<=epoch(ts)).map(v=>v.id).sort();
  const references=new Set<string>();
  const refs=(row:any)=>{if(!Array.isArray(row.evidence)||!row.evidence.length)throw Error('Missing row evidence');row.evidence.forEach((id:string)=>references.add(id));};
  const time=(ts:string,bound=end,lag?:number)=>{const t=epoch(ts);if(t>bound)throw Error('Observation after cutoff');if(lag!=null&&bound-t>lag)throw Error('Stale observation');};
  await check('Input version and cutoff',()=>{if(input.version!==1||input.cutoff!==cutoff)throw Error('Input cutoff/version differs from run');});
  await check('Collection completion',()=>{if(!collection||collection.cutoff!==cutoff||!collection.sources?.length||collection.gaps?.some((g:any)=>g.core&&!g.resolved))throw Error('Missing or failed core collections');for(const g of collection.gaps??[])if(g.core&&g.resolved){if(!g.resolution)throw Error('Missing collection resolution');refs({evidence:[g.evidence]});}});
  await check('Consistent current vault universe',()=>{
    unique(input.vaults.map(v=>v.id),'vault');
    if(!input.vaults.length)throw Error('Empty vault universe');
    if(JSON.stringify(input.current.map(h=>h.id).sort())!==JSON.stringify(eligible(cutoff)))throw Error('Current TVL differs from eligible universe');
    for(const h of input.current){time(h.observedAt,end,86400000);if(!(h.block>0))throw Error('Missing block reference');refs(h);}
  });
  await check('All completed UTC days and daily universe',()=>{
    unique(input.daily.map(d=>d.date),'daily observation');
    const completedEnd=Date.UTC(new Date(cutoff).getUTCFullYear(),new Date(cutoff).getUTCMonth(),new Date(cutoff).getUTCDate());
    for(let t=start;t<completedEnd;t+=86400000) {
      const date=new Date(t).toISOString(),day=input.daily.find(d=>d.date===date);
      if(!day)throw Error(`Missing daily TVL ${date.slice(0,10)}`);
      if(JSON.stringify(day.holdings.map(h=>h.id).sort())!==JSON.stringify(eligible(new Date(t+86400000-1).toISOString())))throw Error(`Daily universe mismatch ${date.slice(0,10)}`);
      for(const h of day.holdings){time(h.observedAt,t+86400000-1,86400000);if(!(h.block>0))throw Error('Missing historical block');refs(h);}
    }
    for(const d of input.daily)if(epoch(d.date)<start||epoch(d.date)>=completedEnd||!d.date.endsWith('T00:00:00.000Z'))throw Error('Daily observation outside completed UTC days');
  });
  await check('Fee splits, event identity and matched vault coverage',()=>{
    unique(input.fees.map(f=>f.id),'fee event');
    for(const f of input.fees){time(f.at);if(epoch(f.at)<start)throw Error('Fee before report window');refs(f);finite(f.retainedUsd,'retained fees');if(f.basis==='retained-mint'){if(f.grossUsd!==null||f.distributedUsd!==null||input.reportScope?.fees?.basis!=='identified-retained-mints')throw Error('Retained mint coverage must disclose unavailable gross/distributed fees');}else{finite(f.grossUsd,'gross fees');finite(f.distributedUsd,'distributed fees');if(Math.abs(f.grossUsd-f.retainedUsd-f.distributedUsd)>0.01)throw Error('Gross/retained/distributed fee split does not balance');}if(!['vault','ylockers'].includes(f.kind))throw Error('Invalid fee kind');if(f.kind==='vault'&&!eligible(f.at).includes(f.vaultId!))throw Error('Fee outside matched vault universe');if(f.kind==='ylockers'&&f.vaultId!==null)throw Error('Locker fee must be distinct from vault fees');}
  });
  await check('Cash classifications and internal-transfer exclusion',()=>{
    unique(input.cash.map(c=>c.id),'cash movement');
    const controlled=new Set(input.controlledAccounts.map(a=>a.toLowerCase()));if(!controlled.size)throw Error('Missing controlled-account scope');
    for(const c of input.cash){if(['currentSpot','current-spot'].includes((c as any).sourcePriceMethod))throw Error('Cash requires historical valuation');refs(c);time(c.at);if(epoch(c.at)<start)throw Error('Cash movement before window');finite(c.usd,'cash USD');if(!['spending','receipt','internal','asset-swap'].includes(c.kind))throw Error('Invalid cash classification');const from=controlled.has(c.from.toLowerCase()),to=controlled.has(c.to.toLowerCase());if(from&&to&&c.kind!=='internal')throw Error('Controlled-account transfer counted as external cash');if(c.kind==='spending'&&(!from||to))throw Error('Spending must leave controlled scope');if(c.kind==='receipt'&&(!to||from))throw Error('Receipt must enter controlled scope');}
  });
  await check('Budget evidence and cash/accrual separation',()=>{for(const b of input.budgets){refs(b);time(b.approvedAt);if(!b.team||!b.line)throw Error('Missing budget scope');}});
  await check('Liquid treasury, valuation dates and unique representations',()=>{
    if(!input.treasury.length||!input.coverage.treasuryEnumerationComplete)throw Error('Incomplete treasury enumeration');
    unique(input.treasury.map(t=>t.id),'treasury position');
    const roots=new Set(input.treasury.map(t=>t.id));
    for(const t of input.treasury){refs(t);time(t.observedAt,end,86400000);time(t.valuedAt,end,86400000);if(!(t.block>0))throw Error('Missing treasury block');if(t.usd===null){if(t.liquid||!t.valuationGap||!input.reportScope?.treasury)throw Error('Unpriced treasury holding requires a disclosed non-liquid valuation gap');}else finite(t.usd,'treasury USD');if(t.representationOf&&roots.has(t.representationOf))throw Error('Wrapper and underlying both counted');if(t.liquid&&(t.committed||t.ownToken))throw Error('Committed or own-token inventory counted as liquid');}
  });
  await check('Reported accounting periods remain distinct from calendar budgets',()=>{if(!input.accountingPeriods)return;unique(input.accountingPeriods.map(p=>String(p.id)),'accounting period');for(const p of input.accountingPeriods){refs(p);time(p.start);if(!(epoch(p.end)>epoch(p.start))||p.complete&&epoch(p.end)>end)throw Error('Invalid accounting period');finite(p.protocolRevenueUsd,'reported revenue');finite(p.recordedCostsUsd,'reported costs');}if(!input.accountingPeriods.some(p=>p.complete&&p.recordedCostsUsd>0))throw Error('No validated completed accounting period');});
  await check('Coverage reconciliation',()=>{
    const c=input.coverage;if(!c||[c.feesThrough,c.cashThrough,c.budgetsThrough].some(t=>t!==cutoff))throw Error('Core series do not reach cutoff');
    if(!c.reviewNotes.methodology?.trim())throw Error('Missing reviewed scope and methodology');refs(c.reviewNotes);
  });
  await check('Secondary metric scope and evidence',()=>{
    const s=input.secondary;if(!s)return;
    for(const [key,rows] of Object.entries(s)) {
      if(Array.isArray(rows))for(const row of rows){refs(row);if(row.at)time(row.at);for(const [k,v] of Object.entries(row))if(['value','usd','fed','stableSupplyUsd','defiTvlUsd'].includes(k)&&v!=null)finite(v,k,!(key==='apy'&&k==='value'));}
      else if(rows)refs(rows);
    }
    if(s.apy){for(const a of s.apy)if(a.value < -1||a.value > 10)throw Error('APY outside reviewed plausibility bounds');unique(s.apy.map(a=>a.vaultId),'APY vault');for(const a of s.apy)if(!eligible(cutoff).includes(a.vaultId))throw Error('APY outside universe');}
    if(s.depositors){finite(s.depositors.count,'depositor count');finite(s.depositors.top10Share,'holder share');if(s.depositors.top10Share>1||!Number.isInteger(s.depositors.count))throw Error('Invalid depositor statistic');if(s.depositors.coveredVaults.some(id=>!eligible(cutoff).includes(id)))throw Error('Depositor scope outside universe');}
    if(s.flows){unique(s.flows.map(f=>f.id),'deposit/withdrawal event');for(const f of s.flows)if(!eligible(f.at).includes(f.vaultId)||!['deposit','withdrawal'].includes(f.kind))throw Error('Invalid measured flow');}
    if(s.partners)finite(s.partners.count,'partner count');
    if(s.visitors){unique(s.visitors.map(v=>v.month),'visitor month');for(const v of s.visitors)if(!p.some(m=>m.label===v.month))throw Error('Visitor period outside window');}
  });
  await check('Saved evidence integrity',async()=>{
    if(!references.size)throw Error('No saved evidence references');
    for(const id of references){if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid evidence identifier');const record=await readJSON(join(cacheDirectory,id+'.json'));if(record.id!==id||record.cutoff!==cutoff||record.digest!==hash(record.data))throw Error('Evidence integrity/cutoff mismatch');}
  });
  let snapshot:any=null;
  await check('Accounting calculation and nested exposure reconciliation',()=>{snapshot=calculate(input);});
  return {ok:checks.every(c=>c.ok),cutoff,checks,snapshot};
}
