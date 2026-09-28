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
  if(r&&r.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA'&&(String(r.status)!=='APPROVED'||r.logoUrl!==V6_STUDIO_LOGO_||String(r.htmlBody).indexOf('src="'+V6_STUDIO_LOGO_+'"')<0||/stay close|staying close|seguimos cerca|relationship continuity|multiservicio|\{\{service\}\}/i.test([r.subject,r.preheader,r.htmlBody,r.textBody].join(' '))))return false;
  return !!(r&&r.creativeId&&Number(r.creativeVersion)>0&&r.htmlChecksum!==''&&r.htmlChecksum!=null&&r.contentChecksum!==''&&r.contentChecksum!=null&&r.approvalId&&r.subject&&r.htmlBody&&String(r.status||'APPROVED')==='APPROVED'&&!v6AuraIsRevokedInLedger_(r.creativeId)&&String(v6AuraChecksum_(r.htmlBody))===String(r.htmlChecksum)&&String(v6AuraCanonicalContentChecksum_(r.subject,r.htmlBody,r.textBody,r.templateId,r.creativeVersion))===String(r.contentChecksum)&&!v6AuraDetectInternalLabels_([r.subject,r.preheader,r.htmlBody,r.textBody].join(' ')).length);
}
function v6CampaignStudioContext_(payload) {
  var id=String((payload||{}).campaignId||'').trim(),matches=v6Rows_('MKT_CAMPAIGNS').filter(function(r){return r.campaignId===id;});
  if(matches.length>1)throw new Error('CAMPAIGN_ID_AMBIGUOUS');
  var row=matches[0];
  if(!row)throw new Error('CAMPAIGN_NOT_FOUND');
  var c={};['campaignId','campaignName','campaignType','objective','service','scopeId','audienceId','playbookId','status','approvalStatus','recipientMode','messageAngle','language','qnbWindow'].forEach(function(k){c[k]=row[k]||'';});
  if(id==='CMP-CAMPANA-A-HA-PRIORITARIA')Object.assign(c,v6CampaignStudioCanonicalA_());
  c.recipientMode=c.recipientMode||'GOVERNED_PRIVATE_AUDIENCE';
  try{Object.assign(c,v6CampaignStudioAudience_(c));}catch(e){Object.assign(c,{audienceResolved:false,eligibleContacts:0,eligibleAccounts:0,excludedContacts:0,requiredLanguages:[],languageCounts:{ES:0,EN:0,PT:0}});}
  c.approvedCreativeVariants={};c.missingCreativeVariants=[];
  ['ES','EN','PT'].forEach(function(l){var r=v6AuraLatestApprovedCreativeForLanguage_(id,l);if(v6CampaignStudioVariantValid_(r)){c.approvedCreativeVariants[l]={creativeId:r.creativeId,creativeVersion:r.creativeVersion,approvalId:r.approvalId,htmlChecksum:r.htmlChecksum,contentChecksum:r.contentChecksum};}else if(c.requiredLanguages.indexOf(l)>=0)c.missingCreativeVariants.push(l);});
  var draftRows=v6Rows_(V6_STUDIO_DRAFT_TABLE_);c.testDraftVerifications={};c.missingTestDrafts=[];c.testDraftStatus={};
  ['ES','EN','PT'].forEach(function(l){
    var creative=c.approvedCreativeVariants[l],evidence=v6CampaignStudioDraftEvidence_(id,l,creative,draftRows);
    if(evidence)c.testDraftVerifications[l]={creativeId:evidence.creativeId,creativeVersion:evidence.creativeVersion,contentChecksum:evidence.contentChecksum,draftId:evidence.draftId,verifiedAt:evidence.verifiedAt,status:'VERIFIED'};
    var historical=draftRows.some(function(r){return r.campaignId===id&&r.language===l&&r.status==='VERIFIED';});
    c.testDraftStatus[l]=evidence?'TEST DRAFT VERIFIED':historical?'STALE AFTER EDIT':creative?'APPROVED / TEST DRAFT REQUIRED':'UNAPPROVED';
    if(c.requiredLanguages.indexOf(l)>=0&&!evidence)c.missingTestDrafts.push(l);
  });
  c.testDraftReviewRequired=id==='CMP-CAMPANA-A-HA-PRIORITARIA';
  var durable=v6CampaignStudioDurableSet_(c);
  c.creativeSetStatus=!c.audienceResolved?'AUDIENCE_UNRESOLVED':c.missingCreativeVariants.length?'CREATIVE_SET_INCOMPLETE':c.testDraftReviewRequired&&c.missingTestDrafts.length?'TEST_DRAFT_SET_INCOMPLETE':durable?'APPROVED':'READY_FOR_APPROVAL';
  c.creativeSetApprovalId=c.creativeSetStatus==='APPROVED'?durable.approvalId:'';
  c.approvalStatus=c.creativeSetStatus==='APPROVED'?'APPROVED':'PENDING';return c;
}
function v6CampaignStudioList_(){return {campaigns:v6Rows_('MKT_CAMPAIGNS').map(function(r){var c=r.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA'?v6CampaignStudioCanonicalA_():r;return {campaignId:c.campaignId,campaignName:c.campaignName};})};}
function v6CampaignStudioApproveSet_(payload){return v6CampaignStudioLocked_(function(){return v6CampaignStudioApproveSetLocked_(payload);});}
function v6CampaignStudioApproveSetLocked_(payload){
  var c=v6CampaignStudioContext_(payload);
  if(!c.audienceResolved||c.missingCreativeVariants.length)throw new Error('CREATIVE_SET_INCOMPLETE');
  if(c.testDraftReviewRequired&&c.missingTestDrafts.length)throw new Error('TEST_DRAFT_SET_INCOMPLETE');
  var record={approvalId:'SCSET:'+Utilities.getUuid(),campaignId:c.campaignId,approvalType:'CREATIVE_SET',status:'APPROVED',
    requiredLanguages:JSON.stringify(c.requiredLanguages),approvedVariants:JSON.stringify(c.approvedCreativeVariants),
    approvedAt:new Date().toISOString(),approvedBy:v6CampaignStudioActor_(),creativeSetSignature:v6CampaignStudioSignature_(c.approvedCreativeVariants)};
  ['ES','EN','PT'].forEach(function(l){var v=c.approvedCreativeVariants[l]||{};record[l+'CreativeId']=v.creativeId||'';record[l+'CreativeVersion']=v.creativeVersion||'';record[l+'ContentChecksum']=v.contentChecksum==null?'':v.contentChecksum;});
  v6CampaignStudioAppendEvidence_(V6_STUDIO_SET_TABLE_,record);return v6CampaignStudioContext_(payload);
}
function v6CampaignStudioSetGate_(id){
  try{var c=v6CampaignStudioContext_({campaignId:id});return {blocked:c.creativeSetStatus!=='APPROVED',error:'CREATIVE_SET_INCOMPLETE',context:c};}
  catch(e){return {blocked:true,error:'CREATIVE_SET_INCOMPLETE'};}
}


// Validate current persisted identity and content before using the existing Gmail readback path.
function v6CampaignStudioTestDraft_(payload){
 return v6CampaignStudioLocked_(function(){
  var p=payload||{},d=p.draft||{},c=v6CampaignStudioContext_(p),language=v6StudioLanguage_(d.language);
  if(!c.audienceResolved)throw new Error('AUDIENCE_UNRESOLVED');
  if(!language||!d.subject||!d.htmlBody)throw new Error('TEST_DRAFT_CONTENT_REQUIRED');
  if(c.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA'&&/stay close|staying close|seguimos cerca|relationship continuity|multiservicio|\{\{service\}\}/i.test([d.subject,d.preheader,d.htmlBody,d.textBody].join(' ')))throw new Error('ACTIVATION_COPY_INVALID');
  var creative=v6AuraLatestApprovedCreativeForLanguage_(c.campaignId,language);
  if(!v6CampaignStudioVariantValid_(creative))throw new Error('TEST_DRAFT_CREATIVE_NOT_APPROVED');
  // Bind the displayed variant, not just coincidentally identical HTML in another language/version.
  if(d.creativeId!==creative.creativeId||d.approvalId!==creative.approvalId||String(d.creativeVersion)!==String(creative.creativeVersion)||String(d.contentChecksum)!==String(creative.contentChecksum)||String(d.htmlChecksum)!==String(creative.htmlChecksum))throw new Error('TEST_DRAFT_VARIANT_MISMATCH');
  if(String(d.subject)!==String(creative.subject)||String(d.textBody||'')!==String(creative.textBody||''))throw new Error('TEST_DRAFT_STUDIO_STORED_MISMATCH');
  if(v6AuraNormalizeHtmlForCompare_(d.htmlBody)!==v6AuraNormalizeHtmlForCompare_(creative.htmlBody))throw new Error('TEST_DRAFT_STUDIO_STORED_MISMATCH');
  v6AuraAssertHtmlProductionSafe_(creative.htmlBody);
  if(c.campaignId==='CMP-CAMPANA-A-HA-PRIORITARIA')v6CampaignStudioValidateBrand_(creative);
  var actor=v6CampaignStudioActor_();
  var result=v6AuraVerifyAndCreateTestDraft_({campaignId:c.campaignId,draft:Object.assign({},d,{language:language})});
  var current=v6AuraLatestApprovedCreativeForLanguage_(c.campaignId,language);
  if(!v6CampaignStudioVariantValid_(current)||current.creativeId!==creative.creativeId||String(current.contentChecksum)!==String(creative.contentChecksum))throw new Error('TEST_DRAFT_APPROVAL_CHANGED');
  if(!result.match||!result.draftId||result.creativeId!==creative.creativeId)throw new Error('TEST_DRAFT_CONTENT_MISMATCH');
  v6CampaignStudioAppendEvidence_(V6_STUDIO_DRAFT_TABLE_,{
   verificationId:'SDV:'+Utilities.getUuid(),campaignId:c.campaignId,language:language,
   creativeId:creative.creativeId,creativeVersion:creative.creativeVersion,contentChecksum:creative.contentChecksum,htmlChecksum:creative.htmlChecksum,
   draftId:result.draftId,verifiedAt:new Date().toISOString(),verifiedBy:actor,status:'VERIFIED'
  });
  return Object.assign({},result,{status:'TEST_DRAFT_VERIFIED',exactMatch:true,language:language,
   creativeVersion:creative.creativeVersion,contentChecksum:creative.contentChecksum,htmlChecksum:creative.htmlChecksum});
 });
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

var V6_STUDIO_SET_TABLE_='MKT_STUDIO_SET_APPROVALS';
var V6_STUDIO_DRAFT_TABLE_='MKT_STUDIO_DRAFT_VERIFICATIONS';
// Append-only evidence: no recipient PII or duplicated message bodies.
var V6_STUDIO_EVIDENCE_SCHEMA_={
 MKT_STUDIO_SET_APPROVALS:['approvalId','campaignId','approvalType','status','requiredLanguages','approvedVariants','ESCreativeId','ESCreativeVersion','ESContentChecksum','ENCreativeId','ENCreativeVersion','ENContentChecksum','PTCreativeId','PTCreativeVersion','PTContentChecksum','approvedAt','approvedBy','creativeSetSignature'],
 MKT_STUDIO_DRAFT_VERIFICATIONS:['verificationId','campaignId','language','creativeId','creativeVersion','contentChecksum','htmlChecksum','draftId','verifiedAt','verifiedBy','status']
};
function v6CampaignStudioAppendEvidence_(table,record){
 var required=V6_STUDIO_EVIDENCE_SCHEMA_[table];
 if(!required)throw new Error('STUDIO_EVIDENCE_TABLE_INVALID');
 var sheet=v6Sheet_(table);
 if(!sheet)sheet=SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).insertSheet(table);
 var count=sheet.getLastColumn(),headers=count?sheet.getRange(1,1,1,count).getValues()[0]:[];
 var missing=required.filter(function(k){return headers.indexOf(k)<0;});
 if(missing.length){sheet.getRange(1,headers.length+1,1,missing.length).setValues([missing]);headers=headers.concat(missing);}
 sheet.appendRow(headers.map(function(k){return record[k]==null?'':record[k];}));
}
function v6CampaignStudioActor_(){
 // Opaque platform-issued user key: attribution without persisting the user's email.
 var key=Session.getTemporaryActiveUserKey();
 if(!key)throw new Error('STUDIO_ACTOR_REQUIRED');
 return 'USER:'+key;
}
function v6CampaignStudioSignature_(variants){
 return JSON.stringify(Object.keys(variants).sort().map(function(l){
  var r=variants[l];return [l,r.creativeId,String(r.creativeVersion),String(r.contentChecksum),String(r.htmlChecksum)];
 }));
}
function v6CampaignStudioDraftEvidence_(campaignId,language,creative,rows){
 if(!creative)return null;
 return (rows||v6Rows_(V6_STUDIO_DRAFT_TABLE_)).filter(function(r){
  return r.campaignId===campaignId&&r.language===language&&r.status==='VERIFIED'&&r.draftId&&r.verifiedAt&&r.verifiedBy&&
   r.creativeId===creative.creativeId&&String(r.creativeVersion)===String(creative.creativeVersion)&&
   String(r.contentChecksum)===String(creative.contentChecksum)&&String(r.htmlChecksum)===String(creative.htmlChecksum);
 }).slice(-1)[0]||null;
}
function v6CampaignStudioDurableSet_(c){
 var signature=v6CampaignStudioSignature_(c.approvedCreativeVariants);
 return v6Rows_(V6_STUDIO_SET_TABLE_).filter(function(r){
  if(r.campaignId!==c.campaignId||r.approvalType!=='CREATIVE_SET'||r.status!=='APPROVED'||!r.approvalId||!r.approvedAt||!r.approvedBy||r.creativeSetSignature!==signature)return false;
  try{
   var required=JSON.parse(r.requiredLanguages),variants=JSON.parse(r.approvedVariants);
   if(!Array.isArray(required)||v6CampaignStudioSignature_(variants)!==signature)return false;
   return c.requiredLanguages.every(function(l){
    var v=c.approvedCreativeVariants[l];
    return required.indexOf(l)>=0&&v&&r[l+'CreativeId']===v.creativeId&&String(r[l+'CreativeVersion'])===String(v.creativeVersion)&&String(r[l+'ContentChecksum'])===String(v.contentChecksum);
   });
  }catch(e){return false;}
 }).slice(-1)[0]||null;
}
