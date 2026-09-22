// AURA — "Campana A - HA prioritaria" dedicated pipeline (Phase 1 activation).
//
// DGL asked AURA to work, for this first phase, with EXACTLY ONE tab (65 accounts / 227
// contacts) from the House-Account priority report, ignoring every other tab in the
// same workbook (including Campana B), and to add real per-contact ES/EN/PT language selection
// and generic-name detection that the shared, multi-source pipeline
// (MarketingV6AuraAutomation.gs, MarketingV6AuraEmailDispatcher.gs) does not need and must not
// change for every other campaign. Rather than bolt single-purpose behavior onto shared code,
// this file is a self-contained, dedicated pipeline: it reuses every existing governed primitive
// it safely can (v6AuraPolicyApproved_ for approval policy, v6AuraEmailCanonicalReplyTo_/
// v6AuraEmailValid_/v6AuraEmailAccountStopped_/v6AuraEmailJobId_/v6AuraGenerateCopy_/
// v6AuraEmailHtml_ from the email dispatcher and copy engine, v6RecipientActiveExclusion_/
// v6FrequencyStatus_ from the shared recipient-resolution/frequency engines) and adds nothing new
// to those engines except the one exclusion registered in v6AuraAutoBuildScopesForFamily_
// (MarketingV6AuraAutomation.gs) that keeps this dedicated pipeline's accounts from ALSO being
// auto-grouped by the shared, multi-source mechanism.
//
// Recipient sourcing (Pass 18, 2026-09-16): this pipeline has its OWN dedicated recipient
// resolver (v6AuraCampanaAResolveRecipients_) and does NOT call the shared v6ResolveRecipients_
// (MarketingV6RecipientResolution.gs, still used unchanged by every other campaign family). The
// shared engine sources recipients exclusively from MKT_CONTACTS_SECURE, which silently dropped
// every real, explicitly-listed tab email that had not yet synced into NOVA/the Data Hub -- a
// real production gap DGL asked fixed. See v6AuraCampanaAResolveRecipients_'s own header comment
// for the full recipientSource (CAMPANA_A_SOURCE/CONTACTS_SECURE/MERGED) model.
//
// Performance note (2026-09-16 production incident): a live run against the real ~227-contact
// audience hit Apps Script's execution-time limit (RUN_AURA_CAMPANA_A_REGENERATE_DRY_RUN ran
// 8:03:08-8:33:08). Root cause: this file's earlier version, and the shared upsert primitive
// v6UpsertByKey_ it (and v6ResolveRecipients_, v6AuraEnsureCampaignScope_,
// v6AuraGmailUpsertOpportunity_) called once PER ROW/PER CONTACT, each does a FULL re-read of its
// target sheet before writing -- O(n) per call, O(n^2) total across a loop of n against the same
// (and, for MKT_AUDIENCES/MKT_EMAIL_QUEUE/MKT_AURA_GMAIL_OPPORTUNITIES, already large and
// multi-campaign) table. Every write path in this file now reads its target table ONCE, merges
// in memory, and writes ONCE via v6BatchUpsertByKey_ (MarketingV6FrequencyControl.gs) -- see
// v6AuraCampanaAPersistSourceRows_, the opportunity-upsert loop in
// v6AuraCampanaAIngestFromSpreadsheet_, v6AuraCampanaAEnsureCampaignAndScope_ (via
// v6AuraEnsureCampaignScope_'s opt-in batchWrite), v6AuraCampanaABuildQueue_'s MKT_EMAIL_QUEUE
// write, and v6AuraCampanaAPreflight_'s suppression write. Every per-contact/per-account
// re-read of a bulk-loadable table (MKT_ACCOUNTS, MKT_CAMPAIGNS, MKT_FREQUENCY_LEDGER via
// v6ResolveRecipients_'s own preload) is now loaded once and passed through instead. A
// checkpoint/resume mechanism (Script Property CAMPANA_A_BUILD_CHECKPOINT) additionally protects
// the per-contact build loop against ever needing to fit inside one execution again, and every
// phase is timed (see v6AuraCampanaARegenerateDryRun_'s returned `profile`).

var CAMPANA_A_SHEET_NAME_ = 'Campana A - HA prioritaria';
var CAMPANA_A_CAMPAIGN_ID_ = 'CMP-CAMPANA-A-HA-PRIORITARIA';
var CAMPANA_A_SCOPE_ID_ = 'SCOPE-CAMPANA-A-HA-PRIORITARIA';

// Real-time stage markers (2026-09-16 second timeout, same ~30-minute duration as the first):
// per-stage totals returned at the END of a run are useless if the run never reaches the end --
// this logs a line the moment each stage starts and ends, so the Apps Script execution
// transcript (visible live, in the editor's execution log, while a manual run is still in
// progress) shows exactly which stage is CURRENTLY running, not just which stages already
// finished. Never throws -- logging must never mask or block the real work.
function v6AuraCampanaALog_(stage) {
  try { console.log('[AURA CAMPANA A] ' + stage + ' @ ' + new Date().toISOString()); } catch (err) { /* logging must never block the pipeline */ }
}

// --- Direct source read ------------------------------------------------------------------------
// Root cause of the 0-recipients run: this pipeline had NO direct reference to the real source
// workbook at all -- it only ever read MKT_AURA_GMAIL_OPPORTUNITIES, itself populated
// exclusively by Gmail message parsing (MarketingV6AuraGmailIngest.gs), and no matching message
// was ever successfully ingested. 'Marketing_DGL_14-09-2026' is its own standalone spreadsheet
// (confirmed via Drive metadata: a real file named exactly that, mimeType
// application/vnd.google-apps.spreadsheet, owned by the same AM lead this project's Gmail
// ingestion already watches for reports (MarketingV6AuraGmailIngest.gs) -- NOT a tab inside
// DGL_MARKETING_DATA_HUB, which is a completely different file). The Script Property below is
// the primary, always-checked-first source of truth (the filename carries a date, so a future
// reporting cycle's replacement file only requires updating this property, never a code
// redeploy); CAMPANA_A_SOURCE_SPREADSHEET_ID_DEFAULT_ is that same real, Drive-confirmed id,
// used only as a fallback so this works immediately without requiring that manual step, exactly
// mirroring the existing AURA_GMAIL_SOURCE_MAILBOX property+fallback pattern
// (MarketingV6AuraGmailIngest.gs).
var CAMPANA_A_SOURCE_SPREADSHEET_ID_PROPERTY_ = 'CAMPANA_A_SOURCE_SPREADSHEET_ID';
var CAMPANA_A_SOURCE_SPREADSHEET_ID_DEFAULT_ = '1GlYvjGKfhCWxPHoNzjEGDz--dT6t7WV4w2YAXvEXJ_c';
function v6AuraCampanaAResolveSourceSpreadsheetId_() {
  return v6AuraEmailText_(PropertiesService.getScriptProperties().getProperty(CAMPANA_A_SOURCE_SPREADSHEET_ID_PROPERTY_)) || CAMPANA_A_SOURCE_SPREADSHEET_ID_DEFAULT_;
}
// Reads the LIVE 'Campana A - HA prioritaria' tab directly from its own source spreadsheet every
// time this runs -- never a cached/emailed snapshot, never data copied into code. Reuses the
// exact same header-detection/column-parsing engine the Gmail attachment path already uses
// (v6AuraGmailParseTable_, a pure data-in/data-out function with no Gmail dependency of its own)
// so a row accepted this way is indistinguishable from one accepted via email -- one governed
// opportunity pipeline, two ways to reach it. Every write below is a single batch operation
// (v6BatchUpsertByKey_) regardless of row count -- never one Sheets round trip per row. Fails
// closed with a specific, distinguishable status at every real failure point (property unset,
// file inaccessible, tab missing, tab recognized but empty) -- never silently returns zero rows
// without saying why.
function v6AuraCampanaAIngestFromSpreadsheet_() {
  v6AuraCampanaALog_('SOURCE_READ_START');
  var t0 = Date.now();
  var spreadsheetId = v6AuraCampanaAResolveSourceSpreadsheetId_();
  if (!spreadsheetId) { v6AuraCampanaALog_('SOURCE_READ_END (SPREADSHEET_ID_NOT_CONFIGURED)'); return { status: 'SPREADSHEET_ID_NOT_CONFIGURED', spreadsheetId: '' }; }
  var ss;
  try { ss = SpreadsheetApp.openById(spreadsheetId); }
  catch (err) { v6AuraCampanaALog_('SOURCE_READ_END (SPREADSHEET_NOT_ACCESSIBLE)'); return { status: 'SPREADSHEET_NOT_ACCESSIBLE', spreadsheetId: spreadsheetId, error: String(err && err.message || err) }; }
  var sheet = ss.getSheetByName(CAMPANA_A_SHEET_NAME_);
  if (!sheet) {
    v6AuraCampanaALog_('SOURCE_READ_END (TAB_NOT_FOUND)');
    return {
      status: 'TAB_NOT_FOUND', spreadsheetId: spreadsheetId, sheetName: CAMPANA_A_SHEET_NAME_,
      availableSheets: ss.getSheets().map(function (s) { return s.getName(); })
    };
  }
  var values = sheet.getDataRange().getValues();
  var sourceReadMs = Date.now() - t0;
  v6AuraCampanaALog_('SOURCE_READ_END (' + values.length + ' rows, ' + sourceReadMs + 'ms)');
  v6AuraCampanaALog_('PARSE_START');
  var t1 = Date.now();
  // Diagnostic ground truth FIRST, independent of whether v6AuraGmailParseTable_ recognizes the
  // layout below -- every real row, every real header name, persisted before any accept/reject
  // decision, so "what does the tab actually contain" never depends on guessing.
  var sourceRows = v6AuraCampanaAParseSourceRows_(values);
  if (sourceRows.status === 'OK') v6AuraCampanaAPersistSourceRows_(sourceRows.rows);
  var ctx = { messageId: 'DIRECT_SPREADSHEET_READ:' + spreadsheetId, receivedAt: new Date().toISOString(), sourceFile: 'Marketing_DGL_14-09-2026' };
  var parsed = v6AuraGmailParseTable_(CAMPANA_A_SHEET_NAME_, values, ctx);
  if (!parsed || parsed.unrecognizedLayout) {
    v6AuraCampanaALog_('PARSE_END (TAB_EMPTY_OR_UNRECOGNIZED_LAYOUT)');
    return { status: 'TAB_EMPTY_OR_UNRECOGNIZED_LAYOUT', spreadsheetId: spreadsheetId, sheetName: CAMPANA_A_SHEET_NAME_, rowsInSheet: values.length, headersFound: sourceRows.headers, profile: { SOURCE_READ_MS: sourceReadMs, PARSE_MS: Date.now() - t1 } };
  }
  // Every candidate's row shape is computed in memory (v6AuraGmailBuildOpportunityRow_, pure, no
  // I/O -- MarketingV6AuraGmailIngest.gs) and written in ONE batch call, instead of one
  // v6AuraGmailUpsertOpportunity_ call per candidate (each its own full-table read-to-check +
  // full-table read-to-upsert). Multiple rows for the same account still collapse to one
  // opportunity, last row wins -- v6BatchUpsertByKey_ preserves that exact semantic for records
  // sharing a key within the same batch.
  var existingOppIds = {};
  v6Rows_('MKT_AURA_GMAIL_OPPORTUNITIES').forEach(function (r) { existingOppIds[v6AuraEmailText_(r.opportunityId)] = true; });
  var opportunityRows = parsed.accepted.map(function (candidate) { return v6AuraGmailBuildOpportunityRow_(candidate, ctx); });
  var created = 0, updated = 0;
  var uniqueOppIdsInBatch = {};
  opportunityRows.forEach(function (row) {
    var isNewOverall = !existingOppIds[row.opportunityId] && !uniqueOppIdsInBatch[row.opportunityId];
    uniqueOppIdsInBatch[row.opportunityId] = true;
    if (isNewOverall) created++; else updated++;
  });
  if (opportunityRows.length) v6BatchUpsertByKey_('MKT_AURA_GMAIL_OPPORTUNITIES', ['opportunityId'], opportunityRows);
  var contactColumnsFound = sourceRows.rows.filter(function (r) { return r.contactName || r.email; }).length;
  var countryColumnFound = sourceRows.rows.filter(function (r) { return r.country; }).length;
  v6AuraCampanaALog_('PARSE_END (' + parsed.accepted.length + ' accepted, ' + (Date.now() - t1) + 'ms)');
  return {
    status: parsed.accepted.length ? 'OK' : 'TAB_FOUND_BUT_ZERO_ACCEPTED_ROWS',
    spreadsheetId: spreadsheetId, sheetName: CAMPANA_A_SHEET_NAME_, rowsInSheet: values.length,
    headersFound: sourceRows.headers,
    rowsParsed: parsed.rowCount, accepted: parsed.accepted.length, rejected: parsed.rejected.length,
    created: created, updated: updated,
    sourceRowsCaptured: sourceRows.rows.length, rowsWithContactOrEmail: contactColumnsFound, rowsWithCountry: countryColumnFound,
    profile: { SOURCE_READ_MS: sourceReadMs, PARSE_MS: Date.now() - t1 }
  };
}

// --- Raw per-row capture (diagnostic ground truth, never guessed) ---------------------------
// v6AuraGmailParseTable_ treats every recognized tab as ONE ROW = ONE ACCOUNT (accountName +
// amOwner only) -- correct for the account-level worklist tabs it was built for, but if
// 'Campana A - HA prioritaria' actually carries per-contact columns (email, contact name,
// country/market) on each row, that data is read into memory (getDataRange already returns
// every column) but then silently discarded, since v6AuraGmailParseTable_ never looks at it and
// multiple rows for the same account collapse into one upserted opportunity (last row wins).
// This never assumes an exact header name: it checks each field against several real, plausible
// spellings and only accepts a value under a header that is ACTUALLY present in the tab, so the
// diagnostic below reports the true header names and true coverage instead of a guess.
var CAMPANA_A_CONTACT_NAME_HEADERS_ = ['Contacto', 'Contact', 'Contact Name', 'Nombre', 'Nombre Contacto', 'Nombre del Contacto', 'Nombre y Apellido', 'First Name'];
var CAMPANA_A_EMAIL_HEADERS_ = ['Email', 'E-mail', 'Correo', 'Correo Electronico', 'Correo Electrónico', 'Email Contacto', 'Contact Email'];
var CAMPANA_A_COUNTRY_HEADERS_ = ['País', 'Pais', 'Country', 'Mercado', 'Market', 'Region', 'Región'];
function v6AuraCampanaAFindField_(rowObject, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    if (Object.prototype.hasOwnProperty.call(rowObject, candidates[i])) {
      var v = v6AuraEmailText_(rowObject[candidates[i]]);
      if (v) return { header: candidates[i], value: v };
    }
  }
  return null;
}
// Reuses v6AuraGmailFindHeaderRow_/v6AuraGmailRowObject_ (MarketingV6AuraGmailIngest.gs, pure
// data-in/data-out utilities, no Gmail dependency) to get the real header row and one object per
// data row, then captures EVERY row -- not just the ones v6AuraGmailParseTable_ would accept --
// so nothing from the real tab is ever silently lost before it can even be inspected.
function v6AuraCampanaAParseSourceRows_(values) {
  var headerRowIdx = v6AuraGmailFindHeaderRow_(values);
  if (headerRowIdx < 0) return { status: 'UNRECOGNIZED_LAYOUT', headers: [], rows: [] };
  var headers = values[headerRowIdx].map(v6AuraEmailText_);
  var dataRows = values.slice(headerRowIdx + 1).filter(function (r) { return r.some(function (v) { return v6AuraEmailText_(v) !== ''; }); });
  var rows = dataRows.map(function (row, i) {
    var r = v6AuraGmailRowObject_(headers, row);
    var contactField = v6AuraCampanaAFindField_(r, CAMPANA_A_CONTACT_NAME_HEADERS_);
    var emailField = v6AuraCampanaAFindField_(r, CAMPANA_A_EMAIL_HEADERS_);
    var countryField = v6AuraCampanaAFindField_(r, CAMPANA_A_COUNTRY_HEADERS_);
    return {
      sourceRow: headerRowIdx + 2 + i,
      accountName: v6AuraEmailText_(r['Cuenta']),
      amOwner: v6AuraEmailText_(r['Account Owner']) || v6AuraEmailText_(r['Agente responsable (Sales Rep Actual)']),
      contactName: contactField ? contactField.value : '', contactNameHeader: contactField ? contactField.header : '',
      email: emailField ? emailField.value : '', emailHeader: emailField ? emailField.header : '',
      country: countryField ? countryField.value : '', countryHeader: countryField ? countryField.header : ''
    };
  });
  return { status: 'OK', headers: headers, rows: rows };
}
var MKT_AURA_CAMPANA_A_SOURCE_ROWS_SCHEMA_ = ['sourceRow', 'accountName', 'amOwner', 'contactName', 'contactNameHeader', 'email', 'emailHeader', 'country', 'countryHeader', 'capturedAt'];
function v6AuraCampanaAEnsureSourceRowsSheet_() { return v6AcqEnsureSheet_('MKT_AURA_CAMPANA_A_SOURCE_ROWS', MKT_AURA_CAMPANA_A_SOURCE_ROWS_SCHEMA_); }
// ONE batch read+merge+write (v6BatchUpsertByKey_) for every captured row, instead of one
// v6UpsertByKey_ call per row -- each of which used to re-read this same, growing table from
// scratch. Same idempotent key (sourceRow) and same capturedAt stamping as before.
function v6AuraCampanaAPersistSourceRows_(rows) {
  v6AuraCampanaAEnsureSourceRowsSheet_();
  if (!rows.length) return { created: 0, updated: 0 };
  var now = new Date().toISOString();
  var records = rows.map(function (r) { return Object.assign({}, r, { capturedAt: now }); });
  return v6BatchUpsertByKey_('MKT_AURA_CAMPANA_A_SOURCE_ROWS', ['sourceRow'], records);
}

// --- Deterministic account-name normalization (matching only, never fuzzy) -------------------
// Strips punctuation, collapses whitespace, and removes a fixed, explicit list of common
// corporate suffixes -- never a similarity/edit-distance guess that could match two different
// real companies. Two different real accounts NEVER share a normalized name just because they
// happen to have similar words; this only removes noise a real NOVA extract and a real
// human-typed report legitimately spell differently for the exact same company (e.g. "Progeral
// Corp" vs "Progeral" vs "PROGERAL, CORP.").
var CAMPANA_A_CORP_SUFFIX_RE_ = /\b(corp(oration)?|inc(orporated)?|llc|ltda?|s\.?a\.?(\s*de\s*c\.?v\.?)?|s\.?a\.?s\.?|co(mpany)?)\.?\s*$/i;
function v6AuraCampanaANormalizeAccountName_(name) {
  var n = String(name || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  var stripped = n.replace(CAMPANA_A_CORP_SUFFIX_RE_, '').replace(/\s+/g, ' ').trim();
  return stripped || n;
}

// --- Dedicated-account registry ---------------------------------------------------------------
// Read by v6AuraAutoBuildScopesForFamily_ (MarketingV6AuraAutomation.gs, typeof-guarded) so
// these accounts are excluded from the shared, multi-source family scope-builder. Written
// generically (a map of every account any dedicated pipeline currently owns) so a future second
// dedicated pipeline can extend this same function without another change to the shared engine.
function v6AuraCampanaAAccountMap_() {
  var map = {};
  v6Rows_('MKT_AURA_GMAIL_OPPORTUNITIES').forEach(function (r) {
    if (v6AuraEmailText_(r.sourceSheet) === CAMPANA_A_SHEET_NAME_) map[v6AuraEmailText_(r.accountId)] = r;
  });
  return map;
}

// --- Match report: data-quality / NOVA-sync-coverage diagnostic, NOT a recipient gate -----------
// Compares the real, captured source rows (MKT_AURA_CAMPANA_A_SOURCE_ROWS -- written by
// v6AuraCampanaAIngestFromSpreadsheet_ from the actual tab, before any accept/reject decision)
// against the real MKT_ACCOUNTS/MKT_CONTACTS_SECURE tables, reporting exact counts and exact
// unmatched names/emails -- never a percentage guess. Matches an account by the existing
// hash-derived accountId first (v6AuraGmailOpportunityId_'s scheme, already the join key
// v6AuraCampanaAAccountMap_ depends on), then, if that misses, by the deterministic normalized
// name (accounts for legitimate spelling differences like a missing/extra "Corp" -- never a
// fuzzy/similarity match that could conflate two different real companies). Read-only, O(1)
// full-table reads (each table read exactly once) -- never called per-contact.
// Pass 18: an "unmatched" email/account here means "not yet synced into NOVA/MKT_CONTACTS_SECURE"
// -- it is a real, useful sync-coverage signal for DGL, but it no longer means "excluded from the
// campaign." v6AuraCampanaAResolveRecipients_ includes every valid tab email as a candidate
// regardless of what this report finds (see recipientSource: CAMPANA_A_SOURCE on the resulting
// job). Use v6AuraCampanaAAudit_'s byRecipientSource / excludedByReason for actual campaign
// inclusion/exclusion counts.
function v6AuraCampanaAMatchReport_() {
  var sourceRows = v6Rows_('MKT_AURA_CAMPANA_A_SOURCE_ROWS');
  var accountMap = v6AuraCampanaAAccountMap_();
  var accounts = v6Rows_('MKT_ACCOUNTS');
  var accountsById = {}; accounts.forEach(function (a) { accountsById[v6AuraEmailText_(a.accountId)] = a; });
  var accountsByNormalizedName = {};
  accounts.forEach(function (a) { accountsByNormalizedName[v6AuraCampanaANormalizeAccountName_(a.accountName)] = a; });
  var contactsByAccountId = {};
  v6Rows_('MKT_CONTACTS_SECURE').forEach(function (c) {
    var id = v6AuraEmailText_(c.accountId);
    (contactsByAccountId[id] = contactsByAccountId[id] || []).push(c);
  });

  var uniqueSourceAccountNames = {};
  sourceRows.forEach(function (r) { if (r.accountName) uniqueSourceAccountNames[r.accountName] = true; });
  var matchedAccounts = [], unmatchedAccounts = [];
  Object.keys(uniqueSourceAccountNames).forEach(function (name) {
    var accountId = null;
    Object.keys(accountMap).forEach(function (id) { if (v6AuraEmailText_(accountMap[id].accountName) === name) accountId = id; });
    var byId = accountId && accountsById[accountId];
    var byName = accountsByNormalizedName[v6AuraCampanaANormalizeAccountName_(name)];
    if (byId || byName) {
      matchedAccounts.push({ accountName: name, accountId: accountId || (byName && byName.accountId), matchedVia: byId ? 'ACCOUNT_ID' : 'NORMALIZED_NAME' });
    } else {
      unmatchedAccounts.push({ accountName: name, accountId: accountId || '', reason: accountId ? 'ACCOUNT_ID_NOT_IN_MKT_ACCOUNTS' : 'NO_ACCOUNT_ID_DERIVED' });
    }
  });

  var contactsWithEmail = sourceRows.filter(function (r) { return r.email; });
  var matchedContacts = [], unmatchedContacts = [];
  contactsWithEmail.forEach(function (r) {
    var accountId = null;
    Object.keys(accountMap).forEach(function (id) { if (v6AuraEmailText_(accountMap[id].accountName) === r.accountName) accountId = id; });
    var candidates = (accountId && contactsByAccountId[accountId]) || [];
    var found = candidates.filter(function (c) { return v6AuraEmailText_(c.email).toLowerCase() === r.email.toLowerCase(); })[0];
    if (found) matchedContacts.push({ email: r.email, accountName: r.accountName, contactId: found.contactId });
    else unmatchedContacts.push({ email: r.email, accountName: r.accountName, reason: accountId ? (candidates.length ? 'EMAIL_NOT_FOUND_AMONG_ACCOUNT_CONTACTS' : 'NO_CONTACTS_SECURE_ROWS_FOR_ACCOUNT') : 'ACCOUNT_NOT_MATCHED' });
  });

  return {
    sourceRowCount: sourceRows.length,
    sourceAccountCount: Object.keys(uniqueSourceAccountNames).length,
    accountsMatched: matchedAccounts.length, accountsUnmatched: unmatchedAccounts.length, unmatchedAccounts: unmatchedAccounts,
    sourceContactCount: contactsWithEmail.length,
    contactsMatched: matchedContacts.length, contactsUnmatched: unmatchedContacts.length, unmatchedContacts: unmatchedContacts,
    tabProvidesContactColumns: contactsWithEmail.length > 0
  };
}
// --- Real-account resolution: closes the actual recipient gap ---------------------------------
// The hash-derived accountId (v6AuraGmailOpportunityId_'s scheme) only matches MKT_ACCOUNTS when
// the account name is byte-identical between the tab and NOVA. Root cause of the 170/227
// recipient gap: any account whose name differs even by a legitimate spelling variant (a missing
// "Corp"/"Inc" suffix, punctuation, casing) NEVER matches, so v6ResolveRecipients_ finds zero
// MKT_CONTACTS_SECURE rows for it and every one of its real contacts is silently dropped. This
// resolves the REAL MKT_ACCOUNTS.accountId to use for scope-building: the hash id first (exact,
// unchanged behavior when it already matches), falling back to the SAME deterministic normalized
// name used by v6AuraCampanaAMatchReport_ (never fuzzy -- never matches two different real
// companies) only when the hash id itself is not a real MKT_ACCOUNTS row. When neither resolves,
// the hash id is returned unchanged (safe, inert -- v6ResolveRecipients_ simply finds no contacts
// for it, exactly as before this fix, and it shows up in the match report as unmatched).
// `preloadedAccounts` (optional) lets a caller resolving many accounts in one pass (every real
// caller in this file) share ONE v6Rows_('MKT_ACCOUNTS') read instead of one fresh read per
// account -- omit it and this reads fresh, exactly as before.
function v6AuraCampanaARealAccountId_(hashAccountId, accountName, preloadedAccounts) {
  var accounts = preloadedAccounts || v6Rows_('MKT_ACCOUNTS');
  var direct = accounts.filter(function (a) { return v6AuraEmailText_(a.accountId) === hashAccountId; })[0];
  if (direct) return hashAccountId;
  var normalized = v6AuraCampanaANormalizeAccountName_(accountName);
  var byName = accounts.filter(function (a) { return v6AuraCampanaANormalizeAccountName_(a.accountName) === normalized; })[0];
  return byName ? v6AuraEmailText_(byName.accountId) : hashAccountId;
}
// Every account this dedicated pipeline touches, under EITHER identity (the hash id it was
// detected under, and the real MKT_ACCOUNTS id it resolves to) -- so the shared family
// scope-builder's exclusion never misses an account just because the two ids differ. Reads
// MKT_ACCOUNTS exactly once regardless of how many dedicated accounts exist.
function v6AuraDedicatedAccountIds_() {
  var out = {};
  var accountMap = v6AuraCampanaAAccountMap_();
  var accounts = v6Rows_('MKT_ACCOUNTS');
  Object.keys(accountMap).forEach(function (hashId) {
    out[hashId] = true;
    out[v6AuraCampanaARealAccountId_(hashId, accountMap[hashId].accountName, accounts)] = true;
  });
  return out;
}

// --- Name reliability --------------------------------------------------------------------------
// Denylist matches the exact examples DGL gave (Pricing Team, Sales Team, Correo Corporativo,
// Imports, Operations) plus a few equally generic role/mailbox labels already seen in this
// codebase's own contact data conventions. Fails closed to "no name" (never a guess) whenever a
// value looks like a role, a department, a mailbox alias, or is empty -- matching the exact
// output DGL expects ("¿Tiene un movimiento en puerta?", never a fabricated "Team, ..." greeting).
var CAMPANA_A_GENERIC_NAME_DENYLIST_ = [
  'pricing team', 'sales team', 'correo corporativo', 'imports', 'operations',
  'team', 'equipo', 'admin', 'administracion', 'administración', 'info', 'support', 'soporte',
  'accounting', 'contabilidad', 'billing', 'facturacion', 'facturación',
  'customer service', 'servicio al cliente', 'logistics', 'logistica', 'logística',
  'imports team', 'operations team', 'accounts payable', 'accounts receivable'
];
function v6AuraCampanaANameReliable_(name) {
  var n = v6AuraEmailText_(name);
  if (!n) return '';
  if (/@/.test(n)) return '';
  var norm = n.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return '';
  if (CAMPANA_A_GENERIC_NAME_DENYLIST_.indexOf(norm) >= 0) return '';
  // A single all-caps token of 5+ letters reads as a department/system label (IMPORTS,
  // OPERATIONS) rather than a human name -- fail closed rather than guess.
  if (/^[A-Z]{5,}$/.test(n.trim())) return '';
  return n;
}

// --- Country -> language ------------------------------------------------------------------------
// Exactly the mapping DGL specified: Brazil -> PT; the named Spanish-speaking LATAM markets (plus
// the other, equally Spanish-speaking LATAM countries already implied by "y demás LATAM
// hispanohablante") -> ES; USA/Canada (and any other non-Spanish-speaking market) -> EN. Common
// English/Spanish/Portuguese spellings and ISO-3166 alpha-2 codes are included so a real country
// value in any of those forms resolves correctly; an unmapped value returns '' so the caller
// falls back to EN exactly as specified, never a guess.
var CAMPANA_A_COUNTRY_LANGUAGE_ = {
  BRAZIL: 'PT', BRASIL: 'PT', BR: 'PT',
  MEXICO: 'ES', 'MÉXICO': 'ES', MX: 'ES',
  COLOMBIA: 'ES', CO: 'ES',
  ECUADOR: 'ES', EC: 'ES',
  PERU: 'ES', 'PERÚ': 'ES', PE: 'ES',
  PARAGUAY: 'ES', PY: 'ES',
  'COSTA RICA': 'ES', CR: 'ES',
  'EL SALVADOR': 'ES', SV: 'ES',
  PANAMA: 'ES', 'PANAMÁ': 'ES', PA: 'ES',
  ARGENTINA: 'ES', AR: 'ES',
  CHILE: 'ES', CL: 'ES',
  GUATEMALA: 'ES', GT: 'ES',
  HONDURAS: 'ES', HN: 'ES',
  NICARAGUA: 'ES', NI: 'ES',
  BOLIVIA: 'ES', BO: 'ES',
  'REPUBLICA DOMINICANA': 'ES', 'REPÚBLICA DOMINICANA': 'ES', 'DOMINICAN REPUBLIC': 'ES', DO: 'ES',
  VENEZUELA: 'ES', VE: 'ES',
  URUGUAY: 'ES', UY: 'ES',
  'UNITED STATES': 'EN', 'ESTADOS UNIDOS': 'EN', 'UNITED STATES OF AMERICA': 'EN', USA: 'EN', US: 'EN',
  CANADA: 'EN', 'CANADÁ': 'EN', CA: 'EN'
};
function v6AuraCountryToLanguage_(country) {
  var key = v6AuraEmailText_(country).toUpperCase();
  return key ? (CAMPANA_A_COUNTRY_LANGUAGE_[key] || '') : '';
}
// A real contact-level "language" field found in this codebase's own NOVA import bridge
// (MarketingImport.js, MKT_IMPORT_SHEETS.contacts.optional) may be populated in full-word or
// locale-tag form ('Spanish'/'Español'/'es-MX') rather than the bare 'ES'/'EN'/'PT' this
// pipeline stores -- normalizing common real-world spellings here means a genuine signal in any
// of those forms is honored instead of silently falling through to a country guess or the EN
// fallback just because of formatting.
var CAMPANA_A_LANGUAGE_VALUE_MAP_ = {
  ES: 'ES', ESP: 'ES', SPANISH: 'ES', ESPANOL: 'ES', 'ESPAÑOL': 'ES', 'ES-ES': 'ES', 'ES-MX': 'ES', 'ES-CO': 'ES', 'ES-US': 'ES', 'ES-419': 'ES',
  EN: 'EN', ENG: 'EN', ENGLISH: 'EN', INGLES: 'EN', 'INGLÉS': 'EN', 'EN-US': 'EN', 'EN-GB': 'EN', 'EN-CA': 'EN',
  PT: 'PT', POR: 'PT', PORTUGUESE: 'PT', PORTUGUES: 'PT', 'PORTUGUÊS': 'PT', 'PT-BR': 'PT', 'PT-PT': 'PT'
};
function v6AuraCampanaANormalizeLanguageValue_(value) {
  var key = v6AuraEmailText_(value).toUpperCase();
  return key ? (CAMPANA_A_LANGUAGE_VALUE_MAP_[key] || '') : '';
}
// Priority: (1) an existing reliable LANGUAGE signal already on the contact record (several
// plausible column names AND several plausible value spellings, both real -- see above); (2)
// the country column already present on 'Campana A - HA prioritaria' itself, when that tab
// provides one -- DGL's own instruction is to use it directly as the primary country source for
// this campaign, since it is the most current, campaign-specific data; (3) a country column on
// the matched MKT_CONTACTS_SECURE/MKT_ACCOUNTS record, several plausible spellings, as a second
// fallback; (4) EN, and only EN, when nothing above resolves -- never a guess beyond what is
// actually present. Every decision returns WHY (languageSource/languageReason) so this can be
// audited per contact instead of trusted blindly.
function v6AuraCampanaAPreferredLanguage_(contact, account, tabCountry) {
  var c = contact || {}, a = account || {};
  var explicit = v6AuraCampanaANormalizeLanguageValue_(c.preferredLanguage || c.language || c.Idioma || c.idioma || c.Language);
  if (explicit) {
    return { language: explicit, source: 'CONTACT_EXPLICIT_SIGNAL', reason: 'MKT_CONTACTS_SECURE contact-level language field already resolves to ' + explicit };
  }
  var tabCountryText = v6AuraEmailText_(tabCountry);
  if (tabCountryText) {
    var byTabCountry = v6AuraCountryToLanguage_(tabCountryText);
    if (byTabCountry) return { language: byTabCountry, source: 'CAMPANA_A_TAB_COUNTRY', reason: "'Campana A - HA prioritaria' row country = '" + tabCountryText + "'" };
  }
  var recordCountry = v6AuraEmailText_(c.country || c.Country || c['país'] || c.pais || a.country || a.Country || a['país'] || a.pais);
  if (recordCountry) {
    var byRecordCountry = v6AuraCountryToLanguage_(recordCountry);
    if (byRecordCountry) return { language: byRecordCountry, source: 'CONTACT_OR_ACCOUNT_COUNTRY', reason: "MKT_CONTACTS_SECURE/MKT_ACCOUNTS country = '" + recordCountry + "'" };
    return { language: 'EN', source: 'EN_FALLBACK_UNMAPPED_COUNTRY', reason: "country value '" + recordCountry + "' (tab: '" + tabCountryText + "') did not match the known country->language map" };
  }
  if (tabCountryText) return { language: 'EN', source: 'EN_FALLBACK_UNMAPPED_COUNTRY', reason: "tab country '" + tabCountryText + "' did not match the known country->language map" };
  return { language: 'EN', source: 'EN_FALLBACK_NO_SIGNAL', reason: 'no contact-level language signal, no Campana A tab country, no MKT_CONTACTS_SECURE/MKT_ACCOUNTS country found under any checked field name' };
}
function v6AuraCampanaALanguageCampaignFlag_(lang) {
  return lang === 'EN' ? 'English' : lang === 'PT' ? 'Português (Brasil)' : 'Spanish';
}

// --- No-name-aware subject merge -----------------------------------------------------------
// Every AURA copy template (including the Activation templates this dedicated Campana A
// pipeline actually generates via v6AuraGenerateCopy_) has its ONLY use of {{firstName}} as a leading
// "{{firstName}}, ..." subject clause (MarketingV6AuraCopyEngine.gs) -- headline/body/body2/
// preheader never reference it. So a name-aware subject only needs to handle that one real
// pattern: with no reliable name, drop the "{{firstName}}, " prefix and capitalize what follows
// (this pipeline's real Activation subject, e.g. "Sofia, ¿tiene un movimiento Multiservicio en
// puerta?" -> "¿tiene un movimiento Multiservicio en puerta?" -- capitalization has no visible
// effect here since the character right after the comma is the accented "¿", which has no
// uppercase form), instead of ever sending a fabricated "Team,".
function v6AuraCampanaASubject_(template, vars) {
  var v = vars || {};
  if (v.firstName) return v6AuraEmailMergeTokens_(template, v);
  var m = String(template || '').match(/^\{\{firstName\}\},\s*(.)([\s\S]*)$/);
  if (m) return m[1].toUpperCase() + v6AuraEmailMergeTokens_(m[2], v);
  // Defensive fallback for a future template that doesn't lead with "{{firstName}}, ".
  var merged = v6AuraEmailMergeTokens_(template, Object.assign({}, v, { firstName: '' })).replace(/^,\s*/, '');
  return merged.replace(/^./, function (ch) { return ch.toUpperCase(); });
}

// --- Campaign + scope (idempotent) ----------------------------------------------------------
// `preloadedAccounts` (optional) lets v6AuraCampanaABuildQueue_ share the ONE MKT_ACCOUNTS read
// it already needs for its own account/contact maps, instead of this function doing its own
// fresh read on top. Also returns realIdByHashId so the caller never needs to re-derive the same
// real-account-id mapping a second time right after this call returns.
function v6AuraCampanaAEnsureCampaignAndScope_(preloadedAccounts) {
  var accountMap = v6AuraCampanaAAccountMap_();
  var accounts = preloadedAccounts || v6Rows_('MKT_ACCOUNTS');
  // Scope by the REAL MKT_ACCOUNTS id (falls back to the hash id only when no real account
  // resolves at all) so v6ResolveRecipients_ joins against the actual contact records instead of
  // an id that only matches when the tab's spelling happens to be byte-identical to NOVA's.
  var realIdByHashId = {};
  Object.keys(accountMap).filter(Boolean).forEach(function (hashId) {
    realIdByHashId[hashId] = v6AuraCampanaARealAccountId_(hashId, accountMap[hashId].accountName, accounts);
  });
  var realIdSet = {};
  Object.keys(realIdByHashId).forEach(function (hashId) { realIdSet[realIdByHashId[hashId]] = true; });
  var accountIds = Object.keys(realIdSet);
  var now = new Date().toISOString();
  v6UpsertByKey_('MKT_CAMPAIGNS', ['campaignId'], {
    campaignId: CAMPANA_A_CAMPAIGN_ID_, scopeId: CAMPANA_A_SCOPE_ID_,
    campaignName: 'Activation Prioritaria - Campana A (HA)', campaignType: 'Activation', objective: 'Activation',
    service: 'Multiservicio', amOwner: 'Multiple', language: 'Spanish', status: 'AUTO_ACTIVE',
    createdAt: now, updatedAt: now
  });
  v6AuraEnsureCampaignScope_({
    scopeId: CAMPANA_A_SCOPE_ID_, campaignId: CAMPANA_A_CAMPAIGN_ID_,
    opportunityType: 'Activation', campaignType: 'Activation', accountIds: accountIds, batchWrite: true
  });
  return { accountIds: accountIds, count: accountIds.length, accountMap: accountMap, realIdByHashId: realIdByHashId };
}

// --- Governed override: a stale, cross-family historical response must not block Activation
// forever -----------------------------------------------------------------------------------
// Explicit, narrow, and logged -- never a general relaxation of stopOnResponse. CLOSED /
// SUPPRESSED and an ongoing/successful relationship (LOAD / REACTIVATED, RETAINED / EXPANDED)
// are NEVER overridable -- those are real, current outcomes this pipeline must always respect.
// Only RESPONDED / RFQ RECEIVED / QUOTED / COOLDOWN-NURTURE are even eligible, and only when
// ALL of the following are true: the prior campaign's real objective/campaignType (looked up
// from MKT_CAMPAIGNS, never guessed) is a DIFFERENT family than Activation; a real timestamp
// exists to evaluate age against; and that timestamp is older than
// CAMPANA_A_STALE_RESPONSE_OVERRIDE_DAYS_ (90 -- a deliberately separate, explicit constant from
// the unrelated 30-day SEND-frequency cap in MarketingV6FrequencyControl.gs; this one measures
// response/engagement staleness, not send pressure). Every decision -- overridden or not -- is
// captured onto the job (stopOverrideApplied/stopOverrideReason) so it is auditable per account,
// never a silent behavior change. `preloadedCampaigns` (optional) lets the per-contact build loop
// share ONE MKT_CAMPAIGNS read instead of one fresh read per STOPPED contact.
var CAMPANA_A_STALE_RESPONSE_OVERRIDE_DAYS_ = 90;
var CAMPANA_A_STALE_OVERRIDE_ELIGIBLE_STAGES_ = ['RESPONDED', 'RFQ RECEIVED', 'QUOTED', 'COOLDOWN / NURTURE'];
function v6AuraCampanaAPriorCampaignFamily_(campaignId, preloadedCampaigns) {
  if (!campaignId) return '';
  var campaigns = preloadedCampaigns || v6Rows_('MKT_CAMPAIGNS');
  var row = campaigns.filter(function (c) { return v6AuraEmailText_(c.campaignId) === campaignId; })[0];
  if (!row) return '';
  return v6AuraEmailText_(row.objective || row.campaignType).toUpperCase();
}
function v6AuraCampanaAStopOverrideCheck_(currentStage, pipelineRow, preloadedCampaigns) {
  var p = pipelineRow || {};
  if (currentStage === 'CLOSED / SUPPRESSED') return { overridable: false, reason: 'HARD_STOP_CLOSED_SUPPRESSED' };
  if (CAMPANA_A_STALE_OVERRIDE_ELIGIBLE_STAGES_.indexOf(currentStage) < 0) return { overridable: false, reason: 'STAGE_NOT_ELIGIBLE_FOR_OVERRIDE' };
  var priorFamily = v6AuraCampanaAPriorCampaignFamily_(v6AuraEmailText_(p.campaignId), preloadedCampaigns);
  if (priorFamily === 'ACTIVATION') return { overridable: false, reason: 'SAME_FAMILY_ACTIVATION_STILL_ACTIVE' };
  if (!priorFamily) return { overridable: false, reason: 'PRIOR_CAMPAIGN_FAMILY_UNKNOWN' };
  var at = v6AuraEmailText_(p.responseAt || p.enteredStageAt);
  var atDate = at ? new Date(at) : null;
  if (!at || !atDate || isNaN(atDate.getTime())) return { overridable: false, reason: 'NO_TIMESTAMP_TO_EVALUATE_AGE' };
  var ageDays = Math.floor((Date.now() - atDate.getTime()) / 86400000);
  if (ageDays < CAMPANA_A_STALE_RESPONSE_OVERRIDE_DAYS_) return { overridable: false, reason: 'RESPONSE_NOT_YET_STALE', ageDays: ageDays };
  return { overridable: true, reason: 'STALE_CROSS_FAMILY_RESPONSE', ageDays: ageDays, priorFamily: priorFamily };
}

// --- Checkpoint/resume: the per-contact build loop is no longer expected to ever need this
// (the O(n^2) writes that caused the real 30-minute timeout are gone), but AURA must never again
// depend on fitting one full run inside a single Apps Script execution -- this is the safety net.
// State lives in a Script Property (survives across separate executions); a checkpoint is only
// ever trusted when it was taken against the SAME campaign and the SAME total recipient count --
// otherwise (source data changed since) this starts over from zero, which is always safe because
// every job write below is keyed by a deterministic, idempotent jobId (already-built jobs are
// skipped, never duplicated) regardless of where the loop resumes from. -------------------------
var CAMPANA_A_BUILD_CHECKPOINT_PROPERTY_ = 'CAMPANA_A_BUILD_CHECKPOINT';
var CAMPANA_A_BUILD_TIME_BUDGET_MS_PROPERTY_ = 'CAMPANA_A_BUILD_TIME_BUDGET_MS';
var CAMPANA_A_BUILD_TIME_BUDGET_DEFAULT_MS_ = 270000; // 4.5 minutes -- safety margin under Apps Script's common 6-minute execution ceiling.
// An explicitly configured budget (including 0 or negative, e.g. for a deterministic test or an
// operator forcing an immediate checkpoint-only pass) is always honored; only a genuinely unset
// property falls back to the safe default.
function v6AuraCampanaABuildTimeBudgetMs_() {
  var stored = PropertiesService.getScriptProperties().getProperty(CAMPANA_A_BUILD_TIME_BUDGET_MS_PROPERTY_);
  if (stored === null || stored === '') return CAMPANA_A_BUILD_TIME_BUDGET_DEFAULT_MS_;
  var raw = Number(stored);
  return isNaN(raw) ? CAMPANA_A_BUILD_TIME_BUDGET_DEFAULT_MS_ : raw;
}
function v6AuraCampanaAReadBuildCheckpoint_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CAMPANA_A_BUILD_CHECKPOINT_PROPERTY_);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}
function v6AuraCampanaASaveBuildCheckpoint_(state) {
  PropertiesService.getScriptProperties().setProperty(CAMPANA_A_BUILD_CHECKPOINT_PROPERTY_, JSON.stringify(state));
}
function v6AuraCampanaAClearBuildCheckpoint_() {
  PropertiesService.getScriptProperties().deleteProperty(CAMPANA_A_BUILD_CHECKPOINT_PROPERTY_);
}

// --- Recipient resolution: the Campana A tab is the PRIMARY source of recipients ---------------
// Root cause of the real recipient gap found in production (2026-09-16, after the performance
// fix finally let a run complete): the shared v6ResolveRecipients_ engine
// (MarketingV6RecipientResolution.gs) sources recipients EXCLUSIVELY from MKT_CONTACTS_SECURE --
// a real, explicitly-listed, well-formed email on 'Campana A - HA prioritaria' that has not yet
// synced into NOVA/the Data Hub was silently dropped, surfaced only as a diagnostic
// (v6AuraCampanaAMatchReport_'s EMAIL_NOT_FOUND_AMONG_ACCOUNT_CONTACTS /
// NO_CONTACTS_SECURE_ROWS_FOR_ACCOUNT), never as an actual recipient. Per DGL's explicit
// instruction, this dedicated pipeline no longer calls the shared v6ResolveRecipients_ at all:
// the real, captured tab rows (MKT_AURA_CAMPANA_A_SOURCE_ROWS, written by
// v6AuraCampanaAIngestFromSpreadsheet_ from 'Marketing_DGL_14-09-2026', the authoritative current
// commercial source for this campaign) are now the PRIMARY recipient source.
// MKT_CONTACTS_SECURE/MKT_ACCOUNTS are used to ENRICH (firstName/country/language signal/account
// ownership) and to GOVERN (DNC, exclusion, frequency, stopOnResponse via the pipeline stage
// check already in the build loop) -- never to gate whether a valid, explicitly-listed tab email
// becomes a candidate at all.
//
// Reproduces every governed check the shared engine performs -- DNC, strict email-FORMAT
// validation (v6AuraEmailValid_, unchanged), active exclusion (v6RecipientActiveExclusion_,
// unchanged, pure), frequency cap (v6FrequencyStatus_, unchanged) -- against a MERGED candidate
// list instead of an MKT_CONTACTS_SECURE-only one:
//   - MERGED: the tab's email exactly (case-insensitive, NEVER fuzzy) matches an
//     MKT_CONTACTS_SECURE email for the SAME real account -- firstName/DNC/emailStatus enrich
//     from the matched MKT_CONTACTS_SECURE row (preferred, since it is the more governed record)
//     falling back to the tab's own contactName only when MKT_CONTACTS_SECURE's is empty.
//   - CAMPANA_A_SOURCE: the email exists on the tab only -- this pipeline's own required
//     CONTACT_SOURCE_ONLY marker. Still a full, real candidate: never dropped for lack of a NOVA
//     sync, never given a fabricated DNC/exclusion signal it does not actually have (account-level
//     exclusions/frequency/pipeline-stage checks still fully apply, since those are keyed by
//     accountId, independent of which table produced the contactId).
//   - CONTACTS_SECURE: a contact already known for this account in MKT_CONTACTS_SECURE but not
//     listed with an email on this particular tab extract -- preserves every recipient this
//     pipeline already found before this change; the tab becoming primary never removes a
//     previously-included, real, governed recipient.
// A CAMPANA_A_SOURCE contactId is a deterministic, stable hash of (accountId, email) -- never
// random, so idempotency (jobId keying, checkpoint/resume, never duplicating a job) is
// unaffected. Never invents an email: every email comes verbatim from exactly one of these two
// real tables.
function v6AuraCampanaABool_(value) {
  var x = v6AuraEmailText_(value).toUpperCase();
  return value === true || x === 'TRUE' || x === 'YES' || x === 'SI' || x === 'SÍ' || x === '1' || x === 'Y';
}
function v6AuraCampanaAExclusionReasonCode_(row) {
  var x = v6AuraEmailText_((row || {}).reasonCode || (row || {}).reason || 'ACTIVE_EXCLUSION').toUpperCase().replace(/[^A-Z0-9_ -]/g, '').substring(0, 80);
  return x || 'ACTIVE_EXCLUSION';
}
function v6AuraCampanaAResolveRecipients_(accountIds, accountRealIdByName, campaignType) {
  var accountIdSet = {}; accountIds.forEach(function (id) { accountIdSet[id] = true; });

  var sourceRows = v6Rows_('MKT_AURA_CAMPANA_A_SOURCE_ROWS').filter(function (r) { return v6AuraEmailText_(r.email); });
  var contactsSecure = v6Rows_('MKT_CONTACTS_SECURE').filter(function (c) { return accountIdSet[v6AuraEmailText_(c.accountId)] && v6AuraEmailText_(c.status || 'ACTIVE').toUpperCase() !== 'INACTIVE'; });
  var contactsSecureByAccountAndEmail = {};
  contactsSecure.forEach(function (c) {
    var email = v6AuraEmailText_(c.email).toLowerCase();
    if (!email) return;
    contactsSecureByAccountAndEmail[v6AuraEmailText_(c.accountId) + '|' + email] = c;
  });
  var matchedContactsSecureKeys = {};

  var candidates = [];
  sourceRows.forEach(function (r) {
    var accountId = accountRealIdByName[v6AuraEmailText_(r.accountName)];
    if (!accountId || !accountIdSet[accountId]) return; // this account never resolved into this campaign's own scope
    var email = v6AuraEmailText_(r.email).toLowerCase();
    var key = accountId + '|' + email;
    var matched = contactsSecureByAccountAndEmail[key];
    if (matched) matchedContactsSecureKeys[key] = true;
    candidates.push({
      accountId: accountId,
      contactId: matched ? v6AuraEmailText_(matched.contactId) : ('CAMPANA-A-' + v6HashKey_(accountId + '|' + email)),
      email: email,
      firstName: (matched && v6AuraEmailText_(matched.firstName)) || v6AuraEmailText_(r.contactName) || '',
      rowCountry: v6AuraEmailText_(r.country),
      doNotContact: matched ? v6AuraCampanaABool_(matched.doNotContact || matched.dnc) : false,
      emailStatus: matched ? v6AuraEmailText_(matched.emailStatus) : '',
      recipientSource: matched ? 'MERGED' : 'CAMPANA_A_SOURCE'
    });
  });
  contactsSecure.forEach(function (c) {
    var accountId = v6AuraEmailText_(c.accountId), email = v6AuraEmailText_(c.email).toLowerCase();
    if (!email || matchedContactsSecureKeys[accountId + '|' + email]) return;
    candidates.push({
      accountId: accountId, contactId: v6AuraEmailText_(c.contactId), email: email,
      firstName: v6AuraEmailText_(c.firstName), rowCountry: '',
      doNotContact: v6AuraCampanaABool_(c.doNotContact || c.dnc), emailStatus: v6AuraEmailText_(c.emailStatus),
      recipientSource: 'CONTACTS_SECURE'
    });
  });

  var exclusions = v6Rows_('MKT_EXCLUSIONS');
  var ledgerRows = v6Rows_('MKT_FREQUENCY_LEDGER');
  var now = new Date();
  var eligible = [], excluded = [];
  candidates.forEach(function (cand) {
    var reason = 'CLEAR';
    if (cand.doNotContact) reason = 'DO_NOT_CONTACT';
    else if (!cand.email) reason = 'EMAIL_MISSING';
    else if (!v6AuraEmailValid_(cand.email) || v6AuraEmailText_(cand.emailStatus).toUpperCase() === 'INVALID') reason = 'EMAIL_INVALID';
    else {
      var exclusion = (typeof v6RecipientActiveExclusion_ === 'function') ? v6RecipientActiveExclusion_(exclusions, cand.accountId, cand.contactId, now) : null;
      if (exclusion) reason = 'EXCLUSION_' + v6AuraCampanaAExclusionReasonCode_(exclusion).replace(/[^A-Z0-9]+/g, '_');
      else {
        var frequency = (typeof v6FrequencyStatus_ === 'function') ? v6FrequencyStatus_({ accountId: cand.accountId, contactId: cand.contactId, campaignId: CAMPANA_A_CAMPAIGN_ID_, campaignType: campaignType }, ledgerRows) : { eligible: true, status: 'CLEAR' };
        if (!frequency.eligible) reason = 'FREQUENCY_' + v6AuraEmailText_(frequency.status).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      }
    }
    cand.exclusionReason = reason;
    if (reason === 'CLEAR') eligible.push(cand); else excluded.push(cand);
  });

  return { eligible: eligible, excluded: excluded, candidates: candidates, sourceContactsWithEmail: sourceRows.length };
}

// --- Queue build (idempotent; never rebuilds a job that already exists) ----------------------
// Every table this needs is read AT MOST ONCE (accounts, contacts, source-row countries, account
// pipeline stages, campaigns for the stale-override check, existing queue jobs); recipients are
// resolved via v6AuraCampanaAResolveRecipients_ above (tab-primary, ONE MKT_AUDIENCES batch write
// instead of one per contact); every new job is collected in memory and written via ONE
// v6BatchUpsertByKey_ call at the end, instead of one v6UpsertByKey_ call per contact. A
// checkpoint/resume safety net protects against ever needing the whole recipient list to fit in
// one execution again (see above). Phase timings (MATCH_MS/LANGUAGE_MS/ELIGIBILITY_MS/COPY_MS/
// QUEUE_WRITE_MS) are returned on result.profile.
function v6AuraCampanaABuildQueue_() {
  var profile = { MATCH_MS: 0, LANGUAGE_MS: 0, ELIGIBILITY_MS: 0, COPY_MS: 0, QUEUE_WRITE_MS: 0 };
  v6AuraCampanaALog_('MATCH_START');
  var tMatch0 = Date.now();
  v6EnsureContactRecipientSchema_();
  var accounts = v6Rows_('MKT_ACCOUNTS');
  var setup = v6AuraCampanaAEnsureCampaignAndScope_(accounts);
  var result = { status: setup.count ? 'QUEUE_BUILD_COMPLETE' : 'SOURCE_EMPTY_OR_NOT_FOUND', campaignId: CAMPANA_A_CAMPAIGN_ID_, accounts: setup.count, recipients: 0, built: 0, skippedExisting: 0, skippedIneligible: 0, blockedNoReplyTo: 0, byLanguage: { ES: 0, EN: 0, PT: 0 } };
  if (!setup.count) { profile.MATCH_MS = Date.now() - tMatch0; v6AuraCampanaALog_('MATCH_END (0 accounts, SOURCE_EMPTY_OR_NOT_FOUND)'); result.profile = profile; return result; }

  // recipients below are keyed by the REAL MKT_ACCOUNTS accountId (v6AuraCampanaAEnsureCampaignAndScope_
  // scopes by that id now, not always the hash id) -- this re-keys the same Gmail-opportunity data
  // (accountName/amOwner) by that real id so every lookup below finds it regardless of which of
  // the two ids ended up being the real match. setup.realIdByHashId already computed this
  // mapping once inside v6AuraCampanaAEnsureCampaignAndScope_ -- reused here, never re-derived.
  var gmailOppByRealAccountId = {};
  Object.keys(setup.accountMap).filter(Boolean).forEach(function (hashId) {
    gmailOppByRealAccountId[setup.realIdByHashId[hashId]] = setup.accountMap[hashId];
  });
  var campaigns = v6Rows_('MKT_CAMPAIGNS');
  var campaign = campaigns.filter(function (c) { return v6AuraEmailText_(c.campaignId) === CAMPANA_A_CAMPAIGN_ID_; })[0] || {};
  profile.MATCH_MS += Date.now() - tMatch0;
  v6AuraCampanaALog_('MATCH_END (' + setup.count + ' accounts)');

  v6AuraCampanaALog_('ELIGIBILITY_START (dedicated tab-primary resolver: DNC/email/exclusion/frequency)');
  var tElig0 = Date.now();
  var accountRealIdByName = {};
  Object.keys(setup.accountMap).filter(Boolean).forEach(function (hashId) {
    var name = v6AuraEmailText_(setup.accountMap[hashId].accountName);
    if (name) accountRealIdByName[name] = setup.realIdByHashId[hashId];
  });
  var resolved = v6AuraCampanaAResolveRecipients_(setup.accountIds, accountRealIdByName, 'Activation');
  var recipients = resolved.eligible;
  result.recipients = recipients.length;
  result.candidates = resolved.candidates.length;
  result.sourceContacts = resolved.sourceContactsWithEmail;
  result.recipientSourceBreakdown = { MERGED: 0, CAMPANA_A_SOURCE: 0, CONTACTS_SECURE: 0 };
  resolved.candidates.forEach(function (c) { result.recipientSourceBreakdown[c.recipientSource] = (result.recipientSourceBreakdown[c.recipientSource] || 0) + 1; });
  result.excludedByReason = {};
  resolved.excluded.forEach(function (c) { result.excludedByReason[c.exclusionReason] = (result.excludedByReason[c.exclusionReason] || 0) + 1; });
  // Kept for compatibility with anything else that reads MKT_AUDIENCES for this campaignId
  // (v6AudienceStatus_, the general dashboard) -- ONE batch write for every candidate
  // (eligible AND excluded, exactly like the shared engine's own row shape), never per-contact.
  var audienceStamp = new Date().toISOString();
  var audienceRecords = resolved.candidates.map(function (cand) {
    return {
      audienceRecipientId: 'AUD:' + CAMPANA_A_CAMPAIGN_ID_ + ':' + cand.contactId, recordType: 'RECIPIENT',
      campaignId: CAMPANA_A_CAMPAIGN_ID_, scopeId: CAMPANA_A_SCOPE_ID_, accountId: cand.accountId, contactId: cand.contactId,
      email: cand.email, eligibilityStatus: cand.exclusionReason === 'CLEAR' ? 'ELIGIBLE' : 'EXCLUDED',
      exclusionReason: cand.exclusionReason, frequencyStatus: '', resolvedAt: audienceStamp, updatedAt: audienceStamp,
      recipientSource: cand.recipientSource
    };
  });
  if (audienceRecords.length) v6BatchUpsertByKey_('MKT_AUDIENCES', ['audienceRecipientId'], audienceRecords);
  profile.ELIGIBILITY_MS += Date.now() - tElig0;
  v6AuraCampanaALog_('ELIGIBILITY_END (' + recipients.length + ' eligible of ' + resolved.candidates.length + ' candidates [' + JSON.stringify(result.recipientSourceBreakdown) + '], ' + profile.ELIGIBILITY_MS + 'ms)');

  v6AuraCampanaALog_('MATCH_START (per-contact index preload)');
  var tMatch1 = Date.now();
  var existingIds = {};
  v6Rows_('MKT_EMAIL_QUEUE').forEach(function (r) { existingIds[v6AuraEmailText_(r.jobId)] = true; });
  var accountsById = {}; accounts.forEach(function (a) { accountsById[v6AuraEmailText_(a.accountId)] = a; });
  var contactsById = {}; v6Rows_('MKT_CONTACTS_SECURE').forEach(function (c) { contactsById[v6AuraEmailText_(c.contactId)] = c; });
  // Real country, per real account name, as captured directly from the tab by
  // v6AuraCampanaAIngestFromSpreadsheet_ (MKT_AURA_CAMPANA_A_SOURCE_ROWS) -- the primary country
  // source for this campaign per DGL's own instruction, ahead of whatever MKT_CONTACTS_SECURE/
  // MKT_ACCOUNTS may or may not carry.
  var tabCountryByAccountName = {};
  v6Rows_('MKT_AURA_CAMPANA_A_SOURCE_ROWS').forEach(function (r) {
    if (r.accountName && r.country && !tabCountryByAccountName[r.accountName]) tabCountryByAccountName[r.accountName] = r.country;
  });
  var accountPipelineById = {};
  v6Rows_('MKT_ACCOUNT_PIPELINE').forEach(function (r) { accountPipelineById[v6AuraEmailText_(r.accountId)] = r; });

  var replyTo = v6AuraEmailCanonicalReplyTo_();
  var replyToBlocked = !replyTo;
  var policyApproved = (typeof v6AuraPolicyApproved_ === 'function') ? v6AuraPolicyApproved_('Activation') : true;
  var copyCache = {};
  function copyFor(lang) {
    if (!copyCache[lang]) copyCache[lang] = v6AuraGenerateCopy_({}, Object.assign({}, campaign, { language: v6AuraCampanaALanguageCampaignFlag_(lang) }));
    return copyCache[lang];
  }
  profile.MATCH_MS += Date.now() - tMatch1;
  v6AuraCampanaALog_('MATCH_END (per-contact index preload, ' + profile.MATCH_MS + 'ms total)');

  var checkpoint = v6AuraCampanaAReadBuildCheckpoint_();
  var startIndex = (checkpoint && checkpoint.campaignId === CAMPANA_A_CAMPAIGN_ID_ && checkpoint.totalRecipients === recipients.length) ? checkpoint.lastProcessedIndex : 0;
  var budgetMs = v6AuraCampanaABuildTimeBudgetMs_();
  v6AuraCampanaALog_('LANGUAGE_START (per-contact loop: language + eligibility(stop/override) + copy, ' + (recipients.length - startIndex) + ' of ' + recipients.length + ' recipients, resuming at index ' + startIndex + ')');
  var loopStart = Date.now();
  var pendingJobs = [];
  var sequenceStep = 1;
  var i, checkpointed = false;
  for (i = startIndex; i < recipients.length; i++) {
    if (Date.now() - loopStart >= budgetMs) { checkpointed = true; break; }
    if (i > startIndex && (i - startIndex) % 50 === 0) v6AuraCampanaALog_('LANGUAGE/ELIGIBILITY/COPY progress: ' + (i - startIndex) + '/' + (recipients.length - startIndex) + ' processed, ' + (Date.now() - loopStart) + 'ms elapsed');
    var r = recipients[i];
    var accountId = v6AuraEmailText_(r.accountId), contactId = v6AuraEmailText_(r.contactId);
    var jobId = v6AuraEmailJobId_(CAMPANA_A_CAMPAIGN_ID_, contactId, sequenceStep);
    if (existingIds[jobId]) { result.skippedExisting++; continue; }
    if (!accountId || !contactId || !v6AuraEmailText_(r.email)) { result.skippedIneligible++; continue; }

    var tLang0 = Date.now();
    var account = accountsById[accountId] || {};
    // contact enriches from MKT_CONTACTS_SECURE when a real (non-synthesized) contactId matches
    // one (MERGED/CONTACTS_SECURE recipients) -- correctly empty for a CAMPANA_A_SOURCE-only
    // recipient, since no such record exists there; v6AuraCampanaAPreferredLanguage_ already
    // falls through its priority chain (explicit contact signal -> tab row country -> account
    // country -> EN) exactly as before.
    var contact = contactsById[contactId] || {};
    var gmailOpp = gmailOppByRealAccountId[accountId] || {};
    // The resolver's own per-row country (r.rowCountry) is more precise than the account-level
    // "first tab row found" fallback below (an account can have multiple contact rows on the tab
    // with genuinely different countries) -- still the tab, still primary, per DGL's instruction.
    var tabCountry = r.rowCountry || tabCountryByAccountName[v6AuraEmailText_(gmailOpp.accountName)] || '';
    var langInfo = v6AuraCampanaAPreferredLanguage_(contact, account, tabCountry);
    result.byLanguage[langInfo.language] = (result.byLanguage[langInfo.language] || 0) + 1;
    // Personalization uses the resolver's own merged firstName (r.firstName -- prefers the
    // MKT_CONTACTS_SECURE record when merged, the tab's own contactName when Campana-A-source-only)
    // rather than raw contact.firstName, which is empty for a source-only recipient even though a
    // real name is available directly on the tab.
    var reliableName = v6AuraCampanaANameReliable_(r.firstName);
    var vars = {
      firstName: reliableName, company: v6AuraEmailText_(account.accountName) || v6AuraEmailText_(gmailOpp.accountName) || 'your company',
      service: 'Multiservicio', replyTo: replyTo
    };
    profile.LANGUAGE_MS += Date.now() - tLang0;

    var tElig0 = Date.now();
    // Real, exact stage this account is sitting at -- never just a boolean -- so a STOPPED job
    // is traceable to precisely why (which stage, when it entered it, and, when known, which
    // campaignId produced it) instead of an opaque true/false a human would have to re-derive by
    // hand later. v6PipelineAdvanced_/CLOSED-SUPPRESSED reproduces the exact same stop condition
    // v6AuraEmailAccountStopped_ already uses -- this does not change what counts as stopped.
    var pipelineRow = accountPipelineById[accountId] || null;
    var currentStage = pipelineRow ? String(pipelineRow.currentStage || '').toUpperCase() : '';
    var rawStopped = !!currentStage && (currentStage === 'CLOSED / SUPPRESSED' || (typeof v6PipelineAdvanced_ === 'function' && v6PipelineAdvanced_(currentStage)));
    var overrideCheck = rawStopped ? v6AuraCampanaAStopOverrideCheck_(currentStage, pipelineRow, campaigns) : { overridable: false, reason: 'NOT_STOPPED' };
    var stopped = rawStopped && !overrideCheck.overridable;
    profile.ELIGIBILITY_MS += Date.now() - tElig0;

    var tCopy0 = Date.now();
    var copy = copyFor(langInfo.language);
    var now = new Date().toISOString();
    var country = tabCountry || v6AuraEmailText_(contact.country || contact.Country || account.country || account.Country || '');
    var job = {
      jobId: jobId, campaignId: CAMPANA_A_CAMPAIGN_ID_, audienceId: CAMPANA_A_SCOPE_ID_,
      accountId: accountId, contactId: contactId, email: v6AuraEmailText_(r.email),
      firstName: vars.firstName, company: vars.company, service: vars.service,
      subject: v6AuraCampanaASubject_(copy.subjectA, vars), htmlBody: v6AuraEmailHtml_(campaign, copy, vars),
      replyTo: replyTo,
      status: stopped ? 'STOPPED' : (replyToBlocked ? 'SUPPRESSED' : (policyApproved ? 'PENDING' : 'REVIEW_REQUIRED')),
      gmailDraftId: '', createdAt: now, processedAt: '', error: replyToBlocked ? 'MISSING_REPLY_TO_CONFIGURATION' : '',
      requestId: CAMPANA_A_CAMPAIGN_ID_, amOwner: v6AuraEmailText_(gmailOpp.amOwner) || v6AuraEmailText_(account.amOwner) || '',
      playbookId: 'Activation', sequenceStep: sequenceStep, scheduledAt: now,
      approvalId: policyApproved ? '' : ('APR:' + CAMPANA_A_CAMPAIGN_ID_), approvedAt: '', approvedBy: '',
      stopOnResponse: true, country: country, preferredLanguage: langInfo.language,
      languageSource: langInfo.source, languageReason: langInfo.reason,
      stopReasonStage: rawStopped ? currentStage : '', stopReasonAt: rawStopped ? v6AuraEmailText_(pipelineRow.responseAt || pipelineRow.enteredStageAt) : '',
      stopReasonCampaignId: rawStopped ? v6AuraEmailText_(pipelineRow.campaignId) : '',
      stopOverrideApplied: overrideCheck.overridable ? 'YES' : 'NO', stopOverrideReason: rawStopped ? overrideCheck.reason : '',
      recipientSource: r.recipientSource
    };
    profile.COPY_MS += Date.now() - tCopy0;
    pendingJobs.push(job);
    existingIds[jobId] = true;
    result.built++;
    if (replyToBlocked) result.blockedNoReplyTo++;
  }
  v6AuraCampanaALog_('LANGUAGE_END (' + profile.LANGUAGE_MS + 'ms total)');
  v6AuraCampanaALog_('ELIGIBILITY_END (per-contact stop/override check, +' + profile.ELIGIBILITY_MS + 'ms total including the earlier v6ResolveRecipients_ call)');
  v6AuraCampanaALog_('COPY_END (' + profile.COPY_MS + 'ms total, ' + result.built + ' jobs built)');

  v6AuraCampanaALog_('QUEUE_WRITE_START (' + pendingJobs.length + ' new jobs)');
  var tWrite0 = Date.now();
  if (pendingJobs.length) v6BatchUpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], pendingJobs);
  profile.QUEUE_WRITE_MS += Date.now() - tWrite0;
  v6AuraCampanaALog_('QUEUE_WRITE_END (' + profile.QUEUE_WRITE_MS + 'ms)');

  if (checkpointed) {
    v6AuraCampanaASaveBuildCheckpoint_({ campaignId: CAMPANA_A_CAMPAIGN_ID_, totalRecipients: recipients.length, lastProcessedIndex: i, checkpointedAt: new Date().toISOString() });
    result.status = 'CHECKPOINTED_TIME_BUDGET_EXCEEDED';
    result.checkpoint = { resumeFromIndex: i, totalRecipients: recipients.length, remaining: recipients.length - i };
    v6AuraCampanaALog_('BUILD_CHECKPOINTED (resume from index ' + i + ' of ' + recipients.length + ')');
  } else {
    v6AuraCampanaAClearBuildCheckpoint_();
  }
  result.profile = profile;
  return result;
}

// --- STOPPED breakdown: exact counts by real stage, never a guess ----------------------------
// No suppression/frequency/stopOnResponse rule is changed here -- this only reads back the exact
// stage/timestamp/campaignId v6AuraCampanaABuildQueue_ already captured onto each STOPPED job,
// grouped for a real, auditable answer to "how many of these were RESPONDED vs QUOTED vs closed,
// and from which prior campaign."
function v6AuraCampanaAStoppedBreakdown_() {
  var allJobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_; });
  var jobs = allJobs.filter(function (r) { return r.status === 'STOPPED'; });
  var overridden = allJobs.filter(function (r) { return r.stopOverrideApplied === 'YES'; });
  var byStage = {}, byPriorCampaignId = {}, byOverrideReason = {};
  jobs.forEach(function (j) {
    var stage = v6AuraEmailText_(j.stopReasonStage) || 'UNKNOWN';
    byStage[stage] = (byStage[stage] || 0) + 1;
    var priorCampaign = v6AuraEmailText_(j.stopReasonCampaignId) || 'UNKNOWN';
    byPriorCampaignId[priorCampaign] = (byPriorCampaignId[priorCampaign] || 0) + 1;
  });
  allJobs.forEach(function (j) { if (v6AuraEmailText_(j.stopReasonStage)) { var reason = v6AuraEmailText_(j.stopOverrideReason) || 'NOT_STOPPED'; byOverrideReason[reason] = (byOverrideReason[reason] || 0) + 1; } });
  return {
    totalStopped: jobs.length, byStage: byStage, byPriorCampaignId: byPriorCampaignId,
    totalOverridden: overridden.length, byOverrideReason: byOverrideReason,
    sample: jobs.slice(0, 10).map(function (j) { return { accountId: j.accountId, stage: j.stopReasonStage, at: j.stopReasonAt, priorCampaignId: j.stopReasonCampaignId }; }),
    overriddenSample: overridden.slice(0, 10).map(function (j) { return { accountId: j.accountId, stage: j.stopReasonStage, at: j.stopReasonAt, priorCampaignId: j.stopReasonCampaignId, status: j.status }; })
  };
}

// --- Final preflight: the one gate that decides what may ever reach a real send --------------
// Runs before every dispatch (DRY_RUN or LIVE alike). Re-validates each PENDING job against the
// exact, minimal set of things that must be safely determined before a real send is even
// considered: a real, well-formed email address; a real, valid reply-to; and no active
// suppression/exclusion that appeared after the job was originally built. A job that fails is
// individually marked SUPPRESSED with the specific reason -- it never blocks or holds back any
// other job in the campaign. A language resolved via the documented EN fallback (no signal
// found) still counts as safely determined -- EN is a real, deliberate default, not an unknown.
// MKT_EXCLUSIONS is read ONCE for the whole preflight pass (v6RecipientActiveExclusion_ is pure,
// already accepts a preloaded rows array) instead of once per job; every suppressed job is
// written in ONE final batch instead of one v6UpsertByKey_ call per failure. Returns the exact
// recipient/language/suppression summary DGL asked to review before ever approving LIVE, plus
// readyForLive: true only when at least one job would actually go out and zero jobs remain in an
// undetermined state.
function v6AuraCampanaAPreflight_() {
  v6AuraCampanaALog_('PREFLIGHT_START');
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_ && r.status === 'PENDING'; });
  var exclusions = v6Rows_('MKT_EXCLUSIONS');
  var wouldSend = 0, suppressedNow = 0, byLanguage = { ES: 0, EN: 0, PT: 0 }, issues = [], toSuppress = [];
  jobs.forEach(function (job) {
    var problems = [];
    if (!v6AuraEmailValid_(job.email)) problems.push('INVALID_EMAIL');
    if (!job.replyTo || !v6AuraEmailValid_(job.replyTo)) problems.push('MISSING_OR_INVALID_REPLY_TO');
    if (['ES', 'EN', 'PT'].indexOf(v6AuraEmailText_(job.preferredLanguage)) < 0) problems.push('LANGUAGE_NOT_SAFELY_DETERMINED');
    var exclusion = (typeof v6RecipientActiveExclusion_ === 'function') ? v6RecipientActiveExclusion_(exclusions, job.accountId, job.contactId, new Date()) : null;
    if (exclusion) problems.push('ACTIVE_EXCLUSION_' + (exclusion.reasonCode || exclusion.reason || 'FOUND'));
    if (problems.length) {
      job.status = 'SUPPRESSED'; job.error = 'PREFLIGHT_FAILED: ' + problems.join(', '); job.processedAt = new Date().toISOString();
      toSuppress.push(job);
      suppressedNow++;
      issues.push({ jobId: job.jobId, accountId: job.accountId, email: v6AuraEmailMask_(job.email), problems: problems });
    } else {
      wouldSend++;
      var lang = v6AuraEmailText_(job.preferredLanguage);
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    }
  });
  if (toSuppress.length) v6BatchUpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], toSuppress);
  v6AuraCampanaALog_('PREFLIGHT_END (' + jobs.length + ' pending, ' + wouldSend + ' wouldSend, ' + suppressedNow + ' suppressed)');
  return {
    status: 'PREFLIGHT_COMPLETE', totalPending: jobs.length, wouldSend: wouldSend, suppressedByPreflight: suppressedNow,
    byLanguage: byLanguage, issues: issues, readyForLive: jobs.length > 0 && wouldSend > 0
  };
}

// --- Dispatch every pending Campana A job --------------------------------------------------
// Reads MKT_EMAIL_QUEUE (PENDING, this campaign only), MKT_EXCLUSIONS, MKT_ACCOUNT_PIPELINE and
// MKT_FREQUENCY_LEDGER exactly ONCE each and evaluates every governance re-check in memory --
// the exact same checks the shared auraProcessEmailQueue (MarketingV6AuraEmailDispatcher.gs)
// performs (account-stopped, reply-to/email validity, active exclusion, duplicate-sent,
// frequency) -- instead of looping that shared, per-job-I/O dispatcher, which re-reads several
// full tables from scratch for every single job. auraProcessEmailQueue itself is unchanged and
// still serves every other campaign family exactly as before; this dedicated batch path exists
// only for this pipeline's own dispatch, called from v6AuraCampanaARegenerateDryRun_. Every
// updated job (STOPPED/SUPPRESSED/SKIPPED/REVIEW_REQUIRED/DRY_RUN/SENT/FAILED) is written in ONE
// final batch. A real send (LIVE mode only) still calls GmailApp.sendEmail individually -- that
// is an unavoidable, real per-recipient action, not a Sheets read/write, and is never part of
// the performance problem this pass fixes.
function v6AuraCampanaADispatchBatch_() {
  v6AuraCampanaALog_('DISPATCH_START');
  var mode = v6AuraSendMode_();
  var senderName = v6AuraEmailSenderName_();
  var allQueueJobs = v6Rows_('MKT_EMAIL_QUEUE');
  var jobs = allQueueJobs.filter(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_ && v6AuraEmailText_(r.status).toUpperCase() === 'PENDING'; });
  var counts = { sent: 0, failed: 0, suppressed: 0, skipped: 0, stopped: 0, reviewRequired: 0, dryRun: 0 };
  if (!jobs.length) { v6AuraCampanaALog_('DISPATCH_END (0 pending jobs)'); return { status: 'DISPATCH_COMPLETE', sendMode: mode, rounds: 0, processed: 0, sent: 0, failed: 0, suppressed: 0, skipped: 0, stopped: 0, reviewRequired: 0, dryRun: 0 }; }

  var exclusions = v6Rows_('MKT_EXCLUSIONS');
  var pipelineByAccountId = {};
  v6Rows_('MKT_ACCOUNT_PIPELINE').forEach(function (r) { pipelineByAccountId[v6AuraEmailText_(r.accountId)] = r; });
  var ledgerRows = v6Rows_('MKT_FREQUENCY_LEDGER');
  // Duplicate-sent guard evaluated against the SAME already-loaded queue snapshot -- no re-read.
  var sentKeys = {};
  allQueueJobs.forEach(function (r) {
    if (v6AuraEmailText_(r.status).toUpperCase() === 'SENT') {
      sentKeys[[v6AuraEmailText_(r.campaignId), v6AuraEmailText_(r.accountId), v6AuraEmailText_(r.contactId), String(r.sequenceStep)].join('|')] = true;
    }
  });

  var updated = [];
  jobs.forEach(function (job) {
    var accountId = v6AuraEmailText_(job.accountId), contactId = v6AuraEmailText_(job.contactId);
    var now = new Date().toISOString();
    try {
      var pipelineRow = pipelineByAccountId[accountId] || null;
      var stage = pipelineRow ? String(pipelineRow.currentStage || '').toUpperCase() : '';
      var accountStopped = !!stage && (stage === 'CLOSED / SUPPRESSED' || (typeof v6PipelineAdvanced_ === 'function' && v6PipelineAdvanced_(stage)));
      if (accountStopped) {
        job.status = 'STOPPED'; job.processedAt = now; counts.stopped++; updated.push(job); return;
      }
      if (!job.replyTo || !v6AuraEmailValid_(job.replyTo)) {
        job.status = 'SUPPRESSED'; job.error = 'MISSING_REPLY_TO_CONFIGURATION'; job.processedAt = now; counts.suppressed++; updated.push(job); return;
      }
      if (!v6AuraEmailValid_(job.email)) {
        job.status = 'SUPPRESSED'; job.error = 'EMAIL_INVALID'; job.processedAt = now; counts.suppressed++; updated.push(job); return;
      }
      var exclusion = (typeof v6RecipientActiveExclusion_ === 'function') ? v6RecipientActiveExclusion_(exclusions, accountId, contactId, new Date()) : null;
      if (exclusion) {
        job.status = 'SUPPRESSED'; job.error = 'EXCLUSION_' + (exclusion.reasonCode || exclusion.reason || 'ACTIVE'); job.processedAt = now; counts.suppressed++; updated.push(job); return;
      }
      if (job.approvalId && !job.approvedAt) {
        job.status = 'REVIEW_REQUIRED'; job.processedAt = now; counts.reviewRequired++; updated.push(job); return;
      }
      var dupKey = [v6AuraEmailText_(job.campaignId), accountId, contactId, String(job.sequenceStep)].join('|');
      if (sentKeys[dupKey]) {
        job.status = 'SKIPPED'; job.error = 'ALREADY_SENT_DUPLICATE'; job.processedAt = now; counts.skipped++; updated.push(job); return;
      }
      var frequency = (typeof v6FrequencyStatus_ === 'function') ? v6FrequencyStatus_({ accountId: accountId, contactId: contactId, campaignId: job.campaignId, campaignType: job.playbookId }, ledgerRows) : { eligible: true, status: 'CLEAR' };
      if (!frequency.eligible) {
        job.status = 'SKIPPED'; job.error = 'FREQUENCY_' + frequency.status; job.processedAt = now; counts.skipped++; updated.push(job); return;
      }
      if (mode !== 'LIVE') {
        job.status = 'DRY_RUN'; job.processedAt = now; job.error = ''; counts.dryRun++; updated.push(job); return;
      }
      var options = { htmlBody: job.htmlBody, name: senderName };
      if (job.replyTo) options.replyTo = job.replyTo;
      GmailApp.sendEmail(job.email, job.subject, v6AuraEmailStripHtml_(job.htmlBody), options);
      job.status = 'SENT'; job.processedAt = now; job.error = '';
      counts.sent++; updated.push(job); sentKeys[dupKey] = true;
      if (typeof v6RecordMarketingTouch_ === 'function') {
        try { v6RecordMarketingTouch_({ accountId: accountId, contactId: contactId, campaignId: job.campaignId, campaignType: job.playbookId, sentAt: now, cooldownDays: 30 }); } catch (_) { }
      }
      try { v6UpsertByKey_('MKT_TOUCHES', ['touchId'], { touchId: job.jobId, campaignId: job.campaignId, audienceId: job.audienceId || '', accountId: accountId, contactId: contactId, channel: 'EMAIL', eventType: 'SENT', eventAt: now, externalId: '', metadata: JSON.stringify({ sequenceStep: job.sequenceStep }) }); } catch (_) { }
    } catch (err) {
      job.status = 'FAILED'; job.error = String(err && err.message || err); job.processedAt = new Date().toISOString();
      counts.failed++; updated.push(job);
    }
  });

  if (updated.length) v6BatchUpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], updated);
  try { v6AuraRefreshExecutionReportStatusOnly_(CAMPANA_A_CAMPAIGN_ID_); } catch (_) { }
  v6AuraCampanaALog_('DISPATCH_END (' + jobs.length + ' processed: ' + counts.dryRun + ' dryRun, ' + counts.sent + ' sent, ' + counts.suppressed + ' suppressed, ' + counts.stopped + ' stopped, ' + counts.skipped + ' skipped, ' + counts.reviewRequired + ' reviewRequired, ' + counts.failed + ' failed)');
  return { status: 'DISPATCH_COMPLETE', sendMode: mode, rounds: 1, processed: jobs.length, sent: counts.sent, failed: counts.failed, suppressed: counts.suppressed, skipped: counts.skipped, stopped: counts.stopped, reviewRequired: counts.reviewRequired, dryRun: counts.dryRun };
}
// Kept as the public entry point v6AuraCampanaARegenerateDryRun_ already calls -- now a single
// batch pass (v6AuraCampanaADispatchBatch_) instead of looping the shared, per-job-I/O
// auraProcessEmailQueue up to 20 times. Safe in DRY_RUN since no real send is ever possible, and
// this is only ever used by this dedicated, explicitly-invoked pipeline -- never by an automatic
// trigger.
function v6AuraCampanaADispatchAll_() {
  var out = v6AuraCampanaADispatchBatch_();
  return { rounds: out.rounds, processed: out.processed, sent: out.sent, failed: out.failed, suppressed: out.suppressed, skipped: out.skipped, stopped: out.stopped, reviewRequired: out.reviewRequired, dryRun: out.dryRun };
}

// --- QA: confirm the explicitly-ignored tabs from the SAME workbook were never turned into an
// opportunity. This deliberately does NOT flag every other sourceSheet value in the table --
// a different, already-mapped tab (e.g. 'Retencion prioritaria') legitimately has its own
// historical data from its own past ingestions, and that is correct, expected behavior, not a
// leak. This checks specifically for the tab(s) DGL asked to ignore from this workbook.
var CAMPANA_A_EXPLICITLY_IGNORED_SHEETS_ = ['Campana B'];
function v6AuraCampanaAVerifyOtherTabsIgnored_() {
  var found = {};
  v6Rows_('MKT_AURA_GMAIL_OPPORTUNITIES').forEach(function (r) {
    var s = v6AuraEmailText_(r.sourceSheet);
    if (CAMPANA_A_EXPLICITLY_IGNORED_SHEETS_.indexOf(s) >= 0) found[s] = (found[s] || 0) + 1;
  });
  return { ignoredTabsNeverProcessed: Object.keys(found).length === 0, unexpectedRowsFound: found };
}

// --- Full QA report, scoped strictly to this campaignId --------------------------------------
function v6AuraCampanaAAudit_() {
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_; });
  var base = v6AuraEmailQueueAudit_(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_; });
  var byLanguage = { ES: 0, EN: 0, PT: 0 }, byStatus = {};
  var teamFirstNameCount = 0, nonCanonicalReplyToCount = 0, invalidEmailCount = 0;
  // Compared against the real resolved canonical address (never a hardcoded literal here) so
  // this check tracks whatever AURA_GMAIL_SOURCE_MAILBOX is actually configured to, exactly
  // like every job's own replyTo was built from.
  var canonicalReplyTo = v6AuraEmailText_(v6AuraEmailCanonicalReplyTo_()).toLowerCase();
  jobs.forEach(function (j) {
    var lang = v6AuraEmailText_(j.preferredLanguage).toUpperCase();
    if (byLanguage[lang] == null) byLanguage[lang] = 0;
    byLanguage[lang]++;
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    if (v6AuraEmailText_(j.firstName) === 'Team') teamFirstNameCount++;
    if (v6AuraEmailText_(j.replyTo).toLowerCase() !== canonicalReplyTo) nonCanonicalReplyToCount++;
    if (!v6AuraEmailValid_(j.email)) invalidEmailCount++;
  });
  // Fail-closed: zero accounts ever resolved from the real source tab is a source problem, never
  // a quiet "nothing to do." This must never report clean:true just because there happened to be
  // no findings among zero jobs -- an empty/unreachable source is itself the finding.
  var sourceAccountCount = Object.keys(v6AuraCampanaAAccountMap_()).length;
  var sourceEmpty = sourceAccountCount === 0;
  var byLanguageSource = {};
  jobs.forEach(function (j) { var s = v6AuraEmailText_(j.languageSource) || 'UNKNOWN'; byLanguageSource[s] = (byLanguageSource[s] || 0) + 1; });
  // recipientSource breakdown (Pass 18: the tab is now the primary recipient source) -- computed
  // from the durable job records themselves, not just the transient build-time stat, so this is
  // accurate on every audit call regardless of when the queue was built. MERGED = the tab email
  // matched a real MKT_CONTACTS_SECURE record for the account; CAMPANA_A_SOURCE = present on the
  // tab only (this pipeline's own required "source-only" recipient, never previously included);
  // CONTACTS_SECURE = already known in MKT_CONTACTS_SECURE, not listed with an email on this tab.
  var byRecipientSource = { MERGED: 0, CAMPANA_A_SOURCE: 0, CONTACTS_SECURE: 0 };
  jobs.forEach(function (j) { var s = v6AuraEmailText_(j.recipientSource) || 'UNKNOWN'; byRecipientSource[s] = (byRecipientSource[s] || 0) + 1; });
  return Object.assign({}, base, {
    campaignId: CAMPANA_A_CAMPAIGN_ID_, jobsForCampaignA: jobs.length,
    sourceStatus: sourceEmpty ? 'SOURCE_EMPTY_OR_NOT_FOUND' : 'SOURCE_OK', sourceAccountCount: sourceAccountCount,
    byLanguage: byLanguage, byLanguageSource: byLanguageSource, byStatusForCampaignA: byStatus, byRecipientSource: byRecipientSource,
    teamFirstNameCount: teamFirstNameCount, nonCanonicalReplyToCount: nonCanonicalReplyToCount, invalidEmailCount: invalidEmailCount,
    otherTabsIgnored: v6AuraCampanaAVerifyOtherTabsIgnored_(),
    stoppedBreakdown: v6AuraCampanaAStoppedBreakdown_(),
    matchReport: v6AuraCampanaAMatchReport_(),
    clean: sourceEmpty ? false : base.clean
  });
}

// --- One convenient, no-argument entry point --------------------------------------------------
// Forces/confirms DRY_RUN first (never auraEnableLiveSending). Reads the live source spreadsheet
// directly (v6AuraCampanaAIngestFromSpreadsheet_ -- the primary, authoritative source) so this
// always reflects the CURRENT tab content, never a stale copy; the Gmail-message reprocess stays
// as a non-fatal, best-effort second path (covers a deployment where the report genuinely does
// arrive by email) and can never block the direct read if it errors. Then refreshes
// MKT_OPPORTUNITIES, rebuilds the dedicated campaign/scope/queue, dispatches every pending job
// (still DRY_RUN, so zero real sends), then runs the full QA audit. Every phase is timed; the
// merged profile (SOURCE_READ_MS/PARSE_MS from ingest, MATCH_MS/LANGUAGE_MS/ELIGIBILITY_MS/
// COPY_MS/QUEUE_WRITE_MS from build, AUDIT_MS here, TOTAL_MS for the whole call) is returned on
// result.profile -- the exact fields DGL asked this pass to report.
// --- Durable per-run audit trail: never depend on the Apps Script execution log -----------------
// A real incident (2026-09-16): a completed, non-erroring run's execution log ended up showing
// only its final matchReport section in the Apps Script editor's log panel, not the earlier
// full-result JSON -- and DGL correctly refused to re-run the campaign just to recover a log.
// The execution log is inherently ephemeral and was never a database; every field DGL asked to
// see in a preflight/result summary is now written to MKT_AURA_CAMPANA_A_RUN_SUMMARY, ONE row
// per run (keyed by a real, unique runId), the moment v6AuraCampanaARegenerateDryRun_ finishes --
// inspectable directly in the Data Hub spreadsheet or via v6AuraCampanaALatestRunSummary_/the
// AURA dashboard, independent of the log. Pure function: takes the exact result object
// v6AuraCampanaARegenerateDryRun_ already returns, no I/O of its own.
// Kept OUT of MKT_V6_CONTACT_RECIPIENT_SCHEMA (MarketingV6SchemaMigration.gs) deliberately -- that
// map's v6EnsureContactRecipientSchema_/v6AuditContactRecipientSchema_ throw SCHEMA MIGRATION
// REQUIRED for ANY table listed there that doesn't already exist, which is correct for real
// commercial tables (MKT_ACCOUNTS, MKT_CONTACTS_SECURE, ...) and would have made the shared AURA
// bootstrap flow (MarketingV6AuraBootstrap.gs) -- and even this file's OWN build queue, which
// calls that same ensure function first -- fail on a fresh deployment before this table's first
// write ever ran. Uses the exact same self-contained, auto-creating pattern already proven safe
// for MKT_AURA_CAMPANA_A_SOURCE_ROWS above (v6AcqEnsureSheet_, MarketingV6AcquisitionEngine.gs --
// creates the tab itself if missing, appends any missing header additively otherwise).
var MKT_AURA_CAMPANA_A_RUN_SUMMARY_SCHEMA_ = ['runId', 'runAt', 'status', 'sendMode', 'totalMs',
  'sourceAccounts', 'sourceContacts', 'recipients',
  'recipientsMerged', 'recipientsCampanaASourceOnly', 'recipientsContactsSecureOnly',
  'byLanguageEs', 'byLanguageEn', 'byLanguagePt',
  'built', 'skippedExisting', 'skippedIneligible', 'blockedNoReplyTo',
  'excludedTotal', 'excludedByReasonJson',
  'preflightTotalPending', 'preflightWouldSend', 'preflightSuppressed', 'preflightReadyForLive',
  'dispatchSent', 'dispatchDryRun', 'dispatchSuppressed', 'dispatchStopped', 'dispatchSkipped', 'dispatchReviewRequired', 'dispatchFailed',
  'statusStoppedTotal', 'stoppedByStageJson', 'stoppedOverriddenTotal', 'stoppedByOverrideReasonJson',
  'invalidEmailCount', 'duplicateJobKeys', 'nonCanonicalReplyToCount', 'teamFirstNameCount', 'realSendsDetected', 'clean',
  'matchReportAccountsUnmatched', 'matchReportContactsUnmatched', 'matchReportNote'];
function v6AuraCampanaAEnsureRunSummarySheet_() { return v6AcqEnsureSheet_('MKT_AURA_CAMPANA_A_RUN_SUMMARY', MKT_AURA_CAMPANA_A_RUN_SUMMARY_SCHEMA_); }
function v6AuraCampanaABuildRunSummaryRecord_(runId, result) {
  var build = result.build || {}, preflight = result.preflight || {}, dispatch = result.dispatch || {}, audit = result.audit || {};
  var byLang = build.byLanguage || {}, srcBreak = build.recipientSourceBreakdown || {}, excludedByReason = build.excludedByReason || {};
  var stopped = audit.stoppedBreakdown || {};
  var matchReport = audit.matchReport || {};
  var excludedTotal = 0; Object.keys(excludedByReason).forEach(function (k) { excludedTotal += Number(excludedByReason[k]) || 0; });
  var now = new Date().toISOString();
  return {
    runId: runId, runAt: now, status: result.status, sendMode: result.sendMode, totalMs: (result.profile || {}).TOTAL_MS || 0,
    sourceAccounts: build.accounts || 0, sourceContacts: build.sourceContacts || 0, recipients: build.recipients || 0,
    recipientsMerged: srcBreak.MERGED || 0, recipientsCampanaASourceOnly: srcBreak.CAMPANA_A_SOURCE || 0, recipientsContactsSecureOnly: srcBreak.CONTACTS_SECURE || 0,
    byLanguageEs: byLang.ES || 0, byLanguageEn: byLang.EN || 0, byLanguagePt: byLang.PT || 0,
    built: build.built || 0, skippedExisting: build.skippedExisting || 0, skippedIneligible: build.skippedIneligible || 0, blockedNoReplyTo: build.blockedNoReplyTo || 0,
    excludedTotal: excludedTotal, excludedByReasonJson: JSON.stringify(excludedByReason),
    preflightTotalPending: preflight.totalPending || 0, preflightWouldSend: preflight.wouldSend || 0, preflightSuppressed: preflight.suppressedByPreflight || 0, preflightReadyForLive: preflight.readyForLive ? 'YES' : 'NO',
    dispatchSent: dispatch.sent || 0, dispatchDryRun: dispatch.dryRun || 0, dispatchSuppressed: dispatch.suppressed || 0, dispatchStopped: dispatch.stopped || 0, dispatchSkipped: dispatch.skipped || 0, dispatchReviewRequired: dispatch.reviewRequired || 0, dispatchFailed: dispatch.failed || 0,
    statusStoppedTotal: stopped.totalStopped || 0, stoppedByStageJson: JSON.stringify(stopped.byStage || {}), stoppedOverriddenTotal: stopped.totalOverridden || 0, stoppedByOverrideReasonJson: JSON.stringify(stopped.byOverrideReason || {}),
    invalidEmailCount: audit.invalidEmailCount || 0, duplicateJobKeys: audit.duplicateJobKeys || 0, nonCanonicalReplyToCount: audit.nonCanonicalReplyToCount || 0, teamFirstNameCount: audit.teamFirstNameCount || 0, realSendsDetected: audit.realSendsDetected || 0, clean: audit.clean ? 'YES' : 'NO',
    // These two counts are the SAME diagnostic-only "not yet synced to NOVA" signal
    // v6AuraCampanaAMatchReport_ always reported -- matchReportNote makes explicit, in the
    // durable row itself, that they were never a recipient gate: every one of them that named a
    // real, resolvable account is still reflected in recipientsCampanaASourceOnly above.
    matchReportAccountsUnmatched: matchReport.accountsUnmatched || 0, matchReportContactsUnmatched: matchReport.contactsUnmatched || 0,
    matchReportNote: 'DIAGNOSTIC ONLY (NOVA sync coverage) -- never excludes a recipient; see recipientsCampanaASourceOnly for the real CONTACT_SOURCE_ONLY inclusion count'
  };
}
function v6AuraCampanaAPersistRunSummary_(runId, result) {
  v6AuraCampanaAEnsureRunSummarySheet_();
  var record = v6AuraCampanaABuildRunSummaryRecord_(runId, result);
  v6UpsertByKey_('MKT_AURA_CAMPANA_A_RUN_SUMMARY', ['runId'], record);
  return record;
}
// Read-only: the most recent run's full, durable summary -- the one function DGL (or the AURA
// dashboard) should ever need to answer "what happened in the last Campana A run," without the
// execution log and without re-running anything.
function v6AuraCampanaALatestRunSummary_() {
  var rows = v6Rows_('MKT_AURA_CAMPANA_A_RUN_SUMMARY');
  if (!rows.length) return { found: false, status: 'NO_RUN_RECORDED' };
  var latest = rows.reduce(function (a, b) { return v6AuraEmailText_(b.runAt) > v6AuraEmailText_(a.runAt) ? b : a; });
  // `status` here is intentionally the run's OWN outcome (REGENERATE_COMPLETE/
  // SOURCE_EMPTY_OR_NOT_FOUND/CHECKPOINTED_TIME_BUDGET_EXCEEDED, from the row itself) -- `found`
  // is the separate "a row exists at all" signal, so the two are never conflated.
  return Object.assign({ found: true }, latest);
}

function v6AuraCampanaARegenerateDryRun_() {
  var runId = 'RUN-CAMPANA-A-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  v6AuraCampanaALog_('REGENERATE_START (runId=' + runId + ')');
  var tTotal0 = Date.now();
  auraDisableLiveSending();
  // Idempotent (checks existing triggers by handler name before creating one -- never
  // duplicates). Installed here so the one manual execution DGL runs also confirms the
  // dispatcher's own hourly trigger exists, without requiring a second manual step.
  v6AuraCampanaALog_('TRIGGER_INSTALL_START');
  var triggerStatus = (typeof auraInstallTriggers === 'function') ? auraInstallTriggers() : { status: 'NOT_AVAILABLE' };
  v6AuraCampanaALog_('TRIGGER_INSTALL_END (' + triggerStatus.status + ')');

  var ingest = v6AuraCampanaAIngestFromSpreadsheet_();

  // Performance fix (2026-09-16, second timeout at the same ~30-minute duration as the first):
  // v6AuraGmailReprocessRecent_ searches Gmail and, for every matching message, may convert an
  // XLSX attachment to a throwaway Google Sheet via the Drive Advanced Service (create, open,
  // read every tab, delete) -- a genuinely slow, network-bound operation with no relationship to
  // Sheets I/O, and therefore untouched by the MKT_EMAIL_QUEUE/MKT_AUDIENCES/
  // MKT_AURA_GMAIL_OPPORTUNITIES batching fix. It is explicitly documented (see its own comment)
  // as a best-effort FALLBACK path only needed when the primary, direct-spreadsheet read (above)
  // did not itself produce a usable result -- when the direct read already succeeded, reprocessing
  // Gmail is redundant work reprocessing the exact same accounts a second, much slower way, not a
  // required protection. Skipping it in that case removes no eligibility/suppression/governance
  // check and processes no fewer contacts or accounts -- v6AuraCampanaABuildQueue_ never reads
  // from Gmail-sourced data directly for THIS campaign's own tab; it only reads
  // MKT_AURA_GMAIL_OPPORTUNITIES rows sourced from THIS tab, which the direct read above already
  // populated. v6AuraGmailProcessMessage_'s own per-row upsert loop was also fixed in this same
  // pass (batched, MarketingV6AuraGmailIngest.gs) for the case where this fallback DOES need to
  // run (ingest failure) or for the separately-scheduled hourly Gmail tick.
  var gmailReprocess = null, gmailReprocessMs = 0;
  if (ingest && ingest.status === 'OK') {
    v6AuraCampanaALog_('GMAIL_REPROCESS_SKIPPED (direct spreadsheet read already succeeded; the Gmail fallback would only reprocess the same accounts redundantly)');
  } else if (typeof v6AuraGmailReprocessRecent_ === 'function') {
    v6AuraCampanaALog_('GMAIL_REPROCESS_START (direct read did not fully succeed: ' + (ingest && ingest.status) + ')');
    var tGmail0 = Date.now();
    try { gmailReprocess = v6AuraGmailReprocessRecent_(45); } catch (err) { gmailReprocess = { status: 'ERROR', error: String(err && err.message || err) }; /* best-effort fallback source only, never fatal to the direct read */ }
    gmailReprocessMs = Date.now() - tGmail0;
    v6AuraCampanaALog_('GMAIL_REPROCESS_END (' + gmailReprocessMs + 'ms, ' + JSON.stringify(gmailReprocess && gmailReprocess.status) + ')');
  }

  // v6RefreshOpportunitiesFromReports_ is the SHARED, cross-family (QNB/Activation/Retention/Reactivation/
  // Cross-Sell/Nurture) detection refresh -- it reads the full real NOVA/AM report workbook
  // (several tabs, the entire account base, not just this campaign's ~65 accounts) and was never
  // part of Campana A's own O(n^2) bug (its own write path, v6WriteOpportunities_, already does a
  // single clear + single batch write). It is timed and logged here for the first time so a real
  // slowdown caused by report VOLUME (as opposed to a code-level O(n^2) pattern) is visible
  // instead of silently absorbed into "the Campana A run is slow."
  var refreshOpportunities = null, refreshOpportunitiesMs = 0;
  if (typeof v6RefreshOpportunitiesFromReports_ === 'function') {
    v6AuraCampanaALog_('REFRESH_OPPORTUNITIES_START (shared cross-family detection refresh, full account base)');
    var tRefresh0 = Date.now();
    refreshOpportunities = v6RefreshOpportunitiesFromReports_();
    refreshOpportunitiesMs = Date.now() - tRefresh0;
    v6AuraCampanaALog_('REFRESH_OPPORTUNITIES_END (' + refreshOpportunitiesMs + 'ms)');
  }

  var build = v6AuraCampanaABuildQueue_();
  // Preflight runs BEFORE dispatch, every time, in both DRY_RUN and LIVE -- any job that cannot
  // be safely determined (invalid email, missing/invalid reply-to, an exclusion that appeared
  // since the job was built) is individually suppressed here and never reaches dispatch at all;
  // every other job in the campaign proceeds unaffected.
  var preflight = v6AuraCampanaAPreflight_();
  var dispatch = v6AuraCampanaADispatchAll_();
  v6AuraCampanaALog_('AUDIT_START');
  var tAudit0 = Date.now();
  var audit = v6AuraCampanaAAudit_();
  var auditMs = Date.now() - tAudit0;
  v6AuraCampanaALog_('AUDIT_END (' + auditMs + 'ms)');
  var profile = Object.assign(
    { SOURCE_READ_MS: 0, PARSE_MS: 0 }, ingest && ingest.profile,
    { MATCH_MS: 0, LANGUAGE_MS: 0, ELIGIBILITY_MS: 0, COPY_MS: 0, QUEUE_WRITE_MS: 0 }, build && build.profile,
    { AUDIT_MS: auditMs, GMAIL_REPROCESS_MS: gmailReprocessMs, REFRESH_OPPORTUNITIES_MS: refreshOpportunitiesMs }
  );
  profile.TOTAL_MS = Date.now() - tTotal0;
  var result = {
    runId: runId,
    status: audit.sourceStatus === 'SOURCE_EMPTY_OR_NOT_FOUND' ? 'SOURCE_EMPTY_OR_NOT_FOUND' : (build.status === 'CHECKPOINTED_TIME_BUDGET_EXCEEDED' ? 'CHECKPOINTED_TIME_BUDGET_EXCEEDED' : 'REGENERATE_COMPLETE'),
    sendMode: v6AuraSendMode_(), triggerStatus: triggerStatus, ingest: ingest, gmailReprocess: gmailReprocess, refreshOpportunities: refreshOpportunities, build: build, preflight: preflight, dispatch: dispatch, audit: audit,
    profile: profile
  };
  // Persisted BEFORE the final log line, so even if the Apps Script log panel truncates or the
  // human closes it before scrolling, the durable row already exists -- never dependent on the
  // log being read at all. Never throws: a persistence failure must not mask the real result the
  // caller (and, in DRY_RUN, the whole go-live decision) depends on.
  try { v6AuraCampanaAPersistRunSummary_(runId, result); } catch (err) { v6AuraCampanaALog_('RUN_SUMMARY_PERSIST_FAILED (' + String(err && err.message || err) + ')'); }
  v6AuraCampanaALog_('REGENERATE_END (runId=' + runId + ', TOTAL_MS=' + profile.TOTAL_MS + ')');
  return result;
}
// A human running this from the Apps Script editor has no other way to see the FINAL result once
// the execution ends (the Cloud Logging entry for a given run is not always available/retained),
// so this prints the exact same object the function already returns, plus the specific fields DGL
// asked to see at a glance without parsing the full JSON. v6AuraCampanaARegenerateDryRun_ itself
// (and every function it calls) now ALSO logs real-time START/END stage markers as they happen
// (v6AuraCampanaALog_) -- visible live in the execution transcript even if the run never reaches
// this wrapper's own final log line, so a future timeout is diagnosable by "which stage's START
// line is the last one logged" instead of only after-the-fact. Never throws on a logging
// failure -- the real result is still returned either way.
function RUN_AURA_CAMPANA_A_REGENERATE_DRY_RUN() {
  var result = v6AuraCampanaARegenerateDryRun_();
  try {
    console.log(JSON.stringify(result));
    console.log(JSON.stringify({
      status: result.status, sourceStatus: result.audit && result.audit.sourceStatus,
      spreadsheetId: result.ingest && result.ingest.spreadsheetId, ingestStatus: result.ingest && result.ingest.status,
      sendMode: result.sendMode,
      recipients: result.build && result.build.recipients,
      built: result.build && result.build.built,
      blockedNoReplyTo: result.build && result.build.blockedNoReplyTo,
      preflightWouldSend: result.preflight && result.preflight.wouldSend,
      preflightSuppressed: result.preflight && result.preflight.suppressedByPreflight,
      preflightReadyForLive: result.preflight && result.preflight.readyForLive,
      preflightByLanguage: result.preflight && result.preflight.byLanguage,
      dispatchSuppressed: result.dispatch && result.dispatch.suppressed,
      dispatchFailed: result.dispatch && result.dispatch.failed,
      invalidEmailCount: result.audit && result.audit.invalidEmailCount,
      duplicateJobKeys: result.audit && result.audit.duplicateJobKeys,
      byLanguage: result.audit && result.audit.byLanguage,
      byLanguageSource: result.audit && result.audit.byLanguageSource,
      headersFound: result.ingest && result.ingest.headersFound,
      stoppedBreakdown: result.audit && result.audit.stoppedBreakdown,
      matchReport: result.audit && result.audit.matchReport,
      realSendsDetected: result.audit && result.audit.realSendsDetected,
      findings: result.audit && result.audit.findings,
      gmailReprocessSkipped: result.gmailReprocess === null,
      gmailReprocessStatus: result.gmailReprocess && result.gmailReprocess.status,
      refreshOpportunitiesStatus: result.refreshOpportunities && result.refreshOpportunities.status,
      profile: result.profile
    }));
  } catch (err) { /* logging must never mask the real result */ }
  return result;
}
