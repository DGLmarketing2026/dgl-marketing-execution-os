# AURA Deployment — one-time setup

This is the exact, one-time checklist to take Retention from `AURA_BLOCKED_ONLY_BY_DEPLOYMENT` to running automatically in production. Nothing in this document is optional cleanup — each numbered step removes one specific, named blocker. After steps 1–3 are done, Retention detection, suppression, campaign-scope build, the AM CSV report and the persisted run summary all run automatically on the existing 6-hour trigger, with no manual account list and no manual export at any point. Step 4 is what makes real-time response capture and attribution real; step 5 is what makes the report *source itself* self-refreshing; step 6 is what makes batch attribution resolve real accounts. All three depend on systems or decisions outside this repository that only DGL can wire.

## 0. What you are deploying

Ten `.gs` files, all inside `backend/apps-script-v6/`, on branch `retention/v1-am-activity-join`:

| File | Status |
|---|---|
| `MarketingV6ReportIngestion.gs` | modified — `CUENTAS` (AM Intelligence) join, `AM CONTEXT REQUIRED` gate, additive `tierDestino` field on Retention rows, `v6ScheduledOpportunityRefresh_` now calls `v6AuraRunRetentionCycle_` |
| `MarketingV6RouterExtension.gs` | modified — 11 new route entries total across this branch (7 from the earlier AURA Bridge pass + `v6AuraAuditCanonicalIds`, `v6AuraRetentionDryRun`, `v6AuraRunRetentionCycle`, `v6AuraRetentionRunSummary` this pass) |
| `MarketingV6Pipeline.gs` | modified — revenue aggregates in `v6PipelineSummary_` |
| `MarketingV6ContactIngestion.gs` | modified — Canonical ID Bridge fix: `v6ContactIsSalesforceSource_` replaces the exact-match `source==='SALESFORCE'` gate; new additive `canonicalSalesforceIdStatus` field |
| `MarketingV6SchemaMigration.gs` | modified — `canonicalSalesforceIdStatus` added to `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE`; new `MKT_RETENTION_RUN_SUMMARY` schema entry |
| `MarketingV6AuraBridge.gs` | modified — `v6AuraEvaluateRetention_` now calls the freshness gate before any refresh/scope-build |
| `MarketingV6ResponseEvents.gs` | new (earlier pass) — event classifier (`REPLY`/`RFQ`/`QUOTE`/`LOAD`/`BOUNCE`/`UNSUBSCRIBE`/`CLICK`) |
| `MarketingV6CommercialOutcomes.gs` | new (earlier pass) — batch attribution ingestion from `LOADS_ORIGEN_LQ` |
| `MarketingV6CanonicalIdentity.gs` | new (this pass) — `v6AuraAuditCanonicalIds_()`, read-only safe-aggregate audit |
| `MarketingV6DataFreshness.gs` | new (this pass) — `v6AuraCheckReportFreshness_()`, fail-closed staleness gate |
| `MarketingV6RetentionReport.gs` | new (this pass) — pilot dry run, AM decision mapper, AM CSV report, persisted run summary, single cycle orchestrator |

No customer/contact PII, credentials, account lists, quotes, loads or revenue snapshots are in any of these files — they are code only, reading/writing table names and safe aggregate fields, exactly like every other file already in this pack. The one generated artifact with real account-level detail, the AM CSV report, is written to private Drive at runtime — it is never committed to this repository.

## 1. Copy the files (one-time)

Copy all ten files above into the existing private Apps Script project (the one behind the current V6.6 Web App deployment), preserving filenames exactly. Do not rename, do not split, do not create a new project. Save the project.

## 2. Verify and run once

1. **Canonical ID Bridge schema:** run `v6EnsureContactRecipientSchema_()` (unchanged, pre-existing engine) once. This branch added `canonicalSalesforceIdStatus` to the required-columns list for `MKT_ACCOUNTS` and `MKT_CONTACTS_SECURE` — this step appends that header to both real sheets (append-only, never deletes/renames/moves existing data). Confirm the result reports `SCHEMA READY`.
2. **New table, one-time manual tab creation:** create a new, empty tab named exactly `MKT_RETENTION_RUN_SUMMARY` in the private Data Hub spreadsheet (this engine only appends columns to an existing sheet; it never creates a new tab). Then re-run `v6EnsureContactRecipientSchema_()` — it will append the `runId, asOfDate, accountsEvaluated, detected, eligible, suppressed, reviewRequired, campaignReady, responded, handedToAM, rfqs, quotes, loads, attributedRevenue, csvDriveFileId, createdAt` headers to that new tab. Confirm `SCHEMA READY` again.
3. **New Drive folder for AM reports:** create one new, private Drive folder (separate from the existing `MKT_V6_ARCHIVE` folder set, which is for campaign-execution artifacts, not AM reporting) and paste its real folder ID into `MKT_V6_AM_REPORTS_FOLDER_ID` in `MarketingV6RetentionReport.gs`, replacing the `'REPLACE_WITH_REAL_AM_REPORTS_DRIVE_FOLDER_ID'` placeholder. This is a one-time, DGL-owned step — this codebase cannot invent a real folder ID.
4. **Re-sync existing accounts/contacts (retroactive fix):** if `v6IngestAuthoritativeContacts_` has already been run against real Salesforce data before this branch, re-run it once against the same extract now that `v6ContactIsSalesforceSource_` correctly recognizes `externalSystem` values like `'SALESFORCE_EXPORT'`. This populates `salesforceAccountId`/`salesforceContactId` (and `canonicalSalesforceIdStatus:'RESOLVED'`) on rows that were previously silently left with those fields empty. Run `v6AuraAuditCanonicalIds_()` before and after to see the `RESOLVED` count increase.
5. Run `v6AuraCheckReportFreshness_()` once manually and confirm it returns `status:'FRESH'` (or, if `STALE`, understand why before proceeding — see section 5 below, "Automate the upstream report-source refresh").
6. Run `v6AuraRunRetentionCycle_()` once manually from the Apps Script editor (this supersedes running `v6AuraEvaluateRetention_()` alone as the verification step, since it also now includes the CSV/summary; `v6AuraEvaluateRetention_()` is still safe to call directly and unchanged in its own contract). Confirm the returned object has:
   - `status: 'CYCLE_COMPLETE'` (or `'BLOCKED_STALE_DATA'` if the report source is stale — see section 5)
   - `metrics.detected` / `metrics.suppressed` / `metrics.campaignReady` reflecting however many DETECTED Retention accounts exist in the current `MIGRACION_CAIDAS`/`CUENTAS` snapshot (all zero is valid and expected if there are none right now)
   - `csvDriveFileId` pointing at a real file inside the folder configured in step 3
7. Confirm `MKT_CAMPAIGN_SCOPES` / `MKT_SCOPE_ACCOUNTS` now have rows whose `scopeId` contains `-RETENTION-` for any DETECTED accounts found in step 6, and that `MKT_RETENTION_RUN_SUMMARY` now has one row for the `runId` returned in step 6. This is the concrete, checkable proof that the full detect -> suppress -> scope -> CSV -> summary cycle ran end to end.

## 3. (Re-)install the scheduler

Run `v6InstallOpportunityRefreshTrigger_()` once. It is idempotent — it deletes and recreates only its own trigger by handler name (`v6ScheduledOpportunityRefresh_`), so running it again on an existing deployment does not create a second, competing schedule. From this point on, every 6 hours, Retention is freshness-checked, detected, suppressed, scoped, CSV-reported and summarized automatically with no manual list and no manual export — this is true immediately after this step, independent of steps 4–5 below (except that a `STALE` source will correctly cause that particular run to do nothing but report `BLOCKED_STALE_DATA`, until the source is refreshed — see section 5).

Do not add any other trigger for Retention. A second trigger calling `v6RefreshOpportunitiesFromReports_`, `v6AuraEvaluateRetention_`, or `v6AuraRunRetentionCycle_` directly would race with this one and risk duplicate/overlapping writes to `MKT_OPPORTUNITIES` or duplicate CSV files for the same cycle.

## 4. Connect real response/engagement events (required for account stop + AM handoff to fire on real customer activity)

`v6ClassifyResponseEvent_` (routed as `v6ClassifyResponseEvent`) is written, tested, and ready to receive `{eventType, accountId, eventId, occurredAt, campaignId, executionId, amOwner, contactId, email, amount}`. **No system currently calls it.** This is not a code gap — the function and its router entry exist — it is a missing transport: something has to observe a real reply, RFQ, bounce, unsubscribe, click, quote, or load and POST it to the existing authenticated Web App with `{action:'v6ClassifyResponseEvent', payload:{...}}`.

You (DGL, not this codebase) must choose and wire at least one real source per event type you want live:

- **REPLY**: typically a Gmail/inbox Apps Script trigger (`onFormSubmit`-style polling or a Gmail add-on) that detects a reply on a tracked thread and calls the Web App.
- **RFQ / QUOTE / LOAD**: typically a Salesforce/NOVA outbound message, Flow, or scheduled export that fires when those records are created, calling the Web App (or feeding `LOADS_ORIGEN_LQ` for the batch path in step 5 — real-time and batch are complementary, not exclusive).
- **BOUNCE / UNSUBSCRIBE / CLICK**: typically your ESP/bulk-send provider's own webhook callbacks — currently moot since `MKT_V6_PROVIDER_READY` is `false` and no bulk provider is configured (unchanged, correctly still blocked).

Each raw event should carry a stable `eventId` from its source system; `v6ClassifyResponseEvent_` does not itself dedupe by `eventId` (its underlying writes are idempotent by `accountId`/`contactId`/`exclusionId`, but if you need strict once-only processing at the event level, dedupe by `eventId` in whatever ingress you build, e.g. a small "processed event ids" log). This was flagged and left as an explicit design decision in `RETENTION_V1_ARCHITECTURE.md` — resolve it in the ingress layer, not by adding a new commercial table to this pack.

**What is actually ready vs. not, stated without ambiguity:** (A) the receiver, `v6ClassifyResponseEvent_`, is implemented and unit-tested (`tests/v6-response-events.test.js`, `tests/v6-aura-bridge.test.js`) — ready. (B) no real emitter (Gmail, Salesforce/NOVA, or an ESP) is wired to it anywhere — not ready. Never describe response automation as "LIVE" in any document until (B) is also true.

**Example payload contract** a future real emitter would POST to the existing authenticated Web App (provider-agnostic — this names the shape of the contract, not a specific vendor):

```json
{
  "action": "v6ClassifyResponseEvent",
  "payload": {
    "eventId": "SRC-2026-09-04-0001",
    "eventType": "REPLY",
    "accountId": "ACC-3F2A9C1B0E77",
    "occurredAt": "2026-09-04T14:32:00.000Z",
    "campaignId": "CAM-RETENTION-2026Q3-01",
    "executionId": "EXEC-7B1A2C3D",
    "amOwner": "Jane Doe",
    "contactId": "CON-9A8B7C6D5E4F",
    "email": null,
    "amount": null
  }
}
```

`eventType` accepts `REPLY`, `RFQ`, `QUOTE` (alias of `QUOTE_SIGNAL`), `LOAD` (alias of `LOAD_SIGNAL`, optionally carrying a real `amount`), `BOUNCE`, `UNSUBSCRIBE`, `CLICK`, or any other value (routed to `OTHER` / `IGNORED`, zero writes). `email` is only read on `BOUNCE` (to mark that specific address invalid); it is never logged or echoed back in any aggregate response.

## 5. Automate the upstream report-source refresh (out of scope for this code, named explicitly)

Investigated and confirmed (`README_INSTALL_V6.md`, `DGL_MARKETING_OS_CANONICAL_STATE.md`, `AUDIT_FINDINGS_2026-09-02.md`): there is no automated cadence anywhere in this codebase that refreshes the upstream report source spreadsheet itself (`MKT_V6_REPORT_SOURCE_ID`, the real `DGL_REPORT_SOURCE_V6`) from Salesforce/NOVA. The six-hour trigger only rebuilds `MKT_OPPORTUNITIES` from whatever snapshot is already sitting in that spreadsheet.

This pass adds `v6AuraCheckReportFreshness_()` (`MarketingV6DataFreshness.gs`) as a fail-closed gate in front of every Retention cycle (`v6AuraEvaluateRetention_`, `v6AuraRetentionDryRun_`, `v6AuraRunRetentionCycle_`): if the source spreadsheet's last-modified time is more than 6 hours old (the same constant as the trigger cadence, not a new number), the cycle reports `BLOCKED_STALE_DATA` and does nothing else. **This gate does not, and cannot, refresh the source itself** — it only prevents AURA from silently running Retention against data it already knows is stale.

DGL must choose and wire one of the following (this codebase cannot invent which one is actually in place):

- A **scheduled Salesforce Data Export** that periodically overwrites/updates the sheets inside `MKT_V6_REPORT_SOURCE_ID`.
- A **Salesforce Flow** (or equivalent scheduled report) that pushes fresh `MIGRACION_CAIDAS`/`CUENTAS`/`FICHA_CLIENTES`/`LOADS_ORIGEN_LQ` rows into that spreadsheet on a cadence at or under 6 hours.
- A generic **ETL connector** (e.g. an existing DGL data-integration tool) writing into the same spreadsheet on the same cadence.

Until one of these is wired, expect `v6AuraRunRetentionCycle_()` (and the six-hour trigger that now calls it) to correctly report `BLOCKED_STALE_DATA` whenever the last manual/administrative refresh of the source spreadsheet is more than 6 hours old.

## 6. Populate the authoritative account/contact crosswalk and schedule batch attribution

1. Run `v6IngestAuthoritativeContacts_` against a real Salesforce/authorized-source extract (unchanged, pre-existing function; the Canonical ID Bridge fix in this pass — step 2.4 above — means `salesforceAccountId`/`salesforceContactId` now populate correctly for `externalSystem` values like `'SALESFORCE_EXPORT'`, not just the bare literal `'SALESFORCE'`). Until `MKT_ACCOUNTS` has real rows with `salesforceAccountId`/`externalAccountId`, `v6IngestCommercialOutcomes_` will correctly report every row `unresolvedCount` and write nothing — this is fail-closed by design, not a bug.
2. Once populated, schedule `v6IngestCommercialOutcomes_()` (e.g. `ScriptApp.newTrigger('v6IngestCommercialOutcomes_').timeBased()...`, daily or matching how often `LOADS_ORIGEN_LQ` refreshes). Not wired to a trigger yet in this pack, intentionally, so it isn't run against an empty crosswalk.

## 7. Optional, non-blocking

Extend `MKT_OPPORTUNITIES` headers with `amActivityBucket`, `amActivityTipoGestion`, `amActivityUltimoChatter`, `amActivityAutorChatter`, `tierDestino` (append-only, same pattern as `v6EnsureContactRecipientSchema_`) if AM-facing visibility into the AM-activity evidence is wanted directly on the sheet (independent of the AM CSV report, which already surfaces these regardless of whether this optional step is done). Detection/suppression logic does not depend on these columns existing — `v6WriteOpportunities_` already silently drops fields with no matching header, confirmed by test.

## Status after this checklist

- After steps 1–3: Retention runs automatically end-to-end for freshness-gate -> detect -> suppress -> build scope -> AM CSV report -> persisted run summary, with no manual account list and no manual export, on the existing schedule. This is the part fully owned by this codebase and fully unit-tested.
- Steps 4–6 depend on systems and decisions outside this repository (which mail/CRM/ESP actually calls the response webhook, what refreshes the report source spreadsheet itself, when the Salesforce contact extract runs) — they cannot be completed or verified from a development environment with no credentials to the private Apps Script project, no network path to script.google.com, and no access to Salesforce/NOVA/Drive. That is the entire remaining blocker: **deployment and integration wiring, not missing code.**
