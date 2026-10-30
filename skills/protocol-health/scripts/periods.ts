export function cutoffISO(value?:string) {
  if(value&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) throw Error('--as-of must be a full UTC timestamp ending in Z');
  const d=new Date(value??Date.now());
  if(!Number.isFinite(+d)||+d>Date.now()+1000) throw Error('Invalid or future cutoff');
  return d.toISOString();
}
export function periods(cutoff:string) {
  const d=new Date(cutoff),year=d.getUTCFullYear(),month=d.getUTCMonth();
  return Array.from({length:13},(_,i)=>{
    const start=new Date(Date.UTC(year,month-12+i,1)).toISOString();
    const end=i===12?cutoff:new Date(Date.UTC(year,month-11+i,1)).toISOString();
    return {start,end,label:start.slice(0,7)+(i===12?' MTD':''),complete:i!==12};
  });
}
export function quarters(cutoff:string) {
  const p=periods(cutoff),groups:Record<string,any>={};
  for(const m of p) {
    const d=new Date(m.start),key=`${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth()/3)+1}`;
    (groups[key]??={label:key,months:[],complete:true}).months.push(m.label);
    if(!m.complete) groups[key].complete=false;
  }
  return Object.values(groups).map(g=>{const complete=g.complete&&g.months.length===3;const firstMonth=Number(g.months[0].slice(5,7));return {...g,complete,label:g.label+(complete?'':(firstMonth-1)%3===0?' QTD':' (partial coverage)')};});
}
export const within=(ts:string,start:string,end:string)=>+new Date(ts)>=+new Date(start)&&+new Date(ts)<+new Date(end);
