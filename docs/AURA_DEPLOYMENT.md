# AURA Deployment — one-time setup

This is the exact, one-time checklist to take Retention from `AURA_BLOCKED_ONLY_BY_DEPLOYMENT` to running automatically in production. Nothing in this document is optional cleanup — each numbered step removes one specific, named blocker. After step 1–3 are done, Retention detection, suppression and campaign-scope build run automatically on the existing 6-hour trigger, with no manual account list at any point. Steps 4–5 are what make response capture and attribution real (they depend on systems outside this repository that only DGL can wire).

## 0. What you are deploying

Six `.gs` files, all inside `backend/apps-script-v6/`, on branch `retention/v1-am-activity-join`:

| File | Status |
|---|---|
| `MarketingV6ReportIngestion.gs` | modified — `CUENTAS` (AM Intelligence) join, `AM CONTEXT REQUIRED` gate, `v6ScheduledOpportunityRefresh_` now calls the AURA bridge |
| `MarketingV6RouterExtension.gs` | modified — 7 new route entries |
| `MarketingV6Pipeline.gs` | modified — revenue aggregates in `v6PipelineSummary_` |
| `MarketingV6ResponseEvents.gs` | new — event classifier (`REPLY`/`RFQ`/`QUOTE`/`LOAD`/`BOUNCE`/`UNSUBSCRIBE`/`CLICK`) |
| `MarketingV6CommercialOutcomes.gs` | new — batch attribution ingestion from `LOADS_ORIGEN_LQ` |
| `MarketingV6AuraBridge.gs` | new — AURA Retention Bridge (evaluate, status, scope build, account stop, AM handoff) |

No customer/contact PII, credentials, account lists, quotes, loads or revenue snapshots are in any of these files — they are code only, reading/writing table names and safe aggregate fields, exactly like every other file already in this pack.

## 1. Copy the files (one-time)

Copy the six files above into the existing private Apps Script project (the one behind the current V6.6 Web App deployment), preserving filenames exactly. Do not rename, do not split, do not create a new project. Save the project.

## 2. Verify and run once

1. Run `v6AuditContactRecipientSchema_()` (unchanged, pre-existing) and confirm it still reports `SCHEMA READY` or the expected `SCHEMA MIGRATION REQUIRED` list you already know about — this branch does not change that schema.
2. Run `v6AuraEvaluateRetention_()` once manually from the Apps Script editor. Confirm the returned object has:
   - `status: 'RETENTION_EVALUATED'`
   - `retentionCuentasJoinCoverage` between 0 and 1 (0 is valid and expected if `CUENTAS` is empty or stale — it is observability, never a gate)
   - `scopesBuilt` / `accountsScoped` reflecting however many DETECTED Retention accounts exist in the current `MIGRACION_CAIDAS`/`CUENTAS` snapshot (0/0 is valid and expected if there are none right now)
3. Confirm `MKT_CAMPAIGN_SCOPES` / `MKT_SCOPE_ACCOUNTS` now have rows whose `scopeId` contains `-RETENTION-` for any DETECTED accounts found in step 2. This is the concrete, checkable proof that the AURA Bridge closed the "campaign scope never gets built" gap.

## 3. (Re-)install the scheduler

Run `v6InstallOpportunityRefreshTrigger_()` once. It is idempotent — it deletes and recreates only its own trigger by handler name (`v6ScheduledOpportunityRefresh_`), so running it again on an existing deployment does not create a second, competing schedule. From this point on, every 6 hours, Retention is detected, suppressed and scoped automatically with no manual list — this is true immediately after this step, independent of steps 4–5 below.

Do not add any other trigger for Retention. A second trigger calling `v6RefreshOpportunitiesFromReports_` or `v6AuraEvaluateRetention_` directly would race with this one and risk duplicate/overlapping writes to `MKT_OPPORTUNITIES`.

## 4. Connect real response/engagement events (required for account stop + AM handoff to fire on real customer activity)

`v6ClassifyResponseEvent_` (routed as `v6ClassifyResponseEvent`) is written, tested, and ready to receive `{eventType, accountId, eventId, occurredAt, campaignId, executionId, amOwner, contactId, email, amount}`. **No system currently calls it.** This is not a code gap — the function and its router entry exist — it is a missing transport: something has to observe a real reply, RFQ, bounce, unsubscribe, click, quote, or load and POST it to the existing authenticated Web App with `{action:'v6ClassifyResponseEvent', payload:{...}}`.

You (DGL, not this codebase) must choose and wire at least one real source per event type you want live:

- **REPLY**: typically a Gmail/inbox Apps Script trigger (`onFormSubmit`-style polling or a Gmail add-on) that detects a reply on a tracked thread and calls the Web App.
- **RFQ / QUOTE / LOAD**: typically a Salesforce/NOVA outbound message, Flow, or scheduled export that fires when those records are created, calling the Web App (or feeding `LOADS_ORIGEN_LQ` for the batch path in step 5 — real-time and batch are complementary, not exclusive).
- **BOUNCE / UNSUBSCRIBE / CLICK**: typically your ESP/bulk-send provider's own webhook callbacks — currently moot since `MKT_V6_PROVIDER_READY` is `false` and no bulk provider is configured (unchanged, correctly still blocked).

Each raw event should carry a stable `eventId` from its source system; `v6ClassifyResponseEvent_` does not itself dedupe by `eventId` (its underlying writes are idempotent by `accountId`/`contactId`/`exclusionId`, but if you need strict once-only processing at the event level, dedupe by `eventId` in whatever ingress you build, e.g. a small "processed event ids" log). This was flagged and left as an explicit design decision in `RETENTION_V1_ARCHITECTURE.md` — resolve it in the ingress layer, not by adding a new commercial table to this pack.

## 5. Populate the authoritative account/contact crosswalk and schedule batch attribution

1. Run `v6IngestAuthoritativeContacts_` against a real Salesforce/authorized-source extract (unchanged, pre-existing function). Until `MKT_ACCOUNTS` has real rows with `salesforceAccountId`/`externalAccountId`, `v6IngestCommercialOutcomes_` will correctly report every row `unresolvedCount` and write nothing — this is fail-closed by design, not a bug.
2. Once populated, schedule `v6IngestCommercialOutcomes_()` (e.g. `ScriptApp.newTrigger('v6IngestCommercialOutcomes_').timeBased()...`, daily or matching how often `LOADS_ORIGEN_LQ` refreshes). Not wired to a trigger yet in this pack, intentionally, so it isn't run against an empty crosswalk.

## 6. Optional, non-blocking

Extend `MKT_OPPORTUNITIES` headers with `amActivityBucket`, `amActivityTipoGestion`, `amActivityUltimoChatter`, `amActivityAutorChatter` (append-only, same pattern as `v6EnsureContactRecipientSchema_`) if AM-facing visibility into the AM-activity evidence is wanted. Detection/suppression logic does not depend on these columns existing — `v6WriteOpportunities_` already silently drops fields with no matching header, confirmed by test.

## Status after this checklist

- After steps 1–3: Retention runs automatically end-to-end for detect -> suppress -> build scope, with no manual account list, on the existing schedule. This is the part fully owned by this codebase and fully unit-tested.
- Steps 4–5 depend on systems and decisions outside this repository (which mail/CRM/ESP actually calls the webhook, when the Salesforce contact extract runs) — they cannot be completed or verified from a development environment with no credentials to the private Apps Script project, no network path to script.google.com, and no access to Salesforce/NOVA. That is the entire remaining blocker: **deployment and integration wiring, not missing code.**
