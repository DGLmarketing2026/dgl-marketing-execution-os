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

function makeContext(opts) {
  opts = opts || {};
  var tables = opts.tables || {};
  var sheets = opts.sheets || {};
  var ctx = {
    String: String, Number: Number, Object: Object, Array: Array, Error: Error, Date: Date, JSON: JSON, RegExp: RegExp,
    MKT_V6_DATA_HUB_ID: 'FAKE-HUB-ID',
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
  ctx.__tables = tables; ctx.__sheets = sheets;
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
  var goodJob = { creativeId: creative.creativeId, creativeApprovalId: approval.approvalId, htmlChecksum: creative.htmlChecksum, htmlBody: creative.htmlBody, recipientRenderedChecksum: ctx.v6AuraChecksum_(creative.htmlBody) };
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

console.log('V6 AURA creative approval (Iniciativa 2 -- Campaign Studio canonical source, checksums, gates): ALL PASS');
