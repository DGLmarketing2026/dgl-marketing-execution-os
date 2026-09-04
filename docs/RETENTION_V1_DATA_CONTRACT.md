# Retention V1 Data Contract

## Canonical architecture note

`MIGRACION_CAIDAS` is a NOVA/Salesforce-derived export. `CUENTAS` is **AM Intelligence** output (ownership, bucket, Chatter/commercial activity, relationship status) — per the canonical flow `NOVA/SALESFORCE -> AM PLATFORM / AM INTELLIGENCE -> AURA -> MARKETING OS`, it is the required upstream gate for Retention detection, not optional enrichment. A `MIGRACION_CAIDAS` candidate with no `CUENTAS` match is held (`AM CONTEXT REQUIRED`), never advanced to `DETECTED` on NOVA-only fields.

## Report source fields actually used

All report reads go through `v6ReportRows_(sheetName)` against the private `MKT_V6_REPORT_SOURCE_ID` spreadsheet (`backend/apps-script-v6/MarketingV6ReportIngestion.gs:1-14`). Headers are trimmed; row objects are keyed by the raw (trimmed) header text.

### `MIGRACION_CAIDAS` (Retention detection source)

| Field used | Purpose |
|---|---|
| `Cuenta` | account name; normalized via `v6NormAccount_` to build the join key and `ACC-<hash>` accountId |
| `Sin dueno` | own-row owner-required check (`v6Yes_`) |
| `Sales Rep` | own-row house-account check; also written as `amOwner` |
| `Ultimo load` | `signalDate` (via `v6IsoDate_`) |
| `Tier origen`, `Tier destino` | `sourceRecordId` (`"<origen>><destino>"`); `Tier destino` is now **also** copied verbatim into a new additive field, `tierDestino`, on every Retention opportunity row (`v6BuildRetentionOpportunities_`, `MarketingV6ReportIngestion.gs`), so the AM CSV report (`docs/RETENTION_V1_ARCHITECTURE.md`, AM CSV Report section) can show the destination tier directly instead of parsing it back out of the concatenated `sourceRecordId` string. `sourceRecordId` itself is unchanged. |

### `CUENTAS` (AM-activity evidence, joined onto Retention rows — new in this branch)

Indexed by `v6CuentasIndex_()` keyed on normalized `Cuenta` (same normalization as `MIGRACION_CAIDAS.Cuenta`, so the join is a plain key lookup, never a name-similarity match).

| Field used | Purpose |
|---|---|
| `Cuenta` | join key |
| `Bucket` | decision input (see Bucket -> decision table below) |
| `Sales Rep` | secondary owner-required check |
| `Falso positivo` | `v6Yes_` -> `FALSE POSITIVE` |
| `Solo cobranza` | `v6Yes_` -> `COLLECTIONS` |
| `Tipo gestion` | trimmed/uppercased; only meaningful in combination with certain Buckets (contradiction check) |
| `Ultimo Chatter` | copied as `amActivityUltimoChatter` (via `v6IsoDate_`) — evidence only |
| `Autor Chatter` | copied as `amActivityAutorChatter` — evidence only |

This is the same `CUENTAS` sheet already read by `v6BuildReactivationOpportunities_` for the Reactivation family — no new sheet, no new credentials, no new spreadsheet ID.

### `FICHA_CLIENTES` (unchanged, service enrichment)

Used only for `v6ServiceFromFicha_` (`FTL`/`LTL`/`Drayage` volume columns) to set Retention's `service` field. Not modified in this branch.

### `LOADS_ORIGEN_LQ` (commercial attribution source — new in this branch)

| Field used | Purpose |
|---|---|
| `Load` | `loadId` |
| `Cliente` | account name for resolution against `MKT_ACCOUNTS` |
| `Monto` | copied as `attributedRevenue`, `Number(row.Monto||0)`, never recalculated or summed |
| `Fecha load` | `loadAt` (via `v6IsoDate_`) |
| `Area`, `Dispatcher`, `LQ de origen`, `Fecha LQ`, `Origen` | present in the report but not currently consumed by `v6IngestCommercialOutcomes_`; reserved for future enrichment, not used to derive `accountId` or `campaignId` in this version |

## Bucket -> decision mapping (Retention `reason`, evaluated in this exact order — first match wins)

1. `MIGRACION_CAIDAS.Sin dueno` is truthy (`v6Yes_`) OR `MIGRACION_CAIDAS['Sales Rep']` (case-insensitive) equals `house account` -> `OWNER REQUIRED`.
2. Else, if there is **no** `CUENTAS` (AM Intelligence) match at all -> `AM CONTEXT REQUIRED`. Canonical-architecture gate: a NOVA-only signal (`MIGRACION_CAIDAS`) must not advance without the corresponding AM Intelligence record; this is enforced before any bucket/field evaluation below, which all require a match to even run.
3. Else (a `CUENTAS` match exists), if `Bucket === '1. SIN DUENO'` OR `CUENTAS['Sales Rep']` is `house account` -> `OWNER REQUIRED`.
4. Else, if `CUENTAS['Falso positivo']` is truthy -> `FALSE POSITIVE`.
5. Else, if `CUENTAS['Solo cobranza']` is truthy -> `COLLECTIONS`.
6. Else, if `CUENTAS.Bucket` is one of `['6. COTIZAN Y NO CIERRAN', '7. CASOS EXTREMOS', '8. GESTIONADAS SIN OPERAR']` -> `AM ACTIVITY REVIEW REQUIRED` (activity exists, didn't convert; needs AM review before automated retention outreach).
7. Else, if `CUENTAS.Bucket` is one of `['2. OPERA SIN GESTION', '3. SIN GESTION CRITICO', '4. SIN GESTION ALTO', '5. SIN GESTION MEDIO']` AND `CUENTAS['Tipo gestion']` (trimmed, uppercased) `=== 'COMERCIAL'` -> `AM ACTIVITY REVIEW REQUIRED` (contradiction: bucket says "no management happening" but the last recorded management type says commercial activity did occur — ambiguous, do not auto-suppress silently and do not auto-detect silently; flag for review).
8. Else (a `CUENTAS` match exists and its bucket confirms genuine absence of management with no contradiction) -> no reason, `eligibilityStatus:'DETECTED'`.

`eligibilityStatus = reason ? 'SUPPRESSED' : 'DETECTED'`. A missing `CUENTAS` match **fails closed** (`AM CONTEXT REQUIRED`, rule 2) — `DETECTED` is only reachable through rule 8, which requires a `CUENTAS` match to exist. See `tests/v6-retention-am-activity.test.js`, test 7.

After per-row rules, the shared `v6ApplyPrioritySuppression_` still applies cross-family suppression (`HIGHER PRIORITY SIGNAL`) — Retention (`priorityRank:2`) is superseded by QNB (`priorityRank:1`) for the same account, unchanged from before this branch.

## `suppressionReason` vocabulary (Retention family)

| Value | Meaning | Introduced |
|---|---|---|
| `OWNER REQUIRED` | account has no assigned AM / is a house account | existing |
| `HIGHER PRIORITY SIGNAL` | a higher-priority opportunity family (e.g. QNB) already claims this account | existing (cross-family) |
| `AM CONTEXT REQUIRED` | no `CUENTAS` (AM Intelligence) record found for this account — a NOVA-only signal cannot advance per the canonical architecture | new (Retention V1 only) |
| `FALSE POSITIVE` | AM has flagged this Retention signal as a false positive in `CUENTAS` | new (Retention V1; already existed for Reactivation) |
| `COLLECTIONS` | account activity is collections-only, not commercial | new (Retention V1; already existed for Reactivation) |
| `AM ACTIVITY REVIEW REQUIRED` | AM activity evidence is ambiguous or contradictory relative to the "no management" bucket — requires human AM review before automated retention outreach | new (Retention V1 only) |
| *(empty string)* | no suppression; `eligibilityStatus:'DETECTED'` — only reachable when an AM Intelligence match exists | existing |

## AccountId strategy (unchanged — hash + crosswalk)

Retention opportunity rows keep the exact same `accountId` derivation used by every other opportunity family in `MarketingV6ReportIngestion.gs`: `accountId: 'ACC-' + v6HashKey_(v6NormAccount_(r.Cuenta))` — a deterministic MD5-derived hash of the normalized account name, **not** a Salesforce ID. This is intentional and unchanged by this branch: opportunity detection runs against private report snapshots that only carry account names, so the opportunity engine cannot know the Salesforce Account ID at detection time.

The authoritative crosswalk lives one layer down, in `MKT_ACCOUNTS` (`accountId, externalSystem, externalAccountId, salesforceAccountId, accountName, ...`), populated by `v6IngestAuthoritativeContacts_` (`MarketingV6ContactIngestion.gs`) from Salesforce/authorized sources. `v6ContactAccountId_` there prefers an existing crosswalk row over any supplied `accountId`, and falls back to the same `'ACC-' + v6HashKey_(v6NormAccount_(accountName))` scheme when no crosswalk exists yet — so as long as the account name is stable, the hash-derived `accountId` used by the opportunity engine and the one used by contact ingestion converge to the same value (verified by the existing `tests/v6-contact-ingestion.test.js`, "opportunity engine identities must match" assertion).

`v6IngestCommercialOutcomes_` (new) explicitly does **not** use the hash scheme to resolve `accountId` for attribution — per the "never join by account name" hard rule, it only accepts a match in `MKT_ACCOUNTS` where `salesforceAccountId` or `externalAccountId` is populated (i.e., a real, authoritative crosswalk), and only if that match is unique. A same-named account with no crosswalk yet, or an ambiguous (non-unique) name match, is left unresolved (`unresolvedCount`) rather than guessed.

## Canonical ID Bridge (`salesforceAccountId` / `salesforceContactId` population fix)

**Diagnosis, confirmed by direct inspection of `MarketingV6ContactIngestion.gs` on this branch before any change:** the user-reported symptom (`MKT_ACCOUNTS` / `MKT_CONTACTS_SECURE` have real rows with `externalSystem='SALESFORCE_EXPORT'` and a populated `externalAccountId`/`externalContactId`, but an empty `salesforceAccountId`/`salesforceContactId`) was real and root-caused exactly as suspected: `v6IngestAuthoritativeContacts_` gated the assignment with an **exact-match** comparison, `source==='SALESFORCE'`. Real authoritative extracts arrive with `externalSystem='SALESFORCE_EXPORT'`, which is not exactly `'SALESFORCE'`, so that comparison was always `false` for real data — while the corresponding `externalAccountId`/`externalContactId` assignment lines have no such gate and were always populated. Confirmed, not refuted.

**Fix:** `v6ContactIsSalesforceSource_(source)` (`MarketingV6ContactIngestion.gs`) replaces the exact-match gate with `/SALESFORCE/.test(String(source||'').toUpperCase())` — a substring test that accepts `'SALESFORCE'`, `'SALESFORCE_EXPORT'`, and any reasonable future variant containing the word, without hardcoding a second literal as if it were the only valid one. Used identically for both the account (`salesforceAccountId`) and contact (`salesforceContactId`) assignment.

**New field:** every `MKT_ACCOUNTS` and `MKT_CONTACTS_SECURE` record written by `v6IngestAuthoritativeContacts_` now also carries `canonicalSalesforceIdStatus`: `'RESOLVED'` if the corresponding Salesforce mirror field ended up populated after the fix above, `'UNRESOLVED'` otherwise (e.g. no `externalAccountId`/`externalContactId` was ever supplied, or the source isn't Salesforce-derived at all). No other value is produced. This is additive, same pattern as the existing `amActivity*` evidence fields on Retention opportunity rows.

**Schema:** `MKT_V6_CONTACT_RECIPIENT_SCHEMA` (`MarketingV6SchemaMigration.gs`) now lists `canonicalSalesforceIdStatus` for both `MKT_ACCOUNTS` and `MKT_CONTACTS_SECURE`. Schema is append-only and unchanged in mechanism: `v6EnsureContactRecipientSchema_()` (unmodified) appends the missing header the next time it runs against the real sheets.

**`v6UpsertByKey_` vs `v6WriteOpportunities_` behavior on an unknown field — verified, not assumed:** both behave identically. `v6UpsertByKey_` (`MarketingV6FrequencyControl.gs`) builds the row to write as `t.headers.map(function(h){return record[h]==null?'':record[h];})` — it only ever reads the header names that already exist on the sheet; a `record` field with no matching header is silently never written, exactly like `v6WriteOpportunities_`'s `headers.map(function(h){return r[h]==null?'':r[h];})`. **There is no difference between the two functions on this point.** The real risk is not in `v6UpsertByKey_` itself but in `v6IngestAuthoritativeContacts_`'s own pre-flight guard: it calls `v6RequireContactRecipientHeaders_('MKT_ACCOUNTS')` / `('MKT_CONTACTS_SECURE')` *before* any upsert, and that guard throws `SCHEMA MIGRATION REQUIRED` if any header listed in `MKT_V6_CONTACT_RECIPIENT_SCHEMA` for that table is missing from the real sheet. Practical consequence: once this branch is deployed, `v6IngestAuthoritativeContacts_` will throw on every call against the real Data Hub until `v6EnsureContactRecipientSchema_()` is run once to append the new `canonicalSalesforceIdStatus` column to both sheets — see `docs/AURA_DEPLOYMENT.md` step 2.

**Audit:** `v6AuraAuditCanonicalIds_()` (new, `MarketingV6CanonicalIdentity.gs`) reads `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` and returns `{accounts:{total,RESOLVED,UNRESOLVED,MISSING}, contacts:{total,RESOLVED,UNRESOLVED,MISSING}}` — safe aggregate counts only, no `accountName`/email/phone. `MISSING` is distinct from `UNRESOLVED`: it means the record predates this field entirely (the column didn't exist yet when the row was written), whereas `UNRESOLVED` means the field exists and explicitly says no Salesforce ID could be resolved. Registered in the router as `v6AuraAuditCanonicalIds`.

## Campaign scope identity (AURA Retention Bridge)

`v6AuraAutoBuildRetentionScopes_` / `v6AuraEnsureCampaignScope_` (`MarketingV6AuraBridge.gs`) write `MKT_CAMPAIGN_SCOPES` (`scopeId, audienceId, campaignId, campaignType, opportunityType, updatedAt`) and `MKT_SCOPE_ACCOUNTS` (`scopeId, audienceId, campaignId, accountId, eligibilityStatus, updatedAt`) — the exact schema already documented in `backend/apps-script-v6/README_INSTALL_V6.md` and already consumed by `v6RecipientCampaignContext_`/`v6ResolveRecipients_`. No new columns were added.

`scopeId` is computed by `v6AuraScopeId_`/`v6AuraSlug_`, a byte-for-byte port of the frontend's `scopeId()`/`slug()` in `assets/js/lifecycle-modules-v6.js`, grouping Retention's DETECTED accounts by `(amOwner, service)` (Retention rows never carry a window or reasonCategory at the backend level, same as the frontend's grouping for this family). Keeping the two implementations byte-identical is deliberate: a scope built here and a scope the frontend would compute for the same group must resolve to the same ID. `campaignId` is left blank on these rows — assigning one is the private, out-of-pack backend's job (`createRequest`/`createCampaign` in `campaign-scope-bridge-v6.js`'s adapter calls); `v6RecipientCampaignContext_` can still resolve the scope by `scopeId` once a `MKT_CAMPAIGNS` row referencing the same `scopeId` exists.
