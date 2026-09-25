const fs=require('fs'),vm=require('vm'),assert=require('assert');
const calls=[],window={DGL_MARKETING_BACKEND_ADAPTER_V55:{isConnected:()=>true,prepareCampaignStudioScope:async id=>{calls.push(id);return {campaignId:'FROM_BACKEND'};}}};
vm.runInNewContext(fs.readFileSync('assets/js/campaign-scope-bridge-v6.js','utf8'),{window});
(async()=>{
  const bridge=window.DGL_CAMPAIGN_SCOPE_BRIDGE_V6;
  assert.equal(calls.length,0,'loading bridge never creates records');
  assert.equal(bridge.autoAdvance,undefined,'automatic progression removed');
  await assert.rejects(()=>bridge.ensureCampaignRecord({}),/EXPLICIT_SCOPE_REQUIRED/);
  const result=await bridge.ensureCampaignRecord({scopeId:'SCOPE-A',objective:'FAKE',service:'FAKE'});
  assert.equal(result.campaignId,'FROM_BACKEND');assert.deepEqual(calls,['SCOPE-A'],'only scope identity crosses boundary');
  console.log('PASS explicit scope entry; no automatic selection, creation, resolution or approval');
})().catch(e=>{console.error(e);process.exitCode=1});
