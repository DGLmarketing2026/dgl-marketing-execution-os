const assert=require('assert'),fs=require('fs'),vm=require('vm');
(async()=>{
 const buttons=['sent','failed','bounced','replied','opened','clicked'].map(k=>({dataset:{perfKpi:k},setAttribute(){}}));
 const inputs=['search','campaignId','campaignFamily','sendStatus','language','from','to'].map(k=>({dataset:{perfFilter:k},value:''}));
 const nodes={'[data-perf-detail]':{innerHTML:''},'[data-perf-reset]':{},'[data-perf-download]':{}};
 const host={querySelector:s=>nodes[s],querySelectorAll:s=>s==='[data-perf-kpi]'?buttons:inputs};
 let dialog,frame,blob,copied,requested=[];
 const exact='<html><body><h1>Retention historical</h1><script>throw 1</script><a href="https://example.com">Link</a></body></html>';
 let detail={jobId:'J0',subject:'=Exact persisted subject',htmlBody:exact,sentFamily:'Retention',currentCampaignFamily:'Activation',creativeProvenance:'LEGACY_PRE_CANONICAL',integrityStatus:'LEGACY_CHECKSUM_NOT_AVAILABLE',status:'SENT',opened:null,clicked:null,bounceReason:'BLOCKED'};
 const document={addEventListener(){},body:{appendChild(){}},createElement:type=>{
   if(type==='dialog'){const n={};dialog={innerHTML:'',open:false,setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},querySelector:s=>n[s]||(n[s]={appendChild:f=>{frame=f;}})};return dialog;}
   if(type==='iframe')return {attrs:{},style:{},setAttribute(k,v){this.attrs[k]=v;}};
   return {click(){}};
 }};
 const rows=Array.from({length:60},(_,i)=>({jobId:'J'+i,company:'Company '+i,email:`p${i}@example.com`,subject:'subject '+i,sentFamily:'Retention',currentCampaignFamily:'Activation',creativeProvenance:'LEGACY_PRE_CANONICAL',integrityStatus:'LEGACY_CHECKSUM_NOT_AVAILABLE',sendStatus:i===59?'FAILED':'SENT',sentAt:`2026-09-${String(1+i%28).padStart(2,'0')}T10:00:00Z`,opened:null,clicked:null}));
 const window={document,addEventListener(){},DGL_MARKETING_BACKEND_ADAPTER_V55:{isConnected:()=>true,v6AuraEmailPerformance:async()=>({rows,summary:{sent:59,sentUniqueEmails:59,sentUniqueAccounts:23,opened:null,clicked:null}}),v6AuraEmailPerformanceJob:async id=>{requested.push(id);return {...detail,jobId:id};}}};
 vm.runInNewContext(fs.readFileSync('assets/js/aura-dashboard-v1.js','utf8'),{window,document,navigator:{clipboard:{writeText:async s=>{copied=s;}}},Blob,URL:{createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL(){}},setTimeout:f=>f()});
 const mount={innerHTML:'',querySelector:()=>host};await window.DGL_MODULE_RENDERERS['aura-overview'](mount);
 assert(mount.innerHTML.includes('59 recipient emails · 23 accounts'));assert.equal((nodes['[data-perf-detail]'].innerHTML.match(/VIEW EMAIL/g)||[]).length,25);assert(nodes['[data-perf-detail]'].innerHTML.includes('Page 1 / 3'));
 host.onclick({target:{closest:s=>s==='[data-perf-next]'?{}:null}});assert(nodes['[data-perf-detail]'].innerHTML.includes('Page 2 / 3'));
 buttons[0].onclick();assert(nodes['[data-perf-detail]'].innerHTML.includes('59 recipient rows'));assert(nodes['[data-perf-detail]'].innerHTML.includes('Page 1 / 3'));
 inputs[0].value='p58@example.com';inputs[0].oninput();assert(nodes['[data-perf-detail]'].innerHTML.includes('1 recipient rows'));assert(nodes['[data-perf-detail]'].innerHTML.includes('Page 1 / 1'));
 nodes['[data-perf-download]'].onclick();let csv=await blob.text();assert(csv.includes('p58@example.com'));assert(!csv.includes('p57@example.com'));assert(csv.includes('subject'));assert(csv.includes('creativeProvenance'));assert(!csv.includes('htmlBody'));
 host.onclick({target:{closest:s=>s==='[data-perf-view]'?{dataset:{perfView:'J58'}}:null}});await new Promise(r=>setImmediate(r));assert.equal(requested[0],'J58');assert.equal(frame.srcdoc,exact);assert.equal(frame.attrs.sandbox,'');assert.equal(frame.attrs.referrerpolicy,'no-referrer');assert.equal(frame.attrs.tabindex,'-1');assert.equal(frame.style.pointerEvents,'none');assert(!frame.attrs.sandbox.includes('allow-scripts'));assert(dialog.innerHTML.includes('HISTORICAL SEND FAMILY DIFFERS'));assert(dialog.innerHTML.includes('LEGACY / PRE-CANONICAL SEND'));assert(dialog.innerHTML.includes('N/A — NOT TRACKED'));assert(!dialog.innerHTML.includes('contenteditable'));assert(!dialog.innerHTML.includes('<input'));
 dialog.querySelector('[data-email-download]').onclick();assert.equal(await blob.text(),exact);await dialog.querySelector('[data-email-copy]').onclick();assert.equal(copied,detail.subject);
 detail.htmlBody='';await window.DGL_AURA_PERFORMANCE.openEmail('missing-body');assert.equal(dialog.querySelector('[data-email-preview]').textContent,'EMAIL BODY NOT AVAILABLE — NO CONTENT WILL BE RECONSTRUCTED');
 csv=window.DGL_AURA_PERFORMANCE.csv([{...rows[0],subject:'=cmd',htmlBody:exact}]);assert(csv.includes("'=cmd"));assert(!csv.includes(exact));assert(csv.startsWith('\uFEFF'));
 const paged=window.DGL_AURA_PERFORMANCE.page(rows,0);assert.equal(paged.length,25);assert(paged[0].sentAt>=paged[24].sentAt);
 console.log('PASS sent-email modal, on-demand job fetch, exact sandboxed preview/download, missing body, filters, pagination, CSV and recipient/account labels');
})().catch(e=>{console.error(e);process.exitCode=1;});
