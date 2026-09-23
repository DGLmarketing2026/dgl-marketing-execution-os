/**
 * DGL Marketing Execution OS — V5.5 Private Backend
 * AM decides WHAT. Marketing executes HOW.
 */
const MKT_V55 = Object.freeze({
  HUB_ID: '1FXpoBO658ldbr4V8wCKo0luHU3_kqHwYzAnWijA6lBM',
  TZ: 'America/Bogota',
  TOKEN_PROPERTY: 'DGL_MKT_V55_TOKEN',
  SHEETS: Object.freeze({
    REQUESTS: 'MKT_AM_REQUESTS',
    CAMPAIGNS: 'MKT_CAMPAIGNS',
    APPROVALS: 'MKT_APPROVALS',
    RESPONSES: 'MKT_RESPONSES',
    STOPS: 'MKT_ACCOUNT_STOPS',
    HANDOFFS: 'MKT_HANDOFFS',
    ACTIVITY: 'MKT_ACTIVITY',
    EMAIL_QUEUE: 'MKT_EMAIL_QUEUE',
    ATTRIBUTION: 'MKT_ATTRIBUTION'
  })
});

function handleMarketingV55Api_(e, method) {
  if (!e) return null;
  var params = Object.assign({}, e.parameter || {});
  var body = {};
  if (e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (err) {}
  }
  var req = Object.assign({}, params, body);
  if (req.payload && typeof req.payload === 'string') {
    try { req = Object.assign(req, JSON.parse(req.payload)); } catch (ignored) {}
  }

  var action = String(req.action || '');
  var allowed = [
  'v55CreateTestDraft',
  'v55ResolveRecipients',
  'v55AudienceStatus',
  'v55Health','v55Setup','v55Requests','v55CreateRequest','v55UpdateRequest',
  'v55Campaigns','v55CreateCampaign','v55RequestApproval','v55RecordApproval',
  'v55ActivateCampaign','v55PauseCampaign','v55RecordResponse','v55StopAccount',
 'v55Handoff', 'v55RecordOutcome', 'v55Activity',
'v6Opportunities', 'v6RunOpportunityEngine', 'v6OpportunitySummary',
'v6FrequencyStatus', 'v6EvaluateCampaignPressure',
'v6AccountPipeline', 'v6PipelineSummary',
'v6PipelineTransition', 'v6PipelineSyncSignals',
'v6CreateExecution', 'v6QueueExecution', 'v6StartExecution',
'v6ExecutionStatus', 'v6ExecutionArchiveStatus',
'v6CopyUsage', 'v6RecordCopyUsage',
'v6CreativeUsage', 'v6RecordCreativeUsage',
// AURA dashboard bridge (read-only reporting functions only -- see
// MarketingV6RouterExtension.gs for the real handlers). Deliberately excludes every
// AURA function that writes queue rows or could ever send a real email
// (v6AuraCampanaARegenerateDryRun_, auraProcessEmailQueue, auraEnableLiveSending): this
// GitHub Pages frontend is presentation-only, per this project's own stated architecture,
// and must never be a second way to trigger a real send.
'v6AuraEmailPerformance', 'v6AuraRetentionDashboard', 'v6AuraCampanaAAudit', 'v6AuraCampanaAMatchReport',
'v6AuraCampanaAStoppedBreakdown', 'v6AuraExecutionReport', 'v6AuraAutomaticReportStatus',
'v6AuraCampanaALatestRunSummary',
// Iniciativa 2 -- Campaign Studio's own Approve Creative action (MarketingV6AuraCreativeApproval.gs).
// This persists CONTENT Marketing already designed and is about to display back to itself in the
// same Studio -- exactly the same "Marketing executes HOW" category as v55CreateCampaign/
// v55RecordApproval above, never a send. It writes MKT_CAMPAIGN_CREATIVES only; it never writes a
// queue row and never calls GmailApp -- still excluded, same as before, are every AURA function
// that writes queue rows or could ever send a real email.
'v6AuraApproveCreative', 'v6AuraLatestApprovedCreative',
// PR #3 audit remediation -- editing an approved creative must revoke the BACKEND record, not
// only local browser state. Writes MKT_CAMPAIGN_CREATIVES only (flips status to REVOKED on the
// exact row that was edited); never writes a queue row and never calls GmailApp.
'v6AuraRevokeCreativeApproval'
];
  
  if (allowed.indexOf(action) === -1) return null;

  try {
    if (action !== 'v55Health') mktV55AssertToken_(req.token || req.apiKey || '');
    var result;
    switch (action) {
    case 'v6Opportunities':
case 'v6RunOpportunityEngine':
case 'v6OpportunitySummary':
case 'v6FrequencyStatus':
case 'v6EvaluateCampaignPressure':
case 'v6AccountPipeline':
case 'v6PipelineTransition':
case 'v6PipelineSyncSignals':
case 'v6PipelineSummary':
case 'v6CreateExecution':
case 'v6QueueExecution':
case 'v6StartExecution':
case 'v6ExecutionStatus':
case 'v6ExecutionArchiveStatus':
case 'v6CopyUsage':
case 'v6RecordCopyUsage':
case 'v6CreativeUsage':
case 'v6RecordCreativeUsage':
case 'v6AuraEmailPerformance':
case 'v6AuraRetentionDashboard':
case 'v6AuraCampanaAAudit':
case 'v6AuraCampanaAMatchReport':
case 'v6AuraCampanaAStoppedBreakdown':
case 'v6AuraExecutionReport':
case 'v6AuraAutomaticReportStatus':
case 'v6AuraCampanaALatestRunSummary':
  result = routeMarketingV6_(action, req);
  break;
 case 'v6IngestAuthoritativeContacts':
case 'v6ResolveRecipients':
case 'v6AudienceStatus':
case 'v55ResolveRecipients':
case 'v55AudienceStatus':
case 'v6AuraApproveCreative':
case 'v6AuraLatestApprovedCreative':
case 'v6AuraRevokeCreativeApproval':
  result = routeMarketingV6_(action, req);
  break;
    case 'v55CreateTestDraft':
  // PR #3 audit punto 9 -- createMarketingV55TestDraft_ is not defined anywhere in this
  // repository (confirmed by grep across the whole backend/ tree); the real, verified,
  // in-repo implementation lives in MarketingV6AuraCreativeApproval.gs. It creates the real
  // Gmail draft itself and reads it back for a genuine end-to-end comparison -- see that
  // file's doc comment. On success it also writes the same MKT_ACTIVITY row
  // (actionType TEST_DRAFT_CREATED) the frontend's createTestDraft() polling already expects;
  // on any thrown error the existing catch-all below writes the matching API_ERROR row, same
  // as for every other action.
  result = v6AuraVerifyAndCreateTestDraft_(req);
  mktV55Audit_('TEST_DRAFT_CREATED', req, 'COMPLETED', result);
  break;
      case 'v55Health':
        result = {ok:true,service:'DGL Marketing OS V5.5 Private Backend',version:'5.5',mode:'PRIVATE_BACKEND',claudeConnected:false,hubId:MKT_V55.HUB_ID};
        break;
      case 'v55Setup': result = setupMarketingV55Backend(); break;
      case 'v55Requests': result = mktV55ReadAll_(MKT_V55.SHEETS.REQUESTS); break;
      case 'v55CreateRequest': result = createMarketingV55Request_(req.record || req); break;
      case 'v55UpdateRequest': result = updateMarketingV55Request_(req.requestId || req.id, req.patch || req.record || req); break;
      case 'v55Campaigns': result = mktV55ReadAll_(MKT_V55.SHEETS.CAMPAIGNS); break;
      case 'v55CreateCampaign': result = createMarketingV55Campaign_(req.requestId, req.strategy || req.record || {}); break;
      case 'v55RequestApproval': result = requestMarketingV55Approval_(req.campaignId, req); break;
      case 'v55RecordApproval': result = recordMarketingV55Approval_(req.campaignId, req); break;
      case 'v55ActivateCampaign': result = activateMarketingV55Campaign_(req.campaignId, req); break;
      case 'v55PauseCampaign': result = pauseMarketingV55Campaign_(req.campaignId, req); break;
      case 'v55RecordResponse': result = recordMarketingV55Response_(req); break;
      case 'v55StopAccount': result = stopMarketingV55Account_(req); break;
      case 'v55Handoff': result = handoffMarketingV55ToAM_(req); break;
      case 'v55RecordOutcome': result = recordMarketingV55Outcome_(req); break;
      case 'v55Activity': result = mktV55ReadAll_(MKT_V55.SHEETS.ACTIVITY); break;
    }
    return mktV55Json_(req.callback || '', {
  ok: true,
  result: result
});
  } catch (err) {
    try { mktV55Audit_('API_ERROR', req, 'BLOCKED', String(err && err.message || err)); } catch (ignored2) {}
  return mktV55Json_(req.callback || '', {
  ok: false,
  error: String(err && err.message || err)
});
  }
}

function setupMarketingV55Backend() {
  var required = {};
  required[MKT_V55.SHEETS.REQUESTS] = ['requestId','createdAt','amOwner','portfolioName','accountName','accountCount','objective','service','messageAngle','priority','commercialContext','requestedOutcome','targetWindow','lane','qnbWindow','audienceId','audienceCount','exclusions','status','campaignId','automationStatus','marketingStatus','createdBy','updatedAt','source','notes'];
  required[MKT_V55.SHEETS.CAMPAIGNS] = ['campaignId','campaignName','campaignType','audienceId','service','language','templateId','subject','preheader','headline','body','body2','cta','ctaUrl','heroUrl','logoUrl','senderName','replyTo','status','createdAt','updatedAt','requestId','amOwner','playbookId','marketingStatus','approvalStatus'];
  required[MKT_V55.SHEETS.APPROVALS] = ['approvalId','campaignId','requestId','approvalType','approvalScope','status','requestedAt','requestedBy','approvedAt','approvedBy','rejectedAt','rejectedBy','reason','expiresAt','channel','audienceId','accountCount','version','notes','updatedAt'];
  required[MKT_V55.SHEETS.RESPONSES] = ['responseId','campaignId','requestId','accountId','contactId','responseType','responseAt','channel','externalMessageId','rfqId','quoteId','loadId','summary','requiresAMAction','amOwner','stopApplied','handoffId','status','createdAt','notes'];
  required[MKT_V55.SHEETS.STOPS] = ['stopId','campaignId','requestId','accountId','contactId','stopReason','stoppedAt','responseType','scope','remainingCampaignAccountsContinue','sourceEventId','amOwner','sequenceStep','externalId','status','createdBy','createdAt','updatedAt','metadata','notes'];
  required[MKT_V55.SHEETS.HANDOFFS] = ['handoffId','campaignId','requestId','accountId','contactId','amOwner','responseType','responseDate','campaignObjective','service','nextAction','handoffStatus','acknowledgedAt','acknowledgedBy','closedAt','outcomeId','quoteId','loadId','createdAt','notes'];
  required[MKT_V55.SHEETS.ACTIVITY] = ['activityId','timestamp','actionType','requestId','campaignId','accountId','contactId','permissionLevel','status','result','approvedBy','actor','source','externalId','correlationId','idempotencyKey','createdAt','metadata','error','notes'];

  var ss = mktV55Ss_(), missingSheets = [], headerErrors = [];
  Object.keys(required).forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { missingSheets.push(name); return; }
    var expected = required[name];
    var actual = sh.getRange(1,1,1,expected.length).getValues()[0].map(String);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) headerErrors.push(name);
  });

  return {
    ok: missingSheets.length === 0 && headerErrors.length === 0,
    hubTitle: ss.getName(),
    hubId: ss.getId(),
    missingSheets: missingSheets,
    headerErrors: headerErrors,
    tokenConfigured: Boolean(PropertiesService.getScriptProperties().getProperty(MKT_V55.TOKEN_PROPERTY)),
    claudeConnected: false
  };
}

function createMarketingV55Token() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(MKT_V55.TOKEN_PROPERTY)) return {ok:true,created:false,tokenConfigured:true};
  props.setProperty(MKT_V55.TOKEN_PROPERTY, Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''));
  return {ok:true,created:true,tokenConfigured:true,note:'Stored in Script Properties. Never put it in GitHub Pages.'};
}

function validateMarketingV55Request_(r) {
  r = r || {}; var missing = [];
  if (!String(r.amOwner || '').trim()) missing.push('amOwner');
  if (!String(r.portfolioName || r.accountName || '').trim()) missing.push('portfolioName/accountName');
  if (!String(r.objective || '').trim()) missing.push('objective');
  if (!String(r.service || '').trim()) missing.push('service');
  if (!(Number(r.accountCount || 0) > 0)) missing.push('accountCount');
  if (!String(r.priority || '').trim()) missing.push('priority');
  if (!String(r.requestedOutcome || '').trim()) missing.push('requestedOutcome');
  var objective = String(r.objective || '').toUpperCase();
  if (objective === 'QUOTED NOT BOOKED' && !String(r.qnbWindow || '').trim()) missing.push('qnbWindow');
  if (objective === 'LANE CAMPAIGN' && !String(r.lane || '').trim()) missing.push('lane');
  return {ok:missing.length===0,missingFields:missing,status:missing.length?'NEEDS CLARIFICATION':'READY FOR MARKETING'};
}

function createMarketingV55Request_(input) {
  var d = Object.assign({}, input || {}), v = validateMarketingV55Request_(d), now = mktV55Now_();
  var record = {
    requestId:d.requestId || mktV55Id_('AMR'), createdAt:d.createdAt || now, amOwner:d.amOwner || '',
    portfolioName:d.portfolioName || '', accountName:d.accountName || '', accountCount:Number(d.accountCount || 0),
    objective:d.objective || '', service:d.service || '', messageAngle:d.messageAngle || '', priority:d.priority || 'MEDIUM',
    commercialContext:d.commercialContext || '', requestedOutcome:d.requestedOutcome || '', targetWindow:d.targetWindow || '',
    lane:d.lane || '', qnbWindow:d.qnbWindow || '', audienceId:d.audienceId || '', audienceCount:Number(d.audienceCount || d.accountCount || 0),
    exclusions:d.exclusions || '', status:v.status, campaignId:d.campaignId || '', automationStatus:v.status, marketingStatus:v.status,
    createdBy:d.createdBy || 'AM', updatedAt:now, source:d.source || 'AM',
    notes:v.ok ? (d.notes || '') : ('Missing: ' + v.missingFields.join(', '))
  };
  var saved = mktV55Upsert_(MKT_V55.SHEETS.REQUESTS,'requestId',record,'AMR');
  mktV55Audit_('AM_REQUEST_CREATED', saved, v.ok?'COMPLETED':'BLOCKED', v);
  return {request:saved,validation:v};
}

function updateMarketingV55Request_(requestId, patch) {
  if (!requestId) throw new Error('requestId is required');
  var current = mktV55Find_(MKT_V55.SHEETS.REQUESTS,'requestId',requestId);
  if (!current) throw new Error('AM Request not found: ' + requestId);
  var merged = Object.assign({}, current, patch || {}, {requestId:requestId,updatedAt:mktV55Now_()});
  var v = validateMarketingV55Request_(merged);
  if (!v.ok) {
    merged.status = merged.automationStatus = merged.marketingStatus = 'NEEDS CLARIFICATION';
    merged.notes = 'Missing: ' + v.missingFields.join(', ');
  } else if (String(merged.status) === 'NEEDS CLARIFICATION') {
    merged.status = merged.automationStatus = merged.marketingStatus = 'READY FOR MARKETING';
  }
  var saved = mktV55Upsert_(MKT_V55.SHEETS.REQUESTS,'requestId',merged,'AMR');
  mktV55Audit_('AM_REQUEST_UPDATED', saved, v.ok?'COMPLETED':'BLOCKED', v);
  return {request:saved,validation:v};
}

function createMarketingV55Campaign_(requestId, strategy) {
  var request = mktV55Find_(MKT_V55.SHEETS.REQUESTS,'requestId',requestId);
  if (!request) throw new Error('AM Request not found: ' + requestId);
  var v = validateMarketingV55Request_(request);
  if (!v.ok) throw new Error('AM Request incomplete: ' + v.missingFields.join(', '));
  if (request.campaignId) {
    var existing = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',request.campaignId);
    if (existing) return existing;
  }
  var s = strategy || {}, now = mktV55Now_(), id = mktV55Id_('CMP');
  var campaign = {
    campaignId:id, campaignName:s.campaignName || (request.objective + ' · ' + request.service),
    campaignType:request.objective, audienceId:request.audienceId || '', service:request.service || '',
    language:s.language || 'EN', templateId:s.templateId || s.creativeSystem || '', subject:s.subject || '',
    preheader:s.preheader || '', headline:s.headline || '', body:s.body || '', body2:s.body2 || '',
    cta:s.cta || '', ctaUrl:s.ctaUrl || '', heroUrl:s.heroUrl || '', logoUrl:s.logoUrl || '',
    senderName:s.senderName || 'DGL', replyTo:s.replyTo || '', status:'CAMPAIGN READY', createdAt:now, updatedAt:now,
    requestId:request.requestId, amOwner:request.amOwner, playbookId:s.playbookId || '',
    marketingStatus:'CAMPAIGN READY', approvalStatus:'NOT REQUESTED'
  };
  var saved = mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',campaign,'CMP');
  request.campaignId=id; request.status=request.automationStatus=request.marketingStatus='CAMPAIGN READY'; request.updatedAt=now;
  mktV55Upsert_(MKT_V55.SHEETS.REQUESTS,'requestId',request,'AMR');
  mktV55Audit_('CAMPAIGN_PREPARED',{requestId:requestId,campaignId:id,amOwner:request.amOwner},'COMPLETED',{playbookId:campaign.playbookId});
  return saved;
}

function requestMarketingV55Approval_(campaignId, data) {
  var c = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',campaignId);
  if (!c) throw new Error('Campaign not found: ' + campaignId);
  data = data || {}; var now = mktV55Now_();
  var a = {
    approvalId:mktV55Id_('APR'), campaignId:campaignId, requestId:c.requestId || '',
    approvalType:data.approvalType || 'CAMPAIGN ACTIVATION', approvalScope:data.approvalScope || 'CAMPAIGN',
    status:'WAITING APPROVAL', requestedAt:now, requestedBy:data.requestedBy || 'Marketing',
    approvedAt:'', approvedBy:'', rejectedAt:'', rejectedBy:'', reason:'', expiresAt:data.expiresAt || '',
    channel:data.channel || 'EMAIL', audienceId:c.audienceId || '', accountCount:Number(data.accountCount || 0),
    version:data.version || 'V5.5', notes:data.notes || '', updatedAt:now
  };
  var saved = mktV55Upsert_(MKT_V55.SHEETS.APPROVALS,'approvalId',a,'APR');
  c.status=c.marketingStatus=c.approvalStatus='WAITING APPROVAL'; c.updatedAt=now;
  mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',c,'CMP');
  mktV55Audit_('APPROVAL_REQUESTED',{campaignId:campaignId,requestId:c.requestId},'WAITING_APPROVAL',saved);
  return saved;
}

function recordMarketingV55Approval_(campaignId, data) {
  if (!data || !data.approvedBy) throw new Error('approvedBy is required');
  var c = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',campaignId);
  if (!c) throw new Error('Campaign not found: ' + campaignId);
  var approvals = mktV55ReadAll_(MKT_V55.SHEETS.APPROVALS).filter(function(a){
    return String(a.campaignId)===String(campaignId) && String(a.status)==='WAITING APPROVAL';
  });
  if (!approvals.length) throw new Error('No pending approval found for campaign');
  var a = approvals[approvals.length-1], approved = String(data.status || 'APPROVED').toUpperCase()==='APPROVED', now=mktV55Now_();
  a.status=approved?'APPROVED':'REJECTED'; a.approvedAt=approved?now:''; a.approvedBy=approved?data.approvedBy:'';
  a.rejectedAt=approved?'':now; a.rejectedBy=approved?'':data.approvedBy; a.reason=data.reason || ''; a.updatedAt=now;
  mktV55Upsert_(MKT_V55.SHEETS.APPROVALS,'approvalId',a,'APR');
  c.status=approved?'APPROVED':'CAMPAIGN READY'; c.marketingStatus=c.status; c.approvalStatus=a.status; c.updatedAt=now;
  mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',c,'CMP');
  mktV55Audit_('APPROVAL_RECORDED',{campaignId:campaignId,requestId:c.requestId,approvedBy:data.approvedBy},approved?'APPROVED':'BLOCKED',{approvalId:a.approvalId,status:a.status});
  return {approval:a,campaign:c};
}

function activateMarketingV55Campaign_(campaignId, data) {
  var c = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',campaignId);
  assertMarketingV55AudienceResolved_(campaignId);
  if (String(c.approvalStatus).toUpperCase()!=='APPROVED') throw new Error('Marketing approval required before activation');
  c.status=c.marketingStatus='CAMPAIGN ACTIVE'; c.updatedAt=mktV55Now_();
  var saved = mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',c,'CMP');
  if (c.requestId) updateMarketingV55Request_(c.requestId,{status:'CAMPAIGN ACTIVE',automationStatus:'CAMPAIGN ACTIVE',marketingStatus:'CAMPAIGN ACTIVE'});
  mktV55Audit_('CAMPAIGN_ACTIVATED',{campaignId:campaignId,requestId:c.requestId,approvedBy:(data&&data.approvedBy)||''},'COMPLETED',{approvalStatus:c.approvalStatus});
  return saved;
}

function pauseMarketingV55Campaign_(campaignId, data) {
  var c=mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',campaignId);
  if (!c) throw new Error('Campaign not found: '+campaignId);
  c.status=c.marketingStatus='PAUSED'; c.updatedAt=mktV55Now_();
  var saved=mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',c,'CMP');
  mktV55Audit_('CAMPAIGN_PAUSED',{campaignId:campaignId,requestId:c.requestId},'COMPLETED',{reason:(data&&data.reason)||''});
  return saved;
}

function recordMarketingV55Response_(d) {
  d=d||{};
  if (!d.campaignId) throw new Error('campaignId is required');
  if (!d.accountId) throw new Error('accountId is required');
  if (!d.responseType) throw new Error('responseType is required');

  if (d.externalMessageId) {
    var dup=mktV55ReadAll_(MKT_V55.SHEETS.RESPONSES).find(function(r){return String(r.externalMessageId)===String(d.externalMessageId);});
    if (dup) return {duplicate:true,response:dup};
  }

  var c=mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS,'campaignId',d.campaignId);
  if (!c) throw new Error('Campaign not found: '+d.campaignId);
  var now=d.responseAt || mktV55Now_(), id=d.responseId || mktV55Id_('RSP');
  var r={
    responseId:id,campaignId:d.campaignId,requestId:d.requestId || c.requestId || '',accountId:d.accountId,contactId:d.contactId || '',
    responseType:d.responseType,responseAt:now,channel:d.channel || 'EMAIL',externalMessageId:d.externalMessageId || '',
    rfqId:d.rfqId || '',quoteId:d.quoteId || '',loadId:d.loadId || '',summary:d.summary || '',requiresAMAction:true,
    amOwner:d.amOwner || c.amOwner || '',stopApplied:false,handoffId:'',status:'RESPONSE RECEIVED',createdAt:mktV55Now_(),notes:d.notes || ''
  };
  mktV55Upsert_(MKT_V55.SHEETS.RESPONSES,'responseId',r,'RSP');
  var stop=stopMarketingV55Account_({campaignId:d.campaignId,requestId:r.requestId,accountId:d.accountId,contactId:d.contactId||'',stopReason:d.stopReason || mktV55StopReasonFromResponse_(d.responseType),responseType:d.responseType,sourceEventId:id,externalId:d.externalMessageId||'',amOwner:r.amOwner,createdBy:'SYSTEM'});
  var handoff=handoffMarketingV55ToAM_({campaignId:d.campaignId,requestId:r.requestId,accountId:d.accountId,contactId:d.contactId||'',amOwner:r.amOwner,responseType:d.responseType,responseDate:now,campaignObjective:c.campaignType||'',service:c.service||'',nextAction:d.nextAction||'AM follow-up required',quoteId:d.quoteId||'',loadId:d.loadId||'',notes:d.summary||d.notes||''});
  r.stopApplied=true; r.handoffId=handoff.handoffId;
  mktV55Upsert_(MKT_V55.SHEETS.RESPONSES,'responseId',r,'RSP');
  mktV55Audit_('CUSTOMER_RESPONSE_PROCESSED',r,'COMPLETED',{stopId:stop.stopId,handoffId:handoff.handoffId,scope:'ACCOUNT_ONLY',remainingCampaignAccountsContinue:true});
  return {response:r,stop:stop,handoff:handoff,remainingCampaignAccountsContinue:true};
}

function stopMarketingV55Account_(d) {
  d=d||{};
  if (!d.campaignId) throw new Error('campaignId is required');
  if (!d.accountId) throw new Error('accountId is required');
  var existing=mktV55ReadAll_(MKT_V55.SHEETS.STOPS).find(function(s){return String(s.campaignId)===String(d.campaignId)&&String(s.accountId)===String(d.accountId)&&String(s.status)==='ACTIVE';});
  if (existing) return existing;
  var now=mktV55Now_(), stop={
    stopId:d.stopId||mktV55Id_('STP'),campaignId:d.campaignId,requestId:d.requestId||'',accountId:d.accountId,contactId:d.contactId||'',
    stopReason:d.stopReason||'CUSTOMER_REPLIED',stoppedAt:d.stoppedAt||now,responseType:d.responseType||'',scope:'ACCOUNT_ONLY',
    remainingCampaignAccountsContinue:true,sourceEventId:d.sourceEventId||'',amOwner:d.amOwner||'',sequenceStep:d.sequenceStep||'',
    externalId:d.externalId||'',status:'ACTIVE',createdBy:d.createdBy||'SYSTEM',createdAt:now,updatedAt:now,
    metadata:JSON.stringify(d.metadata||{}),notes:d.notes||''
  };
  var saved=mktV55Upsert_(MKT_V55.SHEETS.STOPS,'stopId',stop,'STP');
  mktV55StopPendingQueueRows_(d.campaignId,d.accountId,stop.stopReason);
  mktV55Audit_('ACCOUNT_AUTOMATION_STOPPED',stop,'COMPLETED',{scope:'ACCOUNT_ONLY',remainingCampaignAccountsContinue:true});
  return saved;
}

function handoffMarketingV55ToAM_(d) {
  d=d||{};
  if (!d.campaignId) throw new Error('campaignId is required');
  if (!d.accountId) throw new Error('accountId is required');
  if (!d.amOwner) throw new Error('amOwner is required');
  var existing=mktV55ReadAll_(MKT_V55.SHEETS.HANDOFFS).find(function(h){return String(h.campaignId)===String(d.campaignId)&&String(h.accountId)===String(d.accountId)&&['HANDED_TO_AM','ACKNOWLEDGED'].indexOf(String(h.handoffStatus))!==-1;});
  if (existing) return existing;
  var h={
    handoffId:d.handoffId||mktV55Id_('HOF'),campaignId:d.campaignId,requestId:d.requestId||'',accountId:d.accountId,contactId:d.contactId||'',
    amOwner:d.amOwner,responseType:d.responseType||'',responseDate:d.responseDate||mktV55Now_(),campaignObjective:d.campaignObjective||'',
    service:d.service||'',nextAction:d.nextAction||'AM follow-up required',handoffStatus:'HANDED_TO_AM',acknowledgedAt:'',acknowledgedBy:'',
    closedAt:'',outcomeId:'',quoteId:d.quoteId||'',loadId:d.loadId||'',createdAt:mktV55Now_(),notes:d.notes||''
  };
  var saved=mktV55Upsert_(MKT_V55.SHEETS.HANDOFFS,'handoffId',h,'HOF');
  mktV55Audit_('HANDOFF_TO_AM',h,'COMPLETED',{handoffStatus:'HANDED_TO_AM'});
  return saved;
}

function recordMarketingV55Outcome_(d) {
  d=d||{};
  if (!d.campaignId) throw new Error('campaignId is required');
  if (!d.accountId) throw new Error('accountId is required');
  if (!d.attributionType) throw new Error('attributionType is required');
  var a={attributionId:d.attributionId||mktV55Id_('ATT'),campaignId:d.campaignId,accountId:d.accountId,contactId:d.contactId||'',quoteId:d.quoteId||'',loadId:d.loadId||'',service:d.service||'',attributionType:d.attributionType,revenue:Number(d.revenue||0),eventDate:d.eventDate||mktV55Now_(),notes:d.notes||''};
  var saved=mktV55Upsert_(MKT_V55.SHEETS.ATTRIBUTION,'attributionId',a,'ATT');
  var hs=mktV55ReadAll_(MKT_V55.SHEETS.HANDOFFS).filter(function(h){return String(h.campaignId)===String(d.campaignId)&&String(h.accountId)===String(d.accountId);});
  if (hs.length) {
    var h=hs[hs.length-1]; h.outcomeId=saved.attributionId; h.quoteId=d.quoteId||h.quoteId||''; h.loadId=d.loadId||h.loadId||''; h.handoffStatus='CLOSED'; h.closedAt=mktV55Now_();
    mktV55Upsert_(MKT_V55.SHEETS.HANDOFFS,'handoffId',h,'HOF');
  }
  mktV55Audit_('OUTCOME_RECORDED',a,'COMPLETED',{attributionType:d.attributionType});
  return saved;
}

function mktV55Ss_(){return SpreadsheetApp.openById(MKT_V55.HUB_ID);}
function mktV55Sheet_(name){var sh=mktV55Ss_().getSheetByName(name);if(!sh)throw new Error('Missing Data Hub sheet: '+name);return sh;}
function mktV55Headers_(name){var sh=mktV55Sheet_(name),lastCol=sh.getLastColumn();return lastCol?sh.getRange(1,1,1,lastCol).getValues()[0].map(String):[];}
function mktV55ReadAll_(name){var sh=mktV55Sheet_(name),headers=mktV55Headers_(name),lastRow=sh.getLastRow();if(lastRow<2||!headers.length)return[];return sh.getRange(2,1,lastRow-1,headers.length).getValues().map(function(row){var o={};headers.forEach(function(h,i){o[h]=row[i];});return o;});}
function mktV55Find_(name,keyName,keyValue){var rows=mktV55ReadAll_(name);for(var i=0;i<rows.length;i++){if(String(rows[i][keyName])===String(keyValue))return rows[i];}return null;}

function mktV55Upsert_(name,keyName,record,prefix){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var sh=mktV55Sheet_(name),headers=mktV55Headers_(name),keyIndex=headers.indexOf(keyName);
    if(keyIndex<0)throw new Error(name+' missing key column '+keyName);
    var rec=Object.assign({},record||{});if(!rec[keyName])rec[keyName]=mktV55Id_(prefix||'ID');
    var values=sh.getDataRange().getValues(),rowNumber=-1;
    for(var r=1;r<values.length;r++){if(String(values[r][keyIndex])===String(rec[keyName])){rowNumber=r+1;break;}}
    var existing={};if(rowNumber>0){headers.forEach(function(h,i){existing[h]=values[rowNumber-1][i];});}
    var merged=Object.assign({},existing,rec),row=headers.map(function(h){var v=merged[h];if(v&&typeof v==='object'&&!(v instanceof Date))return JSON.stringify(v);return v==null?'':v;});
    if(rowNumber>0)sh.getRange(rowNumber,1,1,headers.length).setValues([row]);else sh.appendRow(row);
    return merged;
  }finally{lock.releaseLock();}
}

function mktV55StopPendingQueueRows_(campaignId,accountId,reason){
  var sh=mktV55Sheet_(MKT_V55.SHEETS.EMAIL_QUEUE),headers=mktV55Headers_(MKT_V55.SHEETS.EMAIL_QUEUE),rows=sh.getDataRange().getValues();
  var cCampaign=headers.indexOf('campaignId'),cAccount=headers.indexOf('accountId'),cStatus=headers.indexOf('status'),cError=headers.indexOf('error'),cProcessed=headers.indexOf('processedAt');
  if(cCampaign<0||cAccount<0||cStatus<0)return 0;
  var stopped=0,terminal=['SENT','DRAFTED','STOPPED','CANCELLED','ERROR'];
  for(var i=1;i<rows.length;i++){
    if(String(rows[i][cCampaign])===String(campaignId)&&String(rows[i][cAccount])===String(accountId)&&terminal.indexOf(String(rows[i][cStatus]).toUpperCase())===-1){
      sh.getRange(i+1,cStatus+1).setValue('STOPPED');
      if(cError>=0)sh.getRange(i+1,cError+1).setValue('Stopped: '+reason);
      if(cProcessed>=0)sh.getRange(i+1,cProcessed+1).setValue(mktV55Now_());
      stopped++;
    }
  }
  return stopped;
}

function mktV55Audit_(actionType,entity,status,result){
  var e=entity||{},record={
    activityId:mktV55Id_('ACT'),timestamp:mktV55Now_(),actionType:actionType,requestId:e.requestId||'',campaignId:e.campaignId||'',
    accountId:e.accountId||'',contactId:e.contactId||'',permissionLevel:mktV55PermissionFor_(actionType),status:status||'COMPLETED',
    result:typeof result==='string'?result:JSON.stringify(result||{}),approvedBy:e.approvedBy||'',actor:e.actor||'MARKETING_BACKEND',
    source:'DGL_MARKETING_OS_V55',externalId:e.externalId||e.externalMessageId||'',correlationId:e.correlationId||'',idempotencyKey:e.idempotencyKey||'',
    createdAt:mktV55Now_(),metadata:JSON.stringify(e.metadata||{}),error:(status==='FAILED'||status==='BLOCKED')?String(result||''):'',notes:e.notes||''
  };
  return mktV55Upsert_(MKT_V55.SHEETS.ACTIVITY,'activityId',record,'ACT');
}

function mktV55PermissionFor_(actionType){return ['CAMPAIGN_ACTIVATED','CAMPAIGN_RESUMED','AUDIENCE_SEND','PAID_CAMPAIGN_LAUNCH'].indexOf(actionType)!==-1?'APPROVAL_REQUIRED':'AUTO';}
function mktV55StopReasonFromResponse_(responseType){var t=String(responseType||'').toUpperCase();if(t.indexOf('RFQ')!==-1)return'NEW_RFQ';if(t.indexOf('QUOTE')!==-1)return'NEW_QUOTE';if(t.indexOf('LOAD')!==-1||t.indexOf('BOOK')!==-1)return'LOAD_CREATED';return'CUSTOMER_REPLIED';}
function mktV55AssertToken_(provided){var expected=PropertiesService.getScriptProperties().getProperty(MKT_V55.TOKEN_PROPERTY);if(!expected)throw new Error('V5.5 private token is not configured');if(!provided||String(provided)!==String(expected))throw new Error('Unauthorized');}
function mktV55Id_(prefix){return String(prefix||'ID')+'-'+Utilities.getUuid().split('-')[0].toUpperCase();}
function mktV55Now_(){return Utilities.formatDate(new Date(),MKT_V55.TZ,"yyyy-MM-dd'T'HH:mm:ssXXX");}
function mktV55Json_(callback, payload) {
  var json = JSON.stringify(payload);

  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      throw new Error('Invalid callback');
    }

    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function testMarketingV55Setup(){var r=setupMarketingV55Backend();console.log(JSON.stringify(r,null,2));return r;}

function testMarketingV55RequestFlow(){
  var req=createMarketingV55Request_({
    amOwner:'AM TEST',portfolioName:'TEST PORTFOLIO',accountCount:3,objective:'Quoted Not Booked',
    service:'FTL',messageAngle:'Quote Recovery',priority:'HIGH',requestedOutcome:'New RFQ',
    targetWindow:'Next 14 days',qnbWindow:'15-30',commercialContext:'SAFE TEST RECORD',
    exclusions:'DNC and active AM conversations',source:'SAFE_TEST'
  });
  var campaign=createMarketingV55Campaign_(req.request.requestId,{campaignName:'TEST · QNB FTL · 15-30',playbookId:'QNB_15_30',creativeSystem:'DGL Executive Minimal',language:'EN',cta:'Send your current requirement'});
  var approval=requestMarketingV55Approval_(campaign.campaignId,{requestedBy:'Marketing TEST',accountCount:3});
  var out={request:req,campaign:campaign,approval:approval};console.log(JSON.stringify(out,null,2));return out;
}

function testMarketingV55ResponseStopHandoff(){
  var campaigns=mktV55ReadAll_(MKT_V55.SHEETS.CAMPAIGNS);if(!campaigns.length)throw new Error('Run testMarketingV55RequestFlow first');
  var c=campaigns[campaigns.length-1];
  var out=recordMarketingV55Response_({campaignId:c.campaignId,requestId:c.requestId,accountId:'TEST-ACCOUNT-001',responseType:'CUSTOMER_REPLIED',channel:'EMAIL',summary:'SAFE TEST RESPONSE',amOwner:c.amOwner||'AM TEST',nextAction:'AM to review test response'});
  console.log(JSON.stringify(out,null,2));return out;
}
