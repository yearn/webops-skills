import { join } from 'node:path';
import { readJSON } from './io';
import { within, periods } from './periods';
export async function secondaryFromEvidence(collection:any,cacheDirectory:string) {
  const result:any={},gaps:any[]=[],macro=new Map<string,any>(),cutoff=collection.cutoff,start=periods(cutoff)[0].start;
  const day=(at:string,id:string)=>{const row=macro.get(at)??{at,fed:null,stableSupplyUsd:null,defiTvlUsd:null,evidence:[]};if(!row.evidence.includes(id))row.evidence.push(id);macro.set(at,row);return row;};
  for(const source of collection.sources) {
    const record=await readJSON(join(cacheDirectory,source.id+'.json')),data=record.data;
    try {
      if(source.name==='macro-fed') {
        const lines=data.body.trim().split(/\r?\n/),head=lines.shift()!;
        if(!/^(observation_date|DATE),DFF$/.test(head))throw Error('FRED did not return daily DFF CSV');
        for(const line of lines){const [date,value]=line.split(','),at=date+'T00:00:00.000Z';if(value==='.'||value==='')continue;const n=Number(value);if(!/^\d{4}-\d\d-\d\d$/.test(date)||!Number.isFinite(n))throw Error('Invalid DFF observation');if(within(at,start,cutoff))day(at,source.id).fed=n;}
      } else if(source.name==='macro-stablecoins'||source.name==='macro-defi-tvl') {
        if(!Array.isArray(data)||!data.length)throw Error('Missing daily context records');
        for(const row of data) {
          const at=new Date(Number(row.date)*1000).toISOString();if(!within(at,start,cutoff))continue;
          const key=source.name==='macro-stablecoins'?'stableSupplyUsd':'defiTvlUsd';
          // Stablecoin supplies denominated in USD are distinct from nominal token supply.
          const value=key==='stableSupplyUsd'?row.totalCirculatingUSD?.peggedUSD:row.tvl;
          if(value==null)continue;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Invalid context USD observation');
          day(at,source.id)[key]=value;
        }
      } else if(source.name==='github-pulls') {
        result.mergedPRs??=[];
        for(const row of data)if(row.merged_at&&within(row.merged_at,start,cutoff))result.mergedPRs.push({at:row.merged_at,evidence:[source.id]});
      } else if(source.name==='linear-issues') {
        result.linearDone=data.filter((r:any)=>r.completedAt&&within(r.completedAt,start,cutoff)).map((r:any)=>({at:r.completedAt,evidence:[source.id]}));
      } else if(source.name==='plausible-month') {
        const value=data.results?.[0]?.metrics?.[0];
        if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Plausible returned no valid unique-visitor count');
        (result.visitors??=[]).push({month:record.params.label,value,evidence:[source.id]});
      }
    }catch(e:any){gaps.push({source:source.name,core:false,reason:e.message});}
  }
  if(macro.size)result.macro=[...macro.values()].sort((a,b)=>a.at.localeCompare(b.at));
  return {secondary:result,gaps,note:'Candidate aggregates from saved evidence; review source coverage and cutoff semantics before incorporating in inputs.json. No core accounting is inferred.'};
}
