# Retention V1 — Progress

Branch: `retention/v1-am-activity-join` (pushed to `origin`).

## Pass 4 — Canonical ID Bridge fix, data-freshness gate, first Retention pilot + AM CSV report

Goal: fix a confirmed real bug in Salesforce ID population, add a fail-closed data-freshness gate, and produce the first real AM-facing Retention pilot (dry-run metrics + CSV report + persisted run summary), wired into the existing 6-hour scheduler.

### Task 1 — Canonical ID Bridge (diagnosis CONFIRMED, not refuted)

Direct inspection of `MarketingV6ContactIngestion.gs` (before any change on this pass) confirmed the user's diagnosis exactly: `v6IngestAuthoritativeContacts_` only populated `salesforceAccountId`/`salesforceContactId` when `sourceSystem` was the exact literal `'SALESFORCE'`. Real authoritative extracts arrive with `externalSystem='SALESFORCE_EXPORT'`, which failed that exact-match gate, while `externalAccountId`/`externalContactId` (no such gate) were always populated. Fixed with `v6ContactIsSalesforceSource_(source)` — `/SALESFORCE/.test(String(source||'').toUpperCase())` — a substring test, not a second hardcoded literal. Added an additive `canonicalSalesforceIdStatus` field (`'RESOLVED'`/`'UNRESOLVED'`) to every `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` record. Schema updated (`MKT_V6_CONTACT_RECIPIENT_SCHEMA`). New read-only audit `v6AuraAuditCanonicalIds_()` (`MarketingV6CanonicalIdentity.gs`, new file), registered as `v6AuraAuditCanonicalIds`.

**Verified, not assumed:** `v6UpsertByKey_` and `v6WriteOpportunities_` behave identically on a field with no matching sheet header — both silently drop it. The real risk from adding a schema field is `v6IngestAuthoritativeContacts_`'s own pre-flight `v6RequireContactRecipientHeaders_` guard, which throws `SCHEMA MIGRATION REQUIRED` until `v6EnsureContactRecipientSchema_()` is re-run against the real sheets — documented as a required one-time deployment step.

Tests: `tests/v6-canonical-identity.test.js` (new, 6 cases) — reproduces the exact bug (`SALESFORCE_EXPORT` + populated `externalAccountId` -> `RESOLVED`), the missing-id case (`UNRESOLVED`), the same two cases for contacts, a non-Salesforce-source regression (must stay `UNRESOLVED`, not a false-positive match), and the audit function's safe aggregates (including the `MISSING` vs `UNRESOLVED` distinction).

### Task 2 — Data freshness (no invented threshold)

Confirmed (not assumed): no automated cadence anywhere in this codebase/docs refreshes `MKT_V6_REPORT_SOURCE_ID` itself from Salesforce/NOVA; the only existing cadence is the six-hour opportunity-refresh trigger, which only rebuilds `MKT_OPPORTUNITIES` from whatever snapshot already exists. New `MarketingV6DataFreshness.gs`: `v6AuraCheckReportFreshness_()` uses `DriveApp.getFileById(MKT_V6_REPORT_SOURCE_ID).getLastUpdated()` (same `DriveApp` API already used in `MarketingV6DriveArchive.gs`) and reuses the exact same six-hour constant as the existing trigger (not a new number) as the staleness threshold. Wired into `v6AuraEvaluateRetention_` (`MarketingV6AuraBridge.gs`): `STALE` now returns `{status:'BLOCKED_STALE_DATA', freshness}` immediately, before any refresh or scope-build write. Documented the remaining external gap (an automated Salesforce/NOVA -> report-source refresh) without naming a specific unverified mechanism as if it already existed.

Tests: `tests/v6-data-freshness.test.js` (new, 4 cases: FRESH, STALE, near-boundary FRESH, uses the real source ID). `tests/v6-aura-bridge.test.js` extended with test 7/7b (STALE blocks evaluate before any write; FRESH proceeds normally) and updated `makeContext` to load the freshness source and a fake `DriveApp`.

### Task 3 — AM CONTEXT REQUIRED gate — confirmed intact

`tests/v6-retention-am-activity.test.js` re-run unmodified after all Pass 4 changes: all 7 cases still pass. `v6RetentionAmActivityReason_` was not touched.

### Task 4 — Full cycle — confirmed and documented

`docs/RETENTION_V1_ARCHITECTURE.md` now has an explicit "Full automatic cycle (confirmed end to end)" section tracing every stage of the canonical pipeline to a concrete, already-documented function, including the new freshness gate as the first step.

### Task 5 — Scheduler uniqueness/idempotency — confirmed by new test

`tests/v6-aura-bridge.test.js` test 8: running `v6AuraEvaluateRetention_()` twice with the same synthetic input does not grow `MKT_OPPORTUNITIES` (full rewrite each time), `MKT_CAMPAIGN_SCOPES`, or `MKT_SCOPE_ACCOUNTS` (both upserted by key). No second trigger was added anywhere in this pass.

### Task 6 — Response events: receiver vs. real source — documented, no code change needed

`docs/AURA_DEPLOYMENT.md` section 4 now states plainly: the receiver (`v6ClassifyResponseEvent_`) is ready and tested; no real emitter is wired anywhere; response automation must never be called "LIVE". Added an explicit example JSON payload contract for a future real emitter.

### Task 7 — First Retention pilot dry run (new)

New `backend/apps-script-v6/MarketingV6RetentionReport.gs`: `v6AuraRetentionDryRun_()` — freshness-gated (reuses `v6AuraCheckReportFreshness_`), then reuses `v6AuraEvaluateRetention_()` for detect/suppress/scope-build, then classifies every Retention opportunity row into the exact categories specified (accountsEvaluated, detected, suppressedByAmActivity, suppressedByMissingAmContext, suppressedByDataQuality, reviewRequired, frequencyBlocked via the already-existing `v6FrequencyStatus_`, eligible, campaignScopesGenerated, recipientResolutionSuccess/Blocked with an explicit unattempted-resolution reason). Registered as `v6AuraRetentionDryRun`.

### Task 8 — AM CSV report + persisted run summary (new)

Same file. `v6AuraDecisionFor_` (pure, 10-branch precedence mapper — pipeline stage always outranks opportunity-level suppression once a real commercial response exists), `v6AuraGenerateAmCsvReport_` (30-column CSV per the exact spec, joined strictly by `accountId` against `MKT_ACCOUNT_PIPELINE`/`MKT_SCOPE_ACCOUNTS`, reuses `v6Csv_`/`v6CsvEscape_` from `MarketingV6DriveArchive.gs`, writes to a new placeholder-ID Drive folder `MKT_V6_AM_REPORTS_FOLDER_ID`, no PII, unique filename every run by construction), `v6AuraWriteRunSummary_`/`v6AuraRetentionRunSummary_` (new `MKT_RETENTION_RUN_SUMMARY` table, schema added to the existing additive-schema engine, upserted by `runId`), and `v6AuraRunRetentionCycle_` (single orchestrator: dry run -> CSV -> summary, or `BLOCKED_STALE_DATA` with no CSV/summary side effects). `v6ScheduledOpportunityRefresh_` now calls `v6AuraRunRetentionCycle_` instead of `v6AuraEvaluateRetention_` directly, so the existing 6-hour trigger now produces the AM CSV and run summary automatically. Also added an additive `tierDestino` field to `v6BuildRetentionOpportunities_` (`MarketingV6ReportIngestion.gs`), sourced directly from `MIGRACION_CAIDAS['Tier destino']`.

Tests: `tests/v6-retention-report.test.js` (new, 7 test blocks: STALE dry run, full category classification with synthetic data, all 10 `v6AuraDecisionFor_` branches plus 2 precedence checks, AM CSV report content/columns/no-PII, run summary write+read-back, STALE cycle produces nothing, FRESH cycle produces exactly one CSV file + one summary row).

### Files changed / added this pass

- Modified: `backend/apps-script-v6/MarketingV6ContactIngestion.gs`, `backend/apps-script-v6/MarketingV6SchemaMigration.gs`, `backend/apps-script-v6/MarketingV6AuraBridge.gs`, `backend/apps-script-v6/MarketingV6ReportIngestion.gs`, `backend/apps-script-v6/MarketingV6RouterExtension.gs`
- Added: `backend/apps-script-v6/MarketingV6CanonicalIdentity.gs`, `backend/apps-script-v6/MarketingV6DataFreshness.gs`, `backend/apps-script-v6/MarketingV6RetentionReport.gs`
- Added tests: `tests/v6-canonical-identity.test.js`, `tests/v6-data-freshness.test.js`, `tests/v6-retention-report.test.js`
- Modified tests: `tests/v6-aura-bridge.test.js` (freshness gate + idempotency tests), `tests/v6-schema-migration.test.js` (mock sheet map extended with the new `MKT_RETENTION_RUN_SUMMARY` table)
- Docs updated: `docs/RETENTION_V1_ARCHITECTURE.md`, `docs/RETENTION_V1_DATA_CONTRACT.md`, `docs/RETENTION_V1_RUNBOOK.md`, `docs/AURA_DEPLOYMENT.md`, this file, `tests.json`

### What this pass deliberately does NOT do

- Does not auto-refresh `MKT_V6_REPORT_SOURCE_ID` itself — that remains a named, undecided DGL integration choice (scheduled Salesforce Data Export, Flow, or ETL connector), documented, not invented.
- Does not wire a real response-event emitter (unchanged gap from Pass 3).
- Does not automatically re-point `MKT_RETENTION_RUN_SUMMARY.csvDriveFileId` to a newer CSV on a second manual invocation of `v6AuraGenerateAmCsvReport_` for an already-summarized `runId` — the underlying "never overwrite, always create a new file" behavior is already correct and tested; only the automatic *decision* of when to regenerate is left pending, documented in `docs/RETENTION_V1_ARCHITECTURE.md` section 13.
- Does not touch `v6ApplyPrioritySuppression_`, `v6RetentionAmActivityReason_`, QNB/Reactivation/Cross-Sell/Nurture build functions, or the execution engine.

### Final status after this pass

All eight numbered tasks are code-complete except the two explicitly-named external integration gaps in Task 6 (real response-event source) and the upstream report-source auto-refresh named in Task 2/4 — both documented, neither invented. Full test suite: see `tests.json` for the exact, current pass/fail breakdown (unchanged 7 pre-existing failures, all new files passing).

## Pass 3 — AURA Retention Bridge (unblock real campaign execution)

Goal: remove the remaining blockers to running a real Retention campaign, without a PR/merge to `main`, per the canonical architecture already corrected in Pass 2.

1. **`.claude/agents/aura.md`** (this workspace, not the GitHub repo) — formal lead-agent identity for AURA (Account Understanding, Retention & Automation), encoding the canonical architecture and hard rules; coordinates the 6 existing Retention subagents at the top level (subagents cannot invoke each other).
2. **`backend/apps-script-v6/MarketingV6AuraBridge.gs`** (new) — the named contract surface AURA calls, every function delegating to an already-existing engine:
   - `v6AuraEvaluateRetention_()` — runs the unified refresh + automatic scope build for Retention; this is now what the scheduler calls (see point 5).
   - `v6AuraStatus_({accountId})` — read-only consolidated status, safe aggregates only.
   - `v6AuraEnsureCampaignScope_(payload)` / `v6AuraAutoBuildRetentionScopes_()` — closes a real gap: nothing in the public source pack previously populated `MKT_CAMPAIGN_SCOPES`/`MKT_SCOPE_ACCOUNTS` for any family. Groups DETECTED Retention accounts by `(amOwner, service)` using a byte-for-byte port of the frontend's `scopeId()`/`slug()`, and idempotently upserts scope + scope-accounts rows. Never touches other families' scopes (filtered by `opportunityType`, and a Retention `scopeId` always carries `-RETENTION-`).
   - `v6AuraCreateAccountStop_(payload)` / `v6AuraCreateAmHandoff_(payload)` — explicit named routes over the existing `v6UpsertPipelineStage_` machine, with care taken not to downgrade an already-advanced commercial stage (stop) and not to reset stage on a handoff call (handoff reads and preserves `currentStage` first).
3. **`MarketingV6ResponseEvents.gs`** — added `QUOTE`/`LOAD` as accepted event-type aliases for `QUOTE_SIGNAL`/`LOAD_SIGNAL` (matching the exact vocabulary requested), plus optional real-time `attributedRevenue` passthrough on `LOAD` events when the source system explicitly supplies an `amount` (never fabricated).
4. **`MarketingV6ReportIngestion.gs`** — `v6ScheduledOpportunityRefresh_` (the function the existing, already-idempotent 6-hour trigger calls) now calls `v6AuraEvaluateRetention_()` instead of `v6RefreshOpportunitiesFromReports_()` directly. Same underlying detection for every family, unchanged; Retention additionally gets automatic scope build on every scheduled run. No second trigger was added.
5. **`MarketingV6RouterExtension.gs`** — registered `v6AuraEvaluateRetention`, `v6AuraStatus`, `v6AuraEnsureCampaignScope`, `v6AuraCreateAccountStop`, `v6AuraCreateAmHandoff`.
6. **`tests/v6-aura-bridge.test.js`** (new, 7 cases) — see `tests.json`.
7. **`docs/AURA_DEPLOYMENT.md`** (new) — exact one-time deployment checklist. `docs/RETENTION_V1_RUNBOOK.md` and `docs/RETENTION_V1_ARCHITECTURE.md` / `docs/RETENTION_V1_DATA_CONTRACT.md` updated to reference and describe the bridge.

### What this pass deliberately does NOT do

- Does not build a webhook/HTTP ingress for real response events (Gmail reply detection, Salesforce outbound messages, ESP callbacks) — that is a DGL integration decision naming a specific external system, not something this codebase can invent without fabricating one. Documented explicitly in `docs/AURA_DEPLOYMENT.md` step 4.
- Does not assign `campaignId` on scope rows — that remains the private, out-of-pack backend's `createRequest`/`createCampaign` responsibility.
- Does not touch QNB/Reactivation/Cross-Sell/Nurture build functions, `v6AggregateOpportunities_`, or any shared frequency/exclusion/recipient logic.

### Final status: `AURA_BLOCKED_ONLY_BY_DEPLOYMENT`

All code for this pass is written and unit-tested. The only remaining blockers are the three named in `docs/RETENTION_V1_RUNBOOK.md` / `docs/AURA_DEPLOYMENT.md`: (1) no credentials/network path to the private Apps Script project from this environment, (2) no real response-event source wired yet (a DGL integration choice), (3) `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` not yet populated from a real Salesforce extract. None of the three are missing code.

## Architecture correction (post-initial-implementation)

The initial implementation of the `CUENTAS` join let a `MIGRACION_CAIDAS` (NOVA) candidate with no `CUENTAS` (AM Intelligence) match resolve to `DETECTED` by default. Per the canonical architecture (`NOVA/SALESFORCE -> AM PLATFORM / AM INTELLIGENCE -> AURA -> MARKETING OS -> ...`, now recorded in the workspace `CLAUDE.md`), that is a NOVA -> AURA path that skips AM, which is explicitly prohibited. Fixed: a missing `CUENTAS` match now resolves to `SUPPRESSED` / `AM CONTEXT REQUIRED` (`v6RetentionAmActivityReason_`, `MarketingV6ReportIngestion.gs`). Tests 1 and 7 in `tests/v6-retention-am-activity.test.js`, and the corresponding rows in `docs/RETENTION_V1_DATA_CONTRACT.md` / `docs/RETENTION_V1_ARCHITECTURE.md`, were updated to match. Also fixed in the same pass: the AM-activity evidence fields were reading `'Ultimo chatter'`/`'Autor chatter'` (lowercase) against a report header that is actually `'Ultimo Chatter'`/`'Autor Chatter'` (capitalized), so both were always empty — corrected to the real header casing.

## What this pass implements

Maps to the 5 specialized subagent domains that produced the spec for this build (signal, governance, strategy, response, attribution):

1. **Signal (AM-activity join).** `MarketingV6ReportIngestion.gs` — new `v6CuentasIndex_()`, `v6BuildRetentionOpportunities_` now takes a third `cuentas` argument and evaluates AM-activity evidence from `CUENTAS` (Bucket, Tipo gestion, Falso positivo, Solo cobranza, chatter fields) in a strict priority order before falling back to `DETECTED`. Adds 4 non-decisional evidence fields per row and a non-blocking `retentionCuentasJoinCoverage` metric on `v6RefreshOpportunitiesFromReports_`. See `docs/RETENTION_V1_ARCHITECTURE.md` and `docs/RETENTION_V1_DATA_CONTRACT.md`.
2. **Governance (suppression / exclusions).** No new suppression mechanism was introduced beyond the Retention-specific reasons above (`FALSE POSITIVE`, `COLLECTIONS`, `AM ACTIVITY REVIEW REQUIRED`); existing frequency/exclusion/DNC gates (`MarketingV6FrequencyControl.gs`, `MKT_EXCLUSIONS`) are untouched. The new `UNSUBSCRIBE` response handler (`v6RegisterExclusion_`) writes into the same, already-governed `MKT_EXCLUSIONS` table.
3. **Strategy (scope/copy/recipients).** Not touched in this pass — out of scope per the spec (no scope/copy/recipient-resolution changes were requested). `v6ResolveRecipients_`, `v6AudienceStatus_`, `v6IngestAuthoritativeContacts_` are unmodified.
4. **Response.** New `MarketingV6ResponseEvents.gs` — `v6ClassifyResponseEvent_` classifies `REPLY`/`RFQ`/`QUOTE_SIGNAL`/`LOAD_SIGNAL`/`BOUNCE`/`UNSUBSCRIBE`/`CLICK`/`OTHER` events and always delegates to an existing (`v6UpsertPipelineStage_`) or narrowly-scoped new (`v6MarkContactEmailInvalid_`, `v6RegisterExclusion_`) writer. Registered in the router.
5. **Attribution.** New `MarketingV6CommercialOutcomes.gs` — `v6IngestCommercialOutcomes_` reads `LOADS_ORIGEN_LQ`, resolves accounts strictly via the `MKT_ACCOUNTS` crosswalk (never by bare name match), copies `Monto` untransformed into `attributedRevenue`, and explicitly flags (without silently overwriting) multi-campaign concurrency. `v6PipelineSummary_` extended with 4 revenue aggregates alongside the existing count aggregates.

## Files changed / added

- Modified: `backend/apps-script-v6/MarketingV6ReportIngestion.gs`, `backend/apps-script-v6/MarketingV6RouterExtension.gs`, `backend/apps-script-v6/MarketingV6Pipeline.gs`
- Added: `backend/apps-script-v6/MarketingV6ResponseEvents.gs`, `backend/apps-script-v6/MarketingV6CommercialOutcomes.gs`
- Added tests: `tests/v6-retention-am-activity.test.js`, `tests/v6-response-events.test.js`, `tests/v6-commercial-outcomes.test.js`
- Added docs: `docs/RETENTION_V1_ARCHITECTURE.md`, `docs/RETENTION_V1_DATA_CONTRACT.md`, `docs/RETENTION_V1_RUNBOOK.md`
- Added tracking: `progress.md` (this file), `tests.json`

No changes were made to QNB/Reactivation/Cross-Sell/Nurture build functions, to `v6ApplyPrioritySuppression_`, to the contact/recipient/frequency stack, or to the execution engine.

## What was NOT done / left pending (see `docs/RETENTION_V1_RUNBOOK.md` for full detail)

- Not deployed to the real private Apps Script project (no `clasp`/credentials/network access from this environment).
- `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` still need real Salesforce/NOVA data before `v6IngestCommercialOutcomes_` can resolve real accounts (fail-closed today: everything reports `unresolvedCount`, which is correct/expected behavior against empty tables, not a bug).
- No webhook/HTTP endpoint exists anywhere in this codebase to feed raw response/engagement events into `v6ClassifyResponseEvent_` — that ingress is an explicit external gap, out of scope for a `.gs` patch.
- No scheduled trigger was added for `v6IngestCommercialOutcomes_` (mirrors the existing pattern where `v6InstallOpportunityRefreshTrigger_` is optional/manual).
- `MKT_OPPORTUNITIES` sheet headers were not extended for the 4 new evidence fields (optional, additive, does not block detection/suppression logic since `v6WriteOpportunities_` already only writes existing headers).
- Bulk provider remains unconfigured (`MKT_V6_PROVIDER_READY=false`, untouched) — production sending stays blocked regardless of this patch.

## Test results (as of this commit, run via `node tests/<file>.test.js`)

All 3 new test files pass. Full existing suite re-run: 13 pass, 7 fail — the same 7 tests fail identically on `main` before this branch's changes (verified via `git stash`), all due to pre-existing `index.html` cache-busting version-string drift and unrelated V5.5 frontend/backend-adapter assertions, none of which touch any file this branch modifies. See `tests.json` for the itemized list.
