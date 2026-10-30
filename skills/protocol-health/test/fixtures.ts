// Synthetic data for calculation/renderer tests; never used for a live report.
import { periods } from '../scripts/periods';
import { Cache } from '../scripts/io';
import type { Inputs, Holding } from '../scripts/calculate';
export const CUTOFF='2026-10-30T04:00:00.000Z';
export async function fixture(cache:Cache) {
  const ev=await cache.get('synthetic-fixture',{purpose:'unit test'},async()=>({synthetic:true})),evidence=[ev.id];
  const start=periods(CUTOFF)[0].start;
  const holding=(at:string):Holding=>({id:'1:synthetic',usd:1000,observedAt:at,block:1,overlaps:[],evidence});
  const daily=[];
  for(let t=Date.parse(start);t<Date.parse(CUTOFF.slice(0,10));t+=86400000)daily.push({date:new Date(t).toISOString(),holdings:[holding(new Date(t+86399000).toISOString())]});
  const inputs:Inputs={version:1,cutoff:CUTOFF,vaults:[{id:'1:synthetic',activation:'2020-01-01T00:00:00.000Z'}],current:[holding(CUTOFF)],daily,
    fees:[{id:'synthetic-fee',at:'2026-09-15T00:00:00.000Z',vaultId:'1:synthetic',kind:'vault',grossUsd:20,retainedUsd:10,distributedUsd:10,evidence}],
    cash:[{id:'synthetic-spend',at:'2026-09-15T00:00:00.000Z',from:'treasury',to:'team',usd:100,kind:'spending',evidence},{id:'synthetic-internal',at:'2026-09-15T00:00:00.000Z',from:'treasury',to:'distributor',usd:200,kind:'internal',evidence}],
    budgets:[{id:'synthetic-budget',team:'test',line:'test',start:'2026-07-01T00:00:00.000Z',end:'2026-10-01T00:00:00.000Z',approvedAt:'2026-06-30T00:00:00.000Z',usd:300,evidence}],
    treasury:[{id:'synthetic-liquid',usd:1000,liquid:true,committed:false,ownToken:false,observedAt:CUTOFF,valuedAt:CUTOFF,block:1,evidence}],controlledAccounts:['treasury','distributor'],
    coverage:{feesThrough:CUTOFF,cashThrough:CUTOFF,budgetsThrough:CUTOFF,treasuryEnumerationComplete:true,reviewNotes:{methodology:'Synthetic test scope only.',evidence}}};
  const collection={cutoff:CUTOFF,sources:[{name:'synthetic-fixture',id:ev.id,digest:ev.digest,retrievedAt:ev.retrievedAt}],gaps:[]};
  return {inputs,collection};
}
