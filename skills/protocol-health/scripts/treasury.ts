// Adapted from Yearn's treasury report lib.mjs: pinned RPC reads and ERC-4626/V2 resolution.
// No prior-snapshot prices, implicit $1 valuations, latest-block calls, or zero-on-error reads.
import { Cache, json } from './io';
export const pad=(value:string|bigint)=>String(typeof value==='bigint'?value.toString(16):value).replace(/^0x/,'').padStart(64,'0');
export const hex=(n:number)=>'0x'+n.toString(16);
export async function rpc(chain:number,method:string,params:unknown[]) {
  const url=process.env[`RPC_URL_${chain}`];if(!url)throw Error(`Missing RPC_URL_${chain}`);
  const j=await json(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(j.error||j.result==null)throw Error(`RPC ${method} failed`);return j.result;
}
export async function pin(chain:number,cutoff:string,cache:Cache) {
  return (await cache.get('block-at-cutoff',{chain,asOf:cutoff},async()=>{
    const target=+new Date(cutoff)/1000, head=Number(BigInt(await rpc(chain,'eth_blockNumber',[])));
    const get=async(n:number)=>rpc(chain,'eth_getBlockByNumber',[hex(n),false]);
    const last=await get(head);if(Number(BigInt(last.timestamp))<target-3600)throw Error(`Chain ${chain} head stale`);
    let lo=0,hi=head;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2),b=await get(mid);if(Number(BigInt(b.timestamp))<=target)lo=mid;else hi=mid-1;}
    const b=await get(lo);return {chain,number:lo,hash:b.hash,timestamp:new Date(Number(BigInt(b.timestamp))*1000).toISOString()};
  })).data;
}
export async function call(chain:number,to:string,data:string,block:number,cache:Cache) {
  return (await cache.get('eth_call',{chain,to:to.toLowerCase(),data,block},()=>rpc(chain,'eth_call',[{to,data},hex(block)]))).data as string;
}
export function uint(raw:string) {if(!/^0x[0-9a-fA-F]{64,}$/.test(raw)||(raw.length-2)%64!==0)throw Error('Invalid uint RPC result');return BigInt(raw.slice(0,66));}
export async function resolveShare(chain:number,token:string,raw:bigint,decimals:number,block:number,cache:Cache,visited=new Set<string>()):Promise<any> {
  const key=token.toLowerCase();if(visited.has(key)||visited.size>=8)throw Error('Wrapper cycle or excessive depth');
  visited.add(key);
  let asset:string,assets:bigint;
  try {
    const result=await call(chain,token,'0x38d52e0f',block,cache);uint(result);asset='0x'+result.slice(26,66);
    assets=uint(await call(chain,token,'0x07a2d13a'+pad(raw),block,cache));
  } catch {
    // V2 token() and pricePerShare(). Both reads must succeed to identify a V2 wrapper.
    try {
      const result=await call(chain,token,'0xfc0c546a',block,cache);uint(result);asset='0x'+result.slice(26,66);
      assets=raw*uint(await call(chain,token,'0x99530b06',block,cache))/10n**BigInt(decimals);
    } catch {return {token:key,raw:raw.toString(),decimals,kind:'unresolved-or-base'};}
  }
  if(/^0x0{40}$/.test(asset))throw Error('Zero wrapper asset');
  const d=Number(uint(await call(chain,asset,'0x313ce567',block,cache)));
  if(d>36)throw Error('Invalid decimals');
  return {token:key,raw:raw.toString(),decimals,kind:'wrapper',underlying:await resolveShare(chain,asset,assets,d,block,cache,visited)};
}
export async function historicalPrice(chainName:string,token:string,cutoff:string,cache:Cache,base:string) {
  const timestamp=Math.floor(+new Date(cutoff)/1000),key=chainName+':'+token.toLowerCase();
  const fetchPrice=async(ts:number)=>cache.get('historical-price',{timestamp:ts,key},()=>json(`${base}/api/prices/historical/${ts}/${key}`,{headers:{Authorization:`Bearer ${process.env.YEARN_PRICES_API_TOKEN}`}}));
  let record=await fetchPrice(timestamp),value=record.data.coins?.[key];
  let valuationBasis='historical quote at cutoff';
  if(value?.timestamp>timestamp) {
    // Daily feeds may label the requested day's close after cutoff; use only the last completed UTC day.
    record=await fetchPrice(Math.floor(timestamp/86400)*86400-1);value=record.data.coins?.[key];
    valuationBasis='previous completed UTC day; requested-day feed timestamp was after cutoff';
  }
  if(!value||!(value.price>0)||!Number.isFinite(value.timestamp))throw Error('No historical valuation');
  if(value.timestamp>timestamp||timestamp-value.timestamp>86400)throw Error('Price outside cutoff tolerance');
  return {...value,evidence:record.id,valuationBasis};
}
