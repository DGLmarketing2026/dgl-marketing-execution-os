// AURA — "Campana A - HA prioritaria" dedicated pipeline (Phase 1 activation).
//
// DGL asked AURA to work, for this first phase, with EXACTLY ONE tab (65 accounts / 227
// contacts) from the House-Account priority Retention report, ignoring every other tab in the
// same workbook (including Campana B), and to add real per-contact ES/EN/PT language selection
// and generic-name detection that the shared, multi-source Retention pipeline
// (MarketingV6AuraAutomation.gs, MarketingV6AuraEmailDispatcher.gs) does not need and must not
// change for every other campaign. Rather than bolt single-purpose behavior onto shared code,
// this file is a self-contained, dedicated pipeline: it reuses every existing governed engine
// (v6ResolveRecipients_ for suppression/frequency/DNC/exclusion-vetted eligibility,
// v6AuraPolicyApproved_ for approval policy, v6AuraEmailCanonicalReplyTo_/v6AuraEmailValid_/
// v6AuraEmailAccountStopped_/v6AuraEmailJobId_/v6AuraGenerateCopy_/v6AuraEmailHtml_ from the
// email dispatcher and copy engine) and adds nothing new to those engines except the one
// exclusion registered in v6AuraAutoBuildScopesForFamily_ (MarketingV6AuraAutomation.gs) that
// keeps this dedicated pipeline's accounts from ALSO being auto-grouped by the shared,
// multi-source mechanism.

var CAMPANA_A_SHEET_NAME_ = 'Campana A - HA prioritaria';
var CAMPANA_A_CAMPAIGN_ID_ = 'CMP-CAMPANA-A-HA-PRIORITARIA';
var CAMPANA_A_SCOPE_ID_ = 'SCOPE-CAMPANA-A-HA-PRIORITARIA';

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
// exact same header-detection/column-parsing engine and idempotent upsert the Gmail attachment
// path already uses (v6AuraGmailParseTable_ / v6AuraGmailUpsertOpportunity_, both pure
// data-in/data-out functions with no Gmail dependency of their own) so a row accepted this way is
// indistinguishable from one accepted via email -- one governed opportunity pipeline, two ways to
// reach it. Fails closed with a specific, distinguishable status at every real failure point
// (property unset, file inaccessible, tab missing, tab recognized but empty) -- never silently
// returns zero rows without saying why.
function v6AuraCampanaAIngestFromSpreadsheet_() {
  var spreadsheetId = v6AuraCampanaAResolveSourceSpreadsheetId_();
  if (!spreadsheetId) return { status: 'SPREADSHEET_ID_NOT_CONFIGURED', spreadsheetId: '' };
  var ss;
  try { ss = SpreadsheetApp.openById(spreadsheetId); }
  catch (err) { return { status: 'SPREADSHEET_NOT_ACCESSIBLE', spreadsheetId: spreadsheetId, error: String(err && err.message || err) }; }
  var sheet = ss.getSheetByName(CAMPANA_A_SHEET_NAME_);
  if (!sheet) {
    return {
      status: 'TAB_NOT_FOUND', spreadsheetId: spreadsheetId, sheetName: CAMPANA_A_SHEET_NAME_,
      availableSheets: ss.getSheets().map(function (s) { return s.getName(); })
    };
  }
  var values = sheet.getDataRange().getValues();
  // Diagnostic ground truth FIRST, independent of whether v6AuraGmailParseTable_ recognizes the
  // layout below -- every real row, every real header name, persisted before any accept/reject
  // decision, so "what does the tab actually contain" never depends on guessing.
  var sourceRows = v6AuraCampanaAParseSourceRows_(values);
  if (sourceRows.status === 'OK') v6AuraCampanaAPersistSourceRows_(sourceRows.rows);
  var ctx = { messageId: 'DIRECT_SPREADSHEET_READ:' + spreadsheetId, receivedAt: new Date().toISOString(), sourceFile: 'Marketing_DGL_14-09-2026' };
  var parsed = v6AuraGmailParseTable_(CAMPANA_A_SHEET_NAME_, values, ctx);
  if (!parsed || parsed.unrecognizedLayout) {
    return { status: 'TAB_EMPTY_OR_UNRECOGNIZED_LAYOUT', spreadsheetId: spreadsheetId, sheetName: CAMPANA_A_SHEET_NAME_, rowsInSheet: values.length, headersFound: sourceRows.headers };
  }
  var created = 0, updated = 0;
  parsed.accepted.forEach(function (candidate) {
    var result = v6AuraGmailUpsertOpportunity_(candidate, ctx);
    if (result === 'created') created++; else updated++;
  });
  var contactColumnsFound = sourceRows.rows.filter(function (r) { return r.contactName || r.email; }).length;
  var countryColumnFound = sourceRows.rows.filter(function (r) { return r.country; }).length;
  return {
    status: parsed.accepted.length ? 'OK' : 'TAB_FOUND_BUT_ZERO_ACCEPTED_ROWS',
    spreadsheetId: spreadsheetId, sheetName: CAMPANA_A_SHEET_NAME_, rowsInSheet: values.length,
    headersFound: sourceRows.headers,
    rowsParsed: parsed.rowCount, accepted: parsed.accepted.length, rejected: parsed.rejected.length,
    created: created, updated: updated,
    sourceRowsCaptured: sourceRows.rows.length, rowsWithContactOrEmail: contactColumnsFound, rowsWithCountry: countryColumnFound
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
function v6AuraCampanaAPersistSourceRows_(rows) {
  v6AuraCampanaAEnsureSourceRowsSheet_();
  var now = new Date().toISOString();
  rows.forEach(function (r) {
    v6UpsertByKey_('MKT_AURA_CAMPANA_A_SOURCE_ROWS', ['sourceRow'], Object.assign({}, r, { capturedAt: now }));
  });
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

// --- Match report: no silent joins ------------------------------------------------------------
// Compares the real, captured source rows (MKT_AURA_CAMPANA_A_SOURCE_ROWS -- written by
// v6AuraCampanaAIngestFromSpreadsheet_ from the actual tab, before any accept/reject decision)
// against the real MKT_ACCOUNTS/MKT_CONTACTS_SECURE tables, reporting exact counts and exact
// unmatched names/emails -- never a percentage guess. Matches an account by the existing
// hash-derived accountId first (v6AuraGmailOpportunityId_'s scheme, already the join key
// v6AuraCampanaAAccountMap_ depends on), then, if that misses, by the deterministic normalized
// name (accounts for legitimate spelling differences like a missing/extra "Corp" -- never a
// fuzzy/similarity match that could conflate two different real companies).
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
function v6AuraDedicatedAccountIds_() {
  var out = {};
  Object.keys(v6AuraCampanaAAccountMap_()).forEach(function (id) { out[id] = true; });
  return out;
}

// --- Name reliability --------------------------------------------------------------------------
// Denylist matches the exact examples DGL gave (Pricing Team, Sales Team, Correo Corporativo,
// Imports, Operations) plus a few equally generic role/mailbox labels already seen in this
// codebase's own contact data conventions. Fails closed to "no name" (never a guess) whenever a
// value looks like a role, a department, a mailbox alias, or is empty -- matching the exact
// output DGL asked for ("Seguimos cerca de la operación de Progeral Corp", never "Team, ...").
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
// Every AURA Retention copy template's ONLY use of {{firstName}} is as a leading
// "{{firstName}}, ..." subject clause (MarketingV6AuraCopyEngine.gs) -- headline/body/body2/
// preheader never reference it. So a name-aware subject only needs to handle that one real
// pattern: with no reliable name, drop the "{{firstName}}, " prefix and capitalize what follows
// (DGL's own example: "Team, seguimos cerca de la operación de Progeral Corp" -> "Seguimos cerca
// de la operación de Progeral Corp"), instead of ever sending a fabricated "Team,".
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
function v6AuraCampanaAEnsureCampaignAndScope_() {
  var accountMap = v6AuraCampanaAAccountMap_();
  var accountIds = Object.keys(accountMap).filter(Boolean);
  var now = new Date().toISOString();
  v6UpsertByKey_('MKT_CAMPAIGNS', ['campaignId'], {
    campaignId: CAMPANA_A_CAMPAIGN_ID_, scopeId: CAMPANA_A_SCOPE_ID_,
    campaignName: 'Retencion Prioritaria - Campana A (HA)', campaignType: 'Retention', objective: 'Retention',
    service: 'Multiservicio', amOwner: 'Multiple', language: 'Spanish', status: 'AUTO_ACTIVE',
    createdAt: now, updatedAt: now
  });
  v6AuraEnsureCampaignScope_({
    scopeId: CAMPANA_A_SCOPE_ID_, campaignId: CAMPANA_A_CAMPAIGN_ID_,
    opportunityType: 'Retention', campaignType: 'Retention', accountIds: accountIds
  });
  return { accountIds: accountIds, count: accountIds.length };
}

// --- Queue build (idempotent; never rebuilds a job that already exists) ----------------------
function v6AuraCampanaABuildQueue_() {
  v6EnsureContactRecipientSchema_();
  var setup = v6AuraCampanaAEnsureCampaignAndScope_();
  var result = { status: setup.count ? 'QUEUE_BUILD_COMPLETE' : 'SOURCE_EMPTY_OR_NOT_FOUND', campaignId: CAMPANA_A_CAMPAIGN_ID_, accounts: setup.count, recipients: 0, built: 0, skippedExisting: 0, skippedIneligible: 0, blockedNoReplyTo: 0, byLanguage: { ES: 0, EN: 0, PT: 0 } };
  if (!setup.count) return result;

  var accountMap = v6AuraCampanaAAccountMap_();
  var campaign = v6Rows_('MKT_CAMPAIGNS').filter(function (c) { return v6AuraEmailText_(c.campaignId) === CAMPANA_A_CAMPAIGN_ID_; })[0] || {};
  v6ResolveRecipients_({ campaignId: CAMPANA_A_CAMPAIGN_ID_ });
  var recipients = v6Rows_('MKT_AUDIENCES').filter(function (r) {
    return v6AuraEmailText_(r.recordType) === 'RECIPIENT' && v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_ && v6AuraEmailText_(r.eligibilityStatus).toUpperCase() === 'ELIGIBLE';
  });
  result.recipients = recipients.length;

  var existingIds = {};
  v6Rows_('MKT_EMAIL_QUEUE').forEach(function (r) { existingIds[v6AuraEmailText_(r.jobId)] = true; });
  var accountsById = {}; v6Rows_('MKT_ACCOUNTS').forEach(function (a) { accountsById[v6AuraEmailText_(a.accountId)] = a; });
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
  var policyApproved = (typeof v6AuraPolicyApproved_ === 'function') ? v6AuraPolicyApproved_('Retention') : true;
  var copyCache = {};
  function copyFor(lang) {
    if (!copyCache[lang]) copyCache[lang] = v6AuraGenerateCopy_({}, Object.assign({}, campaign, { language: v6AuraCampanaALanguageCampaignFlag_(lang) }));
    return copyCache[lang];
  }

  var sequenceStep = 1;
  recipients.forEach(function (r) {
    var accountId = v6AuraEmailText_(r.accountId), contactId = v6AuraEmailText_(r.contactId);
    var jobId = v6AuraEmailJobId_(CAMPANA_A_CAMPAIGN_ID_, contactId, sequenceStep);
    if (existingIds[jobId]) { result.skippedExisting++; return; }
    if (!accountId || !contactId || !v6AuraEmailText_(r.email)) { result.skippedIneligible++; return; }

    var account = accountsById[accountId] || {};
    var contact = contactsById[contactId] || {};
    var gmailOpp = accountMap[accountId] || {};
    var tabCountry = tabCountryByAccountName[v6AuraEmailText_(gmailOpp.accountName)] || '';
    var langInfo = v6AuraCampanaAPreferredLanguage_(contact, account, tabCountry);
    result.byLanguage[langInfo.language] = (result.byLanguage[langInfo.language] || 0) + 1;
    var reliableName = v6AuraCampanaANameReliable_(contact.firstName);
    var vars = {
      firstName: reliableName, company: v6AuraEmailText_(account.accountName) || v6AuraEmailText_(gmailOpp.accountName) || 'your company',
      service: 'Multiservicio', replyTo: replyTo
    };
    var copy = copyFor(langInfo.language);
    // Real, exact stage this account is sitting at -- never just a boolean -- so a STOPPED job
    // is traceable to precisely why (which stage, when it entered it, and, when known, which
    // campaignId produced it) instead of an opaque true/false a human would have to re-derive by
    // hand later. v6PipelineAdvanced_/CLOSED-SUPPRESSED reproduces the exact same stop condition
    // v6AuraEmailAccountStopped_ already uses -- this does not change what counts as stopped.
    var pipelineRow = accountPipelineById[accountId] || null;
    var currentStage = pipelineRow ? String(pipelineRow.currentStage || '').toUpperCase() : '';
    var stopped = !!currentStage && (currentStage === 'CLOSED / SUPPRESSED' || (typeof v6PipelineAdvanced_ === 'function' && v6PipelineAdvanced_(currentStage)));
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
      playbookId: 'Retention', sequenceStep: sequenceStep, scheduledAt: now,
      approvalId: policyApproved ? '' : ('APR:' + CAMPANA_A_CAMPAIGN_ID_), approvedAt: '', approvedBy: '',
      stopOnResponse: true, country: country, preferredLanguage: langInfo.language,
      languageSource: langInfo.source, languageReason: langInfo.reason,
      stopReasonStage: stopped ? currentStage : '', stopReasonAt: stopped ? v6AuraEmailText_(pipelineRow.responseAt || pipelineRow.enteredStageAt) : '',
      stopReasonCampaignId: stopped ? v6AuraEmailText_(pipelineRow.campaignId) : ''
    };
    v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
    existingIds[jobId] = true;
    result.built++;
    if (replyToBlocked) result.blockedNoReplyTo++;
  });
  return result;
}

// --- STOPPED breakdown: exact counts by real stage, never a guess ----------------------------
// No suppression/frequency/stopOnResponse rule is changed here -- this only reads back the exact
// stage/timestamp/campaignId v6AuraCampanaABuildQueue_ already captured onto each STOPPED job,
// grouped for a real, auditable answer to "how many of these were RESPONDED vs QUOTED vs closed,
// and from which prior campaign."
function v6AuraCampanaAStoppedBreakdown_() {
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_ && r.status === 'STOPPED'; });
  var byStage = {}, byPriorCampaignId = {};
  jobs.forEach(function (j) {
    var stage = v6AuraEmailText_(j.stopReasonStage) || 'UNKNOWN';
    byStage[stage] = (byStage[stage] || 0) + 1;
    var priorCampaign = v6AuraEmailText_(j.stopReasonCampaignId) || 'UNKNOWN';
    byPriorCampaignId[priorCampaign] = (byPriorCampaignId[priorCampaign] || 0) + 1;
  });
  return {
    totalStopped: jobs.length, byStage: byStage, byPriorCampaignId: byPriorCampaignId,
    sample: jobs.slice(0, 10).map(function (j) { return { accountId: j.accountId, stage: j.stopReasonStage, at: j.stopReasonAt, priorCampaignId: j.stopReasonCampaignId }; })
  };
}

// --- Dispatch every pending Campana A job (loops the shared 50-per-call dispatcher; safe in
// DRY_RUN since no real send is ever possible, and this loop is only ever used by this
// dedicated, explicitly-invoked pipeline -- never by an automatic trigger). -----------------
function v6AuraCampanaADispatchAll_() {
  var totals = { rounds: 0, processed: 0, sent: 0, failed: 0, suppressed: 0, skipped: 0, stopped: 0, reviewRequired: 0, dryRun: 0 };
  var out;
  do {
    out = auraProcessEmailQueue(50);
    totals.rounds++; totals.processed += out.processed;
    totals.sent += out.sent; totals.failed += out.failed; totals.suppressed += out.suppressed;
    totals.skipped += out.skipped; totals.stopped += out.stopped; totals.reviewRequired += out.reviewRequired; totals.dryRun += out.dryRun;
  } while (out.processed === 50 && totals.rounds < 20);
  return totals;
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
  return Object.assign({}, base, {
    campaignId: CAMPANA_A_CAMPAIGN_ID_, jobsForCampaignA: jobs.length,
    sourceStatus: sourceEmpty ? 'SOURCE_EMPTY_OR_NOT_FOUND' : 'SOURCE_OK', sourceAccountCount: sourceAccountCount,
    byLanguage: byLanguage, byLanguageSource: byLanguageSource, byStatusForCampaignA: byStatus,
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
// (still DRY_RUN, so zero real sends), then runs the full QA audit.
function v6AuraCampanaARegenerateDryRun_() {
  auraDisableLiveSending();
  var ingest = v6AuraCampanaAIngestFromSpreadsheet_();
  if (typeof v6AuraGmailReprocessRecent_ === 'function') {
    try { v6AuraGmailReprocessRecent_(45); } catch (err) { /* best-effort fallback source only, never fatal to the direct read */ }
  }
  if (typeof v6RefreshOpportunitiesFromReports_ === 'function') v6RefreshOpportunitiesFromReports_();
  var build = v6AuraCampanaABuildQueue_();
  var dispatch = v6AuraCampanaADispatchAll_();
  var audit = v6AuraCampanaAAudit_();
  return {
    status: audit.sourceStatus === 'SOURCE_EMPTY_OR_NOT_FOUND' ? 'SOURCE_EMPTY_OR_NOT_FOUND' : 'REGENERATE_COMPLETE',
    sendMode: v6AuraSendMode_(), ingest: ingest, build: build, dispatch: dispatch, audit: audit
  };
}
// Logging lives ONLY in this public wrapper -- v6AuraCampanaARegenerateDryRun_ itself is
// unchanged, so anything calling it directly (tests, the router) sees identical behavior. A
// human running this from the Apps Script editor has no other way to see the result once the
// execution ends (the Cloud Logging entry for a given run is not always available/retained), so
// this prints the exact same object the function already returns, plus the specific fields DGL
// asked to see at a glance without parsing the full JSON. Never throws on a logging failure --
// the real result is still returned either way.
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
      findings: result.audit && result.audit.findings
    }));
  } catch (err) { /* logging must never mask the real result */ }
  return result;
}
