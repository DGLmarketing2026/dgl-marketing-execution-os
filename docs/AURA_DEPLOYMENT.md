# AURA Deployment — one-time setup

This is the exact, one-time checklist to take Retention from `AURA_BLOCKED_ONLY_BY_DEPLOYMENT` to running automatically in production. Steps 1–2 are now a single action: copy the files, save, and run `v6AuraBootstrapAndRun_()` once. There is no more manual tab creation, no manual folder creation, and no folder-ID constant to paste anywhere — the bootstrap does all of it, idempotently (safe to re-run if you are ever unsure whether it already ran). After that one run, Retention detection, suppression, campaign-scope build, the AM CSV report, the AM Handoffs CSV, and the persisted run summary all run automatically on the existing 6-hour trigger, with no manual account list and no manual export at any point. Step 4 is what makes real-time response capture and attribution real; step 5 is what makes the report *source itself* self-refreshing; step 6 is what makes batch attribution resolve real accounts. All three depend on systems or decisions outside this repository that only DGL can wire.

## 0. What you are deploying

Twelve `.gs` files, all inside `backend/apps-script-v6/`, on branch `retention/v1-aura-integration-20260911`:

| File | Status |
|---|---|
| `MarketingV6ReportIngestion.gs` | modified — `CUENTAS` (AM Intelligence) join, `AM CONTEXT REQUIRED` gate, additive `tierDestino` field on Retention rows, `v6ScheduledOpportunityRefresh_` now calls `v6AuraRunRetentionCycle_` |
| `MarketingV6RouterExtension.gs` | modified — new route entries across this branch, including `v6AuraAuditCanonicalIds`, `v6AuraRetentionDryRun`, `v6AuraRunRetentionCycle`, `v6AuraRetentionRunSummary`, and `v6AuraBootstrapAndRun` (this pass) |
| `MarketingV6Pipeline.gs` | modified — revenue aggregates in `v6PipelineSummary_` |
| `MarketingV6ContactIngestion.gs` | modified — Canonical ID Bridge fix: `v6ContactIsSalesforceSource_` replaces the exact-match `source==='SALESFORCE'` gate; new additive `canonicalSalesforceIdStatus` field |
| `MarketingV6SchemaMigration.gs` | modified — `canonicalSalesforceIdStatus` added to `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE`; `handoffsCsvDriveFileId` added to `MKT_RETENTION_RUN_SUMMARY`; new `v6AuraEnsureRunSummarySheet_()` (this pass — the **only** table in this schema that auto-creates its own tab) |
| `MarketingV6AuraBridge.gs` | modified — `v6AuraEvaluateRetention_` now calls the freshness gate before any refresh/scope-build |
| `MarketingV6ResponseEvents.gs` | new (earlier pass) — event classifier (`REPLY`/`RFQ`/`QUOTE`/`LOAD`/`BOUNCE`/`UNSUBSCRIBE`/`CLICK`) |
| `MarketingV6CommercialOutcomes.gs` | new (earlier pass) — batch attribution ingestion from `LOADS_ORIGEN_LQ` |
| `MarketingV6CanonicalIdentity.gs` | new (earlier pass) — `v6AuraAuditCanonicalIds_()`, read-only safe-aggregate audit |
| `MarketingV6DataFreshness.gs` | new (earlier pass) — `v6AuraCheckReportFreshness_()`, fail-closed staleness gate |
| `MarketingV6RetentionReport.gs` | modified (this pass) — pilot dry run, AM decision mapper, AM CSV report, new **Handoffs CSV** (`v6AuraGenerateHandoffsCsvReport_`), persisted run summary, single cycle orchestrator; the previous hardcoded-placeholder `MKT_V6_AM_REPORTS_FOLDER_ID` constant is gone, replaced by runtime-resolved `v6AuraResolveReportsFolder_()` |
| `MarketingV6AuraBootstrap.gs` | new (this pass) — `v6AuraBootstrapAndRun_()`, the single one-time install-and-run entry point |

No customer/contact PII, credentials, account lists, quotes, loads or revenue snapshots are in any of these files — they are code only, reading/writing table names and safe aggregate fields, exactly like every other file already in this pack. The one generated artifact with real account-level detail, the AM CSV report, is written to private Drive at runtime — it is never committed to this repository.

### Complete file set required for the Retention cycle (first real deployment)

The table above is the delta since the prior AURA pass. For a first real deployment, the full self-consistent set `v6AuraBootstrapAndRun_`/`v6AuraRunRetentionCycle_` depends on, transitively, is these 19 files (all of `backend/apps-script-v6/*.gs` **except** `MarketingV6AcquisitionEngine.gs` and `MarketingV6AcquisitionWordPress.gs`, which Retention never calls and the router resolves lazily — safe to omit for this deployment):

`MarketingV6ReportIngestion.gs`, `MarketingV6RouterExtension.gs`, `MarketingV6Pipeline.gs`, `MarketingV6ContactIngestion.gs`, `MarketingV6SchemaMigration.gs`, `MarketingV6AuraBridge.gs`, `MarketingV6ResponseEvents.gs`, `MarketingV6CommercialOutcomes.gs`, `MarketingV6CanonicalIdentity.gs`, `MarketingV6DataFreshness.gs`, `MarketingV6RetentionReport.gs`, `MarketingV6AuraBootstrap.gs`, `MarketingV6OpportunityEngine.gs`, `MarketingV6FrequencyControl.gs`, `MarketingV6RecipientResolution.gs`, `MarketingV6ExecutionEngine.gs`, `MarketingV6DriveArchive.gs`, `MarketingV6CopyUsage.gs`, `MarketingV6CreativeUsage.gs`.

## 1. Copy the files (one-time)

Copy the 19 files above into the existing private Apps Script project (the one behind the current V6.6 Web App deployment), preserving filenames exactly. Do not rename, do not split, do not create a new project. Save the project.

## 2. Run the bootstrap once

There is nothing left to create by hand. No new tab, no new Drive folder, no folder-ID constant to paste anywhere. From the Apps Script editor, select `v6AuraBootstrapAndRun_` and run it once (or call it via the router as `{action:'v6AuraBootstrapAndRun', payload:{}}`). Accept the Google permissions prompt if it appears (Drive/Sheets scopes, first-run only). This single call does everything steps 2–3 used to require manually:

1. Verifies `MKT_V6_DATA_HUB_ID`/`MKT_V6_REPORT_SOURCE_ID` are readable — fails fast with `status:'BLOCKED_DATA_HUB_ACCESS'` if not, before touching anything else.
2. Creates the `MKT_RETENTION_RUN_SUMMARY` tab (with the correct headers) if it does not already exist yet; leaves it untouched if it does (`v6AuraEnsureRunSummarySheet_`).
3. Runs `v6AuditContactRecipientSchema_()`/`v6EnsureContactRecipientSchema_()` (unchanged engines) — appends any other missing columns, including `canonicalSalesforceIdStatus` on `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` and `handoffsCsvDriveFileId` on `MKT_RETENTION_RUN_SUMMARY`, append-only, never touching existing data.
4. Records `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` row counts (informational only — an empty table is reported, not treated as fatal, since this pack does not assume they are empty).
5. Runs `v6AuraAuditCanonicalIds_()` (safe RESOLVED/UNRESOLVED/MISSING aggregates).
6. Runs `v6AuraCheckReportFreshness_()`.
7. Confirms the `AM CONTEXT REQUIRED` gate's entry point (`v6BuildRetentionOpportunities_`) is present in the deployed code.
8. Resolves (or creates, exactly once) the private `DGL_AURA_AM_REPORTS` Drive folder and remembers its ID in `PropertiesService` (`v6AuraResolveReportsFolder_`) — never a hardcoded ID, never written to this repo.
9. Installs/reinstalls the six-hour opportunity-refresh trigger (`v6InstallOpportunityRefreshTrigger_`, already deduped by handler name — safe to run again on an existing deployment, never a second competing schedule).
10. Checks for an optional `v6FetchAuthoritativeContactsFromSource_` hook (not present anywhere in this pack today) — if absent, records `contactIngestion:'SOURCE_NOT_CONFIGURED'` and continues; does not invent a Salesforce contact-pull integration.
11. If the freshness check from step 6 is `STALE`, stops here and returns `status:'BOOTSTRAP_BLOCKED_STALE_DATA'` with everything gathered so far — no cycle, no CSV, no summary row are produced against stale data.
12. If `FRESH`, runs the real first cycle (`v6AuraRunRetentionCycle_`) — detect -> suppress -> build scope -> AM CSV -> Handoffs CSV -> run summary — and returns `status:'BOOTSTRAP_COMPLETE'` with the cycle's result attached as `retentionCycle`.

Confirm the returned object's `retentionCycle.csvDriveFileId` and `retentionCycle.handoffsCsvDriveFileId` point at real files inside the folder from step 8, and that `MKT_RETENTION_RUN_SUMMARY` now has one row for `retentionCycle.runId`. This is the concrete, checkable proof that the full detect -> suppress -> scope -> CSV -> Handoffs CSV -> summary cycle ran end to end.

It is safe to run `v6AuraBootstrapAndRun_()` again later (e.g. after DGL wires steps 4–6 below) — every step it performs is idempotent: the second run reuses the same Drive folder (via the Script Property), leaves the already-created `MKT_RETENTION_RUN_SUMMARY` tab alone, and reinstalls the same single trigger rather than creating a second one.

**Re-sync existing accounts/contacts (retroactive fix, separate manual step, only if needed):** if `v6IngestAuthoritativeContacts_` was already run against real Salesforce data *before* this branch, re-run it once against the same extract now that `v6ContactIsSalesforceSource_` correctly recognizes `externalSystem` values like `'SALESFORCE_EXPORT'`. This populates `salesforceAccountId`/`salesforceContactId` (and `canonicalSalesforceIdStatus:'RESOLVED'`) on rows that were previously silently left with those fields empty. Run `v6AuraAuditCanonicalIds_()` before and after to see the `RESOLVED` count increase.

## 3. The recurring six-hour cycle is already wired, and is a different, lighter entry point

`v6ScheduledOpportunityRefresh_()` — the handler the trigger installed in step 2.9 above actually calls every six hours — still calls `v6AuraRunRetentionCycle_()` directly, **not** `v6AuraBootstrapAndRun_()`. This is intentional: the bootstrap's folder/sheet/trigger-creation steps are a one-time install concern; repeating them every six hours would be wasted, redundant work. From the moment step 2 above completes, every 6 hours Retention is freshness-checked, detected, suppressed, scoped, CSV-reported (AM CSV + Handoffs CSV) and summarized automatically with no manual list and no manual export — independent of steps 4–5 below (except that a `STALE` source will correctly cause that particular run to do nothing but report `BLOCKED_STALE_DATA`, until the source is refreshed — see section 5).

Do not add any other trigger for Retention. A second trigger calling `v6RefreshOpportunitiesFromReports_`, `v6AuraEvaluateRetention_`, `v6AuraRunRetentionCycle_`, or `v6AuraBootstrapAndRun_` directly would race with this one and risk duplicate/overlapping writes to `MKT_OPPORTUNITIES`, or duplicate CSV files, folders, or run-summary rows for the same cycle.

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

1. Run `v6IngestAuthoritativeContacts_` against a real Salesforce/authorized-source extract (unchanged, pre-existing function; the Canonical ID Bridge fix — see the "Re-sync existing accounts/contacts" note under step 2 above — means `salesforceAccountId`/`salesforceContactId` now populate correctly for `externalSystem` values like `'SALESFORCE_EXPORT'`, not just the bare literal `'SALESFORCE'`). Until `MKT_ACCOUNTS` has real rows with `salesforceAccountId`/`externalAccountId`, `v6IngestCommercialOutcomes_` will correctly report every row `unresolvedCount` and write nothing — this is fail-closed by design, not a bug.
2. Once populated, schedule `v6IngestCommercialOutcomes_()` (e.g. `ScriptApp.newTrigger('v6IngestCommercialOutcomes_').timeBased()...`, daily or matching how often `LOADS_ORIGEN_LQ` refreshes). Not wired to a trigger yet in this pack, intentionally, so it isn't run against an empty crosswalk.

## 7. Optional, non-blocking

Extend `MKT_OPPORTUNITIES` headers with `amActivityBucket`, `amActivityTipoGestion`, `amActivityUltimoChatter`, `amActivityAutorChatter`, `tierDestino` (append-only, same pattern as `v6EnsureContactRecipientSchema_`) if AM-facing visibility into the AM-activity evidence is wanted directly on the sheet (independent of the AM CSV report, which already surfaces these regardless of whether this optional step is done). Detection/suppression logic does not depend on these columns existing — `v6WriteOpportunities_` already silently drops fields with no matching header, confirmed by test.

## Status after this checklist

- After steps 1–2 (copy files, run `v6AuraBootstrapAndRun_()` once): Retention runs automatically end-to-end for freshness-gate -> detect -> suppress -> build scope -> AM CSV report -> Handoffs CSV -> persisted run summary, with no manual account list and no manual export, on the existing schedule (confirmed wired by step 3, and already true immediately once the bootstrap's one-time trigger install completes). This is the part fully owned by this codebase and fully unit-tested (`tests/v6-aura-bootstrap.test.js` plus the existing Retention test suite).
- Steps 4–6 depend on systems and decisions outside this repository (which mail/CRM/ESP actually calls the response webhook, what refreshes the report source spreadsheet itself, when the Salesforce contact extract runs) — they cannot be completed or verified from a development environment with no credentials to the private Apps Script project, no network path to script.google.com, and no access to Salesforce/NOVA/Drive. That is the entire remaining blocker: **deployment and integration wiring, not missing code.**
