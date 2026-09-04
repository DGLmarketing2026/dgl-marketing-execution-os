# Retention V1 Runbook

Follows the same deployment pattern as `backend/apps-script-v6/README_INSTALL_V6.md`. This branch (`retention/v1-am-activity-join`) only adds/edits `.gs` files inside `backend/apps-script-v6/`; nothing here changes the deployment mechanics, the token validation, the JSONP wrapper, or the existing Web App deployment.

## Deploy the patch to the private Apps Script project

1. Copy the changed/added source files into the existing private Apps Script project, preserving filenames exactly:
   - `MarketingV6ReportIngestion.gs` (modified — `v6CuentasIndex_`, retention join logic, `retentionCuentasJoinCoverage`)
   - `MarketingV6RouterExtension.gs` (modified — two new route entries)
   - `MarketingV6Pipeline.gs` (modified — revenue aggregates added to `v6PipelineSummary_`)
   - `MarketingV6ResponseEvents.gs` (new)
   - `MarketingV6CommercialOutcomes.gs` (new)
2. Save the project.
3. Run `v6RefreshOpportunitiesFromReports_()` once. Confirm the returned object includes `retentionCuentasJoinCoverage` between 0 and 1 (0 is valid if `CUENTAS` has no matching rows yet or `MIGRACION_CAIDAS` is empty — it is an observability metric, not a gate).
4. Optionally re-run `v6InstallOpportunityRefreshTrigger_()` (idempotent — deletes and recreates only its own trigger).
5. Deploy a **new version of the same existing web app deployment**. Do not create a new deployment.
6. Keep the existing token validation and JSONP response wrapper ahead of the V6 router, exactly as before.
7. Keep bulk production sending blocked until a provider is configured (`MKT_V6_PROVIDER_READY` stays `false`).

## New router actions available after deploy

- `v6ClassifyResponseEvent` -> `v6ClassifyResponseEvent_(rawEvent)` — classifies one inbound response/engagement event (`REPLY`, `RFQ`, `QUOTE_SIGNAL`, `LOAD_SIGNAL`, `BOUNCE`, `UNSUBSCRIBE`, `CLICK`, `OTHER`/unknown) and delegates to the appropriate existing pipeline/contact/exclusion upsert. Idempotent per `eventId` is the caller's responsibility (this function does not itself dedupe by `eventId` — see gap below); the underlying writes (`v6UpsertPipelineStage_`, `v6UpsertByKey_`) are idempotent by `accountId`/`contactId`/`exclusionId`.
- `v6IngestCommercialOutcomes` -> `v6IngestCommercialOutcomes_()` — reads `LOADS_ORIGEN_LQ`, resolves accounts via `MKT_ACCOUNTS` crosswalk, and writes `attributedRevenue` onto `MKT_ACCOUNT_PIPELINE`. Safe to re-run; each row's write goes through the same accountId-keyed upsert used everywhere else.

## Manual steps pending before this is live in production (not automatable from this environment)

1. **Populate `MKT_ACCOUNTS` / `MKT_CONTACTS_SECURE` with real data.** Retention's opportunity detection (hash-based `accountId`) and commercial-outcome attribution (crosswalk-based `accountId`) only converge once `MKT_ACCOUNTS` actually has real Salesforce/authorized-source rows with `salesforceAccountId`/`externalAccountId` populated. Until `v6IngestAuthoritativeContacts_` has been run against a real Salesforce/NOVA extract, `v6IngestCommercialOutcomes_` will report every row `unresolvedCount` and write nothing — this is fail-closed by design, not a bug.
2. **Connect the real emitter of response/engagement events.** There is no webhook or HTTP ingestion endpoint anywhere in this codebase today that receives raw provider events (Gmail/ESP replies, RFQ webhooks, bounce/unsubscribe callbacks from a bulk provider) and calls `v6ClassifyResponseEvent_(rawEvent)`. This is an explicit external dependency gap: someone must build/connect that ingress (e.g., a provider webhook -> Apps Script doPost -> `routeMarketingV6_('v6ClassifyResponseEvent', rawEvent)`), including `eventId` idempotency/dedupe at that layer, before response capture is live end-to-end. `v6ClassifyResponseEvent_` itself is ready and tested; only the transport into it is missing.
3. **Schedule `v6IngestCommercialOutcomes_()`.** Like `v6RefreshOpportunitiesFromReports_`, this is not currently wired to a time-based trigger. Add one (e.g., via `ScriptApp.newTrigger('v6IngestCommercialOutcomes_').timeBased()...`) once the `MKT_ACCOUNTS` crosswalk (step 1) is populated, so attribution isn't run against an empty crosswalk.
4. **Extend `MKT_OPPORTUNITIES` headers (optional).** The 4 new evidence fields (`amActivityBucket`, `amActivityTipoGestion`, `amActivityUltimoChatter`, `amActivityAutorChatter`) are produced by `v6BuildRetentionOpportunities_` but are silently dropped by `v6WriteOpportunities_` unless those column headers already exist on the `MKT_OPPORTUNITIES` sheet. Add the headers manually (append-only, same pattern as `v6EnsureContactRecipientSchema_`) if AM-facing visibility into the join evidence is wanted; retention detection/suppression logic does not depend on these headers existing.

## Current blocked state

**Status: `BLOCKED_EXTERNAL_DEPENDENCY`.**

Exact cause:
- This development environment has no access to the private Apps Script project (no `clasp` credentials, no OAuth token, no network path to script.google.com or the private `DGL_MARKETING_DATA_HUB` / `MKT_V6_REPORT_SOURCE_ID` spreadsheets). All code in this branch has been written, unit-tested against mocked `SpreadsheetApp`/`Utilities`/`Session` contracts (see `tests/v6-retention-am-activity.test.js`, `tests/v6-response-events.test.js`, `tests/v6-commercial-outcomes.test.js`), and is ready to copy into the real project per the steps above, but it has not been executed against real private data because that execution surface is not reachable from here.
- `MKT_V6_PROVIDER_READY` remains `false` (untouched by this branch) — bulk production sending stays blocked at the provider-gate level regardless of this patch; Gmail remains Test Draft / QA only, unchanged.
- The response-event ingress (webhook/endpoint that would call `v6ClassifyResponseEvent_`) does not exist in this codebase and is out of scope for a `.gs`-file patch — it requires a decision about which provider/webhook to wire and where (Manual step 2 above).

Given these three factors, Retention V1 finishes this engineering pass at **QA / test-draft-ready** for the detection, response-classification, and attribution logic itself (all unit-tested, idempotent, suppression-safe), but cannot be marked production-ready until: (a) the patch is applied to the real private Apps Script project, (b) `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` are populated from a real Salesforce/NOVA extract, and (c) a real response-event webhook is connected. None of those three steps can be completed from this environment.
