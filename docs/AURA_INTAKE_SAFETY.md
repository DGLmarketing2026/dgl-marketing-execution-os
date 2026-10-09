# AURA intake safety corrections

Base: feat/growth-os-v1 (2fe7cfa). Branch: fix/aura-intake-safety.
The report-intake commits were incorporated from feat/aura-report-intake-info because the activation entrypoint was absent from the requested base. No business policies or frontend changes.

## Isolation contract

QA is the existing offline Node VM harness, not an Apps Script deployment. It has no Google credentials, OAuth consent or real scheduler. Gmail and Drive are memory adapters; Sheets accepts only synthetic file IDs; send/draft/HTTP counters must remain zero. Python only reads the synthetic XLSX fixtures. No real CRM adapter is loaded.

Run: `node tests/aura-e2e-report-intake.test.js` (Node, Python/openpyxl). Optionally set AURA_QA_PYTHON to the bundled Python executable. AURA_SEND_MODE=LIVE or run({sendMode:'LIVE'}) is rejected before simulation starts.

AURA_ENVIRONMENT=QA in Google is explicitly unsupported: intake, XLSX conversion, labels, common data access and dispatch fail closed. This property is defense in depth, not a universal sandbox for every unrelated legacy application entrypoint. Do not deploy the QA runner or use a production deployment as QA. The isolation guarantee comes from the offline harness having no Google/CRM capabilities.

Production intake refuses LIVE without changing it. DRY_RUN still permits ingestion writes, Gmail labels, temporary Drive files, backup tabs and execution-report/queue writes in the existing commercial dispatcher. DRY_RUN alone is not isolation.

## Corrections

- Effective execution identity must be present and equal to the report inbox.
- Allowlisted senders also require aligned authentication from Gmail's Authentication-Results. Explicit DMARC failure is rejected.
- Gmail searches paginate in batches of 50 until exhausted; overlapping queries deduplicate messages.
- FAILED attempts have persisted 1h/2h backoff, maximum three attempts; terminal failures require explicit operator review/reprocessing. Existing message/hash deduplication remains.
- Activation checks first-run ingestion and refresh before installing a trigger, reports failures honestly and rolls back a newly created trigger on installation failure. Existing unrelated triggers are preserved. First-run data effects are not globally transactional.
- Opportunity replacement uses one Sheets batchUpdate containing duplicateSheet (retained backup) and updateCells. A rejected transaction cannot commit a partial clear. Formula-like strings remain literal strings. Locks serialize updates inside this project; they cannot exclude unrelated human or external writers.
- Recovery: operator-only v6RestoreOpportunitiesBackup_(backupSheetId), same Data Hub, validated AURA_OPP_BACKUP_ tab, atomic clear/copy batch. No automatic deletion of backups. Monitor workbook capacity; a capacity failure leaves the original data intact.

Atomic transaction contract: https://developers.google.com/workspace/sheets/api/guides/batch

## OAuth review and future authorization

The existing manifest enables Drive v3 and Sheets v4, with inferred scopes. It is shared with the full commercial application; this patch does not replace it with an incomplete scope list that could break existing business functions.

Current intake requires GmailApp mailbox access (https://mail.google.com/; broad permission including send, although intake does not send), Sheets read/write (https://www.googleapis.com/auth/spreadsheets), Drive conversion/removal access (https://www.googleapis.com/auth/drive under the existing shared application), script trigger management (https://www.googleapis.com/auth/script.scriptapp), and identity (https://www.googleapis.com/auth/userinfo.email). Actual inferred consent for the entire project must be inspected at deployment. Sheets and Drive advanced services must already be enabled. No Anthropic/OpenAI or paid API authorization is needed.

Offline QA needs none of these authorizations. A future real Google test is a separately authorized staging/integration exercise, not this zero-write QA mode. It requires explicit permission for: a separate Apps Script project/account and synthetic mailbox; synthetic Sheets/source copies with every production ID replaced in that staging copy (including fixed inbox/NOVA/Data Hub IDs); required OAuth consent; one synthetic message; real temporary Drive conversion and cleanup; test-table writes/backup; one test trigger and its removal. If production IDs cannot be excluded, block the test. No permission to touch the production inbox or production is implied. Merge and production deployment/activation each remain separate decisions.

## Evidence

REGRESSION_RESULTS.json records each test file and its console evidence. The end-to-end test asserts 19 checks, including zero Gmail sends/drafts/MailApp/HTTP calls, unchanged commercial queue, and pending human approvals. Critical tests cover QA/LIVE, identity, authentication, 121-thread pagination, retry exhaustion, failed atomic replacement and recovery. Existing business-rule tests use updated synthetic Sheets adapters.

No Apps Script executed, no Google trigger installed, no mailbox read or modified, and no Salesforce/NOVA/Clientify/DNS change during implementation.

## STAGING (branch feat/aura-staging-isolation)

`AURA_ENVIRONMENT` selects PRODUCTION (default when unset), STAGING or QA (`MarketingV6AuraEnvironment.gs`). Production resources and behavior are unchanged. An unmarked project running as an account other than the production inbox is refused (`AURA_ENVIRONMENT_REQUIRED`), so a staging copy without its marker cannot fall back to production.

- **Resources per environment:** Data Hub, NOVA report source, Drive archive folder and report inbox are resolved by `v6AuraResourceId_` / `v6AuraReportInbox_`. Every former direct production id (Data Hub, NOVA source, archive folders, legacy V55 hub) goes through them.
- **Fail closed:** STAGING runs only when all of these are set and valid. Otherwise every Sheets, Drive, Gmail or trigger access throws before touching anything:
  - `AURA_STAGING_INBOX`, `AURA_STAGING_DATA_HUB_ID`, `AURA_STAGING_REPORT_SOURCE_ID`, `AURA_STAGING_DRIVE_FOLDER_ID`, `AURA_STAGING_TRIGGERS` and `AURA_GMAIL_ALLOWED_SENDERS` are all present;
  - the ids are well-formed and distinct;
  - no property contains a production id or the production inbox;
  - the project runs as the staging inbox account, never the production one;
  - `AURA_SEND_MODE` is not LIVE.
- **No external effects:** in STAGING the send mode is forced to DRY_RUN and LIVE cannot be enabled. The following throw:
  - every `GmailApp.sendEmail` (6 call sites);
  - WordPress publishing and Salesforce lead routing;
  - the Campaign A source;
  - the legacy NOVA import;
  - Google Sheet links that point to a production id.
- **Triggers:** every trigger is created through `v6AuraNewTrigger_`. STAGING accepts only `auraReportIntakeTick` and `auraAgentTick`, and only if they are listed in `AURA_STAGING_TRIGGERS`.
- **No implicit domain trust:** in STAGING, intake trusts only `AURA_GMAIL_ALLOWED_SENDERS`, plus `AURA_GMAIL_TRUSTED_DOMAINS` when it is set explicitly.
- **OAuth (minimum):** `backend/apps-script-manifest/appsscript.staging.json` declares 5 explicit scopes:
  - `mail.google.com`: GmailApp has no narrower scope; sends are blocked in code;
  - `spreadsheets`;
  - `drive.file`: only files the script creates, i.e. the temporary XLSX conversion;
  - `script.scriptapp`;
  - `userinfo.email`.

  There is no `script.send_mail`, no `script.external_request` (any `UrlFetchApp` call fails) and no web app. Consequences in STAGING: DriveApp archives and the Campaign Studio logo check are not available.
- **Bundle:** `node tools/staging/build-staging-bundle.js <STAGING_SCRIPT_ID> [path/to/production/.clasp.json]` writes `dist/aura-staging/` with the staging manifest and refuses the production script id.
- **Operator check:** `AURA_STAGING_CHECK()` reports `STAGING_READY` or the exact blocking reason. It has no side effects.

Exact requirements for a STAGING run (each needs your authorization; none touches production):
1. A separate Google account (not the production inbox) acting as the synthetic mailbox, and a new Apps Script project owned by it.
2. In that account:
   - a synthetic Data Hub copy (schema only, synthetic rows);
   - a synthetic NOVA report source;
   - a Drive folder.
3. Script Properties:
   - `AURA_ENVIRONMENT=STAGING`, `AURA_SEND_MODE=DRY_RUN`;
   - the 6 `AURA_STAGING_*` / `AURA_GMAIL_ALLOWED_SENDERS` values above;
   - no production property copied.
4. Build the bundle, `clasp push` to the staging script id, accept the 5 scopes, run `AURA_STAGING_CHECK()`, then `AURA_REPORT_INTAKE_ACTIVATE()` and `v6AuraAgentActivate_()`.
5. Send one synthetic XLSX from an allowlisted synthetic sender to the staging mailbox. Verify the tasks and pending approvals, then remove the triggers.
