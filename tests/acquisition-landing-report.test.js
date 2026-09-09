const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const engineSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6AcquisitionEngine.gs'),'utf8');
const driveSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6DriveArchive.gs'),'utf8');
const routerSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6RouterExtension.gs'),'utf8');

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
function fakeDrive(){
  const files=[];
  return {files,getFolderById(){return {createFile(name,content,mime){const f={id:'FILE-'+files.length,name,content,mime,getId(){return this.id;}};files.push(f);return f;}};}};
}
function makeContext(propsIn){
  const props=Object.assign({MKT_DATA_HUB_ID:'TEST_DATA_HUB_ID'},propsIn||{});
  const book=makeBook(),drive=fakeDrive();
  const ctx={
    SpreadsheetApp:{openById:()=>book},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>Object.prototype.hasOwnProperty.call(props,k)?props[k]:null,setProperty:(k,v)=>{props[k]=v;}})},
    Utilities:{getUuid:()=>'uuid-'+Math.random().toString(36).slice(2)},
    ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyHours:()=>({create:()=>{}})})}),deleteTrigger(){}},
    UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>'{}'})},
    DriveApp:drive,MimeType:{CSV:'text/csv'},
    console
  };
  vm.createContext(ctx);
  vm.runInContext(driveSource,ctx,{filename:'MarketingV6DriveArchive.gs'});
  vm.runInContext(engineSource,ctx,{filename:'MarketingV6AcquisitionEngine.gs'});
  ctx.__drive=drive;
  return ctx;
}

function signal(id,market,service){return {signalId:id,source:'TEST',channel:'Organic',market,service,objective:'Lead Generation',languageOverride:''};}

// 1. Real landing report rows, correct field set, honest blanks for visits/conversionRate
(function testLandingReportFields(){
  const ctx=makeContext({});
  const variant=ctx.v6AcqEnsureLandingVariants_(signal('SIG-R1','USA','FTL')).records[0];
  // simulate the page going LIVE (as v6AcqEnsureLandingVariants_ does once ACQ_PUBLIC_LANDING_BASE_URL is set)
  const live=Object.assign({},variant,{status:'LIVE',publishedUrl:'https://example.exec?slug='+variant.slug});
  ctx.v6AcqUpsert_('MKT_ACQ_LANDING_PAGES',['signalId','language'],live);
  ctx.v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],{leadId:'LEAD-1',landingPageId:live.landingPageId,signalId:'SIG-R1',qualificationStatus:'QUALIFIED_REQUIREMENT',createdAt:new Date().toISOString()});
  ctx.v6AcqUpsert_('MKT_ACQ_LEADS',['leadId'],{leadId:'LEAD-2',landingPageId:live.landingPageId,signalId:'SIG-R1',qualificationStatus:'PENDING',createdAt:new Date().toISOString()});
  const report=ctx.v6AcqLandingReport_();
  assert.equal(report.status,'OK');
  assert.equal(report.rows,1);
  const row=report.report[0];
  ['campaignKey','service','landingUrl','publishedAt','visits','leads','qualifiedLeads','conversionRate','utmSource','utmMedium','utmCampaign','status'].forEach(field=>{
    assert(Object.prototype.hasOwnProperty.call(row,field),`landing report row missing field ${field}`);
  });
  assert.equal(row.leads,2,'must count all real leads for this landing page');
  assert.equal(row.qualifiedLeads,1,'must count only QUALIFIED_REQUIREMENT leads');
  assert.equal(row.status,'LIVE');
  assert.equal(row.visits,'','visits must stay blank -- no GA4 Data API integration exists, never fabricated');
  assert.equal(row.conversionRate,'','conversion rate must stay blank without real traffic data, never fabricated');
  console.log('PASS: landing report has the exact requested fields, real lead counts, honest blanks for visits/conversion rate');
})();

// 2. Automatic CSV archive
(function testLandingReportArchive(){
  const ctx=makeContext({ACQ_LANDING_REPORT_ARCHIVE_FOLDER_ID:'FOLDER-1'});
  ctx.v6AcqEnsureLandingVariants_(signal('SIG-R2','USA','LTL'));
  const report=ctx.v6AcqLandingReport_();
  assert.equal(report.archive.status,'CSV ARCHIVED');
  assert(report.archive.fileId,'archived CSV must have a Drive file id');
  assert.equal(ctx.__drive.files.length,1);
  assert(ctx.__drive.files[0].content.includes('campaignKey'),'archived CSV must include the header row');
  console.log('PASS: landing report CSV archives automatically to Drive, no manual export required');
})();

// 3. Falls back to the shared results archive folder (MKT_V6_ARCHIVE.results)
// when no landing-report-specific folder is configured, matching every other
// automatic archive in this codebase (AURA execution reports, WordPress
// cycle CSVs) -- never silently drops the report.
(function testArchiveFallsBackToSharedFolder(){
  const ctx=makeContext({});
  ctx.v6AcqEnsureLandingVariants_(signal('SIG-R3','USA','Drayage'));
  const report=ctx.v6AcqLandingReport_();
  assert.equal(report.archive.status,'CSV ARCHIVED');
  assert(report.archive.fileId,'must archive to the shared results folder when no dedicated folder is configured');
  console.log('PASS: landing report archive falls back to the shared results archive folder when no dedicated folder is configured');
})();

// 4. Router exposes the new report action
(function testRouterExposesLandingReport(){
  assert(/case 'v6AcqLandingReport'\s*:[\s\S]{0,200}v6AcqLandingReport_/.test(routerSource),'router must expose v6AcqLandingReport');
  console.log('PASS: router exposes v6AcqLandingReport');
})();

console.log('Acquisition automatic landing report: ALL PASS');
