# DGL Marketing OS — Canonical State

Last audited: 2026-09-02
Canonical repository: `DGLmarketing2026/dgl-marketing-execution-os`
Canonical branch: `main`
Baseline commit audited: `e7d0e5f4ecdcc68e4f9123b53d35740a5783b6d5`
Canonical architecture: `AUTOMATION_FIRST_V6_6`

## Source of truth

1. GitHub `main` is the source of truth for the public frontend and the versioned Apps Script V6 source pack.
2. The private authenticated Apps Script deployment and `DGL_MARKETING_DATA_HUB` are the source of truth for private persistence and lifecycle data.
3. Salesforce-derived reports are upstream commercial inputs. Public GitHub Pages must never contain customer PII, credentials, pricing, credit or restricted commercial data.
4. Screenshots, old ZIP packages, V6.4 snapshots and legacy frontend files are not canonical runtime sources.

## Non-negotiable operating model

- No Sample Data fallback in the canonical runtime.
- No recurring manual account selection.
- AM users do not decide the recurring Marketing campaign list.
- Report/data signals generate automatic campaign scopes.
- Priority order: QNB = 1, Retention = 2, Reactivation = 3, Cross-Sell = 4, Nurture = 5.
- Higher-priority signals suppress competing lower-priority opportunities for the same account.
- Maximum Marketing pressure: 2 touches per rolling 30 days at account/contact level.
- Normal follow-up spacing: 10–14 days; 3–8 day recurring follow-up is prohibited.
- No-response cooldown: 30–45 days; nurture spacing: 30–60 days.
- A customer response stops pending automation for that account only; the remaining eligible campaign audience continues.
- Normal governed campaigns should use policy-based approval; human review is reserved for strategic, restricted, material-change or override exceptions.
- Gmail is QA/test-draft only. It is not the production bulk-send provider.

## Canonical runtime

The current V6.6 entrypoint loads the private backend adapter, opportunity engine, frequency control, creative/copy engines, Campaign Studio V5 as the active base UI dependency, V6 scope bridge, Campaign Studio V6 readiness/governance layer, account pipeline, lifecycle modules and system-integrity guardrail.

`campaign-studio-v5.js` is still a dependency of V6.6 and must not be deleted merely because its filename contains V5.

## Legacy files

Historical files may remain physically present. Presence in the repository does not make them canonical. The runtime must not load the old AM Request intake or legacy AM Opportunity Center.

Forbidden runtime globals currently checked by `system-integrity-v6.js`:
- `DGL_AM_REQUESTS`
- `DGL_CAMPAIGN_OPPORTUNITY_CENTER_V5`

## Current status

### LIVE / canonical
- V6.6 application shell/router.
- Private backend connection model.
- Report-derived opportunity ingestion source pack.
- Opportunity aggregation and priority conflict suppression.
- FTL / LTL / Drayage scope views.
- Command Center aggregate view.
- Account Campaign Pipeline lifecycle model.
- Account-only response stop behavior.
- Frequency/cooldown rule engine implementation.
- Deterministic playbooks and 10–14 day cadence.
- V6 runtime integrity guardrail.
- Gmail test-draft QA path.

### PARTIAL / not yet end-to-end automatic
- QNB reason routing: window fallback remains where authoritative Reason is absent.
- Retention/reactivation AM activity coordination: event join pending.
- Cross-Sell scoring: service-gap led; full lane/portfolio/account-health scoring pending.
- Recipient/contact resolution: hooks exist, but authoritative contact source is not populated.
- Policy auto-approval: policy logic exists; end-to-end server-side auto progression still needs closure.
- Opportunity `eligibleAccounts` means pre-production/source eligibility, not final production-cleared recipients.
- Drive archive code exists but requires live execution.

### BLOCKED by design
- Production bulk send: provider is not configured.
- Paid/retargeting/LinkedIn remain secondary/future until they inherit pressure, exclusions, consent and attribution rules.

## Root blockers found in audit

1. Automatic scope reaches Campaign Studio but can stop at `CAMPAIGN RECORD PENDING` because the current V6 scope bridge requires a `campaignId` yet does not create one.
2. The old `prepareCampaign()` path depends on `DGL_AM_REQUESTS`, which is intentionally not loaded in V6.6.
3. The private Data Hub has automatic scopes, but the authoritative account/contact masters needed for recipient resolution are not populated.
4. Frequency and exclusion engines exist, but their ledgers are not populated with production history/current exclusion data.
5. Opportunity data has not been refreshed since the prior August snapshot; the upstream report source itself is stale, so the downstream six-hour trigger alone cannot make the system self-feeding.
6. README/package-info and at least one V6 validation test still describe earlier architectures and must not be treated as source of truth.

## Required engineering sequence

A. Close automatic bootstrap:
`report scope -> system campaign record -> campaignId -> recipient resolution -> exclusions/frequency -> policy decision -> execution gate`.

B. Populate authoritative private data:
- accounts
- contacts
- exclusions
- frequency/touch history

C. Automate upstream report refresh from Salesforce/report generation before the existing opportunity refresh.

D. Align docs/tests/version labels with V6.6.

E. Only after A–D are validated, configure a production bulk provider. Keep Gmail QA-only.

## DO NOT

- Do not rebuild from scratch.
- Do not roll back to V6.4.
- Do not use old ZIPs/screenshots as source of truth.
- Do not restore Sample Data fallback.
- Do not restore recurring manual AM campaign lists.
- Do not reactivate legacy AM Request intake as the normal workflow.
- Do not delete Campaign Studio V5 without replacing its active UI dependency.
- Do not call production execution live while the provider is unconfigured.
- Do not expose private customer/contact data on GitHub Pages.

## Definition of done

A new upstream commercial signal must be able to progress without recurring manual account-list work through automatic scope creation, system campaign creation, recipient resolution, exclusions/frequency checks, policy decision, execution readiness, response stop and lifecycle attribution. Humans intervene only for explicit policy exceptions or strategic judgment.
