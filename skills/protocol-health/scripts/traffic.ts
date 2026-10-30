import {join} from 'node:path';
import {Cache,readJSON,save,json,ROOT} from './io';
import {periods} from './periods';
// Plausible custom ranges include the last second. Express [start,end) at source timestamp precision.
export const trafficEnd=(end:string)=>new Date(Math.ceil(Date.parse(end)/1000)*1000-1000).toISOString();
export function trafficQuery(cfg:any,m:any){return json(cfg.plausible,{method:'POST',headers:{Authorization:`Bearer ${process.env.PLAUSIBLE_API_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({site_id:cfg.plausibleSite,date_range:[m.start,trafficEnd(m.end)],metrics:['visitors'],dimensions:[]})});}
export async function refreshTraffic(output:string,cache:Cache){
 const cfg=await readJSON(join(ROOT,'references/sources.json')),collection=await readJSON(join(output,'collection.json')),sources=[];
 for(const m of periods(cache.cutoff)){const r=await cache.get('plausible-month',{site:cfg.plausibleSite,...m,apiEnd:trafficEnd(m.end)},()=>trafficQuery(cfg,m));sources.push({name:r.source,id:r.id,retrievedAt:r.retrievedAt,digest:r.digest,core:false});}
 collection.sources=[...collection.sources.filter((s:any)=>s.name!=='plausible-month'),...sources];await save(join(output,'collection.json'),collection);return sources;
}
if(import.meta.main){const out=process.argv[2],run=await readJSON(join(out,'run.json'));await refreshTraffic(out,new Cache(join(out,'cache'),run.cutoff));}
