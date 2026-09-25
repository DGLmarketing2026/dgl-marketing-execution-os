/** Private Studio governance. Read paths never bootstrap, ingest or write. */
var AURA_STUDIO_CONTEXT_VERSION_ = 1;
var AURA_STUDIO_LOGO_URL_ = 'https://dglmarketing2026.github.io/dgl-marketing-execution-os/assets/brand/dgl-logo-white.png';
// Existing exact master confirmed by the user against the DGL Brand Manual.
var AURA_STUDIO_LOGO_SHA256_ = '06ec3d5bbb2c8c116bfc48f4162b1d89723ca60d16d8cb115572fc76786443ac';
function v6StudioCampaign_(id) {
  var matches = v6Rows_('MKT_CAMPAIGNS').filter(function (r) { return String(r.campaignId) === String(id); });
  if (matches.length !== 1) throw new Error('EXACT_CAMPAIGN_REQUIRED');
  return matches[0];
}
function v6StudioPopulation_(campaign) {
  var id = campaign.campaignId, accounts = v6Rows_('MKT_ACCOUNTS'), contacts = v6Rows_('MKT_CONTACTS_SECURE');
  var byAccount = {}, byContact = {}, countries = {}, names = {}, ids = [], resolved;
  accounts.forEach(function (r) { byAccount[r.accountId] = r; });
  contacts.forEach(function (r) { byContact[r.contactId] = r; });
  if (id === CAMPANA_A_CAMPAIGN_ID_) {
    var map = v6AuraCampanaAAccountMap_();
    Object.keys(map).filter(Boolean).forEach(function (key) {
      var realId = v6AuraCampanaARealAccountId_(key, map[key].accountName, accounts);
      names[map[key].accountName] = realId;
      if (ids.indexOf(realId) < 0) ids.push(realId);
    });
    v6Rows_('MKT_AURA_CAMPANA_A_SOURCE_ROWS').forEach(function (r) {
      if (r.country && !countries[names[r.accountName]]) countries[names[r.accountName]] = r.country;
    });
    resolved = v6AuraCampanaAResolveRecipients_(ids, names, 'Activation');
    var pipeline = {}, campaigns = v6Rows_('MKT_CAMPAIGNS');
    v6Rows_('MKT_ACCOUNT_PIPELINE').forEach(function (r) { pipeline[r.accountId] = r; });
    resolved.eligible = resolved.eligible.filter(function (r) {
      var p = pipeline[r.accountId], stage = p ? String(p.currentStage || '').toUpperCase() : '';
      var stopped = stage && (stage === 'CLOSED / SUPPRESSED' || v6PipelineAdvanced_(stage));
      if (stopped && !v6AuraCampanaAStopOverrideCheck_(stage, p, campaigns).overridable) { resolved.excluded.push(r); return false; }
      return true;
    });
  } else {
    ids = v6Rows_('MKT_SCOPE_ACCOUNTS').filter(function (r) { return r.scopeId === (campaign.scopeId || campaign.audienceId) && !/^(SUPPRESSED|EXCLUDED|BLOCKED)$/.test(String(r.status || r.eligibilityStatus || '').toUpperCase()); }).map(function (r) { return r.accountId; });
    var exclusions = v6Rows_('MKT_EXCLUSIONS'), ledger = v6Rows_('MKT_FREQUENCY_LEDGER');
    resolved = {eligible:[],excluded:[]};
    contacts.filter(function(r){return ids.indexOf(r.accountId)>=0 && String(r.status||'ACTIVE').toUpperCase()!=='INACTIVE';}).forEach(function(r){
      var ok = !v6RecipientBool_(r.doNotContact||r.dnc) && v6RecipientEmailValid_(r.email) && String(r.emailStatus).toUpperCase()!=='INVALID' &&
        !v6RecipientActiveExclusion_(exclusions,r.accountId,r.contactId,new Date()) && v6FrequencyStatus_({accountId:r.accountId,contactId:r.contactId,campaignId:id,campaignType:campaign.campaignType},ledger).eligible;
      (ok?resolved.eligible:resolved.excluded).push(r);
    });
  }
  var counts = { ES: 0, EN: 0, PT: 0 }, eligibleIds = {};
  resolved.eligible.forEach(function (r) {
    var lang = v6AuraCampanaAPreferredLanguage_(byContact[r.contactId] || {}, byAccount[r.accountId] || {}, r.rowCountry || countries[r.accountId] || '').language;
    counts[lang]++; eligibleIds[r.accountId] = true;
  });
  return { detectedAccounts: ids.filter(function (id, i) { return ids.indexOf(id) === i; }).length, eligibleAccounts: Object.keys(eligibleIds).length,
    eligibleContacts: resolved.eligible.length, excludedContacts: resolved.excluded.length,
    requiredLanguages: ['ES','EN','PT'].filter(function (l) { return counts[l] > 0; }), languageCounts: counts };
}
function v6StudioAssertBrand_(creative) {
  if (!/^[a-f0-9]{64}$/i.test(AURA_STUDIO_LOGO_SHA256_)) throw new Error('CANONICAL DGL LOGO VALIDATION FAILED');
  if (String(creative.htmlBody).indexOf('data-dgl-brand-sha256="' + AURA_STUDIO_LOGO_SHA256_ + '"') < 0 || creative.logoUrl !== AURA_STUDIO_LOGO_URL_ || String(creative.htmlBody).indexOf('src="' + AURA_STUDIO_LOGO_URL_ + '"') < 0 || /onerror\s*=/i.test(creative.htmlBody)) throw new Error('BRAND_QA_FAILED');
}
function v6StudioAssertContent_(creative) {
  v6AuraAssertHtmlProductionSafe_(creative.htmlBody);
  v6AuraAssertNoInternalLabels_(creative.subject, creative.htmlBody, [creative.preheader,creative.textBody].join(' '), 'INTERNAL_LABEL_DETECTED');
  var language = v6AuraCreativeLanguage_(creative.language);
  if (!language || String(creative.htmlBody).indexOf('lang="' + language.toLowerCase() + '"') < 0) throw new Error('CREATIVE_VARIANT_MISMATCH');
  if (/Stay Close|Staying Close|Seguimos cerca|Relationship Continuity|Próximos da sua operação|Multiservicio/i.test([creative.subject,creative.preheader,creative.htmlBody,creative.textBody].join(' '))) throw new Error('ACTIVATION_COPY_QA_FAILED');
  var replyTo = v6AuraEmailCanonicalReplyTo_();
  if (!replyTo || String(creative.htmlBody).indexOf('href="mailto:' + replyTo) < 0) throw new Error('CANONICAL_CTA_REQUIRED');
  if (creative.templateId !== 'editorial-white' || creative.heroUrl) throw new Error('INCOMPATIBLE_CREATIVE_SYSTEM');
  if (String(creative.htmlBody).indexOf('Dedicated Ground Logistics') < 0) throw new Error('BRAND_FOOTER_REQUIRED');
}
function v6StudioCreativeSet_(campaign, population) {
  var valid = [], missing = [];
  ['ES','EN','PT'].forEach(function (language) {
    var r = v6AuraLatestApprovedCreativeForLanguage_(campaign.campaignId, language);
    try {
      if (!r || String(r.status) !== 'APPROVED' || !r.approvalId || !r.subject || !r.htmlBody || !r.contentChecksum ||
          v6AuraChecksum_(r.htmlBody) !== r.htmlChecksum || v6AuraCanonicalContentChecksum_(r.subject,r.htmlBody,r.textBody,r.templateId,r.creativeVersion) !== r.contentChecksum) throw new Error('CREATIVE_CHECKSUM_REQUIRED');
      if (campaign.campaignId === CAMPANA_A_CAMPAIGN_ID_) { v6StudioAssertBrand_(r); v6StudioAssertContent_(r); }
      valid.push({language:language,creativeId:r.creativeId,creativeVersion:r.creativeVersion,approvalId:r.approvalId,htmlChecksum:r.htmlChecksum,contentChecksum:r.contentChecksum});
    } catch (err) { if(population.requiredLanguages.indexOf(language)>=0)missing.push(language); }
  });
  return {creativeSetChecksum:String(v6AuraChecksum_(JSON.stringify(valid))),approvedCreativeVariants:valid,missingCreativeVariants:missing,creativeSetStatus:population.requiredLanguages.length && !missing.length ? 'READY' : 'CREATIVE_SET_INCOMPLETE'};
}
function v6CampaignStudioContext_(payload) {
  var c = v6StudioCampaign_((payload || {}).campaignId), p = v6StudioPopulation_(c), result = {};
  ['campaignId','campaignName','campaignType','objective','service','scopeId','audienceId','playbookId','status','approvalStatus','language','updatedAt'].forEach(function (k) { result[k] = c[k] || ''; });
  result.objective = c.objective || c.campaignType || '';
  result.scopeId = c.scopeId || c.audienceId || '';
  result.contextVersion = AURA_STUDIO_CONTEXT_VERSION_;
  result.sourceTimestamp = c.updatedAt || '';
  result.recipientMode = 'RECIPIENT-DRIVEN / MULTILINGUAL';
  result.messageAngle = c.messageAngle || (c.objective === 'Activation' ? 'Current Movement' : '');
  result.replyTo = v6AuraEmailCanonicalReplyTo_();
  result.logoUrl = AURA_STUDIO_LOGO_URL_;
  result.logoSha256 = AURA_STUDIO_LOGO_SHA256_;
  result.logoVerified = /^[a-f0-9]{64}$/i.test(AURA_STUDIO_LOGO_SHA256_);
  var scopes = v6Rows_('MKT_CAMPAIGN_SCOPES').filter(function (r) { return r.scopeId === result.scopeId && r.campaignId === c.campaignId; });
  result.approvedCreativeSetChecksum = c.creativeSetChecksum || '';
  result.metadataValid = c.campaignId !== CAMPANA_A_CAMPAIGN_ID_ || (c.objective === 'Activation' && c.campaignType === 'Activation' && c.service === 'Multiservicio' && c.language === 'MULTILINGUAL' && c.scopeId === CAMPANA_A_SCOPE_ID_ && c.audienceId === CAMPANA_A_SCOPE_ID_ && c.playbookId === 'ACTIVATION_ACCOUNT');
  result.audienceResolved = result.metadataValid && !!c.audienceId && scopes.length === 1 && c.audienceId === scopes[0].audienceId;
  return Object.assign(result, p, v6StudioCreativeSet_(c, p));
}
function v6AuraCampanaACreativeSetReadiness_() {
  try {
    var c = v6CampaignStudioContext_({campaignId:CAMPANA_A_CAMPAIGN_ID_});
    return {ready:c.audienceResolved && c.creativeSetStatus === 'READY' && c.approvalStatus === 'APPROVED' && c.approvedCreativeSetChecksum === c.creativeSetChecksum,status:c.audienceResolved && c.creativeSetStatus === 'READY' && c.approvalStatus === 'APPROVED' && c.approvedCreativeSetChecksum === c.creativeSetChecksum ? 'READY' : 'CREATIVE_SET_INCOMPLETE',requiredLanguages:c.requiredLanguages,missingCreativeVariants:c.missingCreativeVariants};
  } catch (err) { return {ready:false,status:'CREATIVE_SET_INCOMPLETE',reason:String(err.message || err)}; }
}
function v6StudioAssertSetReady_(campaignId) {
  var c = v6CampaignStudioContext_({campaignId:campaignId});
  if (!c.audienceResolved || c.creativeSetStatus !== 'READY') throw new Error('CREATIVE_SET_INCOMPLETE');
  return c;
}
function v6CampaignStudioApproveSet_(payload) {
  var p = payload || {}, lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (!p.approvedBy) throw new Error('approvedBy is required');
    v6StudioAssertSetReady_(p.campaignId);
    requestMarketingV55Approval_(p.campaignId, {requestedBy:p.approvedBy});
    return recordMarketingV55Approval_(p.campaignId, {approvedBy:p.approvedBy,status:'APPROVED'});
  } finally { lock.releaseLock(); }
}

// An explicit scope click passes identity only. Re-read source rows, never trust a
// browser's objective/service/counts and never refresh an external spreadsheet.
function v6StudioScopeId_(row) {
  function slug(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
  return 'SCOPE-'+[row.amOwner||'UNASSIGNED',v6OpportunityFamily_(row.opportunityType),row.service||'MULTISERVICIO',v6OpportunityWindow_(row.qnbWindow||row.window||''),row.reasonCategory||row.reason||''].map(slug).join('-');
}
function v6CampaignStudioPrepareScope_(payload) {
  var scopeId=String((payload||{}).scopeId||''),lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    if(!scopeId)throw new Error('EXPLICIT_SCOPE_REQUIRED');
    var existing=v6Rows_('MKT_CAMPAIGNS').filter(function(c){return c.scopeId===scopeId;});
    if(existing.length===1 && v6Rows_('MKT_CAMPAIGN_SCOPES').some(function(r){return r.scopeId===scopeId && r.campaignId===existing[0].campaignId && r.audienceId===scopeId;}))return {campaignId:existing[0].campaignId};
    if(existing.length>1)throw new Error('AMBIGUOUS_SCOPE_CAMPAIGN');
    var rows=v6Rows_('MKT_OPPORTUNITIES').filter(function(r){return v6StudioScopeId_(r)===scopeId;});
    if(!rows.length)throw new Error('CURRENT_OPPORTUNITY_REQUIRED');
    var row=rows[0],family=v6OpportunityFamily_(row.opportunityType);
    var map={ACTIVATION:['Activation','ACTIVATION_ACCOUNT','Current Movement'],RETENTION:['Retention','RETENTION_RISK','Planning Ahead'],REACTIVATION:['Reactivation','REACTIVATION_ACCOUNT','Previous Relationship'],'CROSS-SELL':['Cross-Sell','CROSS_SELL_SERVICE','Additional Capability'],NURTURE:['Retention','ACCOUNT_NURTURE','Stay Close'],QNB:['Quoted Not Booked','QNB_'+(v6OpportunityWindow_(row.qnbWindow||row.window)==='30+'?'30_PLUS':v6OpportunityWindow_(row.qnbWindow||row.window).replace('-','_')),'Quote Follow-Up']};
    var strategy=map[family];
    if(family==='QNB'){var w=v6OpportunityWindow_(row.qnbWindow||row.window);strategy[2]=w==='15-30'?'Quote Recovery':w==='30+'?'Reopen the Conversation':'Quote Follow-Up';}
    if(!strategy)throw new Error('UNSUPPORTED_OPPORTUNITY_FAMILY');
    var ids=[];rows.forEach(function(r){if(r.accountId&&/^(DETECTED|ELIGIBLE)$/.test(String(r.eligibilityStatus).toUpperCase())&&ids.indexOf(r.accountId)<0)ids.push(r.accountId);});
    if(!ids.length)throw new Error('NO_ELIGIBLE_SCOPE_ACCOUNTS');
    var campaign=existing[0];
    if(!campaign){
    var requestResult=createMarketingV55Request_({requestId:'STUDIO:'+scopeId,portfolioName:scopeId,amOwner:row.amOwner,objective:strategy[0],service:row.service,accountCount:ids.length,priority:row.priority !== '' && row.priority != null && isFinite(Number(row.priority)) ? String(Number(row.priority)) : String(v6OpportunityPriority_(row.opportunityType)),requestedOutcome:'Review current requirement',audienceId:scopeId,qnbWindow:v6OpportunityWindow_(row.qnbWindow||row.window),source:'EXPLICIT_OPPORTUNITY'});
    if(!requestResult.validation.ok)throw new Error('SCOPE_REQUEST_INVALID: '+requestResult.validation.missingFields.join(', '));
    campaign=createMarketingV55Campaign_(requestResult.request.requestId,{scopeId:scopeId,playbookId:strategy[1],messageAngle:strategy[2],campaignName:strategy[0]+' · '+row.service});
    }
    v6AuraEnsureCampaignScope_({scopeId:scopeId,campaignId:campaign.campaignId,opportunityType:strategy[0],campaignType:strategy[0],accountIds:ids,batchWrite:true});
    return {campaignId:campaign.campaignId};
  } finally {lock.releaseLock();}
}
