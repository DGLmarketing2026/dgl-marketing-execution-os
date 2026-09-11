// AURA Email Dispatcher -- the real Gmail send provider for Existing Account Growth.
//
// Closes the one real gap DGL reported: AURA was already detecting, scoping and preparing
// campaigns (v6AuraAutomationTick_, MarketingV6AuraAutomation.gs) all the way to
// 'READY TO SEND · SEND PROVIDER REQUIRED', but nothing ever turned an already-vetted,
// already-eligible audience into real MKT_EMAIL_QUEUE jobs or sent them. This file adds
// exactly that missing link, reusing every existing gate verbatim:
//   - eligibility/suppression/frequency: the audience rows this file reads were already
//     computed by v6ResolveRecipients_ (MarketingV6RecipientResolution.gs) -- no rule is
//     re-implemented here, only re-checked defensively at send time in case state changed
//     between queue build and dispatch.
//   - approval: v6AuraPolicyApproved_ (MarketingV6AuraAutomation.gs) -- unchanged.
//   - copy/brand template: v6AuraGenerateCopy_/v6AuraEmailHtml_ (MarketingV6AuraCopyEngine.gs)
//     -- unchanged, only personalized per recipient via the new optional `vars` argument.
//   - account stop / stopOnResponse: MKT_ACCOUNT_PIPELINE + v6PipelineAdvanced_
//     (MarketingV6Pipeline.gs) -- unchanged.
//   - post-send frequency ledger: v6RecordMarketingTouch_ (MarketingV6FrequencyControl.gs)
//     -- unchanged.
//
// Scope discipline: today this only builds/sends for objective 'Retention' campaigns -- the
// one family DGL asked to activate for real right now. QNB/Reactivation/Cross-Sell keep
// reporting 'READY TO SEND · SEND PROVIDER REQUIRED' exactly as before (see
// v6AuraQueueCountsForCampaign_ in MarketingV6AuraAutomation.gs: a campaign with zero queue
// rows falls through to the unchanged gate-based status). This file never reads or writes
// MKT_V6_PROVIDER_READY -- that flag still gates the older, still-inactive bulk-ESP path used
// by Campaign Studio/the other families, and flipping it would make ALL FOUR families
// eligible for the old v6QueueExecution_/v6StartExecution_ path at once, which is not what was
// asked for.
//
// Safety: AURA_SEND_MODE (Script Property) defaults to DRY_RUN whenever unset. DRY_RUN runs
// every validation below and writes the exact job that WOULD be sent (recorded as status
// 'DRY_RUN'), but never calls GmailApp.sendEmail. Only an explicit, separate call to
// auraEnableLiveSending() -- never invoked automatically by this file, by
// v6AuraAutomationTick_, or by any trigger installed here -- switches a deployment to LIVE.

var AURA_SEND_MODE_PROPERTY_KEY_ = 'AURA_SEND_MODE';
// The only families this dispatcher builds/sends a queue for today. Extend this list only
// once a family's copy/approval/compliance review is actually ready for real sending --
// adding a family here is the one line that would later activate it, no other code changes.
var AURA_EMAIL_QUEUE_FAMILIES_ = ['Retention'];
var AURA_EMAIL_DISPATCH_DEFAULT_LIMIT_ = 20;
var AURA_EMAIL_DISPATCH_MAX_LIMIT_ = 50;
var AURA_EMAIL_DISPATCH_COOLDOWN_DAYS_ = 30;

function v6AuraSendMode_() {
  var v = String(PropertiesService.getScriptProperties().getProperty(AURA_SEND_MODE_PROPERTY_KEY_) || '').toUpperCase();
  return v === 'LIVE' ? 'LIVE' : 'DRY_RUN';
}
// The ONLY two functions that change AURA_SEND_MODE. Neither is ever called by this file, by
// v6AuraAutomationTick_, or by auraInstallTriggers() -- going LIVE is always a separate,
// explicit, human action.
function auraEnableLiveSending() {
  PropertiesService.getScriptProperties().setProperty(AURA_SEND_MODE_PROPERTY_KEY_, 'LIVE');
  return { status: 'LIVE_ENABLED', sendMode: 'LIVE', warning: 'auraProcessEmailQueue() will now call GmailApp.sendEmail for real on its next run (manual or triggered).' };
}
function auraDisableLiveSending() {
  PropertiesService.getScriptProperties().setProperty(AURA_SEND_MODE_PROPERTY_KEY_, 'DRY_RUN');
  return { status: 'DRY_RUN_ENABLED', sendMode: 'DRY_RUN' };
}

function v6AuraEmailText_(v) { return String(v == null ? '' : v).trim(); }
function v6AuraEmailMergeTokens_(text, vars) {
  var v = vars || {};
  return String(text || '')
    .replace(/\{\{firstName\}\}/g, v.firstName || '')
    .replace(/\{\{company\}\}/g, v.company || '')
    .replace(/\{\{service\}\}/g, v.service || '');
}
function v6AuraEmailSenderName_() {
  try { if (typeof DGL_CONFIG !== 'undefined' && DGL_CONFIG.DEFAULT_SENDER_NAME) return DGL_CONFIG.DEFAULT_SENDER_NAME; } catch (_) { }
  return 'DGL';
}
function v6AuraEmailStripHtml_(html) {
  return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function v6AuraEmailValid_(email) {
  if (typeof v6RecipientEmailValid_ === 'function') return v6RecipientEmailValid_(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}
function v6AuraEmailAccountById_(accountId) {
  return v6Rows_('MKT_ACCOUNTS').filter(function (r) { return v6AuraEmailText_(r.accountId) === accountId; })[0] || null;
}
function v6AuraEmailContactById_(contactId) {
  return v6Rows_('MKT_CONTACTS_SECURE').filter(function (r) { return v6AuraEmailText_(r.contactId) === contactId; })[0] || null;
}
function v6AuraEmailPipelineStage_(accountId) {
  var row = v6Rows_('MKT_ACCOUNT_PIPELINE').filter(function (r) { return v6AuraEmailText_(r.accountId) === accountId; })[0] || null;
  return row ? String(row.currentStage || '').toUpperCase() : '';
}
// Reuses v6PipelineAdvanced_ (MarketingV6Pipeline.gs) verbatim -- an account that already
// replied, RFQ'd, quoted, loaded, retained/expanded or entered cooldown/nurture is never a
// fresh send target, and CLOSED / SUPPRESSED (the account-stop terminal stage) never is either.
function v6AuraEmailAccountStopped_(accountId) {
  var stage = v6AuraEmailPipelineStage_(accountId);
  if (!stage) return false;
  return stage === 'CLOSED / SUPPRESSED' || (typeof v6PipelineAdvanced_ === 'function' && v6PipelineAdvanced_(stage));
}
function v6AuraEmailActiveExclusion_(accountId, contactId) {
  if (typeof v6RecipientActiveExclusion_ !== 'function') return null;
  return v6RecipientActiveExclusion_(v6Rows_('MKT_EXCLUSIONS'), accountId, contactId, new Date());
}
// Defensive duplicate guard beyond the deterministic jobId itself: never let a second job for
// the same (campaignId, accountId, contactId, sequenceStep) reach SENT, even if some future
// caller ever mints a job under a different jobId scheme for the same recipient/step.
function v6AuraEmailDuplicateSentExists_(job) {
  return v6Rows_('MKT_EMAIL_QUEUE').some(function (r) {
    return v6AuraEmailText_(r.jobId) !== v6AuraEmailText_(job.jobId) &&
      v6AuraEmailText_(r.campaignId) === v6AuraEmailText_(job.campaignId) &&
      v6AuraEmailText_(r.accountId) === v6AuraEmailText_(job.accountId) &&
      v6AuraEmailText_(r.contactId) === v6AuraEmailText_(job.contactId) &&
      String(r.sequenceStep) === String(job.sequenceStep) &&
      v6AuraEmailText_(r.status).toUpperCase() === 'SENT';
  });
}

// One job per (campaignId, contactId, sequenceStep) -- deterministic and idempotent, exactly
// like every other keyed table in this codebase (v6UpsertByKey_). sequenceStep is always 1
// today: no multi-touch sequence exists yet anywhere in this project, so anything beyond a
// single first touch would be invented, not real.
function v6AuraEmailJobId_(campaignId, contactId, sequenceStep) {
  return 'JOB:' + campaignId + ':' + contactId + ':' + sequenceStep;
}

// Builds MKT_EMAIL_QUEUE jobs for ONE campaign's already-resolved eligible audience
// (MKT_AUDIENCES rows written by v6ResolveRecipients_, recordType 'RECIPIENT',
// eligibilityStatus 'ELIGIBLE' -- DNC/invalid-email/active-exclusion/frequency-blocked
// contacts were already excluded there and never appear here). Never rebuilds a job that
// already exists (by jobId) -- this function only ever creates, so a job's status, once the
// dispatcher has moved it past PENDING, is never silently reset by a later automatic tick.
function v6AuraBuildEmailQueueForCampaign_(campaign) {
  v6EnsureContactRecipientSchema_();
  var sequenceStep = 1;
  var recipients = v6Rows_('MKT_AUDIENCES').filter(function (r) {
    return v6AuraEmailText_(r.recordType) === 'RECIPIENT' &&
      v6AuraEmailText_(r.campaignId) === campaign.campaignId &&
      v6AuraEmailText_(r.eligibilityStatus).toUpperCase() === 'ELIGIBLE';
  });
  var result = { campaignId: campaign.campaignId, built: 0, skippedExisting: 0, skippedIneligible: 0, recipients: recipients.length };
  if (!recipients.length) return result;

  var existingIds = {};
  v6Rows_('MKT_EMAIL_QUEUE').forEach(function (r) { existingIds[v6AuraEmailText_(r.jobId)] = true; });

  var policyApproved = (typeof v6AuraPolicyApproved_ === 'function') ? v6AuraPolicyApproved_(campaign.objective || campaign.campaignType) : true;
  var copy = v6AuraGenerateCopy_({}, campaign);
  var now = new Date().toISOString();

  recipients.forEach(function (r) {
    var accountId = v6AuraEmailText_(r.accountId), contactId = v6AuraEmailText_(r.contactId);
    var jobId = v6AuraEmailJobId_(campaign.campaignId, contactId, sequenceStep);
    if (existingIds[jobId]) { result.skippedExisting++; return; }
    if (!accountId || !contactId || !v6AuraEmailText_(r.email)) { result.skippedIneligible++; return; }

    var account = v6AuraEmailAccountById_(accountId) || {};
    var contact = v6AuraEmailContactById_(contactId) || {};
    var vars = {
      firstName: v6AuraEmailText_(contact.firstName) || 'Team',
      company: v6AuraEmailText_(account.accountName) || 'your company',
      service: v6AuraEmailText_(campaign.service) || 'freight'
    };
    var stopped = v6AuraEmailAccountStopped_(accountId);
    var job = {
      jobId: jobId, campaignId: campaign.campaignId, audienceId: campaign.scopeId || '',
      accountId: accountId, contactId: contactId, email: v6AuraEmailText_(r.email),
      firstName: vars.firstName, company: vars.company, service: vars.service,
      subject: v6AuraEmailMergeTokens_(copy.subjectA, vars), htmlBody: v6AuraEmailHtml_(campaign, copy, vars),
      replyTo: campaign.replyTo || '',
      status: stopped ? 'STOPPED' : (policyApproved ? 'PENDING' : 'REVIEW_REQUIRED'),
      gmailDraftId: '', createdAt: now, processedAt: '', error: '',
      requestId: (typeof v6AuraDeriveExecutionId_ === 'function') ? v6AuraDeriveExecutionId_(campaign.campaignId) : '',
      amOwner: campaign.amOwner || '', playbookId: campaign.objective || campaign.campaignType || '',
      sequenceStep: sequenceStep, scheduledAt: now,
      approvalId: policyApproved ? '' : ('APR:' + campaign.campaignId),
      approvedAt: '', approvedBy: '',
      stopOnResponse: true
    };
    v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
    existingIds[jobId] = true;
    result.built++;
  });
  return result;
}

// Driver: every Retention campaign currently AUTO_ACTIVE (v6AuraEnsureCampaign_). Safe to call
// repeatedly -- v6AuraBuildEmailQueueForCampaign_ is itself idempotent per campaign.
function v6AuraBuildRetentionEmailQueue_() {
  v6EnsureContactRecipientSchema_();
  var campaigns = v6Rows_('MKT_CAMPAIGNS').filter(function (c) {
    return AURA_EMAIL_QUEUE_FAMILIES_.indexOf(v6AuraEmailText_(c.objective || c.campaignType)) >= 0 && v6AuraEmailText_(c.status) === 'AUTO_ACTIVE';
  });
  var results = campaigns.map(v6AuraBuildEmailQueueForCampaign_);
  var totals = results.reduce(function (acc, r) { acc.built += r.built; acc.skippedExisting += r.skippedExisting; acc.skippedIneligible += r.skippedIneligible; acc.recipients += r.recipients; return acc; }, { built: 0, skippedExisting: 0, skippedIneligible: 0, recipients: 0 });
  return { status: 'QUEUE_BUILD_COMPLETE', campaigns: campaigns.length, totals: totals, byCampaign: results };
}

// The dispatcher. Re-validates every gate at send time (state can change between queue build
// and dispatch), processes a small batch (default 20, hard-capped 50 -- never a large volume
// at once), and continues past an individual job failure instead of aborting the whole batch.
function auraProcessEmailQueue(limit) {
  var mode = v6AuraSendMode_();
  var lim = Math.max(1, Math.min(Number(limit || AURA_EMAIL_DISPATCH_DEFAULT_LIMIT_), AURA_EMAIL_DISPATCH_MAX_LIMIT_));
  var senderName = v6AuraEmailSenderName_();
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.status).toUpperCase() === 'PENDING'; }).slice(0, lim);

  var counts = { sent: 0, failed: 0, suppressed: 0, skipped: 0, stopped: 0, reviewRequired: 0, dryRun: 0 };
  var touchedCampaigns = {};

  jobs.forEach(function (job) {
    touchedCampaigns[v6AuraEmailText_(job.campaignId)] = true;
    try {
      var accountId = v6AuraEmailText_(job.accountId), contactId = v6AuraEmailText_(job.contactId);
      var now = new Date().toISOString();

      if (v6AuraEmailAccountStopped_(accountId)) {
        job.status = 'STOPPED'; job.processedAt = now; counts.stopped++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }
      if (!v6AuraEmailValid_(job.email)) {
        job.status = 'SUPPRESSED'; job.error = 'EMAIL_INVALID'; job.processedAt = now; counts.suppressed++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }
      var exclusion = v6AuraEmailActiveExclusion_(accountId, contactId);
      if (exclusion) {
        job.status = 'SUPPRESSED'; job.error = 'EXCLUSION_' + (exclusion.reasonCode || exclusion.reason || 'ACTIVE'); job.processedAt = now; counts.suppressed++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }
      if (job.approvalId && !job.approvedAt) {
        job.status = 'REVIEW_REQUIRED'; job.processedAt = now; counts.reviewRequired++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }
      if (v6AuraEmailDuplicateSentExists_(job)) {
        job.status = 'SKIPPED'; job.error = 'ALREADY_SENT_DUPLICATE'; job.processedAt = now; counts.skipped++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }
      var frequency = (typeof v6FrequencyStatus_ === 'function') ? v6FrequencyStatus_({ accountId: accountId, contactId: contactId, campaignId: job.campaignId, campaignType: job.playbookId }) : { eligible: true, status: 'CLEAR' };
      if (!frequency.eligible) {
        job.status = 'SKIPPED'; job.error = 'FREQUENCY_' + frequency.status; job.processedAt = now; counts.skipped++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }

      if (mode !== 'LIVE') {
        job.status = 'DRY_RUN'; job.processedAt = now; job.error = ''; counts.dryRun++;
        return v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      }

      var options = { htmlBody: job.htmlBody, name: senderName };
      if (job.replyTo) options.replyTo = job.replyTo;
      GmailApp.sendEmail(job.email, job.subject, v6AuraEmailStripHtml_(job.htmlBody), options);
      job.status = 'SENT'; job.processedAt = now; job.error = '';
      v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
      counts.sent++;

      if (typeof v6RecordMarketingTouch_ === 'function') {
        try { v6RecordMarketingTouch_({ accountId: accountId, contactId: contactId, campaignId: job.campaignId, campaignType: job.playbookId, sentAt: now, cooldownDays: AURA_EMAIL_DISPATCH_COOLDOWN_DAYS_ }); } catch (_) { }
      }
      try {
        v6UpsertByKey_('MKT_TOUCHES', ['touchId'], { touchId: job.jobId, campaignId: job.campaignId, audienceId: job.audienceId || '', accountId: accountId, contactId: contactId, channel: 'EMAIL', eventType: 'SENT', eventAt: now, externalId: '', metadata: JSON.stringify({ sequenceStep: job.sequenceStep }) });
      } catch (_) { }
    } catch (err) {
      job.status = 'FAILED'; job.error = String(err && err.message || err); job.processedAt = new Date().toISOString();
      counts.failed++;
      try { v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job); } catch (_) { }
    }
  });

  Object.keys(touchedCampaigns).forEach(function (campaignId) {
    try { v6AuraRefreshExecutionReportStatusOnly_(campaignId); } catch (_) { }
  });

  return { status: 'DISPATCH_COMPLETE', sendMode: mode, processed: jobs.length, sent: counts.sent, failed: counts.failed, suppressed: counts.suppressed, skipped: counts.skipped, stopped: counts.stopped, reviewRequired: counts.reviewRequired, dryRun: counts.dryRun };
}

// Lightweight, dispatcher-only refresh: updates just the report row's real sent/queued/failed/
// status fields for one campaign immediately after a dispatch, without recomputing the whole
// v6AuraAutomationTick_ pipeline. The next hourly tick will also recompute this row (via
// v6AuraReportRow_, same source of truth), so this is a same-minute convenience, not a second
// mechanism.
function v6AuraRefreshExecutionReportStatusOnly_(campaignId) {
  var existing = v6Rows_('MKT_AURA_EXECUTION_REPORT').filter(function (r) { return v6AuraText_(r.reportRowId) === campaignId; })[0];
  if (!existing) return { status: 'NOT_FOUND' };
  var queueCounts = v6AuraQueueCountsForCampaign_(campaignId);
  var status;
  if (queueCounts.sent > 0) status = queueCounts.pending > 0 ? 'SENDING' : 'ACTIVE';
  else if (queueCounts.dryRun > 0) status = 'READY TO SEND · DRY RUN VALIDATED';
  else if (queueCounts.total > 0) status = 'QUEUED';
  else return { status: 'NO_QUEUE' };
  existing.sent = queueCounts.sent; existing.queued = queueCounts.pending; existing.failed = queueCounts.failed;
  existing.status = status; existing.updatedAt = v6AuraNow_();
  v6UpsertByKey_('MKT_AURA_EXECUTION_REPORT', ['reportRowId'], existing);
  return { status: 'UPDATED', reportStatus: status };
}

// Phase 12: idempotent trigger install for the dispatcher, kept strictly separate from the
// canonical hourly Acquisition/AURA tick (v6AcqInstallAutomationTrigger_) and from the 6-hour
// Retention bootstrap trigger (v6InstallOpportunityRefreshTrigger_) -- installing this trigger
// never removes or duplicates either of those. Runs hourly, small batch (default limit),
// respecting Gmail/Apps Script quotas; while AURA_SEND_MODE stays DRY_RUN this fires with zero
// real sends.
function auraInstallTriggers() {
  var fn = 'auraProcessEmailQueue';
  var existing = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === fn; });
  existing.slice(1).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  if (existing.length) return { status: 'TRIGGER_EXISTS', handler: fn, cadence: 'HOURLY' };
  ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
  return { status: 'TRIGGER_INSTALLED', handler: fn, cadence: 'HOURLY' };
}

// Phase 10/11: a single safe read-only data contract for Retention -- Run ID, Last Run,
// Detected/Eligible/Review Required/Campaign Ready/Handoffs (from the real
// MKT_RETENTION_RUN_SUMMARY pilot run) plus Queued/Sent/Failed/Responses/RFQs/Quotes/Loads
// (from the real MKT_AURA_EXECUTION_REPORT rows this file/v6AuraReportRow_ maintain) and a
// per-campaign table. No PII (no account/contact name, no email/phone) -- same safe-aggregate
// discipline as v6AuraExecutionReport_/v6Opportunities_ elsewhere in this project.
function v6AuraRetentionDashboard_() {
  var report = (typeof v6AuraExecutionReport_ === 'function') ? v6AuraExecutionReport_() : { summary: {}, records: [] };
  var runs = v6Rows_('MKT_RETENTION_RUN_SUMMARY');
  var latestRun = runs.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })[0] || null;
  var retentionRows = (report.records || []).filter(function (r) { return v6AuraText_(r.campaignFamily) === 'Retention'; });
  var totals = retentionRows.reduce(function (acc, r) {
    acc.recipients += Number(r.recipients) || 0; acc.queued += Number(r.queued) || 0; acc.sent += Number(r.sent) || 0;
    acc.failed += Number(r.failed) || 0; acc.replies += Number(r.replies) || 0; acc.rfqs += Number(r.rfqs) || 0;
    acc.quotes += Number(r.quotes) || 0; acc.loads += Number(r.loads) || 0; return acc;
  }, { recipients: 0, queued: 0, sent: 0, failed: 0, replies: 0, rfqs: 0, quotes: 0, loads: 0 });
  return {
    runId: latestRun ? latestRun.runId : '', lastRun: latestRun ? latestRun.createdAt : '',
    detected: latestRun ? Number(latestRun.detected) || 0 : 0, eligible: latestRun ? Number(latestRun.eligible) || 0 : 0,
    reviewRequired: latestRun ? Number(latestRun.reviewRequired) || 0 : 0, campaignReady: latestRun ? Number(latestRun.campaignReady) || 0 : 0,
    handoffs: latestRun ? Number(latestRun.handedToAM) || 0 : 0,
    queued: totals.queued, sent: totals.sent, failed: totals.failed,
    responses: totals.replies, rfqs: totals.rfqs, quotes: totals.quotes, loads: totals.loads,
    sendMode: v6AuraSendMode_(),
    campaigns: retentionRows.map(function (r) { return { campaignId: r.campaignId, owner: r.owner, service: r.service, status: r.status, recipients: r.recipients, queued: r.queued, sent: r.sent, failed: r.failed }; })
  };
}

// --- Pre-LIVE content/safety audit -----------------------------------------------------------
// A REAL, no-Sheets-access-required verification of exactly what a human would otherwise have
// to open the spreadsheet to check by eye: is every Retention job genuinely personalized, does
// it match its own account/contact record, is nothing generic/inventible reaching a real send,
// is every governance gate (suppression/frequency/approval/duplicate/stop) actually holding, and
// -- the one non-negotiable check -- has DRY_RUN really never sent a real email. Callable
// directly from the Apps Script editor (no argument required) so a human can get this answer in
// one click without needing external API access this project's own OAuth scopes don't grant.
// Masks the local-part of every email in its output (m***@domain.com) -- this is a safety
// report, not a place to reproduce full contact PII.
function v6AuraEmailMask_(email) {
  var e = v6AuraEmailText_(email);
  var at = e.indexOf('@');
  if (at <= 0) return e ? '***' : '';
  return e.slice(0, 1) + '***' + e.slice(at);
}
function v6AuraEmailQueueAudit_() {
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.playbookId) === 'Retention'; });
  var accountsById = {}, contactsById = {};
  v6Rows_('MKT_ACCOUNTS').forEach(function (a) { accountsById[v6AuraEmailText_(a.accountId)] = a; });
  v6Rows_('MKT_CONTACTS_SECURE').forEach(function (c) { contactsById[v6AuraEmailText_(c.contactId)] = c; });

  var seenKeys = {}, duplicateKeys = {};
  jobs.forEach(function (j) {
    var key = v6AuraEmailText_(j.campaignId) + '|' + v6AuraEmailText_(j.accountId) + '|' + v6AuraEmailText_(j.contactId) + '|' + v6AuraEmailText_(j.sequenceStep);
    if (seenKeys[key]) duplicateKeys[key] = true; else seenKeys[key] = true;
  });

  var byStatus = {}, findings = [], realSendsDetected = 0;
  jobs.forEach(function (job) {
    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    if (String(job.status).toUpperCase() === 'SENT') realSendsDetected++;

    var issues = [];
    var account = accountsById[v6AuraEmailText_(job.accountId)] || null;
    var contact = contactsById[v6AuraEmailText_(job.contactId)] || null;

    if (!v6AuraEmailValid_(job.email)) issues.push('INVALID_EMAIL');
    if (contact && v6AuraEmailText_(contact.email).toLowerCase() !== v6AuraEmailText_(job.email).toLowerCase()) issues.push('EMAIL_MISMATCH_WITH_CONTACT_RECORD');
    if (account && v6AuraEmailText_(account.accountName) && v6AuraEmailText_(account.accountName) !== v6AuraEmailText_(job.company)) issues.push('COMPANY_MISMATCH_WITH_ACCOUNT_RECORD');
    if (contact && v6AuraEmailText_(contact.firstName) && v6AuraEmailText_(contact.firstName) !== v6AuraEmailText_(job.firstName)) issues.push('FIRSTNAME_MISMATCH_WITH_CONTACT_RECORD');
    if (v6AuraEmailText_(job.company) === 'your company') issues.push('GENERIC_COMPANY_FALLBACK_USED');
    if (v6AuraEmailText_(job.firstName) === 'Team') issues.push('GENERIC_FIRSTNAME_FALLBACK_USED');
    if (v6AuraEmailText_(job.service) === 'freight') issues.push('GENERIC_SERVICE_FALLBACK_USED');
    if (/\{\{\w+\}\}/.test(job.subject || '')) issues.push('UNMERGED_TOKEN_IN_SUBJECT');
    if (/\{\{\w+\}\}/.test(job.htmlBody || '')) issues.push('UNMERGED_TOKEN_IN_HTML_BODY');
    if (/href\s*=\s*"#"/i.test(job.htmlBody || '')) issues.push('BROKEN_CTA_HREF');
    if (!/DGL/i.test(job.htmlBody || '')) issues.push('MISSING_SENDER_SIGNATURE');
    if (!job.replyTo) issues.push('MISSING_REPLY_TO');
    var dupKey = v6AuraEmailText_(job.campaignId) + '|' + v6AuraEmailText_(job.accountId) + '|' + v6AuraEmailText_(job.contactId) + '|' + v6AuraEmailText_(job.sequenceStep);
    if (duplicateKeys[dupKey]) issues.push('DUPLICATE_JOB_KEY');
    if (job.approvalId && job.approvedAt && String(job.status).toUpperCase() !== 'REVIEW_REQUIRED') issues.push('APPROVAL_RECORDED_BUT_NOT_ENFORCED');
    if (job.approvalId && !job.approvedAt && ['SENT', 'DRY_RUN'].indexOf(String(job.status).toUpperCase()) >= 0) issues.push('APPROVAL_BYPASSED');

    if (issues.length) findings.push({ jobId: job.jobId, accountId: job.accountId, email: v6AuraEmailMask_(job.email), issues: issues });
  });

  return {
    status: 'AUDIT_COMPLETE', sendMode: v6AuraSendMode_(),
    jobsChecked: jobs.length, byStatus: byStatus,
    realSendsDetected: realSendsDetected,
    realSendsDetectedWarning: realSendsDetected > 0 ? 'CRITICAL: ' + realSendsDetected + ' job(s) already show status SENT -- a real email may have gone out.' : null,
    duplicateJobKeys: Object.keys(duplicateKeys).length,
    findings: findings,
    clean: findings.length === 0 && realSendsDetected === 0
  };
}
