# AURA First Run — PR #9 final remediation audit

Verified on 2026-09-28. PR: https://github.com/DGLmarketing2026/dgl-marketing-execution-os/pull/9
Branch: `fix/campaign-studio-governed-activation-v2`
Base main: `528c70206f74c6595c419da2a910aea381d2374c`
Recovered pre-remediation HEAD: `34f7d9cc018e3f6c0dee5c5b09b7de7414adf47d`
Audited implementation commit: `f8dabe7d0aa805fae4211a0886008146214f8186`
This document follows that implementation commit; there are no code changes in the documentation commit.

## Recovery

Worktree was clean. PR #9 was open, Draft and unmerged. All four audit remediations were NOT_COMPLETED before this run: the interrupted command had not executed. No local changes needed recovery. The last relevant commits were 34f7d9c (initial Studio change), 528c702 (main, PR #8) and ba98238 (sent-email audit).

## Four remediation results

| Remediation | Current result | Evidence |
| --- | --- | --- |
| Draft versus persisted creative | COMPLETED — automated PASS | Exact campaign/language lookup; current creativeId, approvalId, version, both checksums, non-revoked approval, subject/plain text and MIME-normalized persisted HTML checked before Gmail. Existing v6AuraVerifyAndCreateTestDraft_ creates only a draft and reads its actual body back. No caller HTML self-comparison establishes approval. |
| Immutable draft evidence | COMPLETED — automated PASS | MKT_STUDIO_DRAFT_VERIFICATIONS stores identity/version/checksums, draftId, timestamp, opaque platform actor and VERIFIED status only after successful readback. No body or recipient PII is duplicated. |
| Immutable set evidence | COMPLETED — automated PASS | MKT_STUDIO_SET_APPROVALS stores CREATIVE_SET approval ID/type/status, required languages, approved variant snapshot, explicit ES/EN/PT IDs/versions/checksums, actor/time and deterministic signature. Current valid creatives and exact-version draft evidence are required. ScriptProperties cannot authorize a set. |
| Campaign A copy isolation | COMPLETED — automated PASS | Special vocabulary gate uses only exact CMP-CAMPANA-A-HA-PRIORITARIA identity. Retention Stay Close/Seguimos cerca, Reactivation, QNB and unrelated Activation drafts are exercised without that rule leaking. Frontend uses each family's own copy/CTA defaults. |

Implementation: backend/apps-script-v6/MarketingV6CampaignStudio.gs.
Frontend integration: assets/js/campaign-studio-v6.js.
Regression evidence: tests/campaign-studio-governed.test.js and tests/v6-aura-campana-a.test.js.

## Approval evidence architecture

The two dedicated evidence sheets are additive and created only when an authorized draft-verification/set-approval operation first writes evidence. Missing evidence on reads fails closed. Existing MKT_APPROVALS is not modified. Header extension only appends missing columns; evidence operations append new records and never replace/update historical data rows. Extra columns and unrelated records remain preserved.

This is append-only application behavior on Sheets, not a claim of storage-level WORM or protection against a privileged sheet administrator. Actor attribution comes from Session.getTemporaryActiveUserKey, not a caller-provided Marketing label or stored email. Runtime deployment must support this platform API; a missing actor fails closed before recording evidence.

Each required language must have a valid current approved creative and a verified draft with matching campaign, language, creative ID, version and content/HTML checksums. The set gate independently verifies the durable set record against the current creative signature and current draft evidence. Changing or revoking a required creative makes the old evidence non-authorizing; reapproval and an exact new draft are required, then a new explicit set approval. Old records remain unchanged.

The UI hydrates evidence from backend context, shows UNAPPROVED / APPROVED + TEST DRAFT REQUIRED / TEST DRAFT VERIFIED / STALE AFTER EDIT, and disables set approval until complete. Draft requests include the exact displayed approval identity. A generic POST activity success cannot mark verification complete: the UI rereads backend evidence and matches its identity/version/checksum.

No generic Campaign A draft-review prerequisite is imposed on unrelated campaign families. All Studio drafts still use persisted approval integrity. Existing recipient suppression and queue checkpoints remain; complete-set gating is not an atomic external Gmail delivery guarantee.

## Current validation

Targeted: node tests/campaign-studio-governed.test.js; node tests/v6-aura-campana-a.test.js.

Full suite command (PowerShell):
```powershell
$failed = @()
$files = Get-ChildItem tests -Filter '*.test.js'
foreach ($file in $files) {
  & node $file.FullName
  if ($LASTEXITCODE -ne 0) { $failed += $file.Name }
}
if ($failed.Count) { throw ($failed -join ', ') }
```

Counting unit is independently executed test scripts, not individual assertions:
TEST_FILES=55; TESTS_RUN=55; TESTS_PASSED=55; TESTS_FAILED=0; TESTS_SKIPPED=0.
These are results from this remediation run, not reused historical counts.

Targeted coverage includes unapproved/missing/revoked creative; HTML/subject drift; invalid status/checksums; wrong campaign/language/version/approval ID; Gmail readback mismatch with no verification persisted; missing PT draft; stale EN after edit; exact reapproval/new draft; ScriptProperties forgery; cross-execution durable read; immutable old records; actor/time and explicit multilingual snapshot; UI complete-set readiness and family copy regression.

All external Gmail/Sheets services in these tests are fakes. Real ES/EN/PT Gmail drafts were NOT RUN. The implementation calls actual Gmail draft-body readback, verified here with mocked responses; no live Gmail success is claimed.

Static validation: four changed JS/Apps Script source/test files parse with Node vm.Script; git diff --check PASS.
LINT=NOT_CONFIGURED; TYPECHECK=NOT_CONFIGURED; BUILD=NOT_CONFIGURED. package-info.txt describes a static vanilla JS app without a build step, and tests.json confirms standalone Node tests. No package.json, lint/typecheck configuration, clasp configuration, or GitHub workflow was found.
Live Apps Script validation=NOT_RUNTIME_VERIFIED. No synthetic GitHub check/status was created.

## AURA regression and history

Automated PASS: eligibility/suppression, AM-context fail-closed behavior, account stop and response/RFQ handling, AM handoff, attribution, run summary, campaign isolation and duplicate-run protection. Coverage includes v6-retention-am-activity, v6-aura-bridge, v6-response-events, v6-aura-campana-a, v6-aura-email-dispatcher, v6-retention-report, aura-automation-tick, aura-email-performance and v55-live-workflow.

The existing AM CONTEXT REQUIRED suppression is not changed. Operational/live verification for all these behaviors is NOT_RUNTIME_VERIFIED.

Historical fixture: 109 SENT rows remain byte-for-byte unchanged; historical family remains Retention. This is offline fixture evidence, not a new production query. No historical or production records were accessed for mutation. Campaign A persistence retains createdAt, foreign/formula fields and unrelated approval metadata.

## Send safety and brand

AURA_SEND_MODE=UNCHANGED. REAL_EMAILS_SENT=0. No production deployment/mutation, actual Gmail draft creation or dispatch occurred. Preview, campaign save and set approval add no send calls. Tests exercise fake transport only.

Official DGL/FREIGHT BROKER asset bytes are unchanged. Brand load/dimension/PNG validation and canonical colors #77B82A / #05035C remain. Automated official-asset and lockup checks PASS. ES/EN/PT independence, per-variant approval, cross-language/version protection and stale-evidence rejection PASS in fixtures.

## Security scope

SECURITY R01-R10 CHANGES INCLUDED=NO. No security backup commits/files were imported. The four PR-introduced governance/integrity findings above are fixed and tested; this is not a blanket security certification.

PRE_EXISTING_NOT_INTRODUCED_BY_PR: legacy shared-token/JSONP transport and browser token storage; existing non-cryptographic creative checksums; privileged spreadsheet edit access. These remain architecture constraints, not PASS findings. They predate PR #9 and were not broadly refactored. The new set signature is deterministic identity evidence, not a cryptographic signature.

## Visual QA and merge gate

VISUAL_QA=NOT_RUNTIME_VERIFIED.
A fresh browser reset and in-app-browser startup were attempted on 2026-09-28. The runtime exited before opening a page: windows sandbox failed: helper_unknown_error: apply deny-read ACLs (kernel exit code 1).
Desktop, mobile, logo and ES/EN/PT visual checks are NOT RUN. No screenshot or browser PASS is claimed.

Open issue — MEDIUM: required desktop/mobile and multilingual visual QA cannot execute in the current Windows browser sandbox. This is the concrete remaining merge blocker. A functioning non-production browser environment must complete the requested visual checks.

READY_FOR_CHATGPT_FINAL_AUDIT=YES.
READY_FOR_MERGE=NO.
No merge or production deployment performed. After approval, frontend and Apps Script modules must be released together; legacy ScriptProperties-only sets intentionally stop authorizing Campaign A until valid drafts and a durable set approval exist.
