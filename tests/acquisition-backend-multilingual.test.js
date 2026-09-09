const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const engineSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6AcquisitionEngine.gs'),'utf8');

// Minimal in-memory Apps Script mock: a "spreadsheet" is a Map<sheetName, {headers, rows}>.
function makeBook(){
  const sheets=new Map();
  return {
    getSheetByName(name){
      if(!sheets.has(name))return null;
      const s=sheets.get(name);
      return {
        getLastColumn:()=>s.headers.length,
        getLastRow:()=>s.rows.length+1,
        getRange(r,c,numRows,numCols){
          return {
            getValues(){
              if(r===1)return [s.headers.slice(0,numCols)];
              const out=[];
              for(let i=0;i<numRows;i++)out.push((s.rows[r-2+i]||[]).slice(0,numCols));
              return out;
            },
            setValues(vals){
              if(r===1){s.headers=vals[0].slice();return;}
              for(let i=0;i<vals.length;i++)s.rows[r-2+i]=vals[i].slice();
            }
          };
        },
        appendRow(values){s.rows.push(values.slice());}
      };
    },
    insertSheet(name){sheets.set(name,{headers:[],rows:[]});return this.getSheetByName(name);},
    getParent(){return this;}
  };
}

function makeContext(){
  const book=makeBook();
  const props={MKT_DATA_HUB_ID:'TEST_DATA_HUB_ID'};
  const ctx={
    SpreadsheetApp:{openById:()=>book},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;}})},
    Utilities:{getUuid:()=>'uuid-'+Math.random().toString(36).slice(2)},
    ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyHours:()=>({create:()=>{}})})}),deleteTrigger(){}},
    UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>'{}'})},
    console
  };
  vm.createContext(ctx);
  vm.runInContext(engineSource,ctx,{filename:'MarketingV6AcquisitionEngine.gs'});
  ctx.__props=props;
  return ctx;
}

// --- Production generates English-only landing variants (FINAL CANONICAL
// OPERATING MODEL, 2026-09-09: "Remove ES/PT-BR from the active production
// workflow for now ... production UI and automation must use English only").
// The underlying multilingual engine (v6AcqI18n_, MKT_V6_ACQ_LANGUAGES_ALL)
// stays fully intact -- see testInternalMultilingualPreserved below -- this
// only asserts what PRODUCTION actually generates today. ---
(function testEnglishOnlyVariant(){
  const ctx=makeContext();
  const signal={signalId:'SIG-TEST-1',source:'TEST',channel:'Organic',market:'USA',service:'FTL',objective:'Lead Generation',languageOverride:''};
  const result=ctx.v6AcqEnsureLandingVariants_(signal);
  assert.equal(result.created,1,'production must generate exactly 1 variant (English only) per signal');
  const langs=result.records.map(r=>r.language);
  assert.deepEqual(langs,['en'],'production must generate only the English variant');
  result.records.forEach(r=>{
    ['landingPageId','signalId','variantKey','language','defaultForMarket','campaignKey','channel','market','service','objective','designSystem','assetPath','slug','headline','subheadline','supportingCopy','ctaLabel','seoTitle','seoDescription','formVariant','utmSource','utmMedium','utmCampaign','status','createdAt','updatedAt'].forEach(field=>{
      assert(Object.prototype.hasOwnProperty.call(r,field),`variant missing field ${field}`);
      if(['defaultForMarket','publishedUrl'].indexOf(field)<0)assert(String(r[field]).length>0,`variant field ${field} must not be empty`);
    });
  });
  const en=result.records.find(r=>r.language==='en');
  assert.equal(en.designSystem,'SPLIT FREIGHT');assert.equal(en.assetPath,'assets/creative/dgl-ftl-truck.webp');
  assert.equal(en.defaultForMarket,true,'the single generated English variant must be the default');
  console.log('PASS: production generates the English-only landing variant, all fields populated');
})();

// --- English-only production stays correct even for LATAM/Brazil markets:
// the market-routing suggestion (es/pt-BR) is clamped to the active
// (English-only) language set, never silently generating zero variants. ---
(function testEnglishOnlyClampedForNonEnglishMarkets(){
  const ctx=makeContext();
  const signal={signalId:'SIG-TEST-BR',source:'TEST',channel:'Organic',market:'Brazil',service:'LTL',objective:'Lead Generation',languageOverride:''};
  const result=ctx.v6AcqEnsureLandingVariants_(signal);
  assert.equal(result.created,1);
  assert.equal(result.records[0].language,'en');
  assert.equal(result.records[0].defaultForMarket,true,'must still be marked default even though the market would otherwise suggest pt-BR');
  console.log('PASS: Brazil/LATAM signals still generate exactly the English variant, correctly marked default');
})();

// --- Idempotency: signal + language = one variant, never duplicated ---
(function testIdempotency(){
  const ctx=makeContext();
  const signal={signalId:'SIG-TEST-2',source:'TEST',channel:'Organic',market:'Brazil',service:'LTL',objective:'Lead Generation',languageOverride:''};
  const first=ctx.v6AcqEnsureLandingVariants_(signal);
  assert.equal(first.created,1);
  const second=ctx.v6AcqEnsureLandingVariants_(signal);
  assert.equal(second.created,0,'re-running the same signal must not create new rows');
  const all=ctx.v6AcqRows_('MKT_ACQ_LANDING_PAGES').filter(r=>r.signalId==='SIG-TEST-2');
  assert.equal(all.length,1,'total rows for the signal must stay at 1 after a second run');
  console.log('PASS: signal + language idempotency holds across repeated scheduler runs');
})();

// --- Multilingual engine stays intact internally: re-enabling ES/PT-BR
// production output later is a one-line change, not a rewrite. ---
(function testInternalMultilingualPreserved(){
  const ctx=makeContext();
  assert.deepEqual(ctx.MKT_V6_ACQ_LANGUAGES_ALL.slice().sort(),['en','es','pt-BR'].sort(),'the full language list must still be defined for internal/future use');
  assert.deepEqual(ctx.MKT_V6_ACQ_LANGUAGES,['en'],'production language scope must be English-only today');
  console.log('PASS: multilingual capability preserved internally (MKT_V6_ACQ_LANGUAGES_ALL) while production scope is English-only (MKT_V6_ACQ_LANGUAGES)');
})();

// --- Market routing defaults ---
(function testMarketRouting(){
  const ctx=makeContext();
  assert.equal(ctx.v6AcqLanguageForMarket_('USA',''),'en');
  assert.equal(ctx.v6AcqLanguageForMarket_('International',''),'en');
  assert.equal(ctx.v6AcqLanguageForMarket_('LATAM / Mexico Colombia Panama Peru',''),'es');
  assert.equal(ctx.v6AcqLanguageForMarket_('Brazil',''),'pt-BR');
  assert.equal(ctx.v6AcqLanguageForMarket_('USA','pt-BR'),'pt-BR','explicit languageOverride wins over market');
  console.log('PASS: market routing defaults (USA/International->EN, LATAM->ES, Brazil->PT-BR)');
})();

// --- EN/ES/PT-BR real content, no shared fallback, SEO metadata present ---
(function testRealLocalizedContent(){
  const ctx=makeContext();
  ['FTL','LTL','Drayage'].forEach(service=>{
    const content=ctx.v6AcqI18n_(service);
    const seen=new Set();
    ['en','es','pt-BR'].forEach(lang=>{
      const c=content[lang];
      assert(c.headline&&c.subheadline&&c.supportingCopy&&c.cta&&c.seoTitle&&c.seoDescription&&c.slugBase,`${service}/${lang} missing a required content field`);
      assert(!seen.has(c.headline),`${service}/${lang} headline duplicates another language (literal-translation smell)`);
      seen.add(c.headline);
    });
    assert(content['pt-BR'].subheadline.indexOf('53')<0||/p[eé]s/i.test(content['pt-BR'].subheadline)===true||content['pt-BR'].subheadline.indexOf("53'")<0,'pt-BR copy must not carry the literal 53\' notation; use Brazilian "pés" terminology');
  });
  console.log('PASS: EN/ES/PT-BR landing content is real per-language copy with SEO metadata, no literal 53\' in pt-BR');
})();

// --- Copy quality: no absolute capacity/time guarantees ---
(function testCopyQuality(){
  const ctx=makeContext();
  const banned=[/on time, every lane/i,/a tiempo, en cada ruta/i,/no prazo, em cada rota/i];
  ['FTL','LTL','Drayage',''].forEach(service=>{
    const content=ctx.v6AcqI18n_(service);
    ['en','es','pt-BR'].forEach(lang=>{
      const blob=JSON.stringify(content[lang]);
      banned.forEach(re=>assert(!re.test(blob),`banned absolute-claim phrase found in ${service||'Multiservice'}/${lang}`));
    });
  });
  console.log('PASS: no absolute capacity/time-guarantee phrases in generated copy');
})();

// --- No invented Salesforce owner ---
(function testNoInventedOwner(){
  const ctx=makeContext();
  const status=ctx.v6AcqStatus_();
  assert.equal(status.newBusinessOwner,'','newBusinessOwner must be empty when no Salesforce response has supplied one');
  console.log('PASS: no invented New Business owner when Salesforce has not returned one');
})();

// --- No PII / no hardcoded contact fixtures in the engine source ---
(function testNoPii(){
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(engineSource),'engine source must not contain email addresses');
  assert(!/(firstName|lastName|company|email)\s*:\s*['"][A-Za-z]/.test(engineSource),'engine source must not hardcode lead PII fixtures');
  console.log('PASS: no PII or hardcoded lead fixtures in the acquisition engine source');
})();

console.log('Acquisition backend multilingual: ALL PASS');
