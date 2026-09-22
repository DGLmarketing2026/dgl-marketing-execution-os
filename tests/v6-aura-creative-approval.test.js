// Iniciativa 2 -- Campaign Studio como unica fuente canonica del email.
// Dedicated unit coverage for MarketingV6AuraCreativeApproval.gs itself: checksum, persistence/
// versioning, the build-time resolver, the dispatch-time re-validator, the customer-visible
// internal-label detector, and the Test Draft exact-match comparator. Integration of these into
// the real queue-build/dispatch paths is covered separately in
// tests/v6-aura-email-dispatcher.test.js and tests/v6-aura-campana-a.test.js.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const src = name => fs.readFileSync(path.join(root, 'backend/apps-script-v6', name), 'utf8');
const dispatcherSource = src('MarketingV6AuraEmailDispatcher.gs'); // for the real v6AuraEmailText_
const creativeApprovalSource = src('MarketingV6AuraCreativeApproval.gs');

function fakePropertiesService(store) {
  store = store || {};
  return { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setProperty: function (k, v) { store[k] = v; return this; } }; } };
}

function makeContext(opts) {
  opts = opts || {};
  var tables = opts.tables || {};
  var sheets = opts.sheets || {};
  var props = opts.props || {};
  var gmailDrafts = opts.gmailDrafts || [];
  var ctx = {
    String: String, Number: Number, Object: Object, Array: Array, Error: Error, Date: Date, JSON: JSON, RegExp: RegExp,
    MKT_V6_DATA_HUB_ID: 'FAKE-HUB-ID',
    PropertiesService: fakePropertiesService(props),
    // PR #3 audit punto 9 -- v6AuraVerifyAndCreateTestDraft_ real-draft test coverage. createDraft
    // returns a draft object whose getMessage().getBody() reflects opts.draftServerRewrite (if
    // given) so a test can simulate Gmail's OWN MIME rewriting of the html it was handed, proving
    // the comparator (not a stub) is what actually decides STORED-vs-DRAFT.
    GmailApp: {
      createDraft: function (to, subject, plainText, options) {
        var htmlBody = (options || {}).htmlBody || '';
        var rendered = typeof opts.draftServerRewrite === 'function' ? opts.draftServerRewrite(htmlBody) : htmlBody;
        var record = { to: to, subject: subject, plainText: plainText, htmlBody: htmlBody, rendered: rendered, id: 'draft-' + (gmailDrafts.length + 1) };
        gmailDrafts.push(record);
        return { getId: function () { return record.id; }, getMessage: function () { return { getBody: function () { return record.rendered; } }; } };
      }
    },
    Session: opts.session === null ? undefined : { getActiveUser: function () { return { getEmail: function () { return (opts.session && opts.session.email) || 'marketing@dglus.com'; } }; } },
    SpreadsheetApp: {
      openById: function () {
        return {
          insertSheet: function (name) {
            var sheet = { headers: [], getRange: function () { return { setValues: function (rows) { sheet.headers = rows[0]; } }; } };
            sheets[name] = sheet;
            return sheet;
          }
        };
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(dispatcherSource, ctx, { filename: 'MarketingV6AuraEmailDispatcher.gs' });
  vm.runInContext(creativeApprovalSource, ctx, { filename: 'MarketingV6AuraCreativeApproval.gs' });
  ctx.v6Sheet_ = function (name) { return sheets[name] || null; };
  ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA = { MKT_CAMPAIGN_CREATIVES: ['creativeId', 'campaignId'] };
  ctx.v6Rows_ = function (name) { return (tables[name] || []).map(function (r) { return Object.assign({}, r); }); };
  ctx.v6UpsertByKey_ = function (name, keys, record) {
    var rows = tables[name] || (tables[name] = []);
    var at = rows.findIndex(function (row) { return keys.every(function (k) { return String(row[k] || '') === String(record[k] || ''); }); });
    if (at < 0) rows.push(Object.assign({}, record)); else rows[at] = Object.assign({}, record);
    return record;
  };
  ctx.__tables = tables; ctx.__sheets = sheets; ctx.__gmailDrafts = gmailDrafts;
  return ctx;
}

function approvePayload(over) {
  return Object.assign({
    campaignId: 'CMP-1', templateId: 'editorial', subject: '{{firstName}}, hola',
    preheader: 'P', htmlBody: '<p>Hola {{firstName}} de {{company}}</p><a href="mailto:info@dglus.com?subject=RE">CTA</a> DGL',
    textBody: 'Hola {{firstName}}', heroUrl: 'assets/hero.png', logoUrl: 'assets/logo.png',
    language: 'Spanish', approvedBy: 'Marketing'
  }, over || {});
}

// 1. Checksum is deterministic and content-sensitive.
(function checksumDeterministicAndSensitiveTest() {
  var ctx = makeContext({});
  var a = ctx.v6AuraChecksum_('<p>Hello</p>');
  var b = ctx.v6AuraChecksum_('<p>Hello</p>');
  var c = ctx.v6AuraChecksum_('<p>Hello!</p>');
  assert.equal(a, b, 'the same string must always produce the same checksum');
  assert.notEqual(a, c, 'a different string must produce a different checksum');
  console.log('creative-approval test 1 (checksum is deterministic and content-sensitive): PASS');
})();

// 2. Persisting an approval validates required fields and rejects an incomplete payload.
(function persistValidatesRequiredFieldsTest() {
  var ctx = makeContext({});
  assert.throws(function () { ctx.v6AuraPersistApprovedCreative_({}); }, /CREATIVE_APPROVAL_MISSING_CAMPAIGN_ID/);
  assert.throws(function () { ctx.v6AuraPersistApprovedCreative_({ campaignId: 'CMP-1' }); }, /CREATIVE_APPROVAL_MISSING_HTML_BODY/);
  assert.throws(function () { ctx.v6AuraPersistApprovedCreative_({ campaignId: 'CMP-1', htmlBody: '<p>x</p>' }); }, /CREATIVE_APPROVAL_MISSING_SUBJECT/);
  assert.throws(function () { ctx.v6AuraPersistApprovedCreative_({ campaignId: 'CMP-1', htmlBody: '<p>x</p>', subject: 'x' }); }, /CREATIVE_APPROVAL_MISSING_APPROVED_BY/);
  console.log('creative-approval test 2 (persist rejects an incomplete approval payload): PASS');
})();

// 3. A successful approval computes a real checksum, assigns creativeVersion 1, and a second
// approval for the SAME campaign creates a new, immutable row at version 2 -- never overwriting
// version 1.
(function persistVersionsMonotonicallyTest() {
  var ctx = makeContext({});
  var first = ctx.v6AuraApproveCreative_(approvePayload({}));
  assert.equal(first.status, 'APPROVED');
  assert.equal(first.creativeVersion, 1);
  assert.equal(first.htmlChecksum, ctx.v6AuraChecksum_(approvePayload({}).htmlBody));
  var second = ctx.v6AuraApproveCreative_(approvePayload({ subject: '{{firstName}}, hola de nuevo' }));
  assert.equal(second.creativeVersion, 2);
  assert.notEqual(second.creativeId, first.creativeId);
  assert.equal(ctx.__tables.MKT_CAMPAIGN_CREATIVES.length, 2, 'both versions must be persisted, never overwritten');
  var v1 = ctx.__tables.MKT_CAMPAIGN_CREATIVES.filter(function (r) { return r.creativeVersion === 1; })[0];
  assert.equal(v1.subject, '{{firstName}}, hola', 'version 1 must remain exactly as it was approved, untouched by a later approval');
  console.log('creative-approval test 3 (each approval creates a new, immutable, monotonically-versioned row): PASS');
})();

// 4. v6AuraLatestApprovedCreative_ always returns the highest version for that campaign.
(function latestApprovedCreativeTest() {
  var ctx = makeContext({});
  ctx.v6AuraApproveCreative_(approvePayload({}));
  ctx.v6AuraApproveCreative_(approvePayload({ subject: '{{firstName}}, v2' }));
  var latest = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  assert.equal(latest.creativeVersion, 2);
  assert.equal(latest.subject, '{{firstName}}, v2');
  assert.equal(ctx.v6AuraLatestApprovedCreative_('CMP-NONEXISTENT'), null);
  console.log('creative-approval test 4 (latest-approved lookup always returns the highest version): PASS');
})();

// 5. Campana A's per-language lookup: three languages can each have their own currently-approved
// creative, live at the same time, under the same campaignId -- never colliding.
(function latestApprovedCreativeForLanguageTest() {
  var ctx = makeContext({});
  ctx.v6AuraApproveCreative_(approvePayload({ campaignId: 'CMP-CAMPANA-A', language: 'Spanish', subject: '{{firstName}}, ES' }));
  ctx.v6AuraApproveCreative_(approvePayload({ campaignId: 'CMP-CAMPANA-A', language: 'English', subject: '{{firstName}}, EN' }));
  var es = ctx.v6AuraLatestApprovedCreativeForLanguage_('CMP-CAMPANA-A', 'Spanish');
  var en = ctx.v6AuraLatestApprovedCreativeForLanguage_('CMP-CAMPANA-A', 'English');
  var pt = ctx.v6AuraLatestApprovedCreativeForLanguage_('CMP-CAMPANA-A', 'Português (Brasil)');
  assert.equal(es.subject, '{{firstName}}, ES');
  assert.equal(en.subject, '{{firstName}}, EN');
  assert.equal(pt, null, 'a language with no approved creative yet must resolve to null, never fall back to another language');
  console.log('creative-approval test 5 (per-language approved-creative lookup never collides across ES/EN/PT): PASS');
})();

// 6. Personalization substitutes ONLY the 4 authorized tokens -- nothing else about the content
// changes, and an unauthorized-looking token is left untouched (never silently dropped/guessed).
(function personalizeOnlyAuthorizedTokensTest() {
  var ctx = makeContext({});
  var out = ctx.v6AuraCreativePersonalize_('Hi {{firstName}} from {{company}}, {{service}} on {{lane}}. Also {{unknownToken}}.', { firstName: 'Maria', company: 'Shipper Co', service: 'FTL', lane: 'Laredo -> Dallas' });
  assert.equal(out, 'Hi Maria from Shipper Co, FTL on Laredo -> Dallas. Also {{unknownToken}}.');
  console.log('creative-approval test 6 (personalization substitutes only firstName/company/service/lane, nothing else): PASS');
})();

// 7. Build-time resolver: no approved creative -> CREATIVE_NOT_APPROVED; a tampered/corrupted
// approved row -> CREATIVE_VERSION_MISMATCH; a valid approved creative -> real personalized
// output with both checksum levels populated.
(function resolveApprovedCreativeForSendTest() {
  var ctx = makeContext({});
  var missing = ctx.v6AuraResolveApprovedCreativeForSend_('CMP-NONE', { firstName: 'Maria' });
  assert.equal(missing.blocked, true);
  assert.equal(missing.error, 'CREATIVE_NOT_APPROVED');

  ctx.v6AuraApproveCreative_(approvePayload({}));
  var creative = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  creative.htmlBody = creative.htmlBody + '<script>tampered</script>';
  ctx.__tables.MKT_CAMPAIGN_CREATIVES[0] = creative; // simulate drift after approval
  var mismatched = ctx.v6AuraResolveApprovedCreativeForSend_('CMP-1', { firstName: 'Maria' });
  assert.equal(mismatched.blocked, true);
  assert.equal(mismatched.error, 'CREATIVE_VERSION_MISMATCH');

  var ctx2 = makeContext({});
  ctx2.v6AuraApproveCreative_(approvePayload({}));
  var resolved = ctx2.v6AuraResolveApprovedCreativeForSend_('CMP-1', { firstName: 'Maria', company: 'Shipper Co' });
  assert.equal(resolved.blocked, false);
  assert(resolved.htmlBody.indexOf('Maria') >= 0);
  assert(resolved.htmlBody.indexOf('Shipper Co') >= 0);
  assert(resolved.htmlBody.indexOf('{{') < 0, 'no unmerged token may reach the resolved output');
  assert.equal(resolved.approvedTemplateChecksum, ctx2.v6AuraLatestApprovedCreative_('CMP-1').htmlChecksum);
  assert.equal(resolved.recipientRenderedChecksum, ctx2.v6AuraChecksum_(resolved.htmlBody));
  console.log('creative-approval test 7 (build-time resolver: missing -> BLOCK, tampered -> BLOCK, valid -> real personalized output with both checksum levels): PASS');
})();

// 8. Dispatch-time re-validator: a well-formed queued job passes; a job with no creative
// reference, a job whose htmlBody drifted after queueing, and a job pointing at a creative that
// no longer exists (or whose checksum no longer matches) are all blocked -- never re-rendering
// anything to decide.
(function validateQueuedCreativeTest() {
  var ctx = makeContext({});
  var approval = ctx.v6AuraApproveCreative_(approvePayload({}));
  var creative = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  // PR #3 audit punto 8 -- dispatch must also revalidate creativeVersion (and, via `creative`,
  // the current status), not just the two checksums already covered above.
  var goodJob = { creativeId: creative.creativeId, creativeApprovalId: approval.approvalId, creativeVersion: creative.creativeVersion, htmlChecksum: creative.htmlChecksum, htmlBody: creative.htmlBody, recipientRenderedChecksum: ctx.v6AuraChecksum_(creative.htmlBody) };
  assert.equal(ctx.v6AuraValidateQueuedCreative_(goodJob).blocked, false);

  assert.equal(ctx.v6AuraValidateQueuedCreative_({ htmlBody: 'x' }).error, 'CREATIVE_NOT_APPROVED');

  var driftedJob = Object.assign({}, goodJob, { htmlBody: goodJob.htmlBody + '<p>drifted</p>' });
  assert.equal(ctx.v6AuraValidateQueuedCreative_(driftedJob).error, 'CREATIVE_VERSION_MISMATCH');

  var orphanJob = Object.assign({}, goodJob, { creativeId: 'CMP-1:CREATIVE:999' });
  assert.equal(ctx.v6AuraValidateQueuedCreative_(orphanJob).error, 'CREATIVE_VERSION_MISMATCH');

  var corruptedCreativeJob = Object.assign({}, goodJob, { htmlChecksum: goodJob.htmlChecksum + 1 });
  assert.equal(ctx.v6AuraValidateQueuedCreative_(corruptedCreativeJob).error, 'CREATIVE_VERSION_MISMATCH');
  console.log('creative-approval test 8 (dispatch-time re-validator blocks every drift/tamper scenario without ever re-rendering): PASS');
})();

// 9. Customer-visible internal labels (Iniciativa 2 punto 8): every internal classification term
// is detected, case-insensitively, as a whole word; ordinary customer copy stays clean.
(function detectInternalLabelsTest() {
  var ctx = makeContext({});
  assert.deepEqual(ctx.v6AuraDetectInternalLabels_('Hola Maria, gracias por tu negocio con DGL.'), []);
  assert(ctx.v6AuraDetectInternalLabels_('Internal note: Activation campaign for this account').indexOf('Activation') >= 0);
  assert(ctx.v6AuraDetectInternalLabels_('This is a retention/Reactivation touch').length >= 1);
  assert(ctx.v6AuraDetectInternalLabels_('campaignId: CMP-1, playbookId: Activation').length >= 2);
  assert(ctx.v6AuraDetectInternalLabels_('QNB window applies here').indexOf('QNB') >= 0);
  var jobs = [
    { jobId: 'J1', subject: 'Hola Maria', htmlBody: '<p>Hola Maria de Shipper Co</p>' },
    { jobId: 'J2', subject: 'Activation follow-up', htmlBody: '<p>internal only</p>' }
  ];
  var ctxTables = makeContext({ tables: { MKT_EMAIL_QUEUE: jobs } });
  var result = ctxTables.v6AuraCheckNoInternalLabelsInQueue_();
  assert.equal(result.jobsChecked, 2);
  assert.equal(result.violations, 1);
  assert.equal(result.findings[0].jobId, 'J2');
  console.log('creative-approval test 9 (customer-visible internal-label detector catches every classification term, leaves real copy clean): PASS');
})();

// 10. Test Draft exact-match (Iniciativa 2 punto 7): identical content, differing only by
// inevitable MIME/encoding artifacts (CRLF, quoted-printable soft breaks, &nbsp; vs NBSP,
// incidental whitespace), is reported as a match; a genuine content/layout difference is not.
(function testDraftExactMatchTest() {
  var ctx = makeContext({});
  var studio = '<p>Hola Maria de Shipper Co</p>\n<p>Gracias&nbsp;DGL</p>';
  var stored = studio; // exactly what was persisted at approval time
  var draftMime = '<p>Hola Maria de Shipper Co</p>\r\n<p>Gracias&nbsp;DGL</p>=\r\n'; // CRLF + trailing QP soft break
  var identical = ctx.v6AuraTestDraftExactMatch_(studio, stored, draftMime);
  assert.equal(identical.match, true, 'MIME-only differences (CRLF, soft line break) must not be treated as a real mismatch');

  var driftedDraft = '<p>Hola Maria de Shipper Co</p>\n<p>Gracias DGL, contactanos hoy</p>';
  var different = ctx.v6AuraTestDraftExactMatch_(studio, stored, driftedDraft);
  assert.equal(different.match, false, 'a genuine content difference must never be normalized away');
  assert.equal(different.studioVsStoredMatch, true);
  assert.equal(different.storedVsDraftMatch, false);
  console.log('creative-approval test 10 (Test Draft exact-match normalizes only MIME/encoding noise, never a real content difference): PASS');
})();

// 11. v6AuraEnsureCampaignCreativesSheet_ is idempotent: creates the tab once, a second call
// reports ALREADY_EXISTS rather than recreating it.
(function ensureSheetIdempotentTest() {
  var ctx = makeContext({});
  var first = ctx.v6AuraEnsureCampaignCreativesSheet_();
  assert.equal(first.status, 'CREATED');
  var second = ctx.v6AuraEnsureCampaignCreativesSheet_();
  assert.equal(second.status, 'ALREADY_EXISTS');
  console.log('creative-approval test 11 (MKT_CAMPAIGN_CREATIVES sheet creation is idempotent): PASS');
})();

// 12. PR #3 audit punto 6 -- persisting an approval hard-blocks (never just audits) when
// internal classification vocabulary appears anywhere in subject/htmlBody/textBody.
(function persistBlocksInternalLabelsTest() {
  var ctx = makeContext({});
  assert.throws(function () {
    ctx.v6AuraPersistApprovedCreative_(approvePayload({ subject: 'Activation follow-up for {{firstName}}' }));
  }, /CREATIVE_APPROVAL_INTERNAL_LABEL_DETECTED/);
  assert.throws(function () {
    ctx.v6AuraPersistApprovedCreative_(approvePayload({ htmlBody: '<p>Internal: campaignId CMP-1</p>' }));
  }, /CREATIVE_APPROVAL_INTERNAL_LABEL_DETECTED/);
  assert.equal(ctx.__tables.MKT_CAMPAIGN_CREATIVES, undefined, 'a rejected approval must never be persisted');
  console.log('creative-approval test 12 (persist hard-blocks internal classification vocabulary in subject/htmlBody/textBody): PASS');
})();

// 13. PR #3 audit puntos 1/2 -- persisting an approval hard-blocks a relative assets/... URL
// (src/href/url()) and a non-functional placeholder href="#"/"" CTA, defense-in-depth on the
// backend even though Campaign Studio itself must never send either.
(function persistBlocksUnsafeHtmlTest() {
  var ctx = makeContext({});
  assert.throws(function () {
    ctx.v6AuraPersistApprovedCreative_(approvePayload({ htmlBody: '<img src="assets/creative/hero.webp"><a href="mailto:info@dglus.com">CTA</a>' }));
  }, /CREATIVE_APPROVAL_RELATIVE_ASSET_URL/);
  assert.throws(function () {
    ctx.v6AuraPersistApprovedCreative_(approvePayload({ htmlBody: '<div style="background:url(\'assets/x.png\')"></div><a href="mailto:info@dglus.com">CTA</a>' }));
  }, /CREATIVE_APPROVAL_RELATIVE_ASSET_URL/);
  assert.throws(function () {
    ctx.v6AuraPersistApprovedCreative_(approvePayload({ htmlBody: '<p>x</p><a href="#">CTA</a>' }));
  }, /CREATIVE_APPROVAL_NONFUNCTIONAL_CTA/);
  assert.throws(function () {
    ctx.v6AuraPersistApprovedCreative_(approvePayload({ htmlBody: '<p>x</p><a href="">CTA</a>' }));
  }, /CREATIVE_APPROVAL_NONFUNCTIONAL_CTA/);
  // An absolute assets URL and a real mailto: CTA must both be accepted.
  var ok = ctx.v6AuraPersistApprovedCreative_(approvePayload({ htmlBody: '<img src="https://dglmarketing2026.github.io/dgl-marketing-execution-os/assets/creative/hero.webp"><a href="mailto:info@dglus.com?subject=Hi">CTA</a>' }));
  assert.equal(ok.status, 'APPROVED');
  console.log('creative-approval test 13 (persist hard-blocks relative assets/ URLs and href="#"/"" CTAs; absolute URL + mailto: CTA is accepted): PASS');
})();

// 14. PR #3 audit punto 3 -- v6AuraApproveCreative_ (the router-facing wrapper) throws
// CREATIVE_APPROVAL_PERSISTENCE_INCOMPLETE if the persisted record is ever missing any of
// creativeId/approvalId/creativeVersion/htmlChecksum/contentChecksum -- the backend's OWN
// self-check, independent of whatever the frontend separately verifies.
(function approveThrowsOnIncompletePersistenceTest() {
  var ctx = makeContext({});
  var real = ctx.v6AuraPersistApprovedCreative_;
  ctx.v6AuraPersistApprovedCreative_ = function (payload) {
    var record = real(payload);
    delete record.approvalId; // simulate a persistence bug
    return record;
  };
  assert.throws(function () { ctx.v6AuraApproveCreative_(approvePayload({})); }, /CREATIVE_APPROVAL_PERSISTENCE_INCOMPLETE/);
  console.log('creative-approval test 14 (v6AuraApproveCreative_ throws CREATIVE_APPROVAL_PERSISTENCE_INCOMPLETE on any incomplete persisted record): PASS');
})();

// 15. PR #3 audit punto 4 -- revocation flips status to REVOKED without touching any other
// column (full-row-merge, never a v6UpsertByKey_ blank-out), is idempotent, and every resolver
// (campaign-wide and per-language) excludes the revoked row afterward.
(function revokeCreativeTest() {
  var ctx = makeContext({});
  var approved = ctx.v6AuraApproveCreative_(approvePayload({ language: 'Spanish' }));
  var before = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  assert.equal(before.creativeId, approved.creativeId);

  var revoked = ctx.v6AuraRevokeCreativeApproval_(approved.creativeId, 'Marketing');
  assert.equal(revoked.status, 'REVOKED');
  assert(revoked.revokedAt);

  var row = ctx.__tables.MKT_CAMPAIGN_CREATIVES.filter(function (r) { return r.creativeId === approved.creativeId; })[0];
  assert.equal(row.status, 'REVOKED');
  assert.equal(row.subject, approvePayload({}).subject, 'revocation must never blank out subject/htmlBody/any other column');
  assert.equal(row.htmlBody, approvePayload({}).htmlBody, 'revocation must never blank out the stored htmlBody');

  assert.equal(ctx.v6AuraLatestApprovedCreative_('CMP-1'), null, 'a revoked creative must no longer resolve as the latest approved one');
  assert.equal(ctx.v6AuraLatestApprovedCreativeForLanguage_('CMP-1', 'Spanish'), null, 'the per-language resolver must exclude a revoked row too');

  var again = ctx.v6AuraRevokeCreativeApproval_(approved.creativeId, 'Someone Else');
  assert.equal(again.status, 'ALREADY_REVOKED', 'revoking an already-revoked row must be idempotent, not an error');
  assert.equal(again.revokedBy, revoked.revokedBy, 'a second revoke call must not overwrite who/when it was first revoked');

  assert.throws(function () { ctx.v6AuraRevokeCreativeApproval_('CMP-1:CREATIVE:999'); }, /CREATIVE_REVOKE_NOT_FOUND/);
  assert.throws(function () { ctx.v6AuraRevokeCreativeApproval_(''); }, /CREATIVE_REVOKE_MISSING_CREATIVE_ID/);
  console.log('creative-approval test 15 (revoke flips status only, preserves every other column, is idempotent, and every resolver excludes the revoked row): PASS');
})();

// 16. PR #3 audit punto 7 -- contentChecksum covers subject too (htmlChecksum alone does not),
// so a subject-only drift on an otherwise-untouched stored row blocks at resolve time.
(function contentChecksumCatchesSubjectDriftTest() {
  var ctx = makeContext({});
  ctx.v6AuraApproveCreative_(approvePayload({}));
  var creative = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  creative.subject = 'Something completely different'; // htmlBody/htmlChecksum untouched
  ctx.__tables.MKT_CAMPAIGN_CREATIVES[0] = creative;
  var resolved = ctx.v6AuraResolveApprovedCreativeForSend_('CMP-1', { firstName: 'Maria' });
  assert.equal(resolved.blocked, true, 'subject-only drift must block even though htmlBody/htmlChecksum never changed');
  assert.equal(resolved.error, 'CREATIVE_VERSION_MISMATCH');
  console.log('creative-approval test 16 (canonical contentChecksum catches subject-only drift that htmlChecksum alone would miss): PASS');
})();

// 17. PR #3 audit punto 5 -- the fail-closed dispatch wrapper. A missing validator function
// blocks with CREATIVE_VALIDATION_UNAVAILABLE (never {blocked:false}); a validator that THROWS
// also blocks the same way (never lets the exception propagate and never opens the gate); and a
// real, working validator's own verdict passes through unchanged either way.
(function validateCreativeOrBlockFailsClosedTest() {
  var ctx = makeContext({});
  var approval = ctx.v6AuraApproveCreative_(approvePayload({}));
  var creative = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  var goodJob = { creativeId: creative.creativeId, creativeApprovalId: approval.approvalId, creativeVersion: creative.creativeVersion, htmlChecksum: creative.htmlChecksum, htmlBody: creative.htmlBody, recipientRenderedChecksum: ctx.v6AuraChecksum_(creative.htmlBody) };

  assert.equal(ctx.v6AuraValidateCreativeOrBlock_(goodJob).blocked, false, 'a well-formed job must still pass through the wrapper unchanged');

  var realValidator = ctx.v6AuraValidateQueuedCreative_;
  ctx.v6AuraValidateQueuedCreative_ = undefined;
  assert.equal(ctx.v6AuraValidateCreativeOrBlock_(goodJob).blocked, true, 'a missing validator function must block, never fail open');
  assert.equal(ctx.v6AuraValidateCreativeOrBlock_(goodJob).error, 'CREATIVE_VALIDATION_UNAVAILABLE');

  ctx.v6AuraValidateQueuedCreative_ = function () { throw new Error('boom -- validator itself is broken'); };
  var thrown = ctx.v6AuraValidateCreativeOrBlock_(goodJob);
  assert.equal(thrown.blocked, true, 'a validator that throws must also block, never let the exception fail the gate open');
  assert.equal(thrown.error, 'CREATIVE_VALIDATION_UNAVAILABLE');

  ctx.v6AuraValidateQueuedCreative_ = realValidator;
  assert.equal(ctx.v6AuraValidateCreativeOrBlock_(goodJob).blocked, false, 'restoring the real validator must resume normal pass-through behavior');
  console.log('creative-approval test 17 (v6AuraValidateCreativeOrBlock_ fails closed on a missing OR a throwing validator, never {blocked:false}): PASS');
})();

// 18. PR #3 audit punto 8 -- dispatch-time revalidation of approvalId, creativeVersion, AND the
// creative's CURRENT status individually (not only the two checksums covered in test 8 above).
(function dispatchRevalidatesApprovalIdVersionAndStatusTest() {
  var ctx = makeContext({});
  var approval = ctx.v6AuraApproveCreative_(approvePayload({}));
  var creative = ctx.v6AuraLatestApprovedCreative_('CMP-1');
  var goodJob = { creativeId: creative.creativeId, creativeApprovalId: approval.approvalId, creativeVersion: creative.creativeVersion, htmlChecksum: creative.htmlChecksum, htmlBody: creative.htmlBody, recipientRenderedChecksum: ctx.v6AuraChecksum_(creative.htmlBody) };
  assert.equal(ctx.v6AuraValidateQueuedCreative_(goodJob).blocked, false);

  var wrongApprovalId = Object.assign({}, goodJob, { creativeApprovalId: 'CAPR:WRONG:1' });
  assert.equal(ctx.v6AuraValidateQueuedCreative_(wrongApprovalId).error, 'CREATIVE_VERSION_MISMATCH', 'a job whose approvalId no longer matches the stored creative must block');

  var wrongVersion = Object.assign({}, goodJob, { creativeVersion: 999 });
  assert.equal(ctx.v6AuraValidateQueuedCreative_(wrongVersion).error, 'CREATIVE_VERSION_MISMATCH', 'a job whose creativeVersion no longer matches the stored creative must block');

  // Revoke the creative AFTER the job was queued -- everything on the job itself is still
  // internally consistent (checksums/approvalId/version all still match what was true when it
  // was queued), so only the CURRENT status check can catch this.
  ctx.v6AuraRevokeCreativeApproval_(creative.creativeId, 'Marketing');
  assert.equal(ctx.v6AuraValidateQueuedCreative_(goodJob).error, 'CREATIVE_REVOKED', 'dispatch must revalidate the creative\'s CURRENT status, not just checksums frozen at queue time');
  console.log('creative-approval test 18 (dispatch independently revalidates approvalId, creativeVersion, and current status -- a revoke after queueing blocks even an otherwise-untampered job): PASS');
})();

// 19. PR #3 audit punto 9 -- v6AuraVerifyAndCreateTestDraft_ is a REAL end-to-end path: it
// throws before any campaign has an approved creative, throws if the Studio HTML the caller
// sent does not match the STORED approved HTML (leg 1), actually calls GmailApp.createDraft (a
// real, verified side effect -- see __gmailDrafts), and on success returns a genuine
// STUDIO==STORED==DRAFT verification, never a unit-test-only comparison.
(function verifyAndCreateTestDraftTest() {
  var ctx0 = makeContext({});
  assert.throws(function () { ctx0.v6AuraVerifyAndCreateTestDraft_({ campaignId: 'CMP-1', htmlBody: '<p>x</p>' }); }, /TEST_DRAFT_CREATIVE_NOT_APPROVED/, 'no approved creative on file must block before any draft is created');

  var ctx = makeContext({});
  var approved = ctx.v6AuraApproveCreative_(approvePayload({}));
  var storedHtml = ctx.v6AuraLatestApprovedCreative_('CMP-1').htmlBody;

  assert.throws(function () {
    ctx.v6AuraVerifyAndCreateTestDraft_({ campaignId: 'CMP-1', subject: 'x', htmlBody: '<p>totally different from what was stored</p>' });
  }, /TEST_DRAFT_STUDIO_STORED_MISMATCH/, 'Studio HTML that does not match the STORED approved HTML must block before any draft is created');
  assert.equal(ctx.__gmailDrafts.length, 0, 'no draft may ever be created when the pre-check fails');

  var result = ctx.v6AuraVerifyAndCreateTestDraft_({ campaignId: 'CMP-1', subject: approved.subject || 'x', htmlBody: storedHtml, textBody: 'text' });
  assert.equal(result.status, 'TEST_DRAFT_VERIFIED');
  assert.equal(result.match, true);
  assert.equal(result.studioVsStoredMatch, true);
  assert.equal(result.storedVsDraftMatch, true);
  assert.equal(ctx.__gmailDrafts.length, 1, 'a real GmailApp.createDraft call must have happened');
  assert.equal(ctx.__gmailDrafts[0].htmlBody, storedHtml, 'the actual draft created in Gmail must carry the exact Studio/stored HTML');

  // Now prove the comparator is checking a REAL read-back, not a stub: simulate Gmail rewriting
  // the html it was handed (e.g. a MIME transform gone wrong) into something with a genuine
  // content difference, and confirm the function still catches it via the actual draft object.
  var ctxRewrite = makeContext({ draftServerRewrite: function (html) { return html.replace('Hola', 'Something else entirely'); } });
  ctxRewrite.v6AuraApproveCreative_(approvePayload({}));
  var storedHtml2 = ctxRewrite.v6AuraLatestApprovedCreative_('CMP-1').htmlBody;
  assert.throws(function () {
    ctxRewrite.v6AuraVerifyAndCreateTestDraft_({ campaignId: 'CMP-1', subject: 'x', htmlBody: storedHtml2, textBody: 'text' });
  }, /TEST_DRAFT_CONTENT_MISMATCH/, 'a genuine STORED-vs-actual-Gmail-draft mismatch must block, proving this reads back the real created draft rather than trusting the input');
  console.log('creative-approval test 19 (v6AuraVerifyAndCreateTestDraft_ is real end-to-end: blocks on no approval, blocks on Studio/Stored mismatch, actually calls GmailApp.createDraft, and independently verifies the real created draft): PASS');
})();

console.log('V6 AURA creative approval (Iniciativa 2 -- Campaign Studio canonical source, checksums, gates): ALL PASS');
