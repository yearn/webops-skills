import {Cache} from './io';
import {rpc,hex,pad,call} from './treasury';
export const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const MULTICALL='0xca11bde05977b3631167028862be2a173976ca11';
export async function multicall(chain:number,calls:{target:string;data:string}[],block:number,cache:Cache):Promise<any[]> {
  const result:any[]=[];
  async function batch(part:{target:string;data:string}[]):Promise<any[]> {
    if(!part.length)return [];
    const record=await cache.get('multicall-pinned',{chain,block,calls:part},async()=>{
      let offsets='',bodies='',running=part.length*32;
      for(const c of part){const data=c.data.slice(2),padded=data.padEnd(Math.ceil(data.length/64)*64,'0');const tuple=pad(c.target)+pad(1n)+pad(96n)+pad(BigInt(data.length/2))+padded;offsets+=pad(BigInt(running));bodies+=tuple;running+=tuple.length/2;}
      try {
        const ret=await rpc(chain,'eth_call',[{to:MULTICALL,data:'0x82ad56cb'+pad(32n)+pad(BigInt(part.length))+offsets+bodies},hex(block)]),body=ret.slice(2);
        const word=(n:number)=>BigInt('0x'+body.slice(n*64,n*64+64));const arr=Number(word(0))/32;
        return part.map((_,i)=>{const tuple=arr+1+Number(word(arr+1+i))/32,offset=tuple+Number(word(tuple+1))/32,len=Number(word(offset));return {success:word(tuple)===1n,data:'0x'+body.slice((offset+1)*64,(offset+1)*64+len*2)};});
      }catch {
        if(part.length===1)return [{success:false,data:'0x'}];
        const mid=Math.floor(part.length/2);return [...await batch(part.slice(0,mid)),...await batch(part.slice(mid))];
      }
    });return record.data.map((r:any)=>({...r,evidence:record.id}));
  }
  for(let i=0;i<calls.length;i+=100)result.push(...await batch(calls.slice(i,i+100)));
  return result;
}
export async function logRange(chain:number,filter:any,from:number,to:number,cache:Cache):Promise<any[]> {
  if(from>to)return [];
  const record=await cache.get('rpc-log-range',{chain,filter,from,to},async()=>{
    try{return await rpc(chain,'eth_getLogs',[{...filter,fromBlock:hex(from),toBlock:hex(to)}]);}
    catch {if(from===to)throw Error(`Chain ${chain} log coverage unavailable at block ${from}`);const mid=Math.floor((from+to)/2);return [...await logRange(chain,filter,from,mid,cache),...await logRange(chain,filter,mid+1,to,cache)];}
  });return record.data;
}
