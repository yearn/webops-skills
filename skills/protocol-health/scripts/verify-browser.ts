import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
export async function verifyBrowser(target:string,output:string,date:string,prefix='local') {
  const checks:{name:string;ok:boolean;error?:string}[]=[];
  let browser:any;
  try {
    const module=process.env.PROTOCOL_HEALTH_PLAYWRIGHT_MODULE||'playwright';
    const { chromium }=await import(module);
    browser=await chromium.launch({headless:true});
    const url=/^https?:/.test(target)?target:pathToFileURL(target).href;
    for(const mobile of [false,true]) {
      const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
      const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
      if(!/^https?:/.test(target))await page.route(/^https?:/, (route:any)=>route.abort());
      const check=async(name:string,fn:()=>Promise<void>)=>{try{await fn();checks.push({name:(mobile?'mobile ':'desktop ')+name,ok:true});}catch(e:any){checks.push({name:(mobile?'mobile ':'desktop ')+name,ok:false,error:e.message.slice(0,400)});}};
      const assert=async(value:unknown,message:string)=>{if(!value)throw Error(message)};
      await page.goto(url);
      await check('dated title',async()=>{await assert(await page.title()==='Yearn Protocol Health '+date,'Wrong dated title')});
      await check('nine panels and no horizontal overflow',async()=>{
        await assert(await page.locator('.tile').count()===9,'Missing panels');
        await assert(await page.locator('.tile .card-chart').count()>=5,'Missing card charts');
        await assert(await page.locator('.tile .more').count()===0,'Redundant Details hover text');
        await assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
      });
      for(const theme of ['light','dark'])await check(theme+' theme',async()=>{
        await page.evaluate((value:string)=>(window as any).YearnTheme.set(value),theme);
        await assert(await page.locator('html').getAttribute('data-theme')===theme,'Theme did not change');
        await page.screenshot({path:join(output,`${prefix}-${mobile?'mobile':'desktop'}-${theme}.png`),fullPage:true});
      });
      for(let i=0;i<9;i++)await check('panel '+i,async()=>{
        await page.locator(`.tile[data-i="${i}"]`).click();
        await assert(await page.locator('#drawer').getAttribute('aria-hidden')==='false','Drawer failed to open');
        await assert((await page.locator('#d-body').innerText()).length>20,'Empty drill-down');
        await page.keyboard.press('Escape');
        await assert(await page.locator('#drawer').getAttribute('aria-hidden')==='true','ESC failed');
      });
      await check('Key Metrics group navigation',async()=>{
        await page.locator('.tile[data-i="4"]').click();
        for(let i=0;i<4;i++){
          await page.locator(`[data-metric-group="${i}"]`).click();
          await assert(await page.locator(`#metrics-tab-${i}`).getAttribute('aria-selected')==='true','Metric group failed');
          await assert((await page.locator('#metrics-group-content').innerText()).length>20,'Empty metric group');
        }
        await page.locator('#metrics-tab-3').press('Home');
        await assert(await page.locator('#metrics-tab-0').getAttribute('aria-selected')==='true','Keyboard navigation failed');
        await page.keyboard.press('Escape');
      });
      await check('menu hash, Back, Forward, refresh and ESC',async()=>{
        await page.locator('[data-menu-open]').first().click();
        await page.waitForFunction(()=>location.hash==='#open-menu'&&(document.querySelector('#site-menu') as HTMLDialogElement).open);
        await page.goBack();
        await page.waitForFunction(()=>!(document.querySelector('#site-menu') as HTMLDialogElement).open);
        await page.goForward();
        await page.waitForFunction(()=>(document.querySelector('#site-menu') as HTMLDialogElement).open);
        await page.reload();
        await page.waitForFunction(()=>(document.querySelector('#site-menu') as HTMLDialogElement).open);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>location.hash!=='#open-menu'&&!(document.querySelector('#site-menu') as HTMLDialogElement).open);
        await page.goto(url+'#open-menu');await page.reload();
        await page.waitForFunction(()=>(document.querySelector('#site-menu') as HTMLDialogElement).open);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>location.hash!=='#open-menu'&&!(document.querySelector('#site-menu') as HTMLDialogElement).open);
      });
      await check('no script errors or invalid chart coordinates',async()=>{
        await assert(!errors.length,errors.join('; '));
        await assert(!await page.evaluate(()=>[...document.querySelectorAll('svg path')].some(p=>/NaN|Infinity/.test(p.getAttribute('d')??''))),'Invalid SVG coordinates');
      });
      await page.close();
    }
  }catch(e:any){checks.push({name:'Browser runtime',ok:false,error:'Install Playwright and Chromium, or set PROTOCOL_HEALTH_PLAYWRIGHT_MODULE to an installed module. '+e.message.slice(0,200)});}
  finally{await browser?.close();}
  return {ok:checks.every(c=>c.ok),checks};
}
