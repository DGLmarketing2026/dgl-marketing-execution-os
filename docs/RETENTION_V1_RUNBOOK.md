# Retention V1 Runbook

Follows the same deployment pattern as `backend/apps-script-v6/README_INSTALL_V6.md`. This branch (`retention/v1-am-activity-join`) only adds/edits `.gs` files inside `backend/apps-script-v6/`; nothing here changes the deployment mechanics, the token validation, the JSONP wrapper, or the existing Web App deployment.

**The exact one-time deployment checklist now lives in `docs/AURA_DEPLOYMENT.md`.** This file keeps the router-action reference and the current blocked-state statement; follow `AURA_DEPLOYMENT.md` step by step to deploy.

## Router actions available after deploy

- `v6AuraEvaluateRetention` -> `v6AuraEvaluateRetention_()` — the scheduler's entry point (see `RETENTION_V1_ARCHITECTURE.md` section 5b). Runs detection + suppression + automatic campaign-scope build for Retention, returns safe aggregates only.
- `v6AuraStatus` -> `v6AuraStatus_({accountId})` — read-only consolidated status per account (pipeline stage, Retention signal, audience status).
- `v6AuraEnsureCampaignScope` -> `v6AuraEnsureCampaignScope_(payload)` — idempotent create/reuse of one campaign scope + its eligible accounts.
- `v6AuraCreateAccountStop` -> `v6AuraCreateAccountStop_(payload)` — explicit account-stop route, reuses `v6UpsertPipelineStage_`.
- `v6AuraCreateAmHandoff` -> `v6AuraCreateAmHandoff_(payload)` — explicit AM-handoff route, preserves current pipeline stage.
- `v6ClassifyResponseEvent` -> `v6ClassifyResponseEvent_(rawEvent)` — classifies one inbound response/engagement event (`REPLY`, `RFQ`, `QUOTE`/`QUOTE_SIGNAL`, `LOAD`/`LOAD_SIGNAL`, `BOUNCE`, `UNSUBSCRIBE`, `CLICK`, `OTHER`/unknown) and delegates to the appropriate existing pipeline/contact/exclusion upsert. Idempotent per `eventId` is the caller's responsibility (this function does not itself dedupe by `eventId` — see `AURA_DEPLOYMENT.md` step 4); the underlying writes (`v6UpsertPipelineStage_`, `v6UpsertByKey_`) are idempotent by `accountId`/`contactId`/`exclusionId`.
- `v6IngestCommercialOutcomes` -> `v6IngestCommercialOutcomes_()` — reads `LOADS_ORIGEN_LQ`, resolves accounts via `MKT_ACCOUNTS` crosswalk, and writes `attributedRevenue` onto `MKT_ACCOUNT_PIPELINE`. Safe to re-run; each row's write goes through the same accountId-keyed upsert used everywhere else.

## Current blocked state

**Status: `AURA_BLOCKED_ONLY_BY_DEPLOYMENT`.**

Every piece of logic this codebase is responsible for is written and unit-tested against mocked `SpreadsheetApp`/`Utilities`/`Session` contracts (`tests/v6-retention-am-activity.test.js`, `tests/v6-response-events.test.js`, `tests/v6-commercial-outcomes.test.js`, `tests/v6-aura-bridge.test.js`) and reuses existing engines throughout (no duplicated suppression/frequency/exclusion logic, no new invented fields or thresholds). What remains is not missing code — it is:

1. **No access to the private Apps Script project from this environment.** No `clasp` credentials, no OAuth token, no network path to script.google.com or the private `DGL_MARKETING_DATA_HUB` / `MKT_V6_REPORT_SOURCE_ID` spreadsheets. The files have not been executed against real private data because that execution surface is not reachable from here — only DGL, with access to that project, can complete `docs/AURA_DEPLOYMENT.md` steps 1–3.
2. **No real response/engagement-event source wired.** `v6ClassifyResponseEvent_` is ready; nothing yet calls it with a real reply/RFQ/bounce/unsubscribe/click/quote/load. Choosing and connecting that source (Gmail trigger, Salesforce Flow/outbound message, ESP webhook) is a DGL integration decision, not a code gap (`docs/AURA_DEPLOYMENT.md` step 4).
3. **`MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` not yet populated with a real Salesforce extract**, so batch attribution (`v6IngestCommercialOutcomes_`) correctly reports everything `unresolvedCount` until `v6IngestAuthoritativeContacts_` runs against real data (`docs/AURA_DEPLOYMENT.md` step 5).
4. `MKT_V6_PROVIDER_READY` remains `false` (untouched) — bulk production sending stays correctly blocked at the provider gate regardless of this patch; Gmail remains Test Draft / QA only.

Once `docs/AURA_DEPLOYMENT.md` steps 1–3 are done, Retention detection, suppression and campaign-scope build run automatically on the existing 6-hour trigger with no manual account list — that part does not wait on steps 4–5. Steps 4–5 are what make response capture and attribution reflect real customer activity; they depend entirely on systems this development environment has no access to.
