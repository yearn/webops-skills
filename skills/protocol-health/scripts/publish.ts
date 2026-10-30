import { join,resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { ROOT,readJSON,save,hash } from './io';
import { verifyBrowser } from './verify-browser';
type Result={key:string;url:string};
async function upload(htmlPath:string):Promise<Result> {
  const publisher=resolve(ROOT,'../post-artifact/scripts/post-artifact.ts');
  const proc=Bun.spawn(['bun',publisher,'--file',htmlPath,'--scanner','protocol-health','--repository','yearn/webops-skills','--retention','archive'],{stdout:'pipe',stderr:'pipe'});
  const [stdout]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text()]);
  if(await proc.exited!==0)throw Error('post-artifact failed; outcome is uncertain in publication.json.');
  return JSON.parse(stdout);
}
// Yearn Artifacts appends only these six social-preview tags to the stored HTML head.
// Accept the exact known transformation, then require a full source-byte hash match.
export function sourceBytes(served:string,receipt:{url:string;retention:string;key:string}) {
  const origin=new URL(receipt.url).origin,key=receipt.key.split('/').at(-1)!,image=`${origin}/${receipt.retention}/${key.replace(/\.[^.]+$/,'.png')}`;
  const block=`<meta property="og:image" content="${image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${image}">`;
  const marker=block+'</head>';
  if(served.split(marker).length===2)return {html:served.replace(marker,'</head>'),transform:'Yearn Artifacts social-preview metadata',thumbnailUrl:image};
  return {html:served,transform:'none'};
}
export async function publish(output:string,htmlPath:string,cutoff:string,digest:string,options:{upload?:(path:string)=>Promise<Result>;fetch?:typeof fetch;verify?:typeof verifyBrowser}={}) {
  const receiptPath=join(output,'publication.json');let receipt:any=null;
  try{await stat(receiptPath);receipt=await readJSON(receiptPath);}catch(e:any){if(e.code!=='ENOENT')throw e;}
  if(receipt?.url) {
    if(receipt.htmlSha256!==digest)throw Error('Published bytes differ. Use a fresh directory; previous URL retained.');
  } else {
    if(receipt?.status==='publishing')throw Error('Prior publication outcome is uncertain. Inspect the service before retrying.');
    if(!options.upload&&!process.env.ARTIFACTS_API_KEY)throw Error('Missing ARTIFACTS_API_KEY. Relaunch through openv with it selected, then resume this output directory.');
    await save(receiptPath,{status:'publishing',cutoff,htmlSha256:digest});
    const result=await (options.upload??upload)(htmlPath);
    if(!result.url||!result.key||!/^https:\/\//.test(result.url))throw Error('Unexpected publisher receipt; inspect service before retrying');
    receipt={...result,status:'published',cutoff,retention:'archive',htmlSha256:digest,publishedAt:new Date().toISOString()};
    await save(receiptPath,receipt); // URL is durable even if the very next verification fails.
  }
  const response=await (options.fetch??fetch)(receipt.url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Published artifact HTTP verification failed; URL saved.');
  const served=await response.text(),normalized=sourceBytes(served,receipt),sourceSha256=hash(normalized.html);
  await save(join(output,'published-byte-validation.json'),{ok:sourceSha256===digest,servedSha256:hash(served),sourceSha256,expectedSha256:digest,transform:normalized.transform,thumbnailUrl:normalized.thumbnailUrl});
  if(sourceSha256!==digest)throw Error('Published artifact byte verification failed; URL saved.');
  const remote=await (options.verify??verifyBrowser)(receipt.url,output,cutoff.slice(0,10),'published');
  await save(join(output,'published-validation.json'),remote);
  if(!remote.ok)throw Error('Published browser verification failed; URL saved.');
  return receipt;
}
