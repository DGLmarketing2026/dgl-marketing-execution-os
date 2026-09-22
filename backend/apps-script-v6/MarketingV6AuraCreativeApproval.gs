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

// --- Canonical content checksum (PR #3 audit, punto 7) --------------------------------
// htmlChecksum above only ever covered htmlBody -- a subject-only edit to an already-stored
// row (or a future caller that persists a mismatched subject/htmlBody pair) would pass every
// existing check. contentChecksum covers subject+htmlBody+textBody+templateId+creativeVersion
// with a separator byte (\u0001) that cannot appear in any of these fields, so no
// concatenation ever collides across a field boundary. Recomputed at resolve/dispatch time and
// compared to the value captured at approval -- any drift, including subject-only drift, blocks.
function v6AuraCanonicalContentChecksum_(subject, htmlBody, textBody, templateId, creativeVersion) {
  var sep = '\u0001';
  return v6AuraChecksum_(
    String(subject == null ? '' : subject) + sep +
    String(htmlBody == null ? '' : htmlBody) + sep +
    String(textBody == null ? '' : textBody) + sep +
    String(templateId == null ? '' : templateId) + sep +
    String(creativeVersion == null ? '' : creativeVersion)
  );
}

// --- Per-job (post-personalization) content checksum (PR #3 audit round 2, punto 1) -------
// recipientRenderedChecksum (below, set by both queue-builders) only ever covered htmlBody --
// a job whose SUBJECT was altered after queueing (direct cell edit, a second divergent code
// path) with htmlBody left untouched would pass every existing dispatch-time check. This
// covers subject+htmlBody on the exact, already-personalized strings that will reach the
// recipient, so subject-only drift on a QUEUED JOB (not just on the stored creative -- see
// v6AuraCanonicalContentChecksum_ above for that) blocks too.
function v6AuraJobContentChecksum_(subject, htmlBody) {
  var sep = '\u0001';
  return v6AuraChecksum_(String(subject == null ? '' : subject) + sep + String(htmlBody == null ? '' : htmlBody));
}

// --- Internal-label hard gate (PR #3 audit, punto 6) -----------------------------------
// v6AuraDetectInternalLabels_/AURA_INTERNAL_LABELS_ (further below) already existed as an
// AUDIT-only check (v6AuraEmailQueueAudit_ reported violations but never blocked anything).
// This throws/blocks -- used at BOTH approval persistence and dispatch-time revalidation, so
// internal classification vocabulary can never reach a real recipient via either path.
function v6AuraAssertNoInternalLabels_(subject, htmlBody, textBody, errorPrefix) {
  var labels = v6AuraDetectInternalLabels_([subject, htmlBody, textBody].join(' '));
  if (labels.length) throw new Error((errorPrefix || 'INTERNAL_LABEL_DETECTED') + ':' + labels.join(','));
}

// --- Absolute-asset / functional-CTA hard gate (PR #3 audit, puntos 1/2) ----------------
// Campaign Studio (assets/js/campaign-studio-v5.js) must itself emit absolute public URLs for
// every assets/... reference and a real mailto:/https:// CTA href BEFORE calling Approve
// Creative -- there is no post-processing step left anywhere (Test Draft no longer rewrites
// relative paths either). This is the backend's own defense-in-depth check: a relative
// assets/... reference or a placeholder href="#" in the HTML Marketing is about to approve is
// rejected here too, never silently accepted and fixed up later.
function v6AuraAssertHtmlProductionSafe_(htmlBody) {
  var html = String(htmlBody == null ? '' : htmlBody);
  if (/(?:src|href)\s*=\s*["'](?!https?:\/\/|data:)assets\//i.test(html) || /url\(\s*['"]?(?!https?:\/\/|data:)assets\//i.test(html)) {
    throw new Error('CREATIVE_APPROVAL_RELATIVE_ASSET_URL');
  }
  if (/href\s*=\s*["']\s*#\s*["']/i.test(html) || /href\s*=\s*["']\s*["']/i.test(html)) {
    throw new Error('CREATIVE_APPROVAL_NONFUNCTIONAL_CTA');
  }
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
  var textBody = String(p.textBody || '');
  var templateId = String(p.templateId || '');

  // PR #3 audit puntos 1/2/6 -- hard gates, BEFORE anything is written. A creative that fails
  // any of these is never persisted, never versioned, never approved.
  v6AuraAssertHtmlProductionSafe_(htmlBody);
  v6AuraAssertNoInternalLabels_(subject, htmlBody, textBody, 'CREATIVE_APPROVAL_INTERNAL_LABEL_DETECTED');

  var existing = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) { return v6AuraEmailText_(r.campaignId) === campaignId; });
  var maxVersion = existing.reduce(function (max, r) { var v = Number(r.creativeVersion || 0); return v > max ? v : max; }, 0);
  var version = maxVersion + 1;
  var creativeId = campaignId + ':CREATIVE:' + version;
  var htmlChecksum = v6AuraChecksum_(htmlBody);
  var contentChecksum = v6AuraCanonicalContentChecksum_(subject, htmlBody, textBody, templateId, version);
  var approvalId = 'CAPR:' + campaignId + ':' + version;
  var now = new Date().toISOString();
  var record = {
    creativeId: creativeId, campaignId: campaignId, templateId: templateId,
    creativeVersion: version, subject: subject, preheader: String(p.preheader || ''),
    htmlBody: htmlBody, textBody: textBody, heroUrl: String(p.heroUrl || ''),
    logoUrl: String(p.logoUrl || ''), language: String(p.language || ''),
    approvedAt: now, approvedBy: approvedBy, approvalId: approvalId,
    htmlChecksum: htmlChecksum, createdAt: now,
    status: 'APPROVED', contentChecksum: contentChecksum, revokedAt: '', revokedBy: ''
  };
  v6UpsertByKey_('MKT_CAMPAIGN_CREATIVES', ['creativeId'], record);
  return record;
}

// Public v6-router-facing wrapper (see MarketingV6RouterExtension.gs / v6AuraApproveCreative).
// Same anti-fabrication discipline as every other v6Xxx_ handler in this codebase: returns
// a plain, verifiable result, never a bare boolean.
//
// PR #3 audit punto 3 -- this is the backend's OWN self-check that persistence actually
// succeeded (the frontend, campaign-studio-v5.js, independently re-checks this same shape
// before ever flipping state.approved=true -- belt and suspenders, neither trusts the other
// blindly). A persisted row missing any of these is a persistence bug, not a valid approval,
// and must never be reported back as one.
function v6AuraApproveCreative_(payload) {
  var record = v6AuraPersistApprovedCreative_(payload);
  if (!record || !record.creativeId || !record.approvalId || !(Number(record.creativeVersion) > 0) || !record.htmlChecksum || !record.contentChecksum) {
    throw new Error('CREATIVE_APPROVAL_PERSISTENCE_INCOMPLETE');
  }
  return {
    status: 'APPROVED', creativeId: record.creativeId, campaignId: record.campaignId,
    creativeVersion: record.creativeVersion, approvalId: record.approvalId,
    approvedAt: record.approvedAt, approvedBy: record.approvedBy,
    htmlChecksum: record.htmlChecksum, contentChecksum: record.contentChecksum
  };
}

// --- Revocation ledger (PR #3 audit round 2 -- fail-closed revocation) ------------------
// The row-level REVOKED status write below is a normal MKT_CAMPAIGN_CREATIVES upsert -- like
// any Sheets write it can fail (transient API error, quota, lock contention). A revoke that
// simply throws and leaves the row's status untouched at APPROVED is NOT fail-closed: the
// exact creative Marketing just edited out from under would still resolve as approved for
// every future queue-build. This ledger is a second, independent, single-key Properties write
// (cheap, high-reliability, no row/column shape to get wrong) recorded BEFORE the row write is
// even attempted -- every resolver below (v6AuraLatestApprovedCreative_,
// v6AuraLatestApprovedCreativeForLanguage_, v6AuraValidateQueuedCreative_) checks it IN
// ADDITION TO the row's own status column, so a creativeId in this ledger can never resolve as
// approved again, whether or not the row write that follows ever succeeds.
var AURA_REVOKED_LEDGER_PROPERTY_KEY_ = 'AURA_REVOKED_CREATIVE_IDS';
function v6AuraRevokedLedger_() {
  var raw = PropertiesService.getScriptProperties().getProperty(AURA_REVOKED_LEDGER_PROPERTY_KEY_);
  if (!raw) return {};
  try { var parsed = JSON.parse(raw); return (parsed && typeof parsed === 'object') ? parsed : {}; } catch (e) { return {}; }
}
function v6AuraIsRevokedInLedger_(creativeId) {
  return Object.prototype.hasOwnProperty.call(v6AuraRevokedLedger_(), v6AuraEmailText_(creativeId));
}
function v6AuraMarkRevokedInLedger_(creativeId, revokedBy, revokedAt) {
  var ledger = v6AuraRevokedLedger_();
  ledger[v6AuraEmailText_(creativeId)] = { revokedAt: revokedAt, revokedBy: revokedBy };
  PropertiesService.getScriptProperties().setProperty(AURA_REVOKED_LEDGER_PROPERTY_KEY_, JSON.stringify(ledger));
}

// --- Revocation (PR #3 audit, punto 4; fail-closed hardening, audit round 2) -------------
// Editing an approved creative in Campaign Studio must invalidate the BACKEND record, not
// only the browser's local state -- otherwise a second tab, a stale session, or a direct API
// replay could still resolve the "approved" creative that was just edited out from under it.
// Revocation never deletes/overwrites content (the row stays for audit history); it only
// flips status to REVOKED, which every resolver below (v6AuraLatestApprovedCreative_,
// v6AuraLatestApprovedCreativeForLanguage_, v6AuraValidateQueuedCreative_) treats as
// unapproved. Idempotent -- revoking an already-revoked row is a no-op, not an error.
// Rebuilds the FULL row before writing: v6UpsertByKey_ replaces every column with whatever the
// record object provides (missing keys become '' ), so writing only {creativeId,status} here
// would silently blank out htmlBody/subject/checksums on the matched row.
// FAIL-CLOSED: the ledger entry above is written FIRST, before the row write is even
// attempted, and the row write itself is retried up to 3 times. If every attempt still fails,
// this throws (never a silent/soft success) -- but because the ledger entry already landed,
// the creative is unresolvable everywhere regardless of whether the row itself ever gets
// updated. The caller (the router, then campaign-studio-v5.js's invalidateApproval()) must
// treat that thrown error as a real failure, not a background warning.
function v6AuraRevokeCreativeApproval_(creativeId, revokedBy) {
  var id = v6AuraEmailText_(creativeId);
  if (!id) throw new Error('CREATIVE_REVOKE_MISSING_CREATIVE_ID');
  var row = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) { return v6AuraEmailText_(r.creativeId) === id; })[0];
  if (!row) throw new Error('CREATIVE_REVOKE_NOT_FOUND');
  if (String(row.status || '').toUpperCase() === 'REVOKED') {
    return { status: 'ALREADY_REVOKED', creativeId: id, revokedAt: row.revokedAt || '', revokedBy: row.revokedBy || '' };
  }
  var resolvedRevokedBy = v6AuraEmailText_(revokedBy) || 'Marketing';
  var now = new Date().toISOString();
  // Ledger write first -- if THIS throws, nothing has changed yet (no partial/ambiguous state)
  // and the error propagates immediately.
  v6AuraMarkRevokedInLedger_(id, resolvedRevokedBy, now);
  var merged = Object.assign({}, row, { status: 'REVOKED', revokedAt: now, revokedBy: resolvedRevokedBy });
  var lastError = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      v6UpsertByKey_('MKT_CAMPAIGN_CREATIVES', ['creativeId'], merged);
      return { status: 'REVOKED', creativeId: id, revokedAt: now, revokedBy: resolvedRevokedBy };
    } catch (err) {
      lastError = err;
    }
  }
  // The row write never succeeded after 3 attempts. The creative IS still safely blocked (the
  // ledger entry above already makes it unresolvable in every resolver below), but this must
  // reach the caller as a real, actionable failure -- never swallowed into a soft success.
  throw new Error('CREATIVE_REVOKE_ROW_UPDATE_FAILED_BUT_LEDGER_BLOCKED:' + id + ':' + (lastError && lastError.message || 'unknown error'));
}

// The current, single approved creative for a campaign -- highest creativeVersion.
// Every approval is a brand-new immutable row (v6AuraPersistApprovedCreative_ never
// updates an existing creativeId), so "latest" is always well-defined and never
// ambiguous between two rows claiming the same version.
function v6AuraLatestApprovedCreative_(campaignId) {
  var id = v6AuraEmailText_(campaignId);
  var ledger = v6AuraRevokedLedger_();
  // status is blank on any row that predates this column (additive migration default) -- treated
  // as APPROVED for backward compatibility. Only an explicit REVOKED status excludes a row.
  // The ledger check catches a revoke whose row write itself failed (fail-closed, see above).
  var rows = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) {
    return v6AuraEmailText_(r.campaignId) === id && String(r.status || 'APPROVED').toUpperCase() !== 'REVOKED' &&
      !Object.prototype.hasOwnProperty.call(ledger, v6AuraEmailText_(r.creativeId));
  });
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
  var ledger = v6AuraRevokedLedger_();
  var rows = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) {
    return v6AuraEmailText_(r.campaignId) === id && (!lang || v6AuraEmailText_(r.language) === lang) &&
      String(r.status || 'APPROVED').toUpperCase() !== 'REVOKED' &&
      !Object.prototype.hasOwnProperty.call(ledger, v6AuraEmailText_(r.creativeId));
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
  // PR #3 audit punto 7 -- htmlChecksum alone only ever covers htmlBody; a subject that
  // drifted out of sync with the stored row (direct cell edit, corruption) would pass the
  // check above. contentChecksum covers subject too, so subject drift blocks here.
  var currentContentChecksum = v6AuraCanonicalContentChecksum_(creative.subject, creative.htmlBody, creative.textBody, creative.templateId, creative.creativeVersion);
  if (creative.contentChecksum && String(currentContentChecksum) !== String(creative.contentChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // PR #3 audit punto 6 -- hard gate at resolve time too (defense in depth alongside the
  // approval-time gate): no internal classification vocabulary may reach a real recipient.
  if (v6AuraDetectInternalLabels_([creative.subject, creative.htmlBody, creative.textBody].join(' ')).length) {
    return { blocked: true, error: 'INTERNAL_LABEL_DETECTED' };
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
    recipientRenderedChecksum: recipientRenderedChecksum,
    // PR #3 audit round 2, punto 1 -- subject+htmlBody on the personalized job content; any
    // caller building a job from this result must copy this onto job.recipientContentChecksum
    // (see MarketingV6AuraEmailDispatcher.gs / MarketingV6AuraCampanaA.gs).
    recipientContentChecksum: v6AuraJobContentChecksum_(personalizedSubject, personalizedHtml)
  };
}

// --- Dispatch-time re-validation (Iniciativa 2, puntos 2/5) -----------------------------
// Defense in depth, re-checked independently at send time (state can change between
// queue build and dispatch): never re-renders anything, only recomputes checksums over
// bytes already sitting on the job / already persisted in MKT_CAMPAIGN_CREATIVES.
function v6AuraValidateQueuedCreative_(job) {
  var j = job || {};
  if (!j.creativeId || !j.creativeApprovalId) return { blocked: true, error: 'CREATIVE_NOT_APPROVED' };
  // (a) the job row itself has not drifted from what was queued (htmlBody only).
  var currentHtmlChecksum = v6AuraChecksum_(j.htmlBody);
  if (String(currentHtmlChecksum) !== String(j.recipientRenderedChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // PR #3 audit round 2, punto 1 -- recipientRenderedChecksum above only ever covers htmlBody;
  // a job whose SUBJECT alone was altered after queueing (htmlBody left untouched) would pass
  // it. recipientContentChecksum covers subject+htmlBody on the exact personalized strings the
  // job carries, recomputed fresh here -- subject-only drift on a queued job blocks too. The
  // field is REQUIRED (both production queue-builders always set it); a job missing it is
  // treated the same as a job that fails the check, never silently skipped.
  if (!j.recipientContentChecksum || String(v6AuraJobContentChecksum_(j.subject, j.htmlBody)) !== String(j.recipientContentChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // (b) the approved creative this job claims to come from still exists.
  var creative = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (r) { return v6AuraEmailText_(r.creativeId) === v6AuraEmailText_(j.creativeId); })[0];
  if (!creative) return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  // PR #3 audit punto 8 -- dispatch must revalidate approvalId, creativeVersion, the stored
  // HTML checksum, AND the creative's CURRENT status (not just that it existed at build time --
  // it may have been revoked, punto 4, since this job was queued).
  if (String(creative.htmlChecksum) !== String(j.htmlChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // PR #3 audit round 2, punto 2 -- the check above only compares two ALREADY-STORED values
  // (creative.htmlChecksum vs the job's own captured copy) against each other; neither is
  // recomputed fresh from creative.htmlBody, so if both were corrupted/edited identically (or a
  // future bug ever wrote them out of step with the actual content) this alone would not catch
  // it. Recompute checksum(creative.htmlBody) fresh, independent of the job entirely, and
  // require it still matches the CURRENT stored htmlChecksum column.
  if (String(v6AuraChecksum_(creative.htmlBody)) !== String(creative.htmlChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // Same independent-recompute defense for the canonical contentChecksum (subject+htmlBody+
  // textBody+templateId+creativeVersion) -- catches the stored row's own contentChecksum column
  // going stale relative to its content, not just drift between the job and the creative.
  if (creative.contentChecksum && String(v6AuraCanonicalContentChecksum_(creative.subject, creative.htmlBody, creative.textBody, creative.templateId, creative.creativeVersion)) !== String(creative.contentChecksum)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  if (v6AuraEmailText_(creative.approvalId) !== v6AuraEmailText_(j.creativeApprovalId)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  if (String(creative.creativeVersion) !== String(j.creativeVersion)) {
    return { blocked: true, error: 'CREATIVE_VERSION_MISMATCH' };
  }
  // Fail-closed revocation (audit round 2) -- a revoke whose row write failed still lands this
  // creativeId in the Properties ledger; check it here too, not just the row's status column.
  if (String(creative.status || 'APPROVED').toUpperCase() !== 'APPROVED' || v6AuraIsRevokedInLedger_(creative.creativeId)) {
    return { blocked: true, error: 'CREATIVE_REVOKED' };
  }
  // PR #3 audit punto 6 -- hard gate at dispatch too: re-check the actual bytes on the job
  // (subject + htmlBody), not just the stored creative, since the job's own text is what would
  // actually reach the recipient.
  if (v6AuraDetectInternalLabels_([j.subject, j.htmlBody].join(' ')).length) {
    return { blocked: true, error: 'INTERNAL_LABEL_DETECTED' };
  }
  return { blocked: false };
}

// --- Fail-closed dispatch wrapper (PR #3 audit, punto 5) --------------------------------
// Both real dispatch loops (auraProcessEmailQueue in MarketingV6AuraEmailDispatcher.gs and
// v6AuraCampanaADispatchBatch_ in MarketingV6AuraCampanaA.gs) previously called
// v6AuraValidateQueuedCreative_ through a `typeof fn === 'function' ? fn(job) : {blocked:false}`
// guard -- meant only to tolerate this file not being loaded in an isolated test context, but
// in PRODUCTION it meant a missing/renamed/broken validator FAILED OPEN and let a job through
// unvalidated. This wrapper is the one thing either dispatcher may call: no validator function,
// or the validator itself throwing, both resolve to BLOCKED, never to an open gate.
function v6AuraValidateCreativeOrBlock_(job) {
  if (typeof v6AuraValidateQueuedCreative_ !== 'function') return { blocked: true, error: 'CREATIVE_VALIDATION_UNAVAILABLE' };
  try {
    return v6AuraValidateQueuedCreative_(job);
  } catch (err) {
    return { blocked: true, error: 'CREATIVE_VALIDATION_UNAVAILABLE' };
  }
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

// --- Real end-to-end Test Draft (PR #3 audit, punto 9) -----------------------------------
// The audit's finding: v6AuraTestDraftExactMatch_ above existed only as a pure, unit-tested
// comparator -- nothing in the real v55CreateTestDraft request path ever called it, and the
// legacy function that path referenced (createMarketingV55TestDraft_) is not defined anywhere
// in this repository (grep confirms it exists only, if at all, in the live Apps Script editor,
// outside this PR's reach). This function is the real, in-repo replacement wired into
// MarketingV55Backend.gs's 'v55CreateTestDraft' case (see there): it (1) hard-blocks BEFORE
// any draft is created unless the campaign has a current, non-revoked APPROVED creative whose
// stored htmlBody matches the Studio HTML the request just sent, byte-for-byte after only MIME
// normalization -- the STUDIO-vs-STORED leg can never be skipped; (2) creates the real Gmail
// draft itself via GmailApp.createDraft (never GmailApp.sendEmail -- this only ever produces an
// unsent draft, exactly the pre-existing, already-approved "Test Draft" feature); (3)
// immediately reads the real draft's rendered body back from Gmail and runs the SAME
// v6AuraTestDraftExactMatch_ comparator against it for the STORED-vs-DRAFT leg -- an actual
// live comparison, not a stand-in. Never sends anything; AURA_SEND_MODE is untouched and
// irrelevant here (a draft is never a send).
function v6AuraVerifyAndCreateTestDraft_(req) {
  var r = req || {};
  var draftInput = r.draft && typeof r.draft === 'object' ? r.draft : r;
  var campaignId = v6AuraEmailText_(r.campaignId || draftInput.campaignId);
  if (!campaignId) throw new Error('TEST_DRAFT_MISSING_CAMPAIGN_ID');

  var creative = v6AuraLatestApprovedCreative_(campaignId);
  if (!creative || !creative.htmlBody || !creative.subject || !creative.approvalId || String(creative.status || 'APPROVED').toUpperCase() === 'REVOKED') {
    throw new Error('TEST_DRAFT_CREATIVE_NOT_APPROVED');
  }

  var studioHtml = String(draftInput.htmlBody || '');
  if (!studioHtml) throw new Error('TEST_DRAFT_MISSING_HTML_BODY');
  var storedHtml = String(creative.htmlBody || '');

  // Leg 1/2 (STUDIO vs STORED) is checked and enforced BEFORE any draft is created -- a real
  // production gate, not something a caller can route around.
  var preCheck = v6AuraTestDraftExactMatch_(studioHtml, storedHtml, studioHtml);
  if (!preCheck.studioVsStoredMatch) throw new Error('TEST_DRAFT_STUDIO_STORED_MISMATCH');

  var subject = String(draftInput.subject || creative.subject || '');
  var textBody = String(draftInput.textBody || creative.textBody || '');
  var to = (typeof Session !== 'undefined' && Session.getActiveUser) ? v6AuraEmailText_(Session.getActiveUser().getEmail()) : '';
  if (!to) to = v6AuraEmailCanonicalReplyTo_();
  if (!to) throw new Error('TEST_DRAFT_NO_RECIPIENT_AVAILABLE');

  var plainText = (typeof v6AuraEmailStripHtml_ === 'function') ? v6AuraEmailStripHtml_(studioHtml) : textBody;
  var draft = GmailApp.createDraft(to, subject, plainText, { htmlBody: studioHtml });
  var draftId = (typeof draft.getId === 'function') ? draft.getId() : '';
  var actualDraftHtml = (typeof draft.getMessage === 'function') ? draft.getMessage().getBody() : '';

  // Leg 2/3 (STORED vs the REAL rendered draft Gmail now holds) -- a genuine live read-back,
  // not a second call against the same in-memory string.
  var finalCheck = v6AuraTestDraftExactMatch_(studioHtml, storedHtml, actualDraftHtml);
  if (!finalCheck.match) throw new Error('TEST_DRAFT_CONTENT_MISMATCH');

  return {
    status: 'TEST_DRAFT_VERIFIED', draftId: draftId, campaignId: campaignId,
    creativeId: creative.creativeId, creativeApprovalId: creative.approvalId,
    studioVsStoredMatch: finalCheck.studioVsStoredMatch, storedVsDraftMatch: finalCheck.storedVsDraftMatch,
    match: finalCheck.match,
    studioChecksum: finalCheck.studioChecksum, storedChecksum: finalCheck.storedChecksum, draftChecksum: finalCheck.draftChecksum
  };
}
