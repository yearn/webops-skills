#!/usr/bin/env bun
import { join, resolve } from 'node:path';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { Cache, ROOT, VERSION, readJSON, save, hash, defaultOutput, outsideRepository } from './io';
import { cutoffISO } from './periods';
import { preflight, collect } from './collect';
import { validate } from './validate';
import { render } from './render';
import { verifyBrowser } from './verify-browser';
import { publish as publishReport } from './publish';
import {importEvidence,collectDelta} from './reuse';
import {reconcile} from './reconcile';
import {importBudgetState} from './financial-reuse';
export function parseArgs(argv:string[]) {
  const options:Record<string,string|boolean>={};
  const flags=new Set(['publish','no-publish','offline','help']),values=new Set(['as-of','output','stage','input','import-evidence','import-budget']);
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];if(!a.startsWith('--'))throw Error('Unexpected argument');
    const [key,v]=a.slice(2).split('=',2);
    if(flags.has(key)){if(v!=null)throw Error(`--${key} takes no value`);options[key]=true;}
    else if(values.has(key)){const value=v??argv[++i];if(!value||value.startsWith('--'))throw Error(`Missing --${key} value`);options[key]=value;}
    else throw Error(`Unknown option --${key}`);
  }
  if(options.publish&&options['no-publish'])throw Error('Choose --publish or --no-publish');
  if(options.offline&&options.publish)throw Error('Offline runs cannot publish');
  if(options.stage&&!['preflight','collect','validate','render','verify','publish','reuse','reconcile','all'].includes(String(options.stage)))throw Error('Unknown stage');
  return options;
}
async function exists(p:string){try{await stat(p);return true;}catch(e:any){if(e.code==='ENOENT')return false;throw e;}}
export async function main(argv=process.argv.slice(2)) {
  const args=parseArgs(argv);
  if(args.help){console.log('bun run protocol-health [--as-of UTC_TIMESTAMP] [--output DIRECTORY] [--publish | --no-publish] [--stage preflight|collect|validate|render|verify|publish|reuse|reconcile|all] [--input inputs.json] [--import-evidence DIRECTORY] [--import-budget FILE] [--offline]\nPublication defaults on. Successful requests are cached per cutoff; resume with the same --output. Offline validation/render/verify never accesses the network.');return;}
  let cutoff=cutoffISO(args['as-of'] as string|undefined);
  const output=await outsideRepository(args.output?resolve(String(args.output)):defaultOutput(cutoff));
  await mkdir(output,{recursive:true,mode:0o700});
  const runPath=join(output,'run.json');
  if(await exists(runPath)) {
    const previous=await readJSON(runPath);
    if(args['as-of']&&cutoff!==previous.cutoff)throw Error('Output belongs to another cutoff; use a new directory.');
    if(previous.version!==VERSION)throw Error('Collector version differs; use a new directory.');
    cutoff=previous.cutoff;
  } else await save(runPath,{version:VERSION,cutoff,startedAt:new Date().toISOString()});
  const stage=String(args.stage??'all'),offline=!!args.offline,publish=!args['no-publish']&&!offline;
  const cache=new Cache(join(output,'cache'),cutoff,offline);
  console.log(JSON.stringify({output,cutoff,stage,offline,publish}));
  if(args['import-evidence'])await importEvidence(output,String(args['import-evidence']),cache);
  if(args['import-budget'])await importBudgetState(output,String(args['import-budget']),cache);
  if(stage==='reconcile'){await reconcile(output,cache);return;}
  if(stage==='reuse'){await collectDelta(output,cache);return;}
  const preflightPath=join(output,'preflight.json');
  if(stage==='all'||stage==='preflight'||stage==='collect') {
    const p=await preflight(output,cutoff,publish,offline);
    if(!p.ok){await save(join(output,'validation.json'),{ok:false,cutoff,stage:'preflight',errors:p.errors});await save(join(output,'publication.json'),{status:'blocked',cutoff,reason:'Core preflight failed; nothing uploaded.'});throw Error(p.errors.join('\n'));}
    if(stage==='preflight')return;
  }
  if(stage==='all'||stage==='collect') {await collect(output,cutoff,cache);if(stage==='collect')return;}
  const inputPath=join(output,'inputs.json');
  if(args.input) {
    const normalized=await readJSON(resolve(String(args.input))); // Only an explicit input is copied; never infer October data.
    if(normalized.cutoff!==cutoff)throw Error('Normalized inputs have another cutoff');
    await save(inputPath,normalized);
  }
  if(!await exists(inputPath)) {
    const message='Collection is saved. Reconcile the raw evidence into inputs.json using references/input-schema.md and methodology.md, then resume --stage validate. Core accounting cannot be inferred from labels or fee transfers alone.';
    await save(join(output,'validation.json'),{ok:false,cutoff,stage:'reconciliation',errors:[message]});
    await save(join(output,'publication.json'),{status:'blocked',cutoff,reason:message});
    throw Error(message);
  }
  const input=await readJSON(inputPath),collection=await readJSON(join(output,'collection.json'));
  const validation=await validate(input,cutoff,cache.directory,collection);
  const {snapshot,...validationResult}=validation;
  await save(join(output,'validation.json'),validationResult);
  if(!validation.ok)throw Error('Core validation failed; see validation.json. Nothing published.');
  const fingerprint=hash(input);
  await save(join(output,'snapshot.json'),{...snapshot,inputSha256:fingerprint,sourceManifest:collection.sources});
  const methodology=await readFile(join(ROOT,'references/methodology.md'),'utf8');
  // Publishable notes contain aggregate methodology; private review notes stay in inputs.json.
  await writeFile(join(output,'methodology.md'),methodology+'\n\nSnapshot cutoff: '+cutoff+'\nInput SHA-256: '+fingerprint+'\n',{mode:0o600});
  await save(join(output,'sources.json'),collection);
  if(stage==='validate')return;
  const htmlPath=join(output,'index.html'),rendered=await render(snapshot,validationResult,collection,htmlPath);
  await save(join(output,'render.json'),rendered);
  if(stage==='render')return;
  const browser=await verifyBrowser(htmlPath,output,cutoff.slice(0,10));
  await save(join(output,'browser-validation.json'),browser);
  if(!browser.ok)throw Error('Browser validation failed; publication blocked.');
  if(stage==='verify')return;
  if(!publish) {await save(join(output,'publication.json'),{status:'not-requested',cutoff,htmlSha256:rendered.sha256});return;}
  const receipt=await publishReport(output,htmlPath,cutoff,rendered.sha256);
  console.log(JSON.stringify({url:receipt.url,output}));
}
if(import.meta.main) {
  // Bun SQL may unref its socket while a large result is pending. Keep the CLI alive until every stage settles.
  const keepAlive=setInterval(()=>{},1000);
  try {await main();} catch(e) {console.error(e instanceof Error?e.message:'Protocol health failed');process.exitCode=1;}
  finally {clearInterval(keepAlive);}
}
