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

## Visual QA -- completed 2026-09-28, isolated worktree, real Chromium

The prior Windows in-app-browser sandbox failure (helper_unknown_error, deny-read ACLs) blocked
visual QA entirely. This pass ran in a separate cloud sandbox with a different constraint: the
only browser reachable from that sandbox (Claude in Chrome / the in-app browser, both bound to
the operator's own machine) cannot reach a server or files inside the sandbox itself. Real
Chromium visual QA was instead performed with the Playwright build already present in that cloud
sandbox (`/opt/pw-browsers`), driving the ACTUAL page (`index.html`) served from this worktree
over a local-only HTTP server (127.0.0.1, never exposed) -- not a rewritten test harness. The
private backend (`DGL_MARKETING_BACKEND_ADAPTER_V55`) was replaced in-page with a fixture
adapter returning realistic ES/EN/PT approved-creative fixtures generated by the REAL, unmodified
`DGL_COPY_ENGINE_V5` -- no production Apps Script endpoint was called, no Gmail draft or send
action fired.

This is the first pass in which the two browser-only defects reported by the interrupted prior
(Codex) run were independently investigated against the actual b9c915c code, not assumed present
or absent.

### Defect 1 -- PT rendered as Spanish (CONFIRMED, ROOT-CAUSED, FIXED)

Root cause: `assets/js/copy-experience-v1.js` reassigns `DGL_COPY_ENGINE_V5.generate` in place
(it is loaded after `copy-engine-v5.js` and before `campaign-studio-v5.js`/`campaign-studio-v6.js`
in `index.html`). Its own language mapper recognized only the exact string `"pt-br"` or any string
containing `"portugu"` as Portuguese. The governed Studio (`campaign-studio-v6.js`) calls
`generate({language:"PT",...})` -- the bare code from its own `LANGUAGES=["ES","EN","PT"]`
constant -- which matched neither branch and silently fell through to the Spanish default. Every
PT variant rendered with Spanish subject/headline/body/CTA while displaying a "PT" tab.

This was NOT caught by the existing `tests/campaign-studio-multilingual.test.js` (loads only
`copy-engine-v5.js` in isolation, calls `generate()` with the full name `'Português (Brasil)'`,
which the buggy mapper's `.includes("portugu")` branch already matched) nor by
`tests/campaign-studio-governed.test.js` (loads `copy-engine-v5.js` + `campaign-studio-v6.js`
directly, deliberately or otherwise never loading `copy-experience-v1.js` at all, so it exercised
the pristine engine that index.html's real script chain never uses). Both isolated suites passed
while the real, fully-loaded application was broken -- exactly the integration gap browser QA
exists to catch.

Fix: `copy-experience-v1.js`'s language mapper now also recognizes the bare `"pt"`/`"PT"` code
(one added condition; no other logic touched). Verified three ways: (1) live Playwright screenshot
of the PT tab showing genuine Portuguese subject/headline/body/preview iframe/CTA
(`qa-pr9-desktop-pt.png`, `qa-pr9-mobile-pt.png`); (2) the pre-fix code at commit b9c915c,
re-executed standalone with the exact real script chain, reproduces `languageCode:"es"` for a
`language:"PT"` request -- confirming this is a real, currently-shipping defect, not a QA-harness
artifact; (3) new regression test `tests/campaign-studio-v6-language-layering.test.js`, which
loads the real script chain (`creative-library-v5` -> `copy-engine-v5` -> `copy-experience-v1`, the
same order as `index.html`) and drives `generate()` with the bare codes `campaign-studio-v6.js`
actually sends -- this test fails against the pre-fix file and passes against the fix.

ES and EN were independently confirmed unaffected before and after the fix (both resolved
correctly in every run, `languageCode` stayed `es`/`en`).

### Defect 2 -- Mobile horizontal overflow (CONFIRMED, ROOT-CAUSED, FIXED)

Root cause: the global `.btn` class (`assets/css/styles.css`) sets `white-space:nowrap`. Two
`display:flex` rows rendered by `campaign-studio-v6.js`'s `draw()` (the layout picker and the
ES/EN/PT language tablist) render buttons containing a `<br>` followed by a long descriptive
`<small>` line (e.g. "Activation · Multiservicio · Current Movement · PT"); with `white-space:
nowrap` inherited, that line cannot wrap, so each button balloons to fit it on one line, and
neither flex row declared `flex-wrap:wrap`. At a 390px viewport this produced a measured
`document.documentElement.scrollWidth` of 791px against a 390px `clientWidth` -- 401px of real
horizontal overflow, reproduced live before the fix.

Fix, scoped to only the two offending elements (no change to the shared `.btn` class or any other
button in the app): both flex containers gained `flex-wrap:wrap`, and the layout-picker and
language-tab buttons gained an inline `white-space:normal;max-width:100%` override. Verified live
at 390x844 across ES/EN/PT: `scrollWidth === clientWidth === 390` (zero overflow) in every case,
with screenshots (`qa-pr9-mobile-{es,en,pt}.png`) showing the buttons wrapping onto two lines
instead of overflowing. Desktop (1440x900) confirmed unaffected (`scrollWidth === clientWidth ===
1440` before and after).

### Footer localization (CONFIRMED STILL INCORRECT AT b9c915c, FIXED)

`campaign-studio-v6.js`'s `emailHtml()` footer line was a single hardcoded English string
("Dedicated Ground Logistics · Your inland freight partner.") in every language's HTML, including
ES and PT sends -- unrelated to and not fixed by either defect above. The CTA `mailto:` subject in
the same function already had a working per-language ternary immediately above it; the footer now
follows that exact existing pattern (no second localization system introduced). Verified live:
ES -> "Su aliado de transporte terrestre.", PT -> "Seu parceiro de transporte terrestre.",
EN unchanged.

### Recipient preview

No separate "example recipient view" was added. The governed Studio's existing live email-preview
`<iframe>` (already present in `draw()`, already rendering the exact personalized HTML a recipient
would receive, already re-rendered on every language/copy change) already serves this purpose; nothing
in the four required PR #9 remediations calls for a second, separate preview surface, and one was
not invented.

### Brand QA

Automated PNG/dimension/lockup validation logic (`v6CampaignStudioValidateBrand_`, exercised
against fake PNG bytes) already passes in `tests/campaign-studio-governed.test.js`, unchanged this
pass. Canonical colors #77B82A (accent border + CTA background) and #05035C (header background +
CTA text) are present verbatim in `emailHtml()`'s output and were visible correctly rendered in
every live screenshot (desktop and mobile, all three languages). The literal PNG byte fetch of the
hosted GitHub Pages logo could not be exercised in the isolated sandbox: outbound access to
`dglmarketing2026.github.io` is rejected by that sandbox's own egress policy (`CONNECT tunnel
failed, response 403`), confirmed by a direct `curl` from the same sandbox -- a network-policy
limit of this QA environment, not an application defect. LIVE_LOGO_FETCH=NOT_RUNTIME_VERIFIED;
brand markup/lockup/color correctness otherwise PASS.

### Tests (independently reproduced this pass, not reused)

TEST_FILES=56 (55 pre-existing + 1 new regression file); TESTS_RUN=56; TESTS_PASSED=56;
TESTS_FAILED=0; TESTS_SKIPPED=0. Counting unit is independently executed test scripts, not
assertion count, matching this repository's existing convention. `git diff --check`: PASS. All
four originally-changed backend/apps-script files are untouched this pass (git diff shows only the
two frontend files above plus the new test file); AURA regression coverage
(v6-retention-am-activity, v6-aura-bridge, v6-response-events, v6-aura-campana-a,
v6-aura-email-dispatcher, v6-retention-report, aura-automation-tick, aura-email-performance,
v55-live-workflow) re-ran clean, unaffected by frontend-only changes. Historical 109 SENT rows and
family (Retention) remain byte-for-byte unchanged, per the existing assertions inside
`campaign-studio-governed.test.js`.

### Send safety

AURA_SEND_MODE=UNCHANGED. REAL_EMAILS_SENT=0. The QA fixture adapter's `approveCreative`,
`approveCreativeSet`, `campaignStudioTestDraft` and `revokeApprovedCreative` methods were wired to
throw if ever called, precisely so a QA script bug could never silently perform a write or send;
none were called. No Gmail draft, no production Apps Script call, no production deployment.

### Screenshot evidence

qa-pr9-desktop-es.png, qa-pr9-desktop-en.png, qa-pr9-desktop-pt.png (1440x900),
qa-pr9-mobile-es.png, qa-pr9-mobile-en.png, qa-pr9-mobile-pt.png (390x844). Captured with
Playwright against the real `index.html` + real `DGL_CAMPAIGN_STUDIO_V6.render()`, element-scoped
so each screenshot is provably distinct per language (verified by differing file byte sizes, not
assumed). Kept outside the committed source tree (QA sandbox scratch space), consistent with "do
not commit bulky temporary browser artifacts unless appropriate" -- this repository has no
existing audit-evidence directory convention for binary screenshots, so none were added to avoid
introducing one unreviewed.

### Approval governance -- re-confirmed, not re-litigated

The nine scenarios in this pass's QA instructions (valid draft+creative approval; edit
invalidation; cross-language block; cross-variant/layout block; Campaign A isolation from other
families; missing immutable evidence blocks set approval; partial-language set blocks; complete
ES/EN/PT set succeeds; creative changed after verification invalidates prior evidence) match,
scenario for scenario, assertions already present and passing in
`tests/campaign-studio-governed.test.js` (edit -> STALE AFTER EDIT and revoke, cross-language ->
VARIANT_MISMATCH, cross-family isolation via a second `campaignId`, SET_INCOMPLETE /
TEST_DRAFT_SET_INCOMPLETE for missing/partial evidence, APPROVED set on a complete signature match,
STALE AFTER EDIT + CREATIVE_NOT_APPROVED after a persisted creative changes). No backend file was
touched this pass, so this is confirmation-by-reproduction (the suite re-ran clean), not new
coverage; the frontend-only fixes above cannot regress backend-enforced governance logic they never
call.

## Merge gate

READY_FOR_CHATGPT_FINAL_AUDIT=YES.
READY_FOR_MERGE=NO.
No merge or production deployment performed. Remaining before merge: an operator-reachable browser
(the in-app browser or Claude in Chrome, from a machine that can also reach a running instance of
this branch) should independently confirm the same three visual fixes and the live GitHub Pages
logo fetch, since this pass's browser QA ran in a sandbox that cannot reach either the operator's
own browser or the public logo host. After approval, frontend and Apps Script modules must be
released together; legacy ScriptProperties-only sets intentionally stop authorizing Campaign A
until valid drafts and a durable set approval exist.
