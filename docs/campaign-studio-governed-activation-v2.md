# Campaign Studio governed Activation v2 — review evidence

Base main: `528c70206f74c6595c419da2a910aea381d2374c`
Branch: `fix/campaign-studio-governed-activation-v2`

Campaign A resolves backend strategy as Activation / Multiservicio / Current Movement / ACTIVATION_ACCOUNT / MULTILINGUAL with audience SCOPE-CAMPANA-A-HA-PRIORITARIA. Direct Studio navigation opens an explicit backend campaign picker. Session-stored strategy cannot override backend context.

Campaign ensure writes changed owned cells only. It preserves createdAt, foreign fields and formulas, and approval-set metadata. Repeating ensure/reconciliation is idempotent. Historical SENT payloads are not rewritten. New source ingestion classifies Campaign A as Activation; historical sent-family reporting remains Retention.

ES, EN and PT keep separate copy, approval references, checksums, versions, dirty state and test-draft status. Copy edits revoke the edited language; shared layout changes revoke all variants. Switching language does not revoke. Backend resolution never resurrects an older approved version after revocation. An explicit complete-set approval is required after all current audience languages are approved; missing or revoked required variants block campaign queue building and dispatch. This is a creative-completeness guarantee, not an atomic delivery promise across external Gmail failures. Existing recipient suppressions and queue chunk/checkpoint behavior remain.

The existing official DGL / FREIGHT BROKER PNG is used unchanged. Browser validation checks image load and dimensions. Backend approval and Test Draft fetch the fixed official asset and validate the PNG signature and nonzero dimensions; caller qaBrand flags cannot establish brand approval. Preview and Test Draft share the exact HTML. The new draft action uses the existing POST form transport and verified draft readback. No send action is exposed by Studio.

Validation:
- All 55 independent tests/*.test.js scripts pass under Node 24.18.0.
- campaign-studio-governed.test.js exercises real context, approval, set-gate, revocation, queue and dispatch functions using fake external services, including real official PNG bytes, unknown/formula/approval metadata preservation, missing-language zero-build/zero-dispatch, independent variants, and exact mocked draft HTML.
- Existing Campaign A mechanics, additive schema migration, routing, draft transport, Activation copy, and immutable 109-SENT fixture regressions pass.
- Changed JS and Apps Script sources compile with Node's parser; git diff --check passes.
- Browser visual QA could not start: the local browser tool failed with helper_sandbox_lock_failed / SetNamedSecurityInfoW error 5. No visual or live Apps Script/Gmail verification is claimed.

No production Apps Script deployment or private campaign data mutation was performed. Zero real emails were sent; AURA_SEND_MODE was not changed. The 109-row immutability evidence is an offline fixture, not a new live production audit. Security R01–R10 changes are confined to the separate backup branch and are not part of this diff.

Review/deployment dependency: after review, the frontend and Apps Script modules (including MarketingV6CampaignStudio.gs) must be released together, with the existing additive schema migration for new headers. Existing Campaign A creatives without valid canonical logo/copy/checksums must be reapproved by language, followed by explicit set approval. This PR is for final audit and must not be merged or deployed automatically.
