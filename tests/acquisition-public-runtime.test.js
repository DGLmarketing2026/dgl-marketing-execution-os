const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'backend/apps-script-acquisition-public/AcquisitionPublicRuntime.gs'),'utf8');

// Static contract checks (still present after the redesign).
assert(source.includes('LockService'),'lead form must still use LockService against concurrent writes');
assert(source.includes('honeypot=acqPubText_(p.website)'),'honeypot field must remain');
assert(source.includes("var lock=LockService.getScriptLock()"),'PII append must remain lock-guarded');
assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(source),'no hardcoded email address anywhere in the public runtime source');
assert(!/leadId\s*:\s*['"]LEAD-[A-Z0-9]/.test(source)&&!/company\s*:\s*['"][A-Z][a-z]+ (Inc|Co|LLC)/.test(source),'no hardcoded lead fixture records (form labels like firstName:"Nome" are UI copy, not PII, and are allowed)');
assert(source.includes('Poppins')&&source.includes('Montserrat'),'must use Poppins/Montserrat typography');
assert(source.includes('#77B82A')&&source.includes('#05035C'),'must use DGL brand colors');
assert(source.includes('ACQ_PUBLIC_DESIGN_FALLBACK'),'must map FTL/LTL/Drayage to their design systems for legacy rows');
assert(source.includes('@media(max-width:760px)'),'must include a responsive mobile layout');
assert(source.includes('rel="canonical"'),'must emit a canonical link');
assert(source.includes('meta name="description"'),'must emit a real meta description');
assert(source.includes('acqPubLangSwitch_'),'must render a language switcher');

// Behavioral checks: render actual HTML from mocked landing rows.
function makeGasContext(rows){
  const ctx={
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>'TEST_ID'})},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>({
      getLastColumn:()=>Object.keys(rows[0]||{}).length,
      getLastRow:()=>rows.length+1,
      getRange(r,c,numRows,numCols){
        const headers=Object.keys(rows[0]||{});
        return {getValues(){
          if(r===1)return [headers];
          const out=[];for(let i=0;i<numRows;i++){const row=rows[r-2+i];out.push(row?headers.map(h=>row[h]):[]);}return out;
        }};
      }
    })})},
    ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/FAKE/exec'})},
    HtmlService:{createHtmlOutput:html=>({html,setTitle(t){this.title=t;return this;},setXFrameOptionsMode(){return this;}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}},
    ContentService:{createTextOutput:t=>({t,setMimeType(){return this;}}),MimeType:{JSON:'JSON'}},
    console
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:'AcquisitionPublicRuntime.gs'});
  return ctx;
}

const campaignKey='test-campaign-ftl';
const rows=[
  {landingPageId:'LP-1',signalId:'SIG-1',variantKey:campaignKey+'-en',language:'en',defaultForMarket:'true',campaignKey:campaignKey,channel:'Organic',market:'USA',service:'FTL',objective:'Lead Generation',designSystem:'SPLIT FREIGHT',assetPath:'assets/creative/dgl-ftl-truck.webp',slug:'ftl-usa-en',headline:'U.S. FTL capacity when your operation cannot wait.',subheadline:'Share your lane and ship date.',supportingCopy:'Full truckload coverage with dedicated equipment.',ctaLabel:'REQUEST FTL CAPACITY',seoTitle:'FTL Trucking Capacity in the U.S. | DGL',seoDescription:'Request U.S. full truckload capacity from DGL.',formVariant:'NEW_BUSINESS_REQUIREMENT',utmSource:'landing',utmMedium:'organic',utmCampaign:campaignKey,status:'LIVE',publishedUrl:'',createdAt:'',updatedAt:''},
  {landingPageId:'LP-2',signalId:'SIG-1',variantKey:campaignKey+'-es',language:'es',defaultForMarket:'false',campaignKey:campaignKey,channel:'Organic',market:'USA',service:'FTL',objective:'Lead Generation',designSystem:'SPLIT FREIGHT',assetPath:'assets/creative/dgl-ftl-truck.webp',slug:'ftl-usa-es',headline:'Capacidad FTL en EE.UU. cuando su operación no puede esperar.',subheadline:'Comparta su ruta y fecha de embarque.',supportingCopy:'Cobertura FTL con equipo dedicado.',ctaLabel:'SOLICITAR CAPACIDAD FTL',seoTitle:'Capacidad de Transporte FTL en EE.UU. | DGL',seoDescription:'Solicite capacidad FTL en Estados Unidos con DGL.',formVariant:'NEW_BUSINESS_REQUIREMENT',utmSource:'landing',utmMedium:'organico',utmCampaign:campaignKey,status:'LIVE',publishedUrl:'',createdAt:'',updatedAt:''},
  {landingPageId:'LP-3',signalId:'SIG-1',variantKey:campaignKey+'-pt-BR',language:'pt-BR',defaultForMarket:'false',campaignKey:campaignKey,channel:'Organic',market:'USA',service:'FTL',objective:'Lead Generation',designSystem:'SPLIT FREIGHT',assetPath:'assets/creative/dgl-ftl-truck.webp',slug:'ftl-usa-pt-br',headline:'Capacidade FTL nos EUA quando sua operação não pode esperar.',subheadline:'Envie a rota e a data do embarque.',supportingCopy:'Cobertura FTL com equipamento dedicado.',ctaLabel:'SOLICITAR CAPACIDADE FTL',seoTitle:'Capacidade de Transporte FTL nos EUA | DGL',seoDescription:'Solicite capacidade FTL nos Estados Unidos com a DGL.',formVariant:'NEW_BUSINESS_REQUIREMENT',utmSource:'landing',utmMedium:'organico',utmCampaign:campaignKey,status:'LIVE',publishedUrl:'',createdAt:'',updatedAt:''}
];

(function testEnLanding(){
  const ctx=makeGasContext(rows);
  const out=ctx.doGet({parameter:{slug:'ftl-usa-en'}});
  assert(out.html.includes('U.S. FTL capacity when your operation cannot wait.'),'EN headline must render');
  assert(out.html.includes(ctx.acqPubAssetUrl_('assets/creative/dgl-ftl-truck.webp')),'hero must use the real asset URL');
  assert(out.html.includes('skin-split'),'FTL must render with the SPLIT FREIGHT skin');
  assert(out.html.includes('href="?slug=ftl-usa-es"')&&out.html.includes('href="?slug=ftl-usa-pt-br"'),'language switch must link to the real sibling slugs, not a translation widget');
  assert(out.title==='FTL Trucking Capacity in the U.S. | DGL','document title must use the real SEO title');
  assert(out.html.includes('<meta name="description" content="Request U.S. full truckload capacity from DGL.">'),'meta description must use the real SEO description');
  console.log('PASS: EN real landing renders full design + language switch + SEO metadata');
})();

(function testEsLanding(){
  const ctx=makeGasContext(rows);
  const out=ctx.doGet({parameter:{slug:'ftl-usa-es'}});
  assert(out.html.includes('Capacidad FTL en EE.UU. cuando su operación no puede esperar.'));
  assert(out.html.includes('SOLICITAR CAPACIDAD FTL'));
  console.log('PASS: ES real landing renders its own localized content');
})();

(function testPtBrLanding(){
  const ctx=makeGasContext(rows);
  const out=ctx.doGet({parameter:{slug:'ftl-usa-pt-br'}});
  assert(out.html.includes('Capacidade FTL nos EUA quando sua operação não pode esperar.'));
  assert(out.html.includes('SOLICITAR CAPACIDADE FTL'));
  assert(!out.html.includes('Capacidad FTL en EE.UU'),'pt-BR page must never fall back to Spanish copy');
  console.log('PASS: PT-BR real landing renders native Portuguese content with no Spanish fallback');
})();

(function testDedupeAndFormSubmission(){
  const ctx=makeGasContext(rows);
  const appended=[];
  ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  ctx.Utilities={getUuid:()=>'lead-uuid-0000000000000000000'};
  ctx.acqPubAppend_=(name,record)=>appended.push([name,record]);
  const out=ctx.doPost({parameter:{slug:'ftl-usa-en',company:'Acme Co',email:'buyer@acme.com',service:'FTL',firstName:'Jane',website:''}});
  assert.equal(appended.length,1);assert.equal(appended[0][0],'MKT_ACQ_LEADS');
  assert.equal(appended[0][1].company,'Acme Co');
  assert.equal(appended[0][1].validationStatus,'PENDING');
  assert(out.html.includes('Thank you'),'EN confirmation copy must render');
  console.log('PASS: public form submission appends to the private Data Hub only, with the honeypot untouched');
})();

(function testHoneypotBlocksSubmission(){
  const ctx=makeGasContext(rows);
  let appended=0;
  ctx.acqPubAppend_=()=>appended++;
  ctx.doPost({parameter:{slug:'ftl-usa-en',company:'Acme Co',email:'buyer@acme.com',service:'FTL',website:'bot-filled-this'}});
  assert.equal(appended,0,'a filled honeypot field must silently drop the submission');
  console.log('PASS: honeypot still blocks bot submissions after the redesign');
})();

console.log('Acquisition public runtime: ALL PASS');
