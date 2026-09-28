// AURA — Campaña A controlled catch-up.
// One-time recovery for jobs that were incorrectly skipped by the former account-level
// frequency gate. This module NEVER enables global LIVE mode and NEVER dispatches the global
// queue. The only real-send path is the explicit public wrapper below, scoped to the exact
// campaign/status/error cohort.

var CAMPANA_A_CATCHUP_CAMPAIGN_ID_ = 'CMP-CAMPANA-A-HA-PRIORITARIA';
var CAMPANA_A_CATCHUP_SOURCE_STATUS_ = 'SKIPPED';
var CAMPANA_A_CATCHUP_SOURCE_ERROR_ = 'FREQUENCY_FOLLOW-UP TOO SOON';
var CAMPANA_A_CATCHUP_MAX_ORIGINAL_CANDIDATES_ = 87;

function v6AuraCampanaACatchupText_(v) {
  return String(v == null ? '' : v).trim();
}

function v6AuraCampanaACatchupBool_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return v === true || s === 'TRUE' || s === 'YES' || s === '1';
}

function v6AuraCampanaACatchupEmail_(v) {
  return v6AuraCampanaACatchupText_(v).toLowerCase();
}

function v6AuraCampanaACatchupIsCandidate_(job) {
  return v6AuraCampanaACatchupText_(job.campaignId) === CAMPANA_A_CATCHUP_CAMPAIGN_ID_ &&
    v6AuraCampanaACatchupText_(job.status).toUpperCase() === CAMPANA_A_CATCHUP_SOURCE_STATUS_ &&
    v6AuraCampanaACatchupText_(job.error) === CAMPANA_A_CATCHUP_SOURCE_ERROR_;
}

function v6AuraCampanaACatchupContactBlocked_(contact) {
  var c = contact || {};
  var emailStatus = v6AuraCampanaACatchupText_(c.emailStatus).toUpperCase();
  var marketingStatus = v6AuraCampanaACatchupText_(c.marketingStatus).toUpperCase();
  var status = v6AuraCampanaACatchupText_(c.status).toUpperCase();
  return v6AuraCampanaACatchupBool_(c.doNotContact) ||
    ['DNC', 'DO_NOT_CONTACT', 'SUPPRESSED', 'UNSUBSCRIBED'].indexOf(marketingStatus) >= 0 ||
    ['INVALID', 'HARD_BOUNCE', 'BOUNCED'].indexOf(emailStatus) >= 0 ||
    ['INVALID', 'INACTIVE'].indexOf(status) >= 0;
}

function v6AuraCampanaACatchupResponseStopsContact_(responses, job) {
  return (responses || []).some(function (r) {
    var sameContact = v6AuraCampanaACatchupText_(r.contactId) &&
      v6AuraCampanaACatchupText_(r.contactId) === v6AuraCampanaACatchupText_(job.contactId);
    var explicitAccountStop = !v6AuraCampanaACatchupText_(r.contactId) &&
      v6AuraCampanaACatchupText_(r.accountId) === v6AuraCampanaACatchupText_(job.accountId) &&
      v6AuraCampanaACatchupBool_(r.stopApplied);
    if (!sameContact && !explicitAccountStop) return false;

    var responseType = v6AuraCampanaACatchupText_(r.responseType).toUpperCase();
    var status = v6AuraCampanaACatchupText_(r.status).toUpperCase();
    return v6AuraCampanaACatchupBool_(r.stopApplied) ||
      responseType.indexOf('REPL') >= 0 ||
      responseType.indexOf('RESPOND') >= 0 ||
      status.indexOf('RESPONSE') >= 0 ||
      status.indexOf('STOP') >= 0;
  });
}

function v6AuraCampanaACatchupContext_() {
  var allQueue = v6Rows_('MKT_EMAIL_QUEUE');
  var candidates = allQueue.filter(v6AuraCampanaACatchupIsCandidate_);
  var contacts = v6Rows_('MKT_CONTACTS_SECURE');
  var exclusions = v6Rows_('MKT_EXCLUSIONS');
  var responses = v6Rows_('MKT_RESPONSES');
  var pipeline = v6Rows_('MKT_ACCOUNT_PIPELINE');
  var ledger = v6Rows_('MKT_FREQUENCY_LEDGER');

  var contactsById = {};
  contacts.forEach(function (c) { contactsById[v6AuraCampanaACatchupText_(c.contactId)] = c; });
  var pipelineByAccountId = {};
  pipeline.forEach(function (p) { pipelineByAccountId[v6AuraCampanaACatchupText_(p.accountId)] = p; });

  var sentByContactStep = {};
  var sentByEmailStep = {};
  allQueue.forEach(function (r) {
    if (v6AuraCampanaACatchupText_(r.campaignId) !== CAMPANA_A_CATCHUP_CAMPAIGN_ID_) return;
    if (v6AuraCampanaACatchupText_(r.status).toUpperCase() !== 'SENT') return;
    var step = String(r.sequenceStep == null ? '' : r.sequenceStep);
    sentByContactStep[v6AuraCampanaACatchupText_(r.contactId) + '|' + step] = true;
    sentByEmailStep[v6AuraCampanaACatchupEmail_(r.email) + '|' + step] = true;
  });

  var candidateEmailCounts = {};
  candidates.forEach(function (j) {
    var e = v6AuraCampanaACatchupEmail_(j.email);
    candidateEmailCounts[e] = (candidateEmailCounts[e] || 0) + 1;
  });

  var seenCandidateEmails = {};
  var summary = {
    candidates: candidates.length,
    eligibleForCatchup: 0,
    excludedNow: 0,
    invalidHardBounce: 0,
    dncSuppressed: 0,
    respondedStopped: 0,
    duplicates: 0,
    alreadySent: 0,
    otherGuard: 0,
    readyForCatchup: false,
    sendMode: v6AuraSendMode_()
  };
  var eligibleJobs = [];
  var excluded = [];

  candidates.forEach(function (job) {
    var accountId = v6AuraCampanaACatchupText_(job.accountId);
    var contactId = v6AuraCampanaACatchupText_(job.contactId);
    var email = v6AuraCampanaACatchupEmail_(job.email);
    var step = String(job.sequenceStep == null ? '' : job.sequenceStep);
    var contact = contactsById[contactId] || {};
    var pipelineRow = pipelineByAccountId[accountId] || {};
    var reasons = [];

    // 1) Strict email / hard-bounce guard.
    var contactEmailStatus = v6AuraCampanaACatchupText_(contact.emailStatus).toUpperCase();
    var contactStatus = v6AuraCampanaACatchupText_(contact.status).toUpperCase();
    if (!v6AuraEmailValid_(job.email) ||
        ['INVALID', 'HARD_BOUNCE', 'BOUNCED'].indexOf(contactEmailStatus) >= 0 ||
        ['INVALID', 'INACTIVE'].indexOf(contactStatus) >= 0) {
      summary.invalidHardBounce++;
      reasons.push('INVALID_OR_HARD_BOUNCE');
    }

    // 2) DNC / explicit suppression. Account-wide exclusion is honored only when explicitly
    // represented in MKT_EXCLUSIONS; sharing an accountId/domain alone never suppresses peers.
    var exclusion = (typeof v6RecipientActiveExclusion_ === 'function')
      ? v6RecipientActiveExclusion_(exclusions, accountId, contactId, new Date())
      : null;
    if (v6AuraCampanaACatchupContactBlocked_(contact) || exclusion) {
      summary.dncSuppressed++;
      reasons.push('DNC_OR_SUPPRESSED');
    }

    // 3) Contact-level response/stop. A generic account pipeline stage such as RESPONDED does
    // not automatically stop sibling contacts. Only CLOSED / SUPPRESSED is treated as a hard
    // account-wide stop here, plus explicit account-wide stop records above.
    var stage = v6AuraCampanaACatchupText_(pipelineRow.currentStage).toUpperCase();
    var hardAccountStop = stage === 'CLOSED / SUPPRESSED';
    if (hardAccountStop || v6AuraCampanaACatchupResponseStopsContact_(responses, job) ||
        v6AuraCampanaACatchupText_(job.stopReasonStage)) {
      summary.respondedStopped++;
      reasons.push('RESPONDED_OR_STOPPED');
    }

    // 4) Exact duplicate email inside THIS catch-up cohort. First row wins deterministically;
    // later duplicate rows are excluded. Current verified cohort has zero duplicates.
    var duplicateInCohort = candidateEmailCounts[email] > 1 && !!seenCandidateEmails[email];
    if (duplicateInCohort) {
      summary.duplicates++;
      reasons.push('DUPLICATE_EMAIL');
    }
    seenCandidateEmails[email] = true;

    // 5) Idempotence against any already-sent row for the same campaign + sequence step.
    if (sentByContactStep[contactId + '|' + step] || sentByEmailStep[email + '|' + step]) {
      summary.alreadySent++;
      reasons.push('ALREADY_SENT');
    }

    // 6) Approval / reply-to / corrected contact-level frequency gates.
    if (!job.replyTo || !v6AuraEmailValid_(job.replyTo) || (job.approvalId && !job.approvedAt)) {
      summary.otherGuard++;
      reasons.push('REPLY_TO_OR_APPROVAL_GUARD');
    }
    var frequency = (typeof v6FrequencyStatus_ === 'function')
      ? v6FrequencyStatus_({ accountId: accountId, contactId: contactId, campaignId: job.campaignId, campaignType: job.playbookId }, ledger)
      : { eligible: true, status: 'CLEAR' };
    if (!frequency.eligible) {
      summary.otherGuard++;
      reasons.push('FREQUENCY_' + v6AuraCampanaACatchupText_(frequency.status));
    }

    if (reasons.length) excluded.push({ job: job, reasons: reasons });
    else eligibleJobs.push(job);
  });

  summary.eligibleForCatchup = eligibleJobs.length;
  summary.excludedNow = excluded.length;
  summary.readyForCatchup =
    summary.candidates > 0 &&
    summary.candidates <= CAMPANA_A_CATCHUP_MAX_ORIGINAL_CANDIDATES_ &&
    summary.eligibleForCatchup > 0 &&
    summary.sendMode === 'DRY_RUN';

  return { summary: summary, eligibleJobs: eligibleJobs, excluded: excluded };
}

function RUN_AURA_CAMPANA_A_CATCHUP_PREFLIGHT() {
  var ctx = v6AuraCampanaACatchupContext_();
  var s = ctx.summary;
  var out = {
    CANDIDATES: s.candidates,
    'ELIGIBLE FOR CATCH-UP': s.eligibleForCatchup,
    'EXCLUDED NOW': s.excludedNow,
    'INVALID/HARD BOUNCE': s.invalidHardBounce,
    'DNC/SUPPRESSED': s.dncSuppressed,
    'RESPONDED/STOPPED': s.respondedStopped,
    DUPLICATES: s.duplicates,
    'ALREADY SENT': s.alreadySent,
    'READY FOR CATCH-UP': s.readyForCatchup ? 'YES' : 'NO',
    'GLOBAL SEND MODE': s.sendMode
  };
  console.log(JSON.stringify(out));
  return out;
}

// Update a queue row by jobId without re-reading/re-writing the whole table on every message.
// This makes each successful send durable immediately, so a timeout/re-run cannot duplicate it.
function v6AuraCampanaACatchupQueueWriter_() {
  var t = v6TableHeaders_('MKT_EMAIL_QUEUE');
  var lastRow = t.sheet.getLastRow();
  var rows = lastRow > 1 ? t.sheet.getRange(2, 1, lastRow - 1, t.headers.length).getValues() : [];
  var jobIdCol = t.headers.indexOf('jobId');
  var rowByJobId = {};
  rows.forEach(function (row, i) { rowByJobId[String(row[jobIdCol] || '')] = i + 2; });
  return function (job) {
    var rowNumber = rowByJobId[v6AuraCampanaACatchupText_(job.jobId)];
    if (!rowNumber) throw new Error('CATCHUP JOB NOT FOUND IN MKT_EMAIL_QUEUE: ' + v6AuraCampanaACatchupText_(job.jobId));
    var values = t.headers.map(function (h) { return job[h] == null ? '' : job[h]; });
    t.sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  };
}

function v6AuraCampanaACatchupSafeBatchUpsert_(name, keyFields, records) {
  if (!records || !records.length) return { created: 0, updated: 0 };
  var t = v6TableHeaders_(name);
  var lastRow = t.sheet.getLastRow();
  var existing = lastRow > 1 ? t.sheet.getRange(2, 1, lastRow - 1, t.headers.length).getValues() : [];
  var keyOf = function (getField) {
    return keyFields.map(function (k) { return String(getField(k) || ''); }).join('\u0001');
  };
  var indexByKey = {};
  existing.forEach(function (row, i) {
    indexByKey[keyOf(function (k) { return row[t.headers.indexOf(k)]; })] = i;
  });
  var created = 0, updated = 0;
  records.forEach(function (record) {
    var key = keyOf(function (k) { return record[k]; });
    var values = t.headers.map(function (h) { return record[h] == null ? '' : record[h]; });
    if (Object.prototype.hasOwnProperty.call(indexByKey, key)) {
      existing[indexByKey[key]] = values;
      updated++;
    } else {
      existing.push(values);
      indexByKey[key] = existing.length - 1;
      created++;
    }
  });
  if (existing.length) t.sheet.getRange(2, 1, existing.length, t.headers.length).setValues(existing);
  return { created: created, updated: updated };
}

function v6AuraCampanaACatchupUpsertTouches_(records) {
  return v6AuraCampanaACatchupSafeBatchUpsert_('MKT_TOUCHES', ['touchId'], records || []);
}

function v6AuraCampanaACatchupRecordFrequency_(sentMeta) {
  if (!sentMeta || !sentMeta.length) return { created: 0, updated: 0 };
  var existing = v6Rows_('MKT_FREQUENCY_LEDGER');
  var oldByKey = {};
  existing.forEach(function (r) {
    oldByKey[v6AuraCampanaACatchupText_(r.accountId) + '\u0001' + v6AuraCampanaACatchupText_(r.contactId)] = r;
  });
  var now = new Date();
  var records = sentMeta.map(function (m) {
    var key = v6AuraCampanaACatchupText_(m.accountId) + '\u0001' + v6AuraCampanaACatchupText_(m.contactId);
    var old = oldByKey[key] || {};
    var oldLast = v6DateValue_(old.lastMarketingTouchAt);
    var t30 = oldLast && v6DaysSince_(oldLast, now) <= 30 ? Number(old.touches30d || 0) : 0;
    var t90 = oldLast && v6DaysSince_(oldLast, now) <= 90 ? Number(old.touches90d || 0) : 0;
    var type = v6AuraCampanaACatchupText_(m.playbookId || old.lastCampaignType);
    var record = {
      accountId: v6AuraCampanaACatchupText_(m.accountId),
      contactId: v6AuraCampanaACatchupText_(m.contactId),
      lastMarketingTouchAt: new Date(m.sentAt).toISOString(),
      touches30d: t30 + 1,
      touches90d: t90 + 1,
      activeCampaignId: CAMPANA_A_CATCHUP_CAMPAIGN_ID_,
      cooldownUntil: '',
      lastCampaignType: type,
      lastResponseAt: old.lastResponseAt || '',
      lastCommercialSignalAt: old.lastCommercialSignalAt || '',
      frequencyStatus: 'CLEAR',
      updatedAt: now.toISOString()
    };
    oldByKey[key] = record;
    return record;
  });
  return v6AuraCampanaACatchupSafeBatchUpsert_('MKT_FREQUENCY_LEDGER', ['accountId', 'contactId'], records);
}

function RUN_AURA_CAMPANA_A_CATCHUP_LIVE() {
  // Critical safety property: the global dispatcher must remain DRY_RUN for the entire operation.
  // This scoped function sends directly; it never calls auraEnableLiveSending().
  if (v6AuraSendMode_() !== 'DRY_RUN') {
    throw new Error('ABORT: GLOBAL AURA_SEND_MODE MUST BE DRY_RUN BEFORE CATCH-UP.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ABORT: COULD NOT ACQUIRE SCRIPT LOCK.');

  var startedAt = new Date().toISOString();
  try {
    if (v6AuraSendMode_() !== 'DRY_RUN') throw new Error('ABORT: GLOBAL SEND MODE CHANGED BEFORE DISPATCH.');

    var ctx = v6AuraCampanaACatchupContext_();
    var s = ctx.summary;
    if (s.candidates === 0) {
      return { status: 'NO_CANDIDATES', attempted: 0, sent: 0, failed: 0, skipped: 0, remainingCandidates: 0, globalSendModeAfterRun: v6AuraSendMode_() };
    }
    if (s.candidates > CAMPANA_A_CATCHUP_MAX_ORIGINAL_CANDIDATES_) {
      throw new Error('ABORT: CATCH-UP COHORT GREW BEYOND VERIFIED MAXIMUM (' + s.candidates + ' > ' + CAMPANA_A_CATCHUP_MAX_ORIGINAL_CANDIDATES_ + ').');
    }
    if (!s.readyForCatchup) {
      throw new Error('ABORT: PREFLIGHT NOT READY. ' + JSON.stringify(s));
    }

    var writeQueueJob = v6AuraCampanaACatchupQueueWriter_();
    var senderName = v6AuraEmailSenderName_();
    var attempted = 0, sent = 0, failed = 0, skipped = 0;
    var touchRecords = [], sentMeta = [];

    ctx.eligibleJobs.forEach(function (job) {
      // The preflight already loaded the full queue once and removed any previously-sent
      // contact/email for this campaign+step. ScriptLock prevents a second catch-up execution
      // from racing this one, and successful sends are persisted immediately below.
      if (v6AuraSendMode_() !== 'DRY_RUN') {
        throw new Error('ABORT: GLOBAL SEND MODE CHANGED DURING CATCH-UP.');
      }

      attempted++;
      var now = new Date().toISOString();
      try {
        var options = { htmlBody: job.htmlBody, name: senderName };
        if (job.replyTo) options.replyTo = job.replyTo;
        GmailApp.sendEmail(job.email, job.subject, v6AuraEmailStripHtml_(job.htmlBody), options);

        // Durable idempotence boundary: persist SENT immediately after Gmail accepts the call.
        job.status = 'SENT';
        job.processedAt = now;
        job.error = '';
        writeQueueJob(job);
        sent++;

        touchRecords.push({
          touchId: job.jobId,
          campaignId: job.campaignId,
          audienceId: job.audienceId || '',
          accountId: job.accountId,
          contactId: job.contactId,
          channel: 'EMAIL',
          eventType: 'SENT',
          eventAt: now,
          externalId: '',
          metadata: JSON.stringify({ sequenceStep: job.sequenceStep, catchup: true })
        });
        sentMeta.push({
          accountId: job.accountId,
          contactId: job.contactId,
          playbookId: job.playbookId,
          sentAt: now
        });
      } catch (err) {
        job.status = 'FAILED';
        job.error = String(err && err.message || err);
        job.processedAt = new Date().toISOString();
        writeQueueJob(job);
        failed++;
      }
    });

    var touchWriteError = '';
    var touchWriteResult = null;
    try { touchWriteResult = v6AuraCampanaACatchupUpsertTouches_(touchRecords); }
    catch (err) { touchWriteError = String(err && err.message || err); }

    var frequencyLedgerError = '';
    var frequencyLedgerResult = null;
    try { frequencyLedgerResult = v6AuraCampanaACatchupRecordFrequency_(sentMeta); }
    catch (err) { frequencyLedgerError = String(err && err.message || err); }
    try { v6AuraRefreshExecutionReportStatusOnly_(CAMPANA_A_CATCHUP_CAMPAIGN_ID_); } catch (_) { }

    var remaining = v6Rows_('MKT_EMAIL_QUEUE').filter(v6AuraCampanaACatchupIsCandidate_).length;
    var out = {
      status: 'CATCHUP_COMPLETE',
      campaignId: CAMPANA_A_CATCHUP_CAMPAIGN_ID_,
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      attempted: attempted,
      sent: sent,
      failed: failed,
      skipped: skipped,
      remainingCandidates: remaining,
      otherCampaignsSent: 0,
      touchWriteResult: touchWriteResult,
      touchWriteError: touchWriteError,
      frequencyLedgerResult: frequencyLedgerResult,
      frequencyLedgerError: frequencyLedgerError,
      globalSendModeAfterRun: v6AuraSendMode_()
    };
    console.log(JSON.stringify(out));
    return out;
  } finally {
    // Belt-and-suspenders: this function never switches global mode, but force DRY_RUN anyway so
    // the shared automatic dispatcher remains incapable of real sends after this manual run.
    try { PropertiesService.getScriptProperties().setProperty(AURA_SEND_MODE_PROPERTY_KEY_, 'DRY_RUN'); } catch (_) { }
    try { lock.releaseLock(); } catch (_) { }
  }
}
