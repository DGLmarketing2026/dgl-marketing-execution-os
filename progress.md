# Retention V1 — Progress

Branch: `retention/v1-aura-integration-20260911` (pushed to `origin`).

## Pass 9 — Pre-LIVE content/safety audit for MKT_EMAIL_QUEUE

Requested validation before ever allowing LIVE: real/personalized recipient content, correct
company/contact/service match, no unmerged `{{token}}`, no broken `href="#"` CTA, a sender
signature and reply-to present, suppression/frequency/approval/duplicate protection all holding,
and -- the one non-negotiable check -- confirmation that DRY_RUN never produced a real send.

Attempted independent, this-session verification against the live Data Hub
(`1FXpoBO658ldbr4V8wCKo0luHU3_kqHwYzAnWijA6lBM`) first, exhausting every read path available:
Sheets REST API (already known disabled, 403 SERVICE_DISABLED), Drive API's native-file export
endpoint (`files/{id}/export`, blocked 403 `appNotAuthorizedToFile` -- Drive's `export` still
requires per-file app authorization, not just the `drive.metadata.readonly` scope this OAuth
client has), Drive content read (`alt=media`) on both an Apps-Script-created JSON status file
and an Apps-Script-created CSV (both blocked 403 for the same reason -- content access is
restricted to files created through an authorized interactive session of this exact app, not
just any file this account owns), the Apps Script Execution API (`clasp run`, still returning
the same previously-diagnosed `storage NOT_FOUND`/permission error), and the project's own public
Web App endpoint (`doGet`/`doPost` in `DGL_Core.gs`, real and reachable over plain HTTPS, but
correctly gated by `assertApiKey_` against a random UUID stored only in Script Properties --
intentionally not bypassed; weakening that gate to solve an observability gap would be a real
security regression, not a fix). Net result: this session has metadata-only Drive visibility
(file names/timestamps/sizes -- confirmed real, e.g. the `aura-execution-*.csv` archive trail
showing `v6AuraAutomationTick_` firing on a genuine ~60-minute cadence) and zero ability to read
actual spreadsheet or file content. This is an intentional, correctly-configured security
boundary, not a bug to route around.

Given that, added `v6AuraEmailQueueAudit_()` (`MarketingV6AuraEmailDispatcher.gs`) -- a
no-argument function callable directly from the Apps Script editor (or, API-key-authenticated,
via the router as `v6AuraEmailQueueAudit`) that performs exactly the checklist above against the
real `MKT_EMAIL_QUEUE`/`MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` data, in place, with zero external API
dependency: per-job checks for invalid email, a mismatch against the real account/contact record
(company, firstName, email), any generic fallback value reaching a real job
(`your company`/`Team`/`freight`), any unmerged `{{token}}` in subject or HTML, a broken
`href="#"` CTA, a missing sender signature or reply-to, a duplicate `(campaignId, accountId,
contactId, sequenceStep)` key, and an approval gate that was bypassed or recorded but not
enforced -- plus the one critical, top-level signal: `realSendsDetected` (any job already at
status `SENT`) and its own `CRITICAL` warning string. Every email in the output is masked
(`m***@domain.com`) -- this is a safety report, not a place to reproduce contact PII.

Tests: `tests/v6-aura-email-dispatcher.test.js` extended (+2 cases: a genuinely well-formed job
audits clean with zero findings; a deliberately broken/mismatched/duplicated/already-sent set of
jobs is caught on every single category, including the real-SENT critical case).

Full suite: 36 files, 36 pass, 0 fail.

## Pass 8 — Real Gmail send provider for Retention (AURA Email Dispatcher)

DGL's own real run (`RUN-4C091A1B`: 131 accountsEvaluated, 14 detected/eligible/campaignReady,
117 suppressed, 54 reviewRequired) proved detection/scoping worked end to end, but
`MKT_AURA_EXECUTION_REPORT` stalled every Retention campaign at `READY TO SEND · SEND PROVIDER
REQUIRED` and `MKT_EMAIL_QUEUE` stayed header-only: the automatic campaign/execution engine
(`v6AuraAutomationTick_`, `MarketingV6AuraAutomation.gs` -- live-authored, not yet in this repo
before this pass, now added verbatim) already built scopes/campaigns/executions and generated
real copy every hour, but nothing ever turned an already-vetted eligible audience
(`v6ResolveRecipients_`'s own `MKT_AUDIENCES` output) into `MKT_EMAIL_QUEUE` jobs, and
`v6QueueExecution_`'s gate hard-blocks on the global `MKT_V6_PROVIDER_READY` flag that also
gates QNB/Reactivation/Cross-Sell and Campaign Studio.

Added `MarketingV6AuraEmailDispatcher.gs` as an independent send path for Retention only
(`AURA_EMAIL_QUEUE_FAMILIES_ = ['Retention']`) that never reads or writes
`MKT_V6_PROVIDER_READY`, so QNB/Reactivation/Cross-Sell keep reporting
`READY TO SEND · SEND PROVIDER REQUIRED` exactly as before (zero regression, proven by
`v6AuraQueueCountsForCampaign_` falling through to the unchanged gate-based status whenever a
campaign has no queue rows). It re-uses every existing gate verbatim instead of re-implementing
any of them:
- `v6AuraBuildEmailQueueForCampaign_` reads ONLY the already-`ELIGIBLE` rows
  `v6ResolveRecipients_` persisted in `MKT_AUDIENCES` (DNC/invalid-email/active-exclusion/
  frequency-blocked contacts never even reach this file), builds one deterministic,
  idempotent job per `(campaignId, contactId, sequenceStep)`, and never rebuilds a job that
  already exists -- a job's status, once the dispatcher moves it past `PENDING`, is never reset
  by a later automatic tick.
- Copy/brand template reuse: `v6AuraGenerateCopy_`/`v6AuraEmailHtml_`
  (`MarketingV6AuraCopyEngine.gs`, also newly added to this repo) generate the real subject/
  HTML; `v6AuraEmailHtml_`/`v6AuraSample_` gained an optional `vars`/`firstName` argument
  (backward-compatible default = old hardcoded 'Team' sample) so the SAME approved template
  now personalizes per real contact instead of only ever rendering the generic archive sample.
- Approval: `v6AuraPolicyApproved_` (unchanged) -- a policy-review campaign queues
  `REVIEW_REQUIRED`, never `PENDING`.
- Account stop / `stopOnResponse`: `MKT_ACCOUNT_PIPELINE` + `v6PipelineAdvanced_`
  (unchanged) -- a `RESPONDED`/`RFQ RECEIVED`/`QUOTED`/`LOAD / REACTIVATED`/`RETAINED /
  EXPANDED`/`COOLDOWN / NURTURE`/`CLOSED / SUPPRESSED` account is marked `STOPPED`, never sent.
- Post-send frequency ledger: `v6RecordMarketingTouch_` (unchanged).

`AURA_SEND_MODE` (Script Property) defaults to `DRY_RUN` whenever unset. `auraProcessEmailQueue`
re-validates every gate at send time (email format, active exclusion, approval, duplicate-sent,
frequency) before either simulating (`DRY_RUN` -- every check runs, `GmailApp.sendEmail` is
never called) or actually sending (`LIVE`, via `GmailApp.sendEmail` with
`DGL_CONFIG.DEFAULT_SENDER_NAME` as the display name -- the same identity `DGL_Core.gs`'s own
`processEmailQueue()` already uses, no invented alias). Only `auraEnableLiveSending()`/
`auraDisableLiveSending()` change the mode; neither this file, `v6AuraAutomationTick_`, nor
`auraInstallTriggers()` ever calls them. `auraInstallTriggers()` installs a dedicated, idempotent
hourly trigger for the dispatcher, strictly separate from the canonical Acquisition/AURA hourly
tick and the Retention 6-hour bootstrap trigger.

`MKT_EMAIL_QUEUE` extended additively (existing 17 legacy columns untouched) with `requestId,
amOwner, playbookId, sequenceStep, scheduledAt, approvalId, approvedAt, approvedBy,
stopOnResponse` via the same generic `v6EnsureContactRecipientSchema_` engine every other table
in this project already uses (`MKT_V6_CONTACT_RECIPIENT_SCHEMA`, `MarketingV6SchemaMigration.gs`)
-- `MKT_TOUCHES` added to the same map purely for header validation before the dispatcher logs a
real send touch into it, no column changed. `MKT_AURA_EXECUTION_REPORT` extended with `queued`/
`failed` (additive); `v6AuraReportRow_` now reports real `sent`/`queued`/`failed` counts and a
real `QUEUED` / `READY TO SEND · DRY RUN VALIDATED` / `SENDING` / `ACTIVE` status once a queue
exists for a campaign, so `READY ≠ QUEUED ≠ SENT` is finally distinguishable. `v6AuraRetentionDashboard_`
exposes one safe (no PII), read-only data contract (Run ID, Last Run, Detected/Eligible/Review
Required/Campaign Ready/Handoffs from the real pilot run, Queued/Sent/Failed/Responses/RFQs/
Quotes/Loads from the real execution reports, per-campaign table) for `dgl-marketing-execution-os`
to consume later.

Tests: new `tests/v6-aura-email-dispatcher.test.js` (11 cases: personalized job build, non-
eligible rows never queued, idempotent build never resets a terminal job, policy-review queues
`REVIEW_REQUIRED`, `DRY_RUN` validates everything but never calls `GmailApp.sendEmail`, `LIVE`
sends + records the frequency-ledger touch + `MKT_TOUCHES` row + can be disabled again, an
active exclusion suppresses at dispatch time, a `RESPONDED` account is `STOPPED` not sent, a
frequency cap `SKIPS` the send, a duplicate-sent guard prevents a real double-send even under
`LIVE`, `auraInstallTriggers` is idempotent). `tests/v6-aura-bootstrap.test.js` and
`tests/v6-schema-migration.test.js` fixtures extended with the new `MKT_EMAIL_QUEUE`/
`MKT_TOUCHES` tables (both must already exist in production, like every other real commercial
table in the schema map -- neither is auto-created by the bootstrap).

Full suite: 36 files, 36 pass, 0 fail.

## Pass 7 — Self-observability (MKT_AURA_RUN_LOG), one-shot recovery trigger

Correction from the user: an external session (this one) being unable to read Google Sheets
content via a REST API (Sheets API disabled for the `clasp` OAuth client's project) is an
observability gap in this session, NOT a production runtime failure -- Apps Script itself
runs `SpreadsheetApp`/`DriveApp`/`PropertiesService`/`ScriptApp` natively, with no dependency
on any external API being reachable. Nothing in the actual runtime was ever coupled to that;
this pass adds a durable, native self-log so the outcome of every run is inspectable without
needing external Sheets access at all, and a short-delay recovery mechanism so a
blocked/failed run does not have to wait up to six hours for the next canonical firing.

Added:
- `MKT_AURA_RUN_LOG` schema (`MarketingV6SchemaMigration.gs`) + `v6AuraEnsureRunLogSheet_()`
  -- the second table this pack auto-creates end to end (same justification as
  `MKT_RETENTION_RUN_SUMMARY`: brand-new, AURA-owned, no historical data at risk).
- New `MarketingV6AuraRunLog.gs`: `v6AuraLogStage_(runId,stage,status,extra)` -- upserts one
  row per `(runId, stage)`, idempotent, always best-effort (a logging failure is swallowed
  internally and never breaks the real business logic calling it). `v6AuraWriteLastRunStatusFile_`
  -- a single, overwritten-in-place `_AURA_LAST_RUN_STATUS.json` in the same AM-reports Drive
  folder (native `DriveApp`, not a third historical CSV -- one fixed name, always the latest
  state, safe-aggregate fields only). `v6AuraScheduleOneShotBootstrapRecovery_`/
  `v6AuraCleanupOneShotBootstrapRecovery_` -- a short-delay (default 5 min), idempotent,
  self-cleaning one-time trigger, tracked by trigger unique ID in a Script Property, that
  never duplicates and never touches the canonical six-hour trigger.
- `MarketingV6AuraBootstrap.gs` rewritten around this: generates `runId` once at the very
  top, wraps the entire body in try/catch (a real thrown exception is now caught, logged as
  `RUN_FAILED` with the real `errorCode`/`errorMessage`, schedules a one-shot recovery, and
  returns -- it no longer propagates an unhandled exception out of the function), logs
  `BOOTSTRAP_STARTED`/`SOURCE_SELECTED`/`SCHEDULER_CONFIRMED` inline, schedules one-shot
  recovery on `STALE_SOURCE`, and cleans up any pending one-shot trigger on
  `BOOTSTRAP_COMPLETE`.
- `v6AuraRetentionDryRun_`/`v6AuraRunRetentionCycle_` (`MarketingV6RetentionReport.gs`) now
  accept an optional `runId` so the bootstrap's id is threaded through every stage instead of
  each function minting its own (fully backward compatible: a standalone caller with no
  `runId` still gets one generated exactly as before). Logs
  `SOURCE_SELECTED`/`FRESHNESS_PASSED`/`RETENTION_STARTED`/`RETENTION_COMPLETED`/
  `CSV_CREATED`/`HANDOFF_CSV_CREATED`/`RUN_SUMMARY_WRITTEN`/`RUN_COMPLETED` at each real stage
  (`typeof`-guarded, so these two functions remain fully usable standalone/in tests without
  `MarketingV6AuraRunLog.gs` loaded).

Tests: new `tests/v6-aura-run-log.test.js` (5 cases: log-stage idempotency, logging failure
never throws, status file created-then-updated-in-place never duplicated, one-shot trigger
scheduled/never-duplicated/cleaned-up, cleanup never touches the canonical trigger).
`tests/v6-aura-bootstrap.test.js` extended (+2 cases: a real thrown exception is caught,
logged with the real error, and schedules recovery; a STALE run schedules a one-shot
recovery trigger alongside the always-installed canonical one, never duplicated on a second
STALE run, and a subsequent successful run cleans the one-shot trigger up).
`tests/v6-schema-migration.test.js` updated to seed the new `MKT_AURA_RUN_LOG` tab.

Full suite: 35 files, 35 pass, 0 fail.

## Pass 6 — Source arbitration (NOVA -> AM Intelligence Gmail fallback), extended response events

Root cause of the real production incident this pass fixes: the canonical NOVA report
source (`v6AuraCheckReportFreshness_`) was genuinely stale (confirmed live: 16+ days), but
a separate, already-deployed AM Intelligence pipeline (`MarketingV6AuraGmailIngest.gs`,
brought into this repo for the first time this pass -- it previously existed live-only)
had already validated a current AM report (`GMAIL_AM_REPORT`, 948 rows accepted, 0
rejected, received 2026-09-10) into `MKT_AURA_GMAIL_OPPORTUNITIES`. Nothing arbitrated
between the two sources, and `v6BuildGmailOpportunities_` (already written, live-only,
never wired in) was never actually called by `v6RefreshOpportunitiesFromReports_` despite
its own header comment claiming it was -- so a valid, current AM signal sat unused while
the cycle correctly (but unnecessarily) refused to run.

Fixed:
- `MarketingV6DataFreshness.gs`: new `v6AuraResolveFreshnessSource_()` -- NOVA canonical
  first; falls back to the Gmail AM Intelligence source only when it is present
  (`typeof`-guarded), `status:'OK'`, `freshness:'CURRENT'` (the ingestion engine's own
  <=8-day threshold, reused verbatim, not redefined) and `rowsAccepted>0`. No numeric cap
  on `rowsRejected` -- no such policy is documented anywhere, and none is invented.
  Returns `STALE_SOURCE` (renamed from the old bare `'STALE'`) only when neither source
  qualifies. All three freshness call sites (`MarketingV6AuraBridge.gs`,
  `MarketingV6RetentionReport.gs`, `MarketingV6AuraBootstrap.gs`) updated to this
  function and the new status literal.
- `MarketingV6ReportIngestion.gs`: `v6RefreshOpportunitiesFromReports_` now folds in
  `v6BuildGmailOpportunities_(nowIso)` (typeof-guarded) alongside the existing five
  `v6Build*Opportunities_` sources. Gmail rows use the same `accountId` hash scheme as
  every other source, so the existing `v6ApplyPrioritySuppression_` reconciles a
  Gmail-sourced and a NOVA-sourced signal for the same account with zero new mechanism
  (verified: a QNB/NOVA row still outranks a Gmail/Retention row for the same account).
- `MarketingV6ResponseEvents.gs`: extended vocabulary -- `HARD_BOUNCE` aliases onto the
  existing `BOUNCE` handling; `SPAM_COMPLAINT` registers its own exclusion reason (new
  `v6RegisterSpamComplaintExclusion_`, distinct `SPAM:` key so existing `UNSUB:` exclusion
  rows are untouched); `SENT`/`DELIVERED`/`OPEN`/`SOFT_BOUNCE` are recognized, documented
  no-ops (`MKT_V6_RESPONSE_EVENT_NO_OP_`) -- `SOFT_BOUNCE` specifically must NOT invalidate
  the contact the way `HARD_BOUNCE` does, since the address may still be reachable.
- `MarketingV6AuraGmailIngest.gs` brought into this repo for the first time (previously
  live-only): read fully before doing so, confirmed no customer/contact PII -- only
  the DGL AM-report inbox address (a company mailbox, not an individual
  contact's PII), which `tests/v6-no-pii-in-repo.test.js` now allowlists strictly for that
  one file only.

Tests: new `tests/v6-source-arbitration.test.js` (9 cases: NOVA-fresh short-circuit,
NOVA-stale+Gmail-current fallback, rowsRejected not gating, NOVA-stale+Gmail-AGING fail
closed, NOVA-stale+zero-accepted-rows fail closed, no-report-received fail closed,
Gmail-not-deployed fail closed with no crash, opportunity fold-in, cross-source priority
suppression). `tests/v6-response-events.test.js` extended (+3 cases: extended no-op set,
HARD_BOUNCE, SPAM_COMPLAINT). `tests/v6-aura-bridge.test.js` and
`tests/v6-aura-bootstrap.test.js` updated for the `STALE_SOURCE` rename.
`tests/v6-no-pii-in-repo.test.js` updated for the DGL AM-report-inbox operational allowlist
entry, restricted to `MarketingV6AuraGmailIngest.gs` only.

Full suite: 34 files, 34 pass, 0 fail.

Deployed live (same fixes pushed to `C:\Users\DGL\Desktop\AURA_DEPLOY` and the real Apps
Script project) -- see final status report in the conversation for verified evidence
(Drive/Data Hub modification timestamps) of what actually ran.

## Pass 5 — Single-shot bootstrap, no-hardcoded-Drive-folder, Handoffs CSV

Goal: remove every remaining manual one-time setup step (tab creation, Drive folder creation, folder-ID paste) and replace it with one idempotent function, `v6AuraBootstrapAndRun_()`, so the only human action left is: copy files, save, run it once, accept the Google permissions prompt. Also adds a second, AM-actionable CSV (Handoffs) alongside the existing full AM CSV, reusing the same join instead of rebuilding it. Real `clasp`/deployment access remains unavailable from this environment (confirmed by the user beforehand, not re-verified here) — no `clasp login`/`clasp push`/deployment action of any kind was attempted in this pass.

### Task 1 — `v6AuraBootstrapAndRun_()` (new file, new function)

New `backend/apps-script-v6/MarketingV6AuraBootstrap.gs`. Runs, in order, idempotently: (1) verify `MKT_V6_DATA_HUB_ID`/`MKT_V6_REPORT_SOURCE_ID` are readable via `SpreadsheetApp.openById`, fail closed to `{status:'BLOCKED_DATA_HUB_ACCESS', error}` immediately if not, before touching anything else; (2) `v6AuraEnsureRunSummarySheet_()` (Task 2); (3-4) `v6AuditContactRecipientSchema_()`/`v6EnsureContactRecipientSchema_()` (unchanged); (5) record `MKT_ACCOUNTS`/`MKT_CONTACTS_SECURE` row counts as informational, never fatal (confirmed by direct read that these tables already have real data in this deployment, per the user's instruction — not assumed empty); (6) `v6AuraAuditCanonicalIds_()`; (7) `v6AuraCheckReportFreshness_()`; (8) trivial confirmation that `v6BuildRetentionOpportunities_` (the `AM CONTEXT REQUIRED` gate's home function) is present, without touching or re-verifying the gate's internal logic; (9) `v6AuraResolveReportsFolder_()` (Task 2); (10) `v6InstallOpportunityRefreshTrigger_()` (already dedupes by handler name, untouched); (11) conditional contact ingestion (Task 4); (12) `STALE` -> stop, return `BOOTSTRAP_BLOCKED_STALE_DATA` with everything accumulated, `retentionCycle:null`; (13) `FRESH` -> `v6AuraRunRetentionCycle_()`; (14) one consolidated result object. Registered as `v6AuraBootstrapAndRun` in the router.

### Task 2 — No hardcoded Drive folder ID; one auto-creatable sheet

`backend/apps-script-v6/MarketingV6RetentionReport.gs`: removed the placeholder constant `MKT_V6_AM_REPORTS_FOLDER_ID='REPLACE_WITH_REAL_AM_REPORTS_DRIVE_FOLDER_ID'`. New `v6AuraResolveReportsFolder_()`: reuses the folder ID already stored in `PropertiesService.getScriptProperties()` under `AURA_AM_REPORT_FOLDER_ID` if `DriveApp.getFolderById` still opens it; otherwise looks up by the fixed name `DGL_AURA_AM_REPORTS` and re-saves its ID; otherwise creates it once and saves the new ID. The folder ID is never hardcoded in source and never written to a file this repo tracks — only to Script Properties (private per Apps Script project). `v6AuraGenerateAmCsvReport_`/`v6AuraGenerateHandoffsCsvReport_` both call it instead of the removed constant.

`backend/apps-script-v6/MarketingV6SchemaMigration.gs`: new `v6AuraEnsureRunSummarySheet_()` — creates the `MKT_RETENTION_RUN_SUMMARY` tab (with the schema's exact header row) if `v6Sheet_('MKT_RETENTION_RUN_SUMMARY')` is null, using `SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).insertSheet(...)` (same data hub ID `v6Sheet_` already uses, not a second lookup mechanism); leaves it untouched if it already exists (no data loss, no header rewrite — the pre-existing additive `v6EnsureContactRecipientSchema_()` still handles appending any further missing columns to it afterward, unchanged). This is deliberately the **only** table in `MKT_V6_CONTACT_RECIPIENT_SCHEMA` that auto-creates its own tab; every other table must keep failing loudly (`SCHEMA MIGRATION REQUIRED: <name> NOT FOUND`) if its tab is missing — not generalized to any other table, per the explicit instruction.

`docs/AURA_DEPLOYMENT.md` rewritten: the old manual steps ("create a new, empty tab named exactly...", "create one new, private Drive folder... paste its real folder ID into `MKT_V6_AM_REPORTS_FOLDER_ID`...") are gone, replaced by the single "copy files -> run `v6AuraBootstrapAndRun_()` once -> accept permissions" flow.

### Task 3 — AM CONTEXT REQUIRED / priority / suppression / scope / recipients / governance — confirmed intact, not touched

`v6RetentionAmActivityReason_`, `v6ApplyPrioritySuppression_`, `v6AuraAutoBuildRetentionScopes_`, `v6ResolveRecipients_`, `v6FrequencyStatus_` were not edited in this pass. `tests/v6-retention-am-activity.test.js` (7/7) and `tests/v6-aura-bridge.test.js` (all cases) re-run unmodified and still pass.

### Task 4 — Conditional contact ingestion, no invented source

Confirmed by grep before writing this pass: `v6FetchAuthoritativeContactsFromSource_` does not exist anywhere in `backend/apps-script-v6/`. The bootstrap checks `typeof v6FetchAuthoritativeContactsFromSource_ === 'function'`; if absent (today, always), records `contactIngestion:'SOURCE_NOT_CONFIGURED'` and proceeds — no Salesforce/NOVA contact-pull integration was fabricated. If such a hook is ever added elsewhere under this exact name, the bootstrap calls it and feeds its result straight into the existing, unchanged `v6IngestAuthoritativeContacts_`.

### Task 5 — Handoffs CSV (new, additive to the existing AM CSV)

`v6AuraGenerateAmCsvReport_` refactored (same public signature, same return contract, plus one new additive field) into a pure row-builder, `v6AuraBuildAmCsvRows_(runId, asOfDate)`, and a thin Drive-writing wrapper — so both the full AM CSV and the new `v6AuraGenerateHandoffsCsvReport_(runId, asOfDate, csvRows)` reuse the exact same join/rows without reading `MKT_OPPORTUNITIES`/`MKT_ACCOUNT_PIPELINE`/`MKT_SCOPE_ACCOUNTS` twice per cycle. Handoffs CSV filters to `auraDecision` in `['RESPONDED','HANDED_TO_AM','RFQ','QUOTED','RETAINED']`, exactly 13 columns (`runId, accountId, accountName, amOwner, campaignId, responseType, responseDate, handoffStatus, nextAction, rfqStatus, quoteStatus, loadStatus, attributedRevenue`), `responseType` = the row's `auraDecision`, `responseDate` = the most recent of `responseAt/rfqAt/quoteAt/loadAt` (new `v6AuraMostRecentDate_` helper), filename `AURA_RETENTION_HANDOFFS_<asOfDate>_<runId>.csv`, same resolved folder. `v6AuraRunRetentionCycle_` now generates both CSVs every cycle and records both `csvDriveFileId` and `handoffsCsvDriveFileId` on the persisted run summary (`handoffsCsvDriveFileId` added to the `MKT_RETENTION_RUN_SUMMARY` schema, additive).

### Task 6 — Scheduler — confirmed, not reconstructed

`v6ScheduledOpportunityRefresh_` (`MarketingV6ReportIngestion.gs`) still calls `v6AuraRunRetentionCycle_()` directly, unchanged from Pass 4 — **not** `v6AuraBootstrapAndRun_()`. The bootstrap's folder/sheet/trigger-creation is explicitly a one-time install concern; the recurring six-hour cycle stays the existing lightweight cycle. Documented explicitly in `docs/AURA_DEPLOYMENT.md` section 3 and `docs/RETENTION_V1_ARCHITECTURE.md` section 15.

### Task 7 — Response events / attribution — confirmed, not touched

`MarketingV6ResponseEvents.gs`/`MarketingV6CommercialOutcomes.gs` untouched. `tests/v6-response-events.test.js` and `tests/v6-commercial-outcomes.test.js` re-run unmodified, still pass.

### Task 8 — Production/email — confirmed

`MKT_V6_PROVIDER_READY` remains `false`, untouched by every file in this pass. No new code path simulates or performs a real send.

### Task 9 — Tests

New `tests/v6-aura-bootstrap.test.js` (10 cases: Data Hub inaccessible -> `BLOCKED_DATA_HUB_ACCESS` immediately with nothing else attempted; running bootstrap twice never duplicates the Drive folder; stored-but-deleted folder id falls back to name lookup then create, updating the property either way; `MKT_RETENTION_RUN_SUMMARY` auto-creates with exact schema headers when missing; already-existing `MKT_RETENTION_RUN_SUMMARY` data is left untouched; `STALE` -> `BOOTSTRAP_BLOCKED_STALE_DATA`, no cycle/CSV; `FRESH` -> full cycle runs, `retentionCycle` populated with both CSV ids; `contactIngestion` reports `SOURCE_NOT_CONFIGURED`; trigger install/reinstall is idempotent across two bootstrap runs; router exposes `v6AuraBootstrapAndRun`). Exercises the real (not re-mocked) `v6Sheet_`/`v6Rows_`/`v6UpsertByKey_`/`v6WriteOpportunities_` engines against a generic in-memory sheet mock, rather than re-stubbing their contracts.

`tests/v6-retention-report.test.js` extended: folder-resolution-aware `fakeDriveApp`/`fakePropertiesService`, a new Handoffs CSV test (exact 13 columns, correct inclusion/exclusion set across all 10 `auraDecision` values, most-recent `responseDate`, no PII), and updated assertions on `v6AuraGenerateAmCsvReport_`'s additive `csvRows` field and `v6AuraRunRetentionCycle_`'s new `handoffsCsvDriveFileId` / two-CSV-files-per-cycle contract.

New `tests/v6-no-pii-in-repo.test.js` — scans (via `fs`, not `git`) every `.gs`/`.md`/`.json` file directly inside `backend/apps-script-v6/`, `docs/`, and the repo root for email-address patterns; fails on anything outside a minimal allowlist (the single pre-existing synthetic QA fixture `qa-synthetic@dglus.com`, already covered by `tests/acquisition-wordpress-automation.test.js`'s own no-PII check) and separately asserts the user's own commit-authorship email address never appears in tracked file content (it only lives in git commit authorship metadata, which this scan does not read).

Full suite: `node --test tests/*.test.js` -> **33 files, 33 pass, 0 fail** (31 pre-existing + 2 new this pass: `v6-aura-bootstrap.test.js`, `v6-no-pii-in-repo.test.js`).

### Files changed / added this pass

- Added: `backend/apps-script-v6/MarketingV6AuraBootstrap.gs`
- Modified: `backend/apps-script-v6/MarketingV6RetentionReport.gs` (folder resolution, `v6AuraBuildAmCsvRows_` extraction, `v6AuraGenerateHandoffsCsvReport_`, `v6AuraMostRecentDate_`, `v6AuraRunRetentionCycle_` produces both CSVs), `backend/apps-script-v6/MarketingV6SchemaMigration.gs` (`v6AuraEnsureRunSummarySheet_`, `handoffsCsvDriveFileId` schema field), `backend/apps-script-v6/MarketingV6RouterExtension.gs` (`v6AuraBootstrapAndRun` route)
- Added tests: `tests/v6-aura-bootstrap.test.js`, `tests/v6-no-pii-in-repo.test.js`
- Modified tests: `tests/v6-retention-report.test.js`
- Docs updated: `docs/AURA_DEPLOYMENT.md`, `docs/RETENTION_V1_ARCHITECTURE.md` (new sections 14-15), `docs/RETENTION_V1_RUNBOOK.md`, this file, `tests.json`

### What this pass deliberately does NOT do

- Does not attempt any `clasp`/deployment action (`clasp login`, `clasp push`, or any real Apps Script deployment) — confirmed by the user beforehand to be broken/unreachable from this environment; not re-verified, not retried.
- Does not touch `v6RetentionAmActivityReason_`, `v6ApplyPrioritySuppression_`, `v6AuraAutoBuildRetentionScopes_`, `v6ResolveRecipients_`, `v6FrequencyStatus_`, `MarketingV6ResponseEvents.gs`, `MarketingV6CommercialOutcomes.gs`, or `MKT_V6_PROVIDER_READY`.
- Does not invent a Salesforce/NOVA contact-pull integration (`v6FetchAuthoritativeContactsFromSource_` stays undefined, conditionally called only if it is ever added elsewhere).
- Does not change what the six-hour recurring trigger calls (`v6ScheduledOpportunityRefresh_` still calls `v6AuraRunRetentionCycle_()`, not the bootstrap).

### Final status after this pass

Every remaining one-time manual setup step (tab creation, Drive folder creation, pasting a real folder ID into source) is now automated by `v6AuraBootstrapAndRun_()`. The only manual action left for a first real deployment is: copy the 19 files, save, run `v6AuraBootstrapAndRun_()` once, accept the Google permissions prompt. Real deployment/`clasp` access remains the only blocker, and remains outside this codebase's or this environment's control.

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
