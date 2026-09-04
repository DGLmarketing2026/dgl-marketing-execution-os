# Retention V1 Architecture

Scope: RETENTION / EARLY RISK workflow inside DGL Marketing OS V6 (Google Apps Script, private data hub). This document maps the full mandated pipeline —
`ingest -> normalize -> detect -> prioritize -> suppress -> build scope -> resolve recipients -> govern -> queue -> execute -> capture response -> account stop -> AM handoff -> attribution` — to concrete functions, and marks what already existed (generic, shared across QNB/Reactivation/Cross-Sell/Nurture/Retention) vs what Retention V1 adds (AM-activity join + response classification + commercial attribution).

All line references are to `backend/apps-script-v6/` in this repo, as of this branch (`retention/v1-am-activity-join`).

## 1. Ingest (private report source -> row objects)

- Already existed: `v6ReportRows_(sheetName)` — `MarketingV6ReportIngestion.gs:3`. Reads a named tab from the private `MKT_V6_REPORT_SOURCE_ID` spreadsheet and returns trimmed header-keyed row objects. Shared by every opportunity family.
- Already existed: `v6FichaIndex_()` — `MarketingV6ReportIngestion.gs:40`. Indexes `FICHA_CLIENTES` by normalized account name for service enrichment.
- **Added (Retention V1):** `v6CuentasIndex_()` — `MarketingV6ReportIngestion.gs:45`. Same pattern as `v6FichaIndex_`, indexes `CUENTAS` by normalized `Cuenta` so Retention can join AM-activity evidence (Bucket, Tipo gestion, Falso positivo, Solo cobranza, chatter fields) onto `MIGRACION_CAIDAS` rows without ever joining by raw account name string comparisons at write time (join key is the same normalized function used everywhere: `v6NormAccount_`).
- **Added:** `v6IngestCommercialOutcomes_()` — `backend/apps-script-v6/MarketingV6CommercialOutcomes.gs:11`. Reads `LOADS_ORIGEN_LQ` via the same `v6ReportRows_` used by every other report family (no new source, no new credentials).

## 2. Normalize

- Already existed: `v6NormAccount_`, `v6Text_`, `v6Yes_`, `v6ServiceName_`, `v6IsoDate_`, `v6HashKey_`, `v6OppId_` — `MarketingV6ReportIngestion.gs:16-38`. Untouched. Retention V1 reuses these exactly; no new normalization primitives were introduced. `v6HashKey_`/`v6OppId_`/the `ACC-<hash>` accountId strategy for Retention rows is unchanged (see `RETENTION_V1_DATA_CONTRACT.md`).

## 3. Detect (opportunity signal construction)

- Already existed: `v6BuildRetentionOpportunities_(nowIso, ficha)` reading `MIGRACION_CAIDAS`, with `OWNER REQUIRED` suppression only — `MarketingV6ReportIngestion.gs:72` (pre-change).
- **Changed (Retention V1):** signature is now `v6BuildRetentionOpportunities_(nowIso, ficha, cuentas)` — `MarketingV6ReportIngestion.gs:93`. The `reason` (suppression) logic is now delegated to the new helper `v6RetentionAmActivityReason_(r, match)` — `MarketingV6ReportIngestion.gs:80` — which joins the `MIGRACION_CAIDAS` row against the `CUENTAS` index (`match = cuentas[v6NormAccount_(r.Cuenta)]`) and evaluates, in strict priority order: `OWNER REQUIRED` (own-row `Sin dueno`/house account, unchanged) -> `OWNER REQUIRED` (CUENTAS match Bucket `1. SIN DUENO` / house account) -> `FALSE POSITIVE` (CUENTAS `Falso positivo`) -> `COLLECTIONS` (CUENTAS `Solo cobranza`) -> `AM ACTIVITY REVIEW REQUIRED` (CUENTAS bucket is one of the "activity exists but didn't convert" buckets `6/7/8`) -> `AM ACTIVITY REVIEW REQUIRED` (bucket says "no management" but `Tipo gestion` says `COMERCIAL` — contradiction) -> no reason (`DETECTED`).
  - Every Retention opportunity row also now carries 4 non-decisional evidence fields: `amActivityBucket`, `amActivityTipoGestion`, `amActivityUltimoChatter`, `amActivityAutorChatter` (all sourced from the `CUENTAS` match, empty string if there is no match). These are informational only; `v6WriteOpportunities_` (`MarketingV6ReportIngestion.gs:169`, unchanged) only writes whatever columns already exist as headers in `MKT_OPPORTUNITIES`, so these fields are silently ignored until/unless that sheet's header row is extended — no risk of breaking the existing write path.
- Unchanged: `v6BuildQnbOpportunities_`, `v6BuildReactivationOpportunities_`, `v6BuildCrossSellOpportunities_`, `v6BuildNurtureOpportunities_` — same code, same call signatures, same suppression vocabulary as before this branch.

## 4. Prioritize / cross-family suppression

- Already existed and unchanged: `v6ApplyPrioritySuppression_(rows)` — `MarketingV6ReportIngestion.gs:153`. Retention keeps `priorityRank:2` (below QNB=1, above Reactivation=3), unchanged. Verified by regression test (`tests/v6-retention-am-activity.test.js`, test 3).

## 5. Suppress (write to `MKT_OPPORTUNITIES`) + refresh orchestration

- Already existed: `v6WriteOpportunities_` (unchanged), `v6OpportunityMetrics_` (unchanged).
- **Changed:** `v6RefreshOpportunitiesFromReports_()` — `MarketingV6ReportIngestion.gs:194`. Now also builds `cuentas = v6CuentasIndex_()` and threads it into `v6BuildRetentionOpportunities_(nowIso, ficha, cuentas)`. The other four `v6Build*Opportunities_` calls are untouched (same arguments as before).
- **Added:** join-coverage metric. `v6RetentionCuentasJoinCoverage_(retentionRows, cuentas)` — `MarketingV6ReportIngestion.gs:188` — computes the fraction of Retention rows that found a match in `CUENTAS` (0 when there are no Retention rows, to avoid divide-by-zero). Surfaced as `retentionCuentasJoinCoverage` in the return value of `v6RefreshOpportunitiesFromReports_`. This is an observability signal only; it never gates or suppresses anything (an unmatched row still resolves to `DETECTED` unless another rule fires — no fail-closed behavior on missing join data, see test 7 in `tests/v6-retention-am-activity.test.js`).

## 6. Build scope / resolve recipients / govern (unchanged, reused as-is)

- Already existed, untouched by this branch: `v6ResolveRecipients_`, `v6AudienceStatus_`, `v6IngestAuthoritativeContacts_` (`MarketingV6ContactIngestion.gs`), `v6FrequencyStatus_` / `v6EvaluateCampaignPressure_` (`MarketingV6FrequencyControl.gs`), `MKT_EXCLUSIONS` / `MKT_SCOPE_ACCOUNTS` / `MKT_CAMPAIGN_SCOPES` / `MKT_AUDIENCES` contracts (see `backend/apps-script-v6/README_INSTALL_V6.md`). Retention V1 does not modify any of these; it only extends `MKT_EXCLUSIONS` writes via the new response-event path below (same table, same upsert helper, same schema).

## 7. Queue / execute (unchanged)

- Already existed, untouched: `MarketingV6ExecutionEngine.gs` (`v6CreateExecution_`, `v6QueueExecution_`, `v6StartExecution_`, `v6ExecutionStatus_`), `MarketingV6DriveArchive.gs`. Production bulk send remains gated by `MKT_V6_PROVIDER_READY=false` (see Runbook).

## 8. Capture response (new)

- **Added:** `backend/apps-script-v6/MarketingV6ResponseEvents.gs`.
  - `v6ClassifyResponseEvent_(rawEvent)` (`MarketingV6ResponseEvents.gs:15`) is the single entry point for classifying an inbound response/engagement event. It never writes to a sheet directly; it always delegates to an existing or narrowly-scoped-new function:
    - `REPLY` / `RFQ` / `QUOTE_SIGNAL` / `LOAD_SIGNAL` -> `v6UpsertPipelineStage_` (already existed, `MarketingV6Pipeline.gs:5`, aliased as `v6PipelineTransition_`). This is the same function the pipeline sync and commercial-outcomes ingestion use — one idempotent upsert path per account (`MKT_ACCOUNT_PIPELINE`, keyed by `accountId`).
    - `BOUNCE` -> **added** `v6MarkContactEmailInvalid_` (`MarketingV6ResponseEvents.gs:1`), which reads the existing `MKT_CONTACTS_SECURE` row (if any), merges in `emailStatus:'INVALID'`, and upserts by `contactId` — following the same read-merge-upsert pattern already used by `v6IngestAuthoritativeContacts_` (`MarketingV6ContactIngestion.gs:38`). No pipeline write. No other contact fields are touched.
    - `UNSUBSCRIBE` -> **added** `v6RegisterExclusion_` (`MarketingV6ResponseEvents.gs:9`), which upserts an `ACTIVE` row into the already-existing `MKT_EXCLUSIONS` table, keyed by a deterministic `exclusionId` (`'UNSUB:'+contactId` or `'UNSUB:'+accountId`) so repeated unsubscribe events are idempotent. No pipeline write.
    - `CLICK`, `OTHER`, and any unrecognized `eventType` -> no write at all, `action:'IGNORED'`.
  - Registered in the router: `routeMarketingV6_` — `MarketingV6RouterExtension.gs:1` — new entry `v6ClassifyResponseEvent`.
  - **Explicit external gap:** there is no webhook/HTTP endpoint in this repo that receives raw provider response/engagement events (email replies, RFQ webhooks, bounce/unsubscribe callbacks) and calls `v6ClassifyResponseEvent_`. That ingress does not exist yet anywhere in the codebase we have access to. See `RETENTION_V1_RUNBOOK.md` for the exact gap and BLOCKED status.

## 9. Account stop / AM handoff (unchanged, reused)

- Already existed, unchanged: `v6UpsertPipelineStage_` already sets `nextAction:'STOP ACCOUNT AUTOMATION / V5.5 HANDOFF'` and `handoffStatus:'PENDING'` whenever a stage transition lands on `RESPONDED` (`MarketingV6Pipeline.gs:5`). Retention V1's `REPLY` classification reuses this exact mechanism — it is the same "stop this account, hand off to AM" behavior every other opportunity family already gets through the pipeline, not a new stop/handoff mechanism.

## 10. Attribution (new)

- **Added:** `backend/apps-script-v6/MarketingV6CommercialOutcomes.gs`.
  - `v6IngestCommercialOutcomes_()` (`MarketingV6CommercialOutcomes.gs:11`) reads `LOADS_ORIGEN_LQ` (same `v6ReportRows_` mechanism as every other report). For each row it resolves a canonical `accountId` via `v6ResolveCommercialAccountId_` (`MarketingV6CommercialOutcomes.gs:4`), which requires an exact, unique, normalized-name match in `MKT_ACCOUNTS` that also has `salesforceAccountId` or `externalAccountId` populated (i.e. a real crosswalk, never a bare name match) — no unique match -> the row is skipped and counted in `unresolvedCount`, nothing is written (fail-closed on ambiguous/absent identity, consistent with "never join by account name" as an authority rule; this only accepts the join when there's an authoritative crosswalk backing the name).
  - On a resolved match, it calls the existing `v6PipelineTransition_` (alias of `v6UpsertPipelineStage_`) with `loadId`, `loadAt`, and `attributedRevenue:Number(row.Monto||0)` — the dollar amount is copied as-is, never recalculated or summed with anything else.
  - Multi-campaign concurrency guard: if the account's existing pipeline record already has a `campaignId` and its `currentStage` has already advanced past `CAMPAIGN ACTIVE` (via the already-existing `v6PipelineAdvanced_`, `MarketingV6Pipeline.gs:7`), the ingestion does not attempt to reassign/guess a campaign; it calls `v6PipelineTransition_` with an explicit `nextAction:'MULTI-CAMPAIGN CONCURRENCY — ATTRIBUTION AMBIGUOUS'` and does not pass a `campaignId`, so the existing one is preserved by `v6UpsertPipelineStage_`'s own merge logic (`campaignId:p.campaignId||old.campaignId||''`). Counted in `ambiguousCount`.
  - Registered in the router: `v6IngestCommercialOutcomes` — `MarketingV6RouterExtension.gs:1`.
  - **Extended (not replaced):** `v6PipelineSummary_()` — `MarketingV6Pipeline.gs:15` — now also returns `byCurrentStageRevenue`, `byOpportunityTypeRevenue`, `byServiceRevenue`, `byAmOwnerRevenue`, summing `Number(r.attributedRevenue||0)` only where that field is present and numeric, using the exact same grouping keys as the existing count aggregates (`byCurrentStage`, `byOpportunityType`, `byService`, `byAmOwner`), computed in the same single pass over `MKT_ACCOUNT_PIPELINE`.

## Summary of what is new vs reused

| Stage | Reused as-is | Added in Retention V1 |
|---|---|---|
| Ingest | `v6ReportRows_`, `v6FichaIndex_` | `v6CuentasIndex_`, `v6IngestCommercialOutcomes_` read of `LOADS_ORIGEN_LQ` |
| Normalize | all `v6*_` primitives | none |
| Detect | build-function pattern, `v6ServiceFromFicha_` | `v6RetentionAmActivityReason_`, 4 evidence fields, `cuentas` param |
| Prioritize | `v6ApplyPrioritySuppression_` | none |
| Suppress/write | `v6WriteOpportunities_`, `v6OpportunityMetrics_` | `v6RetentionCuentasJoinCoverage_` metric |
| Scope/recipients/govern | full V6 contact/recipient/frequency stack | none |
| Queue/execute | `MarketingV6ExecutionEngine.gs`, `MarketingV6DriveArchive.gs` | none |
| Capture response | `v6UpsertPipelineStage_` | `v6ClassifyResponseEvent_`, `v6MarkContactEmailInvalid_`, `v6RegisterExclusion_` |
| Stop/handoff | `RESPONDED` -> stop/handoff in `v6UpsertPipelineStage_` | none (reused via REPLY classification) |
| Attribution | `v6PipelineTransition_`, `v6PipelineAdvanced_` | `v6IngestCommercialOutcomes_`, revenue aggregates in `v6PipelineSummary_` |
