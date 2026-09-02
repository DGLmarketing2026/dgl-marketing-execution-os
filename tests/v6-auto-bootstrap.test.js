const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const session=new Map(),calls=[];
const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)};
const document={getElementById(){return null},querySelector(){return null},addEventListener(){},createElement(){return {}}};
const api={isConnected:()=>true,
 async createRequest(r){calls.push(['createRequest',r]);return {requestId:'REQ-AUTO-1'}},
 async createCampaign(p){calls.push(['createCampaign',p]);return {campaignId:'CMP-AUTO-1'}},
 async resolveRecipients(id){calls.push(['resolveRecipients',id]);return {status:'OK'}},
 async getAudienceStatus(id){calls.push(['getAudienceStatus',id]);return {audienceResolved:true,audienceStatus:'RECIPIENTS RESOLVED',eligibleContactCount:3,excludedContactCount:1,frequencyStatus:'CLEAR',exclusionStatus:'CLEAR',exclusionsCleared:true}},
 async requestApproval(id,d){calls.push(['requestApproval',id,d]);return {status:'WAITING APPROVAL'}},
 async recordApproval(id,d){calls.push(['recordApproval',id,d]);return {status:'APPROVED'}}};
const playbooks={resolveStrategy:n=>({valid:true,strategy:{playbookId:'QNB_0_14',campaignName:n.campaignName}}),policyDecision:()=>({status:'AUTO BY POLICY',autoApproved:true})};
const window={DGL_MARKETING_BACKEND_ADAPTER_V55:api,DGL_MARKETING_PLAYBOOKS:playbooks,DGL_MODULE_RENDERERS:{},addEventListener(){},location:{hash:'#/campaign-studio'},lucide:{createIcons(){}}};window.window=window;
const ctx={window,document,sessionStorage,console,Promise,JSON,Number,String,Date};vm.createContext(ctx);
sessionStorage.setItem('dgl_v5_campaign_context',JSON.stringify({scopeId:'SCOPE-AM-QNB-FTL-0-14',audienceId:'SCOPE-AM-QNB-FTL-0-14',amOwner:'AM',objective:'Quoted Not Booked',campaignFamily:'QNB',service:'FTL',qnbWindow:'0-14',window:'0-14',campaignName:'QNB FTL',eligibleAccounts:5,requiresHumanReview:false}));
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','assets','js','campaign-scope-bridge-v6.js'),'utf8'),ctx);
(async()=>{const b=window.DGL_CAMPAIGN_SCOPE_BRIDGE_V6;const result=await b.autoAdvance();assert.equal(result.requestId,'REQ-AUTO-1');assert.equal(result.campaignId,'CMP-AUTO-1');assert.equal(result.audienceResolved,true);assert.equal(result.eligibleContactCount,3);assert.equal(result.policyApprovalStatus,'AUTO BY POLICY · APPROVED');assert.deepEqual(calls.map(x=>x[0]),['createRequest','createCampaign','resolveRecipients','getAudienceStatus','requestApproval','recordApproval']);console.log('bridge auto-bootstrap PASS')})().catch(e=>{console.error(e);process.exit(1)});
