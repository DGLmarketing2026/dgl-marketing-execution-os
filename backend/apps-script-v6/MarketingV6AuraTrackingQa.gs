/**
 * AURA tracking activation + INTERNAL validation (operator tooling, run from the Apps Script
 * editor). Never touches AURA_SEND_MODE, Campaign A jobs, approved creatives or any SENT HTML.
 *
 * STEP 1  AURA_TRACKING_QA_STEP1_ACTIVATE()
 *   - preserves an existing AURA_TRACKING_SECRET (only fingerprints are reported, never values)
 *   - sets AURA_TRACKING_ENABLED=TRUE and AURA_TRACKING_BASE_URL=<production /exec URL>
 *   - renders ONE internal QA email through the governed render (latest approved Campaign A
 *     creative, read-only) with tracking, sends it ONLY to the script owner's @dglus.com mailbox,
 *     and records that job as SENT under CMP-AURA-TRACKING-QA (never a customer campaign).
 *   - logs the tokenized OPEN / CLICK test URLs (opaque tokens, no PII).
 * STEP 2  AURA_TRACKING_QA_STEP2_VERIFY()  (after hitting the URLs)
 *   - reports the QA job's MKT_EMAIL_EVENTS rows, Email Performance recognition and OR/CTR/CTOR,
 *     plus Campaign A counts and AURA_SEND_MODE for the safety check.
 */
var AURA_TRACKING_QA_CAMPAIGN_ID_ = 'CMP-AURA-TRACKING-QA';
var AURA_TRACKING_PROD_EXEC_URL_ = 'https://script.google.com/macros/s/AKfycbw1lzTl7iwqYNp_sp_y2So7rtTt-yUsTmb9DEtRy3tsrF9tUGxHy-exI6Vo8Qmy66GH/exec';
var AURA_TRACKING_QA_JOB_PROP_ = 'AURA_TRACKING_QA_LAST_JOB';

function v6AuraTrackingQaFingerprint_(value) {
  if (!value) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value)).slice(0, 6).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function AURA_TRACKING_QA_STEP1_ACTIVATE() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  var out = { step: 1 };
  try {
    var props = PropertiesService.getScriptProperties();
    var secretBefore = props.getProperty(AURA_TRACKING_PROPS_.secret);
    out.before = { enabled: props.getProperty(AURA_TRACKING_PROPS_.enabled) || '', baseUrl: props.getProperty(AURA_TRACKING_PROPS_.baseUrl) || '', secretExists: !!secretBefore, sendMode: props.getProperty('AURA_SEND_MODE') || '' };
    try { out.serviceUrl = ScriptApp.getService().getUrl(); } catch (e) { out.serviceUrl = 'UNAVAILABLE'; }

    props.setProperty(AURA_TRACKING_PROPS_.enabled, 'TRUE');
    props.setProperty(AURA_TRACKING_PROPS_.baseUrl, AURA_TRACKING_PROD_EXEC_URL_);
    var config = v6AuraTrackingConfig_();
    if (!config.enabled || config.baseUrl !== AURA_TRACKING_PROD_EXEC_URL_) throw new Error('TRACKING_CONFIG_NOT_RESOLVED');
    var secretAfter = v6AuraTrackingSecret_(); // creates one only if none existed
    out.config = config;
    out.secret = { existedBefore: !!secretBefore, preserved: secretBefore ? secretBefore === secretAfter : 'CREATED_NEW', fingerprintBefore: v6AuraTrackingQaFingerprint_(secretBefore), fingerprintAfter: v6AuraTrackingQaFingerprint_(secretAfter) };

    var to = String(Session.getEffectiveUser().getEmail() || '').trim();
    if (!/@dglus\.com$/i.test(to)) throw new Error('INTERNAL_DGL_RECIPIENT_REQUIRED');
    var creative = v6AuraLatestApprovedCreative_(CAMPANA_A_CAMPAIGN_ID_);
    if (!creative || !creative.htmlBody) throw new Error('APPROVED_CREATIVE_NOT_FOUND');

    var stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss');
    var job = {
      jobId: 'JOB:' + AURA_TRACKING_QA_CAMPAIGN_ID_ + ':TRACKING_QA:QA-INTERNAL:' + stamp, campaignId: AURA_TRACKING_QA_CAMPAIGN_ID_,
      accountId: 'QA-INTERNAL', contactId: 'QA-INTERNAL', email: to, firstName: 'QA', company: 'DGL', service: '', playbookId: 'TRACKING_QA',
      creativeId: creative.creativeId, creativeVersion: creative.creativeVersion, renderContract: CAMPANA_A_RENDER_CONTRACT_, trackingBaseUrl: AURA_TRACKING_PROD_EXEC_URL_
    };
    var rendered = v6AuraCampanaAGovernedRender_(creative, job);
    var html = rendered.htmlBody, approved = v6AuraTrackingCtaHrefs_(creative.htmlBody);
    var trackedLinks = (html.match(/[?&]aura_t=c&k=[^"&]+&c=\d+/g) || []);
    var token = decodeURIComponent((html.match(/aura_t=o&k=([^"&]+)/) || [])[1] || '');
    out.render = {
      pixel: /aura_t=o&k=/.test(html), approvedCtas: approved.length, trackedCtas: trackedLinks.length,
      originalHrefsRemaining: approved.filter(function (h) { return html.indexOf('href="' + h + '"') >= 0; }).length,
      // The token decodes to the jobId only: no email, name or company in any tracked URL.
      tokenHasPii: [token].concat(trackedLinks).some(function (u) { return u.indexOf('@') >= 0 || u.toLowerCase().indexOf(to.toLowerCase()) >= 0; }) || v6AuraTrackingVerify_(token).indexOf('@') >= 0,
      tokenVerifies: v6AuraTrackingVerify_(token) === job.jobId
    };
    if (!out.render.pixel || out.render.trackedCtas !== approved.length || !out.render.tokenVerifies) throw new Error('TRACKED_RENDER_INVALID');

    GmailApp.sendEmail(to, '[AURA QA · INTERNAL] ' + rendered.subject, 'AURA tracking validation (internal QA, not a customer email).', { htmlBody: html, name: 'DGL AURA QA' });
    v6EnsureContactRecipientSchema_();
    var nowIso = new Date().toISOString();
    v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], Object.assign({}, job, { subject: '[AURA QA · INTERNAL] ' + rendered.subject, htmlBody: html, status: 'SENT', processedAt: nowIso, sentAt: nowIso, replyTo: to }));
    props.setProperty(AURA_TRACKING_QA_JOB_PROP_, job.jobId);

    var k = encodeURIComponent(token);
    out.qaJob = { jobId: job.jobId, campaignId: job.campaignId, contactId: job.contactId, creativeId: job.creativeId, creativeVersion: job.creativeVersion, recipient: 'SCRIPT_OWNER_DGL_MAILBOX' };
    out.testUrls = {
      open: AURA_TRACKING_PROD_EXEC_URL_ + '?aura_t=o&k=' + k,
      clicks: approved.map(function (h, i) { return { index: i, approvedDestination: h.replace(/\?.*$/, '?…'), url: AURA_TRACKING_PROD_EXEC_URL_ + '?aura_t=c&k=' + k + '&c=' + i }; }),
      outOfRange: AURA_TRACKING_PROD_EXEC_URL_ + '?aura_t=c&k=' + k + '&c=99',
      invalid: AURA_TRACKING_PROD_EXEC_URL_ + '?aura_t=o&k=' + k.slice(0, -3) + 'AAA'
    };
    out.status = 'STEP1_OK';
  } catch (err) {
    out.status = 'STEP1_FAILED'; out.error = String(err && err.message || err);
  } finally { lock.releaseLock(); }
  console.log('AURA_TRACKING_QA ' + JSON.stringify(out));
  return out;
}

function AURA_TRACKING_QA_STEP2_VERIFY() {
  var props = PropertiesService.getScriptProperties(), jobId = props.getProperty(AURA_TRACKING_QA_JOB_PROP_) || '';
  var events = v6Rows_('MKT_EMAIL_EVENTS').filter(function (e) { return e.jobId === jobId; }).map(function (e) {
    return { eventId: e.eventId, eventType: e.eventType, source: e.source, eventCount: e.eventCount, ctaId: e.ctaId, campaignId: e.campaignId, contactId: e.contactId, creativeId: e.creativeId, creativeVersion: e.creativeVersion, occurredAt: e.occurredAt, lastOccurredAt: e.lastOccurredAt };
  });
  var perf = v6AuraEmailPerformance_(), qa = (perf.scopes || {})[AURA_TRACKING_QA_CAMPAIGN_ID_] || {}, ca = (perf.scopes || {})[CAMPANA_A_CAMPAIGN_ID_] || {};
  var row = (perf.rows || []).filter(function (r) { return r.jobId === jobId; })[0] || {};
  var caSent = v6Rows_('MKT_EMAIL_QUEUE').filter(function (q) { return q.campaignId === CAMPANA_A_CAMPAIGN_ID_ && String(q.status).toUpperCase() === 'SENT'; });
  var out = {
    step: 2, jobId: jobId, config: v6AuraTrackingConfig_(), sendMode: props.getProperty('AURA_SEND_MODE') || '',
    events: events, performanceRow: { tracked: row.tracked, opened: row.opened, clicked: row.clicked, openAt: row.openAt, clickAt: row.clickAt },
    qaAllTime: qa.allTime || null, trackingFlag: perf.tracking,
    campaignA: { sentRowsInQueue: caSent.length, currentRun: (ca.currentRun || {}).sent, historical: (ca.historical || {}).sent, historicalFamilies: ca.historicalFamilies, allTime: (ca.allTime || {}).sent, openRate: (ca.allTime || {}).openRate, opened: (ca.allTime || {}).opened }
  };
  console.log('AURA_TRACKING_QA ' + JSON.stringify(out));
  return out;
}
