// Platform performance V1: one-request bootstrap, Campaign Studio context with bundled approved
// creatives, warm lifecycle modules after connect, non-blocking icon library.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
let checks=0;const results=[];function test(n,fn){results.push(Promise.resolve().then(fn).then(()=>{checks++;console.log('PASS '+n);}));}
const v55=fs.readFileSync('backend/apps-script-legacy-v55/MarketingV55Backend.gs','utf8');
const router=fs.readFileSync('backend/apps-script-v6/MarketingV6RouterExtension.gs','utf8');
function extract(src,name){const i=src.indexOf('function '+name+'(');let depth=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')depth++;else if(src[k]==='}'){depth--;if(!depth)return src.slice(i,k+1);}}throw name;}

test('v55Bootstrap aggregates auth probe + datasets + pipeline summary in one memoized execution',()=>{
  const calls=[];let memo=0;
  const ctx={MKT_V55:{SHEETS:{REQUESTS:'R',CAMPAIGNS:'C',ACTIVITY:'A'}},String,
    v6WithRowsMemo_:fn=>{memo++;return fn();},
    mktV55ReadAll_:n=>{calls.push(n);if(n==='A')throw new Error('ACTIVITY_SHEET_MISSING');return [{id:n}];},
    routeMarketingV6_:a=>{calls.push(a);return a==='v6Opportunities'?{groups:[1]}:{ok:1};}};
  vm.createContext(ctx);vm.runInContext(extract(v55,'mktV55Bootstrap_'),ctx);
  const b=ctx.mktV55Bootstrap_({});
  assert.equal(b.contract,'V55_BOOTSTRAP_V1');assert.equal(memo,1);
  assert.deepEqual(b.opportunities,{groups:[1]});assert.equal(b.requests.ok,true);assert.equal(b.activity.ok,false,'a failing dataset degrades only itself');
  assert.equal(b.pipelineSummary.ok,true);assert.equal(b.auraReport.ok,true);
  assert.deepEqual(calls,['v6Opportunities','R','C','A','v6PipelineSummary','v6AuraExecutionReport']);
  const ctx2=Object.assign({},ctx,{routeMarketingV6_:()=>{throw new Error('UNAUTHORIZED');}});vm.createContext(ctx2);vm.runInContext(extract(v55,'mktV55Bootstrap_'),ctx2);
  assert.throws(()=>ctx2.mktV55Bootstrap_({}),/UNAUTHORIZED/,'auth/health authority still fails the whole call');
  assert(/'v55Bootstrap'/.test(v55.slice(0,v55.indexOf('allowed.indexOf(action)'))),'allow-listed (token-protected like every non-health action)');
});
test('Campaign Studio context bundles approved creatives server-side (read-only, memoized)',()=>{
  let memo=0;const ctx={Object,v6WithRowsMemo_:fn=>{memo++;return fn();},
    v6CampaignStudioContext_:p=>({campaignId:p.campaignId,approvedCreativeVariants:{ES:{creativeId:'X:ES'},EN:{creativeId:'X:EN'}}}),
    v6AuraLatestApprovedCreativeForLanguage_:(id,l)=>({creativeId:id+':'+l,htmlBody:'<html>'+l+'</html>'})};
  vm.createContext(ctx);vm.runInContext(extract(router,'v6CampaignStudioContextBundle_'),ctx);
  const plain=ctx.v6CampaignStudioContextBundle_({campaignId:'X'});assert(!plain.approvedCreatives,'opt-in only');
  const full=ctx.v6CampaignStudioContextBundle_({campaignId:'X',includeApprovedCreatives:true});
  assert.deepEqual(Object.keys(full.approvedCreatives).sort(),['EN','ES']);assert.equal(full.approvedCreatives.ES.htmlBody,'<html>ES</html>');assert.equal(memo,2);
  const body=extract(router,'v6CampaignStudioContextBundle_');assert(!/Upsert|setValues|appendRow|GmailApp/.test(body));
  assert(/case 'v6CampaignStudioContext': return v6CampaignStudioContextBundle_\(p\);/.test(router));
});
test('Studio uses the bundled creatives and only falls back to per-language reads',()=>{
  const studio=fs.readFileSync('assets/js/campaign-studio-v6.js','utf8'),adapter=fs.readFileSync('assets/js/marketing-backend-adapter-v55.js','utf8');
  assert(/hasOwnProperty\.call\(bundled,l\)\?bundled\[l\]:api\(\)\.getLatestApprovedCreative/.test(studio));
  assert(/campaignStudioContext:campaignId=>mutate\("v6CampaignStudioContext",\{campaignId,includeApprovedCreatives:true\},false\)/.test(adapter));
});
test('icon library is minified and non-blocking; icons render on load',()=>{
  const index=fs.readFileSync('index.html','utf8');
  assert(/lucide\.min\.js"[^>]*\bdefer\b[^>]*onload="window\.lucide&&window\.lucide\.createIcons\(\)"/.test(index));
  assert(!/lucide\.js"/.test(index));
});
test('after connect, Reactivation / Retention / QNB data comes from the bootstrap (0 extra requests)',async()=>{
  const src=fs.readFileSync('assets/js/marketing-backend-adapter-v55.js','utf8'),log=[],win={},store=new Map([['dgl_mkt_v55_token_session','T']]);
  win.window=win;win.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};win.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
  win.location={hash:'#/reactivation'};win.CustomEvent=class{constructor(t,i){this.detail=i&&i.detail;}};win.dispatchEvent=()=>{};
  const R={v55Bootstrap:{ok:true,data:{contract:'V55_BOOTSTRAP_V1',opportunities:{groups:[{g:1}],summary:{}},pipelineSummary:{ok:true,data:{stages:3}},requests:{ok:true,data:[]},campaigns:{ok:true,data:[]},activity:{ok:true,data:[]},auraReport:{ok:true}}}};
  const doc={createElement:()=>({remove(){}}),head:{appendChild(s){const u=new URL(s.src),a=u.searchParams.get('action'),cb=u.searchParams.get('callback');log.push(a);queueMicrotask(()=>win[cb](R[a]||{ok:true,data:{}}));}},body:{append(){}},addEventListener(){},getElementById:()=>null};
  win.document=doc;const ctx={window:win,document:doc,localStorage:win.localStorage,sessionStorage:win.sessionStorage,CustomEvent:win.CustomEvent,URLSearchParams,URL,setTimeout,clearTimeout,Date,JSON,console,queueMicrotask};
  vm.createContext(ctx);vm.runInContext(src,ctx);const ad=win.DGL_MARKETING_BACKEND_ADAPTER_V55;
  await ad.connect();const [o,p]=await Promise.all([ad.v6Opportunities(),ad.v6PipelineSummary()]);
  assert.deepEqual(log,['v55Bootstrap']);assert.equal(o.groups.length,1);assert.equal(p.stages,3);
  await ad.v6AuraExecutionReport();await ad.v6AuraExecutionReport();assert.equal(log.filter(x=>x==='v6AuraExecutionReport').length,1,'reports cached in memory');
  assert.deepEqual([...store.keys()],['dgl_mkt_v55_token_session'],'nothing cached in browser storage');
});
Promise.all(results).then(()=>console.log(checks+'/'+checks+' platform performance checks passed')).catch(e=>{console.error(e);process.exit(1);});
