/** Explicit maintenance only; never called by a cycle or HTTP route. */
function v6AuraCampanaAReconcileMetadataOnly_() {
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var specs=[{table:'MKT_CAMPAIGNS',key:'campaignId',id:'CMP-CAMPANA-A-HA-PRIORITARIA',values:v6CampaignStudioCanonicalA_()},
      {table:'MKT_CAMPAIGN_SCOPES',key:'scopeId',id:'SCOPE-CAMPANA-A-HA-PRIORITARIA',values:{campaignType:'Activation',opportunityType:'Activation'}}];
    // Validate both exact records and all columns before the first write.
    var plans=specs.map(function(spec){
      var sheet=v6Sheet_(spec.table);if(!sheet)throw new Error('NOT_FOUND: '+spec.table);
      var values=sheet.getDataRange().getValues(),headers=values[0]||[],key=headers.indexOf(spec.key);
      if(key<0||Object.keys(spec.values).some(function(k){return headers.indexOf(k)<0;}))throw new Error('SCHEMA_REQUIRED: '+spec.table);
      var matches=[];values.slice(1).forEach(function(row,i){if(row[key]===spec.id)matches.push(i+1);});
      if(matches.length!==1)throw new Error('EXACT_RECORD_REQUIRED: '+spec.id);
      var row=values[matches[0]];
      if(spec.key==='scopeId'&&row[headers.indexOf('campaignId')]!=='CMP-CAMPANA-A-HA-PRIORITARIA')throw new Error('SCOPE_CAMPAIGN_MISMATCH');
      var changes=Object.keys(spec.values).filter(function(k){return row[headers.indexOf(k)]!==spec.values[k];}).map(function(k){return {field:k,before:row[headers.indexOf(k)],after:spec.values[k]};});
      return {sheet:sheet,row:matches[0]+1,headers:headers,table:spec.table,id:spec.id,changes:changes};
    });
    var changed=0;
    plans.forEach(function(p){p.changes.forEach(function(c){p.sheet.getRange(p.row,p.headers.indexOf(c.field)+1,1,1).setValues([[c.after]]);changed++;});});
    return {status:changed?'RECONCILED':'UNCHANGED',changedFields:changed,diff:plans.map(function(p){return {table:p.table,id:p.id,changes:p.changes};})};
  } finally {lock.releaseLock();}
}
function RUN_AURA_CAMPANA_A_RECONCILE_METADATA_ONLY() {return v6AuraCampanaAReconcileMetadataOnly_();}
