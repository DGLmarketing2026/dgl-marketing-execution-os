/** Private context and cell-level campaign updates; never returns recipient PII. */
function v6CampaignStudioCanonicalA_() {
  return {campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA',campaignName:'Activation Prioritaria - Campana A (HA)',campaignType:'Activation',objective:'Activation',service:'Multiservicio',scopeId:'SCOPE-CAMPANA-A-HA-PRIORITARIA',audienceId:'SCOPE-CAMPANA-A-HA-PRIORITARIA',playbookId:'ACTIVATION_ACCOUNT',messageAngle:'Current Movement',language:'MULTILINGUAL',status:'AUTO_ACTIVE'};
}
function v6CampaignStudioPatchCampaign_(id,patch,create) {
  return v6CampaignStudioLocked_(function(){return v6CampaignStudioPatchCells_(id,patch,create);});
}
function v6CampaignStudioPatchCells_(id,patch,create) {
  var t=v6TableHeaders_('MKT_CAMPAIGNS'),h=t.headers,s=t.sheet,v=s.getDataRange().getValues(),key=h.indexOf('campaignId'),matches=[];
  if(key<0)throw new Error('CAMPAIGN_SCHEMA_REQUIRED');
  v.slice(1).forEach(function(r,i){if(String(r[key])===id)matches.push(i+2);});
  if(matches.length>1)throw new Error('CAMPAIGN_ID_AMBIGUOUS');
  Object.keys(patch).forEach(function(k){if(h.indexOf(k)<0)throw new Error('CAMPAIGN_SCHEMA_REQUIRED:'+k);});
  if(!matches.length){if(!create)throw new Error('CAMPAIGN_NOT_FOUND');var r=Object.assign({campaignId:id,createdAt:new Date().toISOString()},patch);s.appendRow(h.map(function(k){return r[k]==null?'':r[k];}));return;}
  Object.keys(patch).forEach(function(k){var col=h.indexOf(k);if(String(v[matches[0]-1][col])!==String(patch[k]))s.getRange(matches[0],col+1,1,1).setValues([[patch[k]]]);});
}
function v6CampaignStudioAudience_(campaign) {
  var accounts=v6Rows_('MKT_ACCOUNTS'),contacts=v6Rows_('MKT_CONTACTS_SECURE'),resolved,byAccount={},byContact={},countries={},names={};
  accounts.forEach(function(r){byAccount[r.accountId]=r;});contacts.forEach(function(r){byContact[r.contactId]=r;});
  if(campaign.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA'){
    var map=v6AuraCampanaAAccountMap_(),ids={};
    Object.keys(map).forEach(function(hash){var r=map[hash],id=v6AuraCampanaARealAccountId_(hash,r.accountName,accounts);ids[id]=true;names[r.accountName]=id;});
    v6Rows_('MKT_AURA_CAMPANA_A_SOURCE_ROWS').forEach(function(r){if(r.country&&!countries[names[r.accountName]])countries[names[r.accountName]]=r.country;});
    resolved=v6AuraCampanaAResolveRecipients_(Object.keys(ids),names,'Activation');
  }else{
    var rows=v6Rows_('MKT_AUDIENCES').filter(function(r){return r.campaignId===campaign.campaignId&&r.recordType==='RECIPIENT';});
    resolved={eligible:rows.filter(function(r){return r.eligibilityStatus==='ELIGIBLE';}),excluded:rows.filter(function(r){return r.eligibilityStatus!=='ELIGIBLE';})};
  }
  var counts={ES:0,EN:0,PT:0},unique={};
  resolved.eligible.forEach(function(r){var l=v6AuraCampanaAPreferredLanguage_(byContact[r.contactId]||{},byAccount[r.accountId]||{},r.rowCountry||countries[r.accountId]||'').language;counts[l]++;unique[r.accountId]=true;});
  return {audienceResolved:resolved.eligible.length>0,eligibleContacts:resolved.eligible.length,eligibleAccounts:Object.keys(unique).length,excludedContacts:resolved.excluded.length,languageCounts:counts,requiredLanguages:['ES','EN','PT'].filter(function(l){return counts[l]>0;})};
}
function v6CampaignStudioVariantValid_(r) {
  if(r&&r.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA'&&(r.logoUrl!==V6_STUDIO_LOGO_||String(r.htmlBody).indexOf('src="'+V6_STUDIO_LOGO_+'"')<0||/stay close|staying close|seguimos cerca|relationship continuity|multiservicio|\{\{service\}\}/i.test([r.subject,r.preheader,r.htmlBody,r.textBody].join(' '))))return false;
  return !!(r&&r.approvalId&&r.subject&&r.htmlBody&&String(r.status||'APPROVED')==='APPROVED'&&!v6AuraIsRevokedInLedger_(r.creativeId)&&String(v6AuraChecksum_(r.htmlBody))===String(r.htmlChecksum)&&String(v6AuraCanonicalContentChecksum_(r.subject,r.htmlBody,r.textBody,r.templateId,r.creativeVersion))===String(r.contentChecksum)&&!v6AuraDetectInternalLabels_([r.subject,r.preheader,r.htmlBody,r.textBody].join(' ')).length);
}
function v6CampaignStudioContext_(payload) {
  var id=String((payload||{}).campaignId||'').trim(),matches=v6Rows_('MKT_CAMPAIGNS').filter(function(r){return r.campaignId===id;});
  if(matches.length>1)throw new Error('CAMPAIGN_ID_AMBIGUOUS');
  var row=matches[0];
  if(!row)throw new Error('CAMPAIGN_NOT_FOUND');
  var c={};['campaignId','campaignName','campaignType','objective','service','scopeId','audienceId','playbookId','status','approvalStatus','recipientMode','messageAngle','language'].forEach(function(k){c[k]=row[k]||'';});
  if(id==='CMP-CAMPANA-A-HA-PRIORITARIA')Object.assign(c,v6CampaignStudioCanonicalA_());
  c.recipientMode=c.recipientMode||'GOVERNED_PRIVATE_AUDIENCE';
  try{Object.assign(c,v6CampaignStudioAudience_(c));}catch(e){Object.assign(c,{audienceResolved:false,eligibleContacts:0,eligibleAccounts:0,excludedContacts:0,requiredLanguages:[],languageCounts:{ES:0,EN:0,PT:0}});}
  c.approvedCreativeVariants={};c.missingCreativeVariants=[];
  ['ES','EN','PT'].forEach(function(l){var r=v6AuraLatestApprovedCreativeForLanguage_(id,l);if(v6CampaignStudioVariantValid_(r)){c.approvedCreativeVariants[l]={creativeId:r.creativeId,creativeVersion:r.creativeVersion,approvalId:r.approvalId,htmlChecksum:r.htmlChecksum,contentChecksum:r.contentChecksum};}else if(c.requiredLanguages.indexOf(l)>=0)c.missingCreativeVariants.push(l);});
  var signature=JSON.stringify(Object.keys(c.approvedCreativeVariants).sort().map(function(l){var r=c.approvedCreativeVariants[l];return [l,r&&r.creativeId,r&&r.contentChecksum];}));
  var saved=PropertiesService.getScriptProperties().getProperty('STUDIO_CREATIVE_SET:'+id);
  c.creativeSetStatus=!c.audienceResolved?'AUDIENCE_UNRESOLVED':c.missingCreativeVariants.length?'CREATIVE_SET_INCOMPLETE':saved===signature?'APPROVED':'READY_FOR_APPROVAL';
  c.approvalStatus=c.creativeSetStatus==='APPROVED'?'APPROVED':'PENDING';return c;
}
function v6CampaignStudioList_(){return {campaigns:v6Rows_('MKT_CAMPAIGNS').map(function(r){var c=r.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA'?v6CampaignStudioCanonicalA_():r;return {campaignId:c.campaignId,campaignName:c.campaignName};})};}
function v6CampaignStudioApproveSet_(payload){return v6CampaignStudioLocked_(function(){return v6CampaignStudioApproveSetLocked_(payload);});}
function v6CampaignStudioApproveSetLocked_(payload){
  var c=v6CampaignStudioContext_(payload);
  if(!c.audienceResolved||c.missingCreativeVariants.length)throw new Error('CREATIVE_SET_INCOMPLETE');
  var signature=JSON.stringify(Object.keys(c.approvedCreativeVariants).sort().map(function(l){var r=c.approvedCreativeVariants[l];return [l,r.creativeId,r.contentChecksum];}));
  PropertiesService.getScriptProperties().setProperty('STUDIO_CREATIVE_SET:'+c.campaignId,signature);return v6CampaignStudioContext_(payload);
}
function v6CampaignStudioSetGate_(id){
  try{var c=v6CampaignStudioContext_({campaignId:id});return {blocked:c.creativeSetStatus!=='APPROVED',error:'CREATIVE_SET_INCOMPLETE',context:c};}
  catch(e){return {blocked:true,error:'CREATIVE_SET_INCOMPLETE'};}
}


// QA draft only: the browser preview HTML is passed verbatim, never independently rendered.
function v6CampaignStudioTestDraft_(payload){
  var p=payload||{},d=p.draft||{},c=v6CampaignStudioContext_(p);
  if(!c.audienceResolved)throw new Error('AUDIENCE_UNRESOLVED');
  if(!v6StudioLanguage_(d.language)||!d.subject||!d.htmlBody)throw new Error('TEST_DRAFT_CONTENT_REQUIRED');
  v6AuraAssertHtmlProductionSafe_(d.htmlBody);
  v6AuraAssertNoInternalLabels_(d.subject,d.htmlBody,d.textBody);
  v6CampaignStudioValidateBrand_(d);
  if(/stay close|staying close|seguimos cerca|relationship continuity|multiservicio|\{\{service\}\}/i.test([d.subject,d.preheader,d.htmlBody,d.textBody].join(' ')))throw new Error('ACTIVATION_COPY_INVALID');
  var to=Session.getActiveUser().getEmail();if(!to)throw new Error('TEST_DRAFT_RECIPIENT_REQUIRED');
  var draft=GmailApp.createDraft(to,d.subject,d.textBody||'',{htmlBody:d.htmlBody});
  var check=v6AuraTestDraftExactMatch_(d.htmlBody,d.htmlBody,draft.getMessage().getBody());
  if(!check.match)throw new Error('TEST_DRAFT_CONTENT_MISMATCH');
  return {status:'CREATED',draftId:draft.getId(),language:v6StudioLanguage_(d.language),htmlChecksum:check.draftChecksum};
}

// Reentrant only within one Apps Script execution; all mutations share the script lock.
var v6CampaignStudioLockDepth_=0;
function v6CampaignStudioLocked_(fn){
  if(v6CampaignStudioLockDepth_)return fn();
  var lock=LockService.getScriptLock();lock.waitLock(30000);v6CampaignStudioLockDepth_++;
  try{return fn();}finally{v6CampaignStudioLockDepth_--;lock.releaseLock();}
}
function v6CampaignStudioValidateBrand_(p){
  if(p.logoUrl!==V6_STUDIO_LOGO_||String(p.htmlBody).indexOf('src="'+V6_STUDIO_LOGO_+'"')<0)throw new Error("BRAND_VALIDATION_REQUIRED");
  // Fetch only the existing official PNG; caller-supplied qaBrand/width cannot approve a logo.
  var response=UrlFetchApp.fetch(V6_STUDIO_LOGO_,{muteHttpExceptions:true}),bytes=response.getBlob().getBytes();
  var b=bytes.map(function(x){return x&255;});
  if(response.getResponseCode()!==200||b.length<24||b.slice(0,8).join(",")!=="137,80,78,71,13,10,26,10")throw new Error("BRAND_LOGO_LOAD_FAILED");
  var width=b[16]*16777216+b[17]*65536+b[18]*256+b[19],height=b[20]*16777216+b[21]*65536+b[22]*256+b[23];
  if(!width||!height)throw new Error("BRAND_LOGO_DIMENSIONS_INVALID");
  return {url:V6_STUDIO_LOGO_,naturalWidth:width,naturalHeight:height};
}
