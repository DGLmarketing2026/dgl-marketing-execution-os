// INICIATIVA 2 -- Campaign Studio como unica fuente canonica del email.
//
// Problem this file solves: before this change, AURA's own queue-build functions
// (v6AuraBuildEmailQueueForCampaign_, v6AuraRepairEmailQueueContent_,
// v6AuraCampanaABuildQueue_) each called v6AuraEmailHtml_() -- the backend's own,
// single hardcoded "editorial" template -- to produce job.htmlBody. Campaign Studio
// (assets/js/campaign-studio-v5.js) supports 6 different layout systems and is what
// Marketing actually designs and approves. The two renderers are structurally
// different, so the HTML AURA queued/sent was never guaranteed to be the HTML
// Marketing saw and approved.
//
// This file is the new single source of truth for "what HTML is allowed to reach a
// real recipient": Campaign Studio's Approve Creative action persists the exact
// approved HTML here (MKT_CAMPAIGN_CREATIVES), and every production queue-build path
// must resolve htmlBody from THIS persisted, checksum-verified record -- never from
// v6AuraEmailHtml_(). v6AuraEmailHtml_ itself is left in place only for legacy
// previews/tests (see MarketingV6AuraCopyEngine.gs); it must never again be a
// SENDABLE path (verified by grep across the whole backend, see docs in the PR).
//
// REGLA ABSOLUTA: this file never sends anything itself. It only persists/reads/
// validates creative records and produces already-personalized text the caller (a
// queue-builder or the dispatcher) uses. AURA_SEND_MODE and all existing send gates
// are untouched.

// --- Checksum -----------------------------------------------------------------------
// Same rolling 32-bit string checksum used elsewhere in this project's GitHub-push
// verification tooling (h = h*31 + charCode, >>> 0 keeps it an unsigned 32-bit int).
// Deterministic, dependency-free, and cheap enough to run per-recipient at build time
// and again at dispatch time without any external call.
function v6AuraChecksum_(s) {
  var str = String(s == null ? '' : s);
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return h;
}

// --- Persistence ---------------------------------------------------------------------
// MKT_CAMPAIGN_CREATIVES is a brand-new, AURA-owned table (like MKT_RETENTION_RUN_SUMMARY
// / MKT_AURA_RUN_LOG in MarketingV6SchemaMigration.gs) -- no historical data at risk, so
// it is safe to auto-create its tab end to end. Column list lives in
// MKT_V6_CONTACT_RECIPIENT_SCHEMA (MarketingV6SchemaMigration.gs); this function only
// creates the tab once, the same pattern as v6AuraEnsureRunSummarySheet_/
// v6AuraEnsureRunLogSheet_.
function v6AuraEnsureCampaignCreativesSheet_() {
  var name = 'MKT_CAMPAIGN_CREATIVES';
  var existing = v6Sheet_(name);
  if (existing) return { status: 'ALREADY_EXISTS', sheetName: name };
  var headers = MKT_V6_CONTACT_RECIPIENT_SCHEMA[name];
  var created = SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).insertSheet(name);
  created.getRange(1, 1, 1, headers.length).setValues([headers]);
  return { status: 'CREATED', sheetName: name, headers: headers };
}

// Persists exactly what Campaign Studio's Approve Creative action sends: the full
// creative Marketing just approved, never a partial/derived version. htmlBody here
// must be Campaign Studio's own getPreview().html verbatim -- this function does not
// alter it in any way (no re-render, no re-merge) before computing the checksum and
// storing it. A monotonically increasing creativeVersion is assigned per campaignId,
// so every approval creates a new, immutable row -- nothing here ever overwrites a
// prior approved version, which is exactly what "approval invalidates on edit ->
// requires a new version" (Iniciativa 2, punto 6) needs on the persistence side (the
// invalidation of the OLD in-flight approval state itself happens in the browser,
// campaign-studio-v5.js, the moment Marketing edits an approved creative).
function v6AuraPersistApprovedCreative_(payload) {
  var p = payload || {};
  v6AuraEnsureCampaignCreativesSheet_();
  var campaignId = v6AuraEmailText_(p.campaignId);
  if (!campaignId) throw new Error('CREATIVE_APPROVAL_MISSING_CAMPAIGN_ID');
  var htmlBody = String(p.htmlBody || '');
  if (!htmlBody) throw new Error('CREATIVE_APPROVAL_MISSING_HTML_BODY');
  var subject = String(p.subject || '');
  if (!subject) throw new Error('CREATIVE_APPROVAL_MISSING_SUBJECT');
  var approvedBy = v6AuraEmailText_(p.approvedBy);
  if (!approvedBy) throw new Error('CREATIVE_APPROVAL_MISSING_APPROVED_BY');

  var existing = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) { return v6AuraEmailText_(r.campaignId) === campaignId; });
  var maxVersion = existing.reduce(function (max, r) { var v = Number(r.creativeVersion || 0); return v > max ? v : max; }, 0);
  var version = maxVersion + 1;
  var creativeId = campaignId + ':CREATIVE:' + version;
  var htmlChecksum = v6AuraChecksum_(htmlBody);
  var approvalId = 'CAPR:' + campaignId + ':' + version;
  var now = new Date().toISOString();
  var record = {
    creativeId: creativeId, campaignId: campaignId, templateId: String(p.templateId || ''),
    creativeVersion: version, subject: subject, preheader: String(p.preheader || ''),
    htmlBody: htmlBody, textBody: String(p.textBody || ''), heroUrl: String(p.heroUrl || ''),
    logoUrl: String(p.logoUrl || ''), language: String(p.language || ''),
    approvedAt: now, approvedBy: approvedBy, approvalId: approvalId,
    htmlChecksum: htmlChecksum, createdAt: now
  };
  v6UpsertByKey_('MKT_CAMPAIGN_CREATIVES', ['creativeId'], record);
  return record;
}

// Public v6-router-facing wrapper (see MarketingV6RouterExtension.gs / v6AuraApproveCreative).
// Same anti-fabrication discipline as every other v6Xxx_ handler in this codebase: returns
// a plain, verifiable result, never a bare boolean.
function v6AuraApproveCreative_(payload) {
  var record = v6AuraPersistApprovedCreative_(payload);
  return {
    status: 'APPROVED', creativeId: record.creativeId, campaignId: record.campaignId,
    creativeVersion: record.creativeVersion, approvalId: record.approvalId,
    approvedAt: record.approvedAt, approvedBy: record.approvedBy, htmlChecksum: record.htmlChecksum
  };
}

// The current, single approved creative for a campaign -- highest creativeVersion.
// Every approval is a brand-new immutable row (v6AuraPersistApprovedCreative_ never
// updates an existing creativeId), so "latest" is always well-defined and never
// ambiguous between two rows claiming the same version.
function v6AuraLatestApprovedCreative_(campaignId) {
  var id = v6AuraEmailText_(campaignId);
  var rows = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) { return v6AuraEmailText_(r.campaignId) === id; });
  if (!rows.length) return null;
  rows.sort(function (a, b) { return Number(b.creativeVersion || 0) - Number(a.creativeVersion || 0); });
  return rows[0];
}

// Language-scoped variant of the lookup above. Campana A (MarketingV6AuraCampanaA.gs) is the
// one existing pipeline that resolves per-RECIPIENT language (ES/EN/PT) from a single shared
// campaignId, so for that pipeline "latest approved creative" must also be scoped by language
// -- three languages can each have their own currently-approved creative version, live at the
// same time, under the same campaignId. Every other (single-language) campaign can keep using
// v6AuraLatestApprovedCreative_ above; this is additive, not a replacement.
function v6AuraLatestApprovedCreativeForLanguage_(campaignId, language) {
  var id = v6AuraEmailText_(campaignId), lang = v6AuraEmailText_(language);
  var rows = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) {
    return v6AuraEmailText_(r.campaignId) === id && (!lang || v6AuraEmailText_(r.language) === lang);
  });
  if (!rows.length) return null;
  rows.sort(function (a, b) { return Number(b.creativeVersion || 0) - Number(a.creativeVersion || 0); });
  return rows[0];
}

// --- Personalization (Iniciativa 2, punto 4) ------------------------------------------
// Only these four tokens may ever be substituted into an approved creative. Nothing
// else about layout, copy, assets or CTA may change after approval -- this function
// performs a literal, non-structural text substitution only, never a re-render.
function v6AuraCreativePersonalize_(text, vars) {
  var v = vars || {};
  return String(text == null ? '' : text)
    .replace(/\{\{firstName\}\}/g, v.firstName || '')
    .replace(/\{\{company\}\}/g, v.company || '')
    .replace(/\{\{service\}\}/g, v.service || '')
    .replace(/\{\{lane\}\}/g, v.lane || '');
}

// --- Build-time resolution (Iniciativa 2, puntos 2/3/4) --------------------------------
// The ONLY function a production queue-builder may call to obtain job.subject/
// htmlBody/textBody. Never falls back to v6AuraEmailHtml_() under any condition.
// Returns {blocked:true, error:'CREATIVE_NOT_APPROVED'|'CREATIVE_VERSION_MISMATCH'}
// when no valid approved creative exists for this campaign -- the caller must not
// build a sendable job in that case (blocking the send, per Iniciativa 2 punto 2).
function v6AuraResolveApprovedCreativeForSend_(campaignId, vars) {
  var creative = v6AuraLatestApprovedCreative_(campaignId);
  if (!creative || !creative.htmlBody || !creative.subject || !creative.approvalId) {
    return { blocked: true, error: 'CREATIVE_NOT_APPROVED' };
  }
  // approvedTemplateChecksum: recompute the checksum of the record exactly as stored
  // (before personalization) and compare against what was captured at approval time --
  // catches any drift/corruption of the persisted creative itself.
  var approvedTemplateChecksum = v6AuraChecksum_(creative.htmlBody);
  if (String(approvedTemplateChecksum) !== String(creative.htmlChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  var personalizedSubject = v6AuraCreativePersonalize_(creative.subject, vars);
  var personalizedHtml = v6AuraCreativePersonalize_(creative.htmlBody, vars);
  var personalizedText = v6AuraCreativePersonalize_(creative.textBody, vars);
  // recipientRenderedChecksum: the second level (Iniciativa 2 punto 4) -- computed
  // AFTER personalization, over the exact bytes that will become job.htmlBody, so
  // dispatch-time re-validation can detect any change to the queued row itself
  // (tamper or a second, divergent code path) without needing to re-render anything.
  var recipientRenderedChecksum = v6AuraChecksum_(personalizedHtml);
  return {
    blocked: false,
    subject: personalizedSubject, htmlBody: personalizedHtml, textBody: personalizedText,
    creativeId: creative.creativeId, creativeVersion: creative.creativeVersion,
    creativeApprovalId: creative.approvalId,
    approvedTemplateChecksum: approvedTemplateChecksum,
    recipientRenderedChecksum: recipientRenderedChecksum
  };
}

// --- Dispatch-time re-validation (Iniciativa 2, puntos 2/5) -----------------------------
// Defense in depth, re-checked independently at send time (state can change between
// queue build and dispatch): never re-renders anything, only recomputes checksums over
// bytes already sitting on the job / already persisted in MKT_CAMPAIGN_CREATIVES.
function v6AuraValidateQueuedCreative_(job) {
  if (!job.creativeId || !job.creativeApprovalId) return { blocked: true, error: 'CREATIVE_NOT_APPROVED' };
  // (a) the job row itself has not drifted from what was queued.
  var currentHtmlChecksum = v6AuraChecksum_(job.htmlBody);
  if (String(currentHtmlChecksum) !== String(job.recipientRenderedChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // (b) the approved creative this job claims to come from still exists and still
  // matches the template checksum captured at build time.
  var creative = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) { return v6AuraEmailText_(r.creativeId) === v6AuraEmailText_(job.creativeId); })[0];
  if (!creative) return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  if (String(creative.htmlChecksum) !== String(job.htmlChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  return { blocked: false };
}

// --- Customer-visible internal labels (Iniciativa 2, punto 8) ---------------------------
// None of AURA's internal classification vocabulary may ever be visible to a real
// recipient. Whole-word, case-insensitive match against subject+htmlBody+textBody.
var AURA_INTERNAL_LABELS_ = ['Activation', 'Retention', 'Reactivation', 'Cross-Sell', 'Cross Sell', 'QNB', 'Nurture', 'campaignId', 'playbookId', 'stages', 'scores'];
function v6AuraDetectInternalLabels_(text) {
  var s = String(text == null ? '' : text);
  var found = [];
  AURA_INTERNAL_LABELS_.forEach(function (label) {
    var re = new RegExp('\\b' + label.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i');
    if (re.test(s)) found.push(label);
  });
  return found;
}
function v6AuraCheckNoInternalLabelsInQueue_(filterFn) {
  var filter = typeof filterFn === 'function' ? filterFn : function () { return true; };
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(filter);
  var findings = [];
  jobs.forEach(function (job) {
    var combined = [job.subject, job.htmlBody, job.textBody].join(' ');
    var found = v6AuraDetectInternalLabels_(combined);
    if (found.length) findings.push({ jobId: job.jobId, labels: found });
  });
  return { jobsChecked: jobs.length, violations: findings.length, findings: findings };
}

// --- Test Draft exact-match (Iniciativa 2, punto 7) --------------------------------------
// Normalizes ONLY the differences that are an inevitable side effect of MIME
// transport/encoding (CRLF vs LF, quoted-printable soft line breaks, &nbsp; entity vs
// literal NBSP, incidental trailing whitespace) -- it must never mask a real content
// or layout difference. Used to prove STUDIO HTML == STORED APPROVED HTML == TEST
// DRAFT HTML.
function v6AuraNormalizeHtmlForCompare_(html) {
  return String(html == null ? '' : html)
    .replace(/\r\n/g, '\n')
    .replace(/=\r?\n/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
function v6AuraTestDraftExactMatch_(studioHtml, storedApprovedHtml, testDraftHtml) {
  var a = v6AuraNormalizeHtmlForCompare_(studioHtml);
  var b = v6AuraNormalizeHtmlForCompare_(storedApprovedHtml);
  var c = v6AuraNormalizeHtmlForCompare_(testDraftHtml);
  return {
    match: a === b && b === c,
    studioVsStoredMatch: a === b, storedVsDraftMatch: b === c,
    studioChecksum: v6AuraChecksum_(a), storedChecksum: v6AuraChecksum_(b), draftChecksum: v6AuraChecksum_(c)
  };
}
