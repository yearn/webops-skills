import {Cache,json} from './io';
export type PriceRequest={key:string;timestamp:number};
export async function batchPrices(requests:PriceRequest[],cache:Cache) {
  const unique=new Map(requests.map(r=>[r.key.toLowerCase()+':'+r.timestamp,{key:r.key.toLowerCase(),timestamp:r.timestamp}]));
  const byToken=new Map<string,number[]>();for(const r of unique.values()){const v=byToken.get(r.key)??[];v.push(r.timestamp);byToken.set(r.key,v);}
  const results=new Map<string,any>();const jobs:any[]=[];
  for(const [key,times] of byToken)for(let i=0;i<times.length;i+=90)jobs.push({[key]:times.slice(i,i+90)});
  let cursor=0;
  async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];try{const record=await cache.get('daily-price-batch',{coins:job},()=>json('https://prices.yearn.dev/api/prices/batchHistorical?coins='+encodeURIComponent(JSON.stringify(job)),{headers:{Authorization:`Bearer ${process.env.YEARN_PRICES_API_TOKEN}`}}));for(const [key,coin] of Object.entries(record.data.coins??{}) as any)for(const p of coin.prices??[])if(p.price>0&&Number.isFinite(p.price))results.set(key.toLowerCase()+':'+p.timestamp,{...p,evidence:record.id});}catch{}}}
  await Promise.all(Array.from({length:4},worker));return results;
}
