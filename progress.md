# Retention V1 — Progress

Branch: `retention/v1-am-activity-join` (pushed to `origin`).

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
