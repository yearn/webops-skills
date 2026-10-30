import { test, expect } from 'bun:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cache, hash, outsideRepository, ROOT } from '../scripts/io';
import { periods,quarters,cutoffISO } from '../scripts/periods';
import { calculate,deduplicate,activeBudgets,efficiency,type Holding } from '../scripts/calculate';
import { validate } from '../scripts/validate';
import { render } from '../scripts/render';
import { parseArgs } from '../scripts/cli';
import { fixture,CUTOFF } from './fixtures';
async function workspace(fn:(directory:string,cache:Cache)=>Promise<void>) {const d=await mkdtemp(join(tmpdir(),'protocol-health-test-'));try{await fn(d,new Cache(join(d,'cache'),CUTOFF));}finally{await rm(d,{recursive:true,force:true});}}
const h=(id:string,usd:number,overlaps:any[]=[]):Holding=>({id,usd,overlaps,observedAt:CUTOFF,block:1,evidence:['test']});
test('nested holdings and curation overlap subtract each economic claim once',()=>{
  expect(deduplicate([h('a',100,[{target:'b',usd:60,kind:'nested-vault'}]),h('b',80,[{target:'c',usd:40,kind:'curation'}]),h('c',50)])).toEqual({gross:230,overlap:100,net:130});
  expect(()=>deduplicate([h('a',10,[{target:'b',usd:11,kind:'wrapper'}]),h('b',20)])).toThrow();
  expect(()=>deduplicate([h('a',10,[{target:'b',usd:1,kind:'wrapper'}]),h('b',10,[{target:'a',usd:1,kind:'wrapper'}])])).toThrow('cycle');
});
test('budget revisions replace overlaps, actual overlapping expense lines fail',()=>{
  const b={id:'old',team:'a',line:'ops',start:'2026-01-01',end:'2026-04-01',usd:90,approvedAt:'2025-12-01',evidence:['test']};
  expect(()=>activeBudgets([b,{...b,id:'new'}],CUTOFF)).toThrow('Overlapping');
  expect(activeBudgets([b,{...b,id:'new',usd:100,supersedes:['old']}],CUTOFF).length).toBe(1);
});
test('months, MTD and quarters obey UTC boundaries',()=>{
  const p=periods(CUTOFF);expect(p.length).toBe(13);expect(p[0].label).toBe('2025-10');expect(p[12].label).toBe('2026-10 MTD');expect(p[12].end).toBe(CUTOFF);
  expect(quarters(CUTOFF).filter(q=>q.complete).length).toBe(4);expect(quarters(CUTOFF).at(-1).label).toBe('2026 Q4 QTD');
  expect(periods('2026-01-01T00:00:00.000Z').at(-1)?.start).toBe('2026-01-01T00:00:00.000Z');
  expect(()=>cutoffISO('2026-10-01')).toThrow();
});
test('USD/USD efficiency uses actual units and excludes lockers and treasury receipts',async()=>workspace(async(d,c)=>{
  const {inputs}=await fixture(c),ev=inputs.fees[0].evidence;
  inputs.fees.push({id:'locker',at:inputs.fees[0].at,kind:'ylockers',vaultId:null,grossUsd:90,retainedUsd:90,distributedUsd:0,evidence:ev});
  inputs.cash.push({id:'receipt',at:inputs.fees[0].at,kind:'receipt',from:'external',to:'treasury',usd:1000,evidence:ev});
  const s=calculate(inputs),sep=s.monthly.find(m=>m.label==='2026-09')!;
  expect(efficiency(10,1000)).toBe(0.01);expect(sep.feePerDollar).toBe(0.01);expect(sep.protocolRevenueUsd).toBe(100);expect(sep.treasuryReceiptsUsd).toBe(1000);expect(sep.cashSpendingUsd).toBe(100);expect(s.treasury.runwayMonths).toBeCloseTo(30);
}));
test('missing data, stale sources, invalid retention and future observations block core validation',async()=>workspace(async(d,c)=>{
  const {inputs,collection}=await fixture(c);expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(true);
  for(const mutate of [
    (x:any)=>x.daily.pop(),(x:any)=>x.current[0].observedAt='2026-09-01T00:00:00Z',
    (x:any)=>x.fees[0].retainedUsd=30,(x:any)=>x.cash[1].kind='spending',
    (x:any)=>x.treasury[0].valuedAt='2026-11-01T00:00:00Z',
    (x:any)=>x.treasury[0].usd=null,(x:any)=>x.coverage.feesThrough='2026-09-01',
    (x:any)=>x.current[0].evidence=[],(x:any)=>x.treasury[0].committed=true
  ]) {const copy=structuredClone(inputs);mutate(copy);expect((await validate(copy,CUTOFF,c.directory,collection)).ok).toBe(false);}
}));
test('saved-input reproduction is deterministic and offline caches never call network',async()=>workspace(async(d,c)=>{
  const {inputs,collection}=await fixture(c),offline=new Cache(c.directory,CUTOFF,true);
  const ev=await offline.get('synthetic-fixture',{purpose:'unit test'},async()=>{throw Error('Network called')});expect(ev.data.synthetic).toBe(true);
  expect(offline.get('missing',{},async()=>{throw Error('Network called')})).rejects.toThrow('Offline cache miss');
  const a=await validate(inputs,CUTOFF,c.directory,collection),b=await validate(JSON.parse(JSON.stringify(inputs)),CUTOFF,c.directory,collection);
  expect(hash(a.snapshot)).toBe(hash(b.snapshot));
  await render(a.snapshot,a,collection,join(d,'a.html'));await render(b.snapshot,b,collection,join(d,'b.html'));
  expect(await readFile(join(d,'a.html'),'utf8')).toBe(await readFile(join(d,'b.html'),'utf8'));
  const html=await readFile(join(d,'a.html'),'utf8');expect(html).toContain('Yearn Protocol Health 2026-10-30');expect(html).not.toContain('Oct 9');expect(html).not.toContain('@@REPORT@@');
  expect(render(a.snapshot,{ok:false},collection,join(d,'blocked.html'))).rejects.toThrow();
  await writeFile(join(c.directory,ev.id+'.json'),JSON.stringify({...ev,data:'tampered'}));
  expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(false);
}));
test('output location and argument validation protect raw evidence and publication',async()=>{
  expect(outsideRepository(join(ROOT,'data'))).rejects.toThrow('outside');
  expect(()=>parseArgs(['--offline','--publish'])).toThrow();expect(()=>parseArgs(['--as-of'])).toThrow();expect(()=>parseArgs(['--unknown'])).toThrow();expect(()=>parseArgs(['--stage','oops'])).toThrow();
});
test('publication retains exact returned URL before verification and never silently republishes',async()=>workspace(async(d,c)=>{
  const {publish}=await import('../scripts/publish');let uploads=0;
  const url='https://artifacts.yearn.dev/exact-returned-key.html',body='<html>synthetic</html>',digest=hash(body);
  const upload=async()=>{uploads++;return {key:'exact-returned-key.html',url}};
  await expect(publish(d,'synthetic.html',CUTOFF,digest,{upload,fetch:async()=>new Response('unavailable',{status:503})})).rejects.toThrow('URL saved');
  const receipt=JSON.parse(await readFile(join(d,'publication.json'),'utf8'));expect(receipt.url).toBe(url);expect(receipt.retention).toBe('archive');
  const result=await publish(d,'synthetic.html',CUTOFF,digest,{upload,fetch:async()=>new Response(body),verify:async()=>({ok:true,checks:[]})});
  expect(result.url).toBe(url);expect(uploads).toBe(1);
  await expect(publish(d,'synthetic.html',CUTOFF,hash('changed'),{upload})).rejects.toThrow('previous URL retained');
}));
test('context parsing preserves observed series and missing values rather than treating stocks as flows',async()=>workspace(async(d,c)=>{
  const {secondaryFromEvidence}=await import('../scripts/secondary');const records=[];
  records.push(await c.get('macro-fed',{},async()=>({body:'observation_date,DFF\n2026-10-01,4\n2026-10-02,.\n2026-11-01,9'})));
  records.push(await c.get('macro-stablecoins',{},async()=>[{date:Date.parse('2026-10-01')/1000,totalCirculatingUSD:{peggedUSD:100}}]));
  const r=await secondaryFromEvidence({cutoff:CUTOFF,sources:records.map(x=>({name:x.source,id:x.id}))},c.directory);
  expect(r.secondary.macro).toEqual([{at:'2026-10-01T00:00:00.000Z',fed:4,stableSupplyUsd:100,defiTvlUsd:null,evidence:records.map(x=>x.id)}]);
}));
test('MTD fee denominator includes partial-day exposure and historical truncated quarters are explicit',async()=>workspace(async(d,c)=>{
  const {inputs}=await fixture(c);inputs.current[0].usd=2000;
  const s=calculate(inputs),mtd=s.monthly.at(-1)!;
  expect(mtd.averageTvlUsd).toBeCloseTo((29*1000+2000/6)/(29+1/6));
  expect(mtd.tvlUsd).toBe(2000);
  expect(quarters('2026-11-15T00:00:00.000Z')[0].label).toBe('2025 Q4 (partial coverage)');
}));
test('concurrent evidence/progress saves are atomic without shared temporary paths',async()=>workspace(async(d,c)=>{
  const {save,readJSON}=await import('../scripts/io');const target=join(d,'progress.json');
  await Promise.all(Array.from({length:30},(_,i)=>save(target,{sequence:i,payload:'x'.repeat(1000)})));
  const result=await readJSON(target);expect(result.sequence).toBeGreaterThanOrEqual(0);expect(result.payload.length).toBe(1000);
}));
test('daily price labels after cutoff use the previous completed day rather than future data',async()=>workspace(async(d,c)=>{
  const {historicalPrice}=await import('../scripts/treasury');const original=globalThis.fetch;const calls:number[]=[];
  const cutoff=Math.floor(Date.parse(CUTOFF)/1000),previous=Math.floor(cutoff/86400)*86400-1,key='ethereum:0xsynthetic';
  try {
    globalThis.fetch=(async(url:any)=>{const ts=Number(String(url).split('/').at(-2));calls.push(ts);return new Response(JSON.stringify({coins:{[key]:{price:ts===cutoff?999:1,timestamp:ts===cutoff?cutoff+3600:previous,source:'synthetic'}}}));}) as typeof fetch;
    const quote=await historicalPrice('ethereum','0xsynthetic',CUTOFF,c,'https://synthetic.invalid');
    expect(calls).toEqual([cutoff,previous]);expect(quote.price).toBe(1);expect(quote.timestamp).toBeLessThan(cutoff);expect(quote.valuationBasis).toContain('previous completed UTC day');
  }finally{globalThis.fetch=original;}
}));
test('legacy Vyper proxies may return padding beyond the first ABI uint word',async()=>{
  const {uint}=await import('../scripts/treasury');const word='0x'+(123n).toString(16).padStart(64,'0');
  expect(uint(word+'0'.repeat(4096*2-64))).toBe(123n);expect(()=>uint('0x')).toThrow();expect(()=>uint('0x1234')).toThrow();
});
test('84-day reported accounts are never allocated into calendar revenue or budget expense',async()=>workspace(async(d,c)=>{
 const {inputs,collection}=await fixture(c),evidence=inputs.fees[0].evidence;
 inputs.accountingPeriods=[{id:3,label:'P3',start:'2026-07-23T00:00:00.000Z',end:'2026-10-15T00:00:00.000Z',complete:true,protocolRevenueUsd:600,recordedCostsUsd:1000,evidence},{id:4,label:'P4',start:'2026-10-15T00:00:00.000Z',end:'2027-01-07T00:00:00.000Z',complete:false,protocolRevenueUsd:0,recordedCostsUsd:0,evidence}];
 const s=calculate(inputs);expect(s.coverageRatio).toBe(0.6);expect(s.coveragePeriod?.label).toBe('P3');expect(s.monthly.every(m=>m.protocolRevenueUsd===null)).toBe(true);expect(s.quarters.every(q=>q.protocolRevenueUsd===null)).toBe(true);expect(s.monthly.find(m=>m.label==='2026-09')?.accrualExpensesUsd).toBeGreaterThan(0);
 expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(true);
 const bad=structuredClone(inputs);bad.accountingPeriods![1].complete=true;expect((await validate(bad,CUTOFF,c.directory,collection)).ok).toBe(false);
}));
test('verified retained mints do not invent gross or distributed fee splits',async()=>workspace(async(d,c)=>{
 const {inputs,collection}=await fixture(c);inputs.reportScope={vaults:{},fees:{basis:'identified-retained-mints'},treasury:{},methodology:'Synthetic scoped test',publicSources:[]};
 Object.assign(inputs.fees[0],{basis:'retained-mint',grossUsd:null,distributedUsd:null});
 expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(true);expect(calculate(inputs).monthly.find(m=>m.label==='2026-09')?.grossVaultFeesUsd).toBeNull();
 inputs.fees[0].distributedUsd=0;expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(false);
}));
test('unvalued inventory must be disclosed outside liquid scope; symbols never establish stablecoin identity',async()=>workspace(async(d,c)=>{
 const {inputs,collection}=await fixture(c);inputs.reportScope={vaults:{},fees:{},treasury:{basis:'reviewed-liquid-stable-scope'},methodology:'Synthetic scope',publicSources:[]};
 inputs.treasury.push({...inputs.treasury[0],id:'unpriced',usd:null,liquid:false,valuationGap:'Unverified legacy LP pricing'});
 expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(true);expect(calculate(inputs).treasury.liquidUsd).toBe(1000);
 inputs.treasury[1].liquid=true;expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(false);
 const {CASH_STABLES}=await import('../scripts/refresh-treasury');expect(CASH_STABLES.has('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);expect(CASH_STABLES.has('0xa04a3a553548090a7b81d2de75b8a08ee45860e1')).toBe(false);
}));
test('unverified APY explosions are rejected without flooring real negative returns',async()=>workspace(async(d,c)=>{
 const {inputs,collection}=await fixture(c);inputs.secondary={apy:[{vaultId:inputs.vaults[0].id,value:-0.1,evidence:inputs.fees[0].evidence}]};expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(true);expect(calculate(inputs).apy).toBe(-0.1);
 inputs.secondary.apy![0].value=3e22;expect((await validate(inputs,CUTOFF,c.directory,collection)).ok).toBe(false);
}));
test('historical block pins are keyed by requested instant as well as chain',async()=>workspace(async(d,c)=>{
 const {pin}=await import('../scripts/treasury');const original=globalThis.fetch;let reads=0;
 try{globalThis.fetch=(async(_:any,options:any)=>{reads++;const req=JSON.parse(options.body);if(req.method==='eth_blockNumber')return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x64'}));const number=req.params[0]==='latest'?100:Number(BigInt(req.params[0]));return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{number:'0x'+number.toString(16),hash:'0xsynthetic'+number,timestamp:'0x'+(Math.floor(Date.parse(CUTOFF)/1000)-100+number).toString(16)}}));}) as any;
 const earlier=new Date(Date.parse(CUTOFF)-10000).toISOString(),a=await pin(1,earlier,c),b=await pin(1,CUTOFF,c);expect(a.number).toBe(90);expect(b.number).toBe(100);expect(reads).toBeGreaterThan(2);
 }finally{globalThis.fetch=original;}
}));
test('padded legacy address returns resolve the first word rather than trailing padding',async()=>workspace(async(d,c)=>{
 const {resolveShare,pad}=await import('../scripts/treasury'),token='0x1111111111111111111111111111111111111111',asset='0x2222222222222222222222222222222222222222';
 const word=(x:string)=>'0x'+x.padStart(64,'0')+'0'.repeat(64);
 const fakeCache={get:async(_:string,p:any)=>{if(p.to===token&&p.data==='0x38d52e0f')throw Error('Legacy vault');if(p.to===token&&p.data==='0xfc0c546a')return {data:word(asset.slice(2))};if(p.to===token&&p.data==='0x99530b06')return {data:word((2n*10n**18n).toString(16))};if(p.to===asset&&p.data==='0x313ce567')return {data:word('12')};throw Error('Base token has no wrapper interface');}} as any;
 const r=await resolveShare(1,token,10n**18n,18,1,fakeCache);expect(r.underlying.token).toBe(asset);expect(r.underlying.raw).toBe('2000000000000000000');
}));
test('analytics calendar ranges stop at the last source-precision timestamp before the exclusive boundary',async()=>{
 const {trafficEnd}=await import('../scripts/traffic');expect(trafficEnd('2026-10-01T00:00:00.000Z')).toBe('2026-09-30T23:59:59.000Z');expect(trafficEnd(CUTOFF)).toBe('2026-10-30T03:59:59.000Z');expect(trafficEnd('2026-10-30T04:51:59.491Z')).toBe('2026-10-30T04:51:59.000Z');
});
test('hosting social-preview injection is accepted only when every report byte still matches',async()=>{
 const {sourceBytes}=await import('../scripts/publish'),receipt={url:'https://artifacts.yearn.dev/abcdef.html',key:'abcdef.html',retention:'archive'},html='<html><head><title>Report</title></head><body>Evidence</body></html>',image='https://artifacts.yearn.dev/archive/abcdef.png';
 const block=`<meta property="og:image" content="${image}">\n<meta property="og:image:type" content="image/png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${image}">`;
 const served=html.replace('</head>',block+'</head>');expect(sourceBytes(served,receipt).html).toBe(html);expect(hash(sourceBytes(served.replace('Evidence','Changed'),receipt).html)).not.toBe(hash(html));expect(sourceBytes(served.replace('1200','1201'),receipt).html).not.toBe(html);
});
