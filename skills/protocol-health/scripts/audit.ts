import {join} from 'node:path';
import {readJSON,save,Cache} from './io';
import {periods} from './periods';
import {imported} from './reuse';
export async function audit(output:string,cache:Cache) {
  const collection=await readJSON(join(output,'collection.json'));
  const universeRecord=await readJSON(join(cache.directory,collection.sources.find((s:any)=>s.name==='kong-universe').id+'.json'));
  const universe=universeRecord.data.filter((r:any)=>r.label==='vault'&&(r.defaults.yearn||r.defaults.origin==='yearn'));
  const ids=new Map(universe.map((r:any)=>[`${r.chain_id}:${r.address.toLowerCase()}`,r]));
  const months:any[]=[];const feeEvents:any={};const coverage=new Map<string,Set<string>>(),latest=new Map<string,any>();
  for(const source of collection.sources) {
    if(!['kong-series','kong-events'].includes(source.name))continue;
    const record=await readJSON(join(cache.directory,source.id+'.json'));
    if(source.name==='kong-series') {
      const stats={period:record.params.args[0].slice(0,7),rows:record.data.length,tvlRows:0,missingPrices:0,positiveTvl:0,monthEndGrossUsd:0};
      const monthLatest=new Map<string,any>();
      for(const r of record.data) {
        const id=`${r.chain_id}:${r.address.toLowerCase()}`;if(!ids.has(id)||r.label!=='tvl-c'||r.component!=='tvl')continue;
        stats.tvlRows++;if(r.value==null)stats.missingPrices++;else if(Number(r.value)>0)stats.positiveTvl++;
        if(r.value!=null){let dates=coverage.get(id);if(!dates){dates=new Set();coverage.set(id,dates);}dates.add(r.block_time.slice(0,10));}
        if(!monthLatest.has(id)||monthLatest.get(id).block_time<r.block_time)monthLatest.set(id,{...r,evidence:source.id});
        if(!latest.has(id)||latest.get(id).block_time<r.block_time)latest.set(id,{...r,evidence:source.id});
      }
      stats.monthEndGrossUsd=[...monthLatest.values()].reduce((s,r)=>s+Number(r.value??0),0);months.push(stats);
    } else {
      for(const r of record.data) {
        const id=`${r.chain_id}:${r.address.toLowerCase()}`;if(!ids.has(id))continue;
        const stats=feeEvents[r.event_name]??={count:0,positiveFees:0,missingFeePrices:0,totalHookFeesUsd:0};stats.count++;
        const raw=r.args?.total_fees??r.args?.performanceFees??'0';
        if(BigInt(raw)>0n){stats.positiveFees++;if(!(r.hook?.priceUsd>0))stats.missingFeePrices++;}
        stats.totalHookFeesUsd+=r.hook?.totalFeesUsd??r.hook?.performanceFeesUsd??0;
      }
    }
  }
  const first=Date.parse(periods(cache.cutoff)[0].start),last=Date.parse(cache.cutoff.slice(0,10));
  const vaultCoverage=universe.map((v:any)=>{
    const id=`${v.chain_id}:${v.address.toLowerCase()}`,incept=Number(v.defaults.inceptTime??0)*1000;
    const expected=Math.max(0,Math.ceil((last-Math.max(first,Math.floor(incept/86400000)*86400000))/86400000));
    const observed=coverage.get(id)?.size??0;
    return {id,project:v.defaults.projectName??null,expected,observed,missing:Math.max(0,expected-observed),latest:latest.get(id)??null};
  });
  const positions=await imported(output,cache,'positions.json'),flows=await imported(output,cache,'flows.json');
  const priceMethods:Record<string,number>={};for(const r of positions.data.rows){const method=r.pricing?.method??'missing';priceMethods[method]=(priceMethods[method]??0)+1;}
  const cashGroups:Record<string,any>={};for(const r of flows.data.transfers.rows){const key=r.group;const g=cashGroups[key]??={count:0,unpriced:0,inUsd:0,outUsd:0,methods:{}};g.count++;if(r.usd==null)g.unpriced++;else g[r.dir==='out'?'outUsd':'inUsd']+=r.usd;g.methods[r.priceMethod]=(g.methods[r.priceMethod]??0)+1;}
  const result={cutoff:cache.cutoff,universeCount:universe.length,months,feeEvents,vaultCoverage,priorPriceMethods:priceMethods,priorCashGroups:cashGroups};
  await save(join(output,'audit.json'),result);
  console.log(JSON.stringify({universe:universe.length,months,feeEvents,coverage:{complete:vaultCoverage.filter((v:any)=>!v.missing).length,incomplete:vaultCoverage.filter((v:any)=>v.missing).length},priorPriceMethods:priceMethods,priorCashGroups:cashGroups}));
  return result;
}
if(import.meta.main){const output=process.argv[2],run=await readJSON(join(output,'run.json'));await audit(output,new Cache(join(output,'cache'),run.cutoff,true));}
