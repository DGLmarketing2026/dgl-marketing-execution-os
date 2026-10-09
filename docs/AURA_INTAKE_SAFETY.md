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

Offline QA needs none of these authorizations. A future real Google test is a separately authorized staging/integration exercise, not this zero-write QA mode. It requires explicit permission for: a separate Apps Script project/account and synthetic mailbox; synthetic Sheets/source copies with every production ID replaced in that staging copy (including fixed inbox/NOVA/Data Hub IDs); required OAuth consent; one synthetic message; real temporary Drive conversion and cleanup; test-table writes/backup; one test trigger and its removal. If production IDs cannot be excluded, block the test. No permission to touch info@dglus.com or production is implied. Merge and production deployment/activation each remain separate decisions.

## Evidence

REGRESSION_RESULTS.json records each test file and its console evidence. The end-to-end test asserts 19 checks, including zero Gmail sends/drafts/MailApp/HTTP calls, unchanged commercial queue, and pending human approvals. Critical tests cover QA/LIVE, identity, authentication, 121-thread pagination, retry exhaustion, failed atomic replacement and recovery. Existing business-rule tests use updated synthetic Sheets adapters.

No Apps Script executed, no Google trigger installed, no mailbox read or modified, and no Salesforce/NOVA/Clientify/DNS change during implementation.
