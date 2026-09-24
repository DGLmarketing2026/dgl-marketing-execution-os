# Security remediation — 2026-09-24

Base: 528c70206f74c6595c419da2a910aea381d2374c. Fresh remote clone. No production deployment, campaign execution, historical queue mutation or send-mode change.

## Baseline before changes

| Finding | Verified BEFORE evidence |
|---|---|
| R01 | Main adapter jsonp() serializes raw token in query; Acquisition duplicates this. |
| R02 | Main adapter migrates session credential to localStorage; index executes pinned Lucide from unpkg without integrity. |
| R03 | Acquisition reads sessionStorage independently while main reads localStorage. |
| R04 | Private handler authenticates but does not enforce method, timestamp, action policy or mutation replay ledger. |
| R05 | Dashboard labels connected as LIVE; sequential performance read precedes all-or-nothing Promise.all; stale report values survive failures. |
| R06 | Normal DNC/exclusion/frequency gates exist; source-only contacts can bypass secure-contact identity evidence, duplicate candidates are possible; pipeline response stops are account-wide. Security coverage requires deterministic tests. |
| R07 | Shared-token authentication only; list/detail/export lack user/object RBAC. Detail uses explicit fields, but exports all loaded rows without server export audit. |
| R08 | Global KPI cards remain unchanged when local detail filters change. |
| R09 | Full historical rows downloaded for 25-row UI pages; independent reporting calls sequential; acquisition timer can overlap. |
| R10 | Both acquisition renderers interpolate escaped publishedUrl directly into href without protocol/origin validation. |

Inspected the requested frontend/backend modules and relevant existing tests. Full repository pattern search: 983 matches across 103 files (176 searched); no credential values or Data Hub data copied into this report.

## Transport evidence

Google documents doPost body access and ContentService redirected responses:
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/content

Credential-free deployed endpoint probes on 2026-09-24: OPTIONS returned 200 without Access-Control-Allow-Origin (preflight contract unavailable); public health GET returned Access-Control-Allow-Origin: *. Use a simple POST with text/plain JSON body, credentials omitted, no custom auth header and no JSONP fallback. Record POST probe and browser/staging validation separately below.

## Remaining controls

Shared bootstrap credential is not user identity. SSO/MFA, per-user/object RBAC, cross-tenant isolation, Drive IAM, backup/restore, Salesforce authorization, WAF, provider delivery guarantees and AI/RAG/LLM security are NOT CERTIFIED. SessionStorage is tab/session scoped but browser session-restore features may retain it; explicit Disconnect clears it. No claim of guaranteed deletion on browser exit.

