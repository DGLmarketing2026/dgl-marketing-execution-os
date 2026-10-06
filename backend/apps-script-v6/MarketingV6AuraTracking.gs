/**
 * AURA email engagement tracking (OPEN / CLICK).
 *
 * - Opt-in: active only when Script Properties AURA_TRACKING_ENABLED=TRUE and
 *   AURA_TRACKING_BASE_URL (this web app's /exec URL) are set. Otherwise HTML is unchanged.
 * - Tokens are opaque HMAC-signed job references (no email, name or company in any URL).
 *   The signing secret lives only in Script Properties (AURA_TRACKING_SECRET).
 * - CLICK never redirects to a caller-supplied URL: the destination is resolved from the
 *   job's APPROVED creative (n-th approved CTA href), so open redirects are impossible.
 * - Writes are idempotent per job (OPEN) and per job+CTA (CLICK); repeats only increment
 *   eventCount / lastOccurredAt. Nothing is ever inferred or fabricated.
 * - OPEN is a weak signal: image proxies (Gmail) and Apple Mail Privacy Protection can
 *   pre-fetch images (false opens) and image blocking hides real opens. CLICK is stronger.
 * - Apps Script web apps cannot return image MIME types or HTTP 302: the pixel request is
 *   recorded and answered with an empty body; CLICK answers a minimal page that forwards to
 *   the approved destination (with a visible fallback link).
 */
var AURA_TRACKING_PROPS_ = { enabled: 'AURA_TRACKING_ENABLED', baseUrl: 'AURA_TRACKING_BASE_URL', secret: 'AURA_TRACKING_SECRET' };
var AURA_TRACKING_EVENT_EXTRA_HEADERS_ = ['eventCount', 'lastOccurredAt', 'ctaId', 'creativeId', 'creativeVersion'];

function v6AuraTrackingConfig_() {
  var props = PropertiesService.getScriptProperties();
  var enabled = String(props.getProperty(AURA_TRACKING_PROPS_.enabled) || '').toUpperCase() === 'TRUE';
  var baseUrl = String(props.getProperty(AURA_TRACKING_PROPS_.baseUrl) || '').trim();
  return { enabled: enabled && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(baseUrl), baseUrl: baseUrl };
}
function v6AuraTrackingSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty(AURA_TRACKING_PROPS_.secret);
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty(AURA_TRACKING_PROPS_.secret, secret); }
  return secret;
}
function v6AuraTrackingB64_(text) { return Utilities.base64EncodeWebSafe(String(text)).replace(/=+$/, ''); }
function v6AuraTrackingUnB64_(text) {
  var s = String(text || ''); while (s.length % 4) s += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}
function v6AuraTrackingSign_(payload) {
  return v6AuraTrackingB64_(Utilities.computeHmacSha256Signature(String(payload), v6AuraTrackingSecret_()).map(function (b) { return String.fromCharCode(b & 255); }).join('')).slice(0, 22);
}
function v6AuraTrackingToken_(jobId) {
  var ref = v6AuraTrackingB64_(jobId);
  return ref + '.' + v6AuraTrackingSign_(ref);
}
// Returns the jobId for a valid token, '' otherwise (constant-shape comparison).
function v6AuraTrackingVerify_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].length > 400) return '';
  var expected = v6AuraTrackingSign_(parts[0]), diff = expected.length ^ parts[1].length;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (parts[1].charCodeAt(i) || 0);
  if (diff) return '';
  try { return v6AuraTrackingUnB64_(parts[0]); } catch (e) { return ''; }
}
// Approved CTA destinations, in document order: functional mailto:/https: hrefs only.
function v6AuraTrackingCtaHrefs_(html) {
  var out = [], re = /<a\b[^>]*\shref="((?:mailto:|https:\/\/)[^"]*)"/gi, m;
  while ((m = re.exec(String(html || '')))) out.push(m[1]);
  return out;
}
// Deterministic transform (same inputs -> same bytes), so the governed render check can
// re-derive it. Applied only to the per-recipient governed HTML, never to approved creatives.
function v6AuraTrackingApply_(html, jobId, baseUrl) {
  if (!baseUrl || !jobId) return String(html || '');
  var token = encodeURIComponent(v6AuraTrackingToken_(jobId)), i = 0;
  var tracked = String(html || '').replace(/(<a\b[^>]*\shref=")((?:mailto:|https:\/\/)[^"]*)(")/gi, function (all, pre, href, post) {
    return pre + baseUrl + '?aura_t=c&k=' + token + '&c=' + (i++) + post;
  });
  var pixel = '<img src="' + baseUrl + '?aura_t=o&k=' + token + '" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0">';
  return /<\/body>/i.test(tracked) ? tracked.replace(/<\/body>/i, pixel + '</body>') : tracked + pixel;
}

function v6AuraTrackingEnsureEventHeaders_() {
  var sheet = v6Sheet_('MKT_EMAIL_EVENTS'); if (!sheet) return;
  var count = sheet.getLastColumn(), headers = count ? sheet.getRange(1, 1, 1, count).getValues()[0] : [];
  var missing = AURA_TRACKING_EVENT_EXTRA_HEADERS_.filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
}
// Idempotent event write: first occurrence creates the row, repeats increment the count.
function v6AuraTrackingRecord_(type, job, ctaId, nowIso) {
  var eventId = type + ':' + job.jobId + (type === 'CLICK' ? ':' + ctaId : '');
  var existing = v6Rows_('MKT_EMAIL_EVENTS').filter(function (e) { return String(e.eventId) === eventId; })[0];
  var record = existing ? Object.assign({}, existing, { eventCount: Number(existing.eventCount || 1) + 1, lastOccurredAt: nowIso }) : {
    eventId: eventId, jobId: job.jobId, campaignId: job.campaignId, accountId: job.accountId, contactId: job.contactId, email: job.email,
    eventType: type, occurredAt: nowIso, source: 'AURA_TRACKING', externalId: '', reasonCode: '', reasonText: '', createdAt: nowIso,
    eventCount: 1, lastOccurredAt: nowIso, ctaId: type === 'CLICK' ? String(ctaId) : '', creativeId: job.creativeId || '', creativeVersion: job.creativeVersion || ''
  };
  v6UpsertByKey_('MKT_EMAIL_EVENTS', ['eventId'], record);
  return { eventId: eventId, firstOccurrence: !existing };
}
function v6AuraTrackingFindJob_(jobId) {
  return v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return String(r.jobId) === jobId && String(r.status).toUpperCase() === 'SENT'; })[0] || null;
}
function v6AuraTrackingDestination_(job, ctaIndex) {
  var creative = v6Rows_('MKT_CAMPAIGN_CREATIVES').filter(function (c) { return String(c.creativeId) === String(job.creativeId); })[0];
  var hrefs = v6AuraTrackingCtaHrefs_(creative ? creative.htmlBody : '');
  var n = Number(ctaIndex);
  return (n >= 0 && n < hrefs.length && Math.floor(n) === n) ? hrefs[n] : '';
}
// Web app entry point for ?aura_t=o|c. Returns null for any other request so the normal
// router handles it. Never throws to the caller; never reveals whether a token was valid.
function v6AuraTrackingHandle_(e) {
  var p = (e && e.parameter) || {}, type = String(p.aura_t || '');
  if (type !== 'o' && type !== 'c') return null;
  var dest = '';
  try {
    var jobId = v6AuraTrackingVerify_(p.k), job = jobId ? v6AuraTrackingFindJob_(jobId) : null;
    if (job) {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(10000)) {
        try {
          v6AuraTrackingEnsureEventHeaders_();
          if (type === 'c') { dest = v6AuraTrackingDestination_(job, p.c); if (dest) v6AuraTrackingRecord_('CLICK', job, String(p.c), new Date().toISOString()); }
          else v6AuraTrackingRecord_('OPEN', job, '', new Date().toISOString());
        } finally { lock.releaseLock(); }
      } else if (type === 'c') dest = v6AuraTrackingDestination_(job, p.c);
    }
  } catch (err) { /* tracking must never break the recipient experience */ }
  if (type === 'o') return ContentService.createTextOutput('');
  return v6AuraTrackingRedirectPage_(dest);
}
function v6AuraTrackingRedirectPage_(dest) {
  var safe = String(dest || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  var html = dest
    ? '<!doctype html><html><head><meta charset="utf-8"><base target="_top"><meta http-equiv="refresh" content="0;url=' + safe + '"><title>DGL</title></head><body style="font-family:Arial,sans-serif;padding:24px">' +
      '<script>try{window.top.location.href=' + JSON.stringify(String(dest)) + ';}catch(e){}</script><p><a href="' + safe + '">Continue to DGL</a></p></body></html>'
    : '<!doctype html><html><head><meta charset="utf-8"><title>DGL</title></head><body style="font-family:Arial,sans-serif;padding:24px"><p>This link is no longer available. Visit <a href="https://www.dglus.com" target="_top">dglus.com</a>.</p></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Engagement metrics with correct denominators. delivered = sent - bounced.
// OR = unique opens / delivered; CTR = unique clicks / delivered; CTOR = unique clicks / unique opens.
function v6AuraEngagementRates_(c) {
  var delivered = Math.max(0, Number(c.sent || 0) - Number(c.bounced || 0));
  function rate(n, d) { return n == null || !d ? null : Math.round((Number(n) / d) * 10000) / 100; }
  return { delivered: delivered, deliveredBasis: 'SENT_MINUS_BOUNCED', openRate: c.opened == null ? null : rate(c.opened, delivered), ctr: c.clicked == null ? null : rate(c.clicked, delivered), ctor: (c.clicked == null || c.opened == null) ? null : rate(c.clicked, Number(c.opened)) };
}
