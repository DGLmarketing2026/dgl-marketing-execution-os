const assert=require('assert'),fs=require('fs'),vm=require('vm');
(async()=>{
 const nodes={detail:{innerHTML:''},reset:{},download:{}};
 const buttons=['sent','failed','bounced','replied','opened','clicked'].map(k=>({dataset:{perfKpi:k},setAttribute(k,v){this[k]=v;}}));
 const inputs=['search','campaignId','campaignFamily','sendStatus','language','from','to'].map(k=>({dataset:{perfFilter:k},value:''}));
 const host={querySelector:s=>s==='[data-perf-detail]'?nodes.detail:s==='[data-perf-reset]'?nodes.reset:nodes.download,querySelectorAll:s=>s==='[data-perf-kpi]'?buttons:inputs};
 const mount={innerHTML:'',querySelector:()=>host};let csvBlob,clicked=0;
 const report={summary:{sent:1,failed:1,bounced:0,replied:0,opened:null,clicked:null},tracking:{opened:'NOT_TRACKED',clicked:'NOT_TRACKED'},rows:[{company:'First',email:'first@example.com',sendStatus:'SENT',opened:null,clicked:null},{company:'Second',email:'second@example.com',sendStatus:'FAILED',opened:null,clicked:null}]};
 const window={document:{addEventListener(){}},addEventListener(){},DGL_MARKETING_BACKEND_ADAPTER_V55:{isConnected:()=>true,v6AuraEmailPerformance:async()=>report,v6AuraCampanaAAudit:async()=>({byLanguage:{ES:'bad',EN:Infinity},realSendsDetected:NaN})}};
 vm.runInNewContext(fs.readFileSync('assets/js/aura-dashboard-v1.js','utf8'),{window,console,Number,Set,Blob,URL:{createObjectURL:b=>{csvBlob=b;return 'blob:test';},revokeObjectURL(){}},document:{createElement:()=>({click(){clicked++;}})},setTimeout:fn=>fn()});
 await window.DGL_MODULE_RENDERERS['aura-overview'](mount);
 assert(!mount.innerHTML.includes('NaN'));assert(!mount.innerHTML.includes('Infinity'));assert(mount.innerHTML.includes('NOT TRACKED'));assert(mount.innerHTML.includes('Campaña A'));assert(nodes.detail.innerHTML.includes('first@example.com'));assert(nodes.detail.innerHTML.includes('second@example.com'));
 buttons[1].onclick();assert(!nodes.detail.innerHTML.includes('first@example.com'));assert(nodes.detail.innerHTML.includes('second@example.com'));assert.equal(buttons[1]['aria-pressed'],'true');
 nodes.download.onclick();assert.equal(clicked,1);const csv=await csvBlob.text();assert(csv.includes('second@example.com'));assert(!csv.includes('first@example.com'));assert(csv.includes('NOT_TRACKED'));
 buttons[1].onclick();inputs[0].value='First';inputs[0].oninput();assert(nodes.detail.innerHTML.includes('first@example.com'));assert(!nodes.detail.innerHTML.includes('second@example.com'));
 buttons[4].onclick();assert(nodes.detail.innerHTML.includes('0 recipient rows'));
 console.log('PASS UI render, actual KPI clicks, search events, filtered download, diagnostic preservation, no NaN');
})().catch(e=>{console.error(e);process.exitCode=1;});
