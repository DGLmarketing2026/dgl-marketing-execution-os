(function(g){
"use strict";
// Explicit opportunity action only. Backend re-reads current scope and strategy.
async function ensureCampaignRecord(scope){
  if(!scope?.scopeId)throw new Error('EXPLICIT_SCOPE_REQUIRED');
  const api=g.DGL_MARKETING_BACKEND_ADAPTER_V55;
  if(!api?.isConnected?.())throw new Error('PRIVATE_BACKEND_REQUIRED');
  return api.prepareCampaignStudioScope(scope.scopeId);
}
g.DGL_CAMPAIGN_SCOPE_BRIDGE_V6={ensureCampaignRecord};
})(window);
