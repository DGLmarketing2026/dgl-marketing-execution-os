// Isolated real-browser test. Requires Playwright and a Chromium executable.
// All requests except this local fixture and the exact repository logo are blocked.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../..'),CID='CMP-CAMPANA-A-HA-PRIORITARIA',SID='SCOPE-CAMPANA-A-HA-PRIORITARIA';
const digest=require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'assets/brand/dgl-logo-white.png'))).digest('hex');
const scripts=['creative-library-v5','copy-engine-v5','campaign-studio-v5','campaign-scope-bridge-v6','campaign-studio-v6'];
const context={contextVersion:1,campaignId:CID,campaignName:'Activation Prioritaria - Campana A (HA)',objective:'Activation',campaignType:'Activation',service:'Multiservicio',scopeId:SID,audienceId:SID,playbookId:'ACTIVATION_ACCOUNT',messageAngle:'Current Movement',language:'MULTILINGUAL',status:'AUTO_ACTIVE',requiredLanguages:['ES','EN','PT'],languageCounts:{ES:2,EN:3,PT:1},eligibleContacts:6,eligibleAccounts:4,excludedContacts:1,audienceResolved:true,metadataValid:true,logoVerified:true,logoSha256:digest,logoUrl:'https://dglmarketing2026.github.io/dgl-marketing-execution-os/assets/brand/dgl-logo-white.png',replyTo:'info@dglus.com',approvedCreativeVariants:[]};
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/css/campaign-v5.css"><style>body{font-family:Arial;background:#f4f6f8;margin:28px}button{cursor:pointer}</style></head><body><main id="mount"></main>'+scripts.map(n=>'<script src="/assets/js/'+n+'.js"></script>').join('')+'</body></html>');return;}
 const local=path.resolve(root,'.'+req.url.split('?')[0]);if(!local.startsWith(root+path.sep)||!fs.existsSync(local)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',local.endsWith('.js')?'application/javascript; charset=utf-8':'text/css');res.end(fs.readFileSync(local));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.DGL_CHROMIUM_PATH?{executablePath:process.env.DGL_CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});let logoFailure=false;
  await page.route('**/*',async route=>{
   const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();
   if(url===context.logoUrl){if(logoFailure)return route.abort();return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'assets/brand/dgl-logo-white.png'))});}
   return route.abort();
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(c=>{
   window.fixture={approvals:[],revokes:[],drafts:[],sets:0};let ver=0;
   const checksum=s=>{let h=0;for(let i=0;i<s.length;i++)h=(31*h+s.charCodeAt(i))>>>0;return h;};
   window.DGL_MARKETING_BACKEND_ADAPTER_V55={isConnected:()=>true,refresh:async()=>{},getCampaigns:()=>[c],getCampaignStudioContext:async()=>c,getLatestApprovedCreative:async()=>null,
    approveCreative:async(id,p)=>{fixture.approvals.push(p);const v=++ver;return {creativeId:'C'+v,creativeVersion:v,approvalId:'A'+v,htmlChecksum:checksum(p.htmlBody),contentChecksum:checksum([p.subject,p.htmlBody,p.textBody,p.templateId,String(v)].join('\u0001'))};},
    revokeApprovedCreative:async id=>{fixture.revokes.push(id);return {status:'REVOKED'};},
    approveCreativeSet:async()=>{fixture.sets++;return {status:'APPROVED'};},
    createTestDraft:async(id,p)=>{fixture.drafts.push(p);return {status:'TEST DRAFT CREATED'};}};
  },context);
  await page.goto(origin+'/#/campaign-studio');await page.evaluate(()=>DGL_MODULE_RENDERERS['campaign-studio'](document.getElementById('mount')));
  await page.getByRole('heading',{name:'SELECT A CAMPAIGN TO OPEN IN STUDIO'}).waitFor();
  await page.locator('[data-studio-open]').click();
  await page.locator('[data-studio-approve]:not([disabled])').waitFor();
  assert(await page.locator('[role=status]').textContent().then(t=>t.includes('PASS')));
  for(const language of ['ES','EN','PT']){
   await page.locator('[data-studio-language="'+language+'"]').click();
   const frame=page.frameLocator('[data-studio-preview]');await frame.locator('[lang="'+language.toLowerCase()+'"]').waitFor();
   await frame.locator('img').evaluate(i=>i.complete&&i.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{i.onload=resolve;i.onerror=reject;}));
   const dims=await frame.locator('img').evaluate(i=>({loaded:i.complete&&i.naturalWidth>0,natural:i.naturalWidth/i.naturalHeight,rendered:i.getBoundingClientRect().width/i.getBoundingClientRect().height}));assert(dims.loaded);assert(Math.abs(dims.natural-dims.rendered)<0.02,'logo keeps exact aspect ratio');
   const approve=page.locator('[data-studio-approve]');await approve.scrollIntoViewIfNeeded();
   if(language==='EN')await approve.press('Enter');else await approve.click();
   await page.getByRole('button',{name:new RegExp('^'+language+'.*APPROVED')}).waitFor();
  }
  await page.locator('[data-studio-set]').click();assert.equal(await page.evaluate(()=>fixture.sets),1);
  await page.locator('[data-studio-test]').click();await page.getByRole('button',{name:/^PT.*CREATED/}).waitFor();
  assert.equal(await page.evaluate(()=>fixture.drafts[0].htmlBody===DGL_CAMPAIGN_STUDIO_V6.preview()),true);
  await page.locator('[data-studio-copy="body"]').fill('Se a {{company}} tiver um embarque, envie os detalhes.');await page.locator('[data-studio-copy="body"]').press('Tab');
  await page.getByRole('button',{name:/^PT.*STALE AFTER EDIT/}).waitFor();assert.equal(await page.evaluate(()=>fixture.revokes.length),1);assert.equal(await page.evaluate(()=>DGL_CAMPAIGN_STUDIO_V6.getVariants().ES.approved),true);
  assert(await page.locator('[data-studio-set]').isDisabled());assert.equal(await page.locator('button').filter({hasText:'Create Audience Drafts'}).count(),0);
  assert.equal(await page.locator('.governed-summary select,.governed-summary input').count(),0);
  await page.frameLocator('[data-studio-preview]').locator('img').evaluate(i=>i.complete&&i.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{i.onload=resolve;i.onerror=reject;}));
  const masterWidth=await page.frameLocator('[data-studio-preview]').locator('table').first().evaluate(n=>n.getBoundingClientRect().width);assert(masterWidth>=670&&masterWidth<=680,'680px master is visible at desktop size');
  await page.setViewportSize({width:1440,height:1800});
  await page.evaluate(()=>scrollTo(0,0));
  await page.frameLocator('[data-studio-preview]').locator('h1').waitFor({state:'visible'});
  await page.waitForTimeout(300);
  if(process.env.DGL_STUDIO_SCREENSHOT)await page.screenshot({path:process.env.DGL_STUDIO_SCREENSHOT,fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile editor fits viewport');
  logoFailure=true;await page.reload();await page.evaluate(()=>DGL_CAMPAIGN_STUDIO_V6.bind('CMP-CAMPANA-A-HA-PRIORITARIA'));assert.equal(await page.evaluate(()=>DGL_CAMPAIGN_STUDIO_V6.brandQA(DGL_CAMPAIGN_STUDIO_V6.preview())),false);
  assert.deepEqual(errors,[]);console.log('PASS real browser: exact logo load/proportions, chooser, languages, approvals, draft/edit isolation, complete-set gate, responsive editor, failed image blocks approval');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
