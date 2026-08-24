# DGL Marketing OS V5.4 — Claude Marketing Agent Architecture

## 1. Business model

AM decides **what** each account needs. Marketing decides **how** that need becomes a governed, automated and measurable campaign. The agent does not replace AM.

## 2. AM and Marketing responsibilities

- AM owns commercial intent, account ownership, the requested outcome and whether an account needs Reactivation, QNB, Cross-Sell, Retention, Nurture, Service or Lane Campaign activity.
- Marketing owns segmentation, strategy, message, copy, creative system, channel, sequence, automation, QA, measurement and attribution.

## 3. Agent role

The future Claude Marketing Agent will operate Marketing functions through explicit contract calls, not simulated UI clicks. V5.4 exposes `window.DGL_MARKETING_AGENT_CONTRACT` and programmatic Campaign Studio methods. Claude is **not connected** in V5.4.

## 4. Permission levels

- `AUTO`: read requests; prepare strategy, copy, creative, previews, sequences, QA, analysis and recommendations; apply account-level stop and handoff rules.
- `APPROVAL REQUIRED`: launch or resume campaigns, send audience communications, materially change active campaigns, or launch paid campaigns.
- `NEVER AUTO`: change AM intent or ownership, pricing, credit or sensitive commercial data; override exclusions or DNC; communicate outside approved rules; expose PII or secrets.

The reusable matrix is `window.DGL_AGENT_PERMISSIONS`.

## 5. Agent action contract

`assets/js/marketing-agent-contract-v1.js` defines request, campaign, preparation, approval, activation, response, stop, handoff, outcome, queue and audit methods. Every action follows the documented `AgentAction` shape and status vocabulary. Browser-only behavior returns `LOCAL_DEMO`, `READY`, `APPROVAL_REQUIRED`, `BLOCKED`, or `BACKEND_REQUIRED`; it never claims external execution.

## 6. Campaign lifecycle

AM Request → Ready for Marketing → Agent Preparation → Marketing Approval when required → Campaign Active → Automated Sequence → Customer Response → Account Automation Stop → Handoff to AM → RFQ / Quote / Load → Attribution.

Campaign states support Draft, Prepared by Agent, Waiting Approval, Approved, Active, Response Received, Handed to AM and Closed / Converted. Automation status is separate: Running, Paused, Stopped on Response or Completed.

## 7. Account-level stop rule

`stopAutomationForAccount(campaignId, accountId)` records `stopReason`, `stoppedAt` and `responseType`. A response stops future touches only for that account. Other eligible accounts in the campaign continue. Shared stop conditions include customer reply, RFQ, quote, load, DNC, AM stop request and campaign end.

## 8. AM handoff

`handoffToAM` prepares `campaignId`, `accountId`, `amOwner`, `responseType`, `responseDate`, `campaignObjective`, `service`, `nextAction` and `handoffStatus`. Supported handoff states are Pending, Handed to AM, Acknowledged and Closed.

## 9. Security boundary

GitHub Pages remains a public frontend. It must never store real customer emails, sensitive names, PII, Anthropic/Claude keys, Salesforce credentials or other secrets. The agent and all real data/execution must live behind an authenticated private backend with authorization, audit logging, validation and secret management.

## 10. Future private backend endpoints

- `GET /agent/requests`, `GET /agent/requests/:id`
- `POST /agent/campaigns/prepare`, `PATCH /agent/campaigns/:id`
- `POST /agent/campaigns/:id/test-draft`
- `POST /agent/campaigns/:id/request-approval`
- `POST /agent/campaigns/:id/activate`, `POST /agent/campaigns/:id/pause`
- `GET /agent/campaigns/:id/results`
- `POST /agent/campaigns/:id/accounts/:accountId/stop`
- `POST /agent/campaigns/:id/accounts/:accountId/handoff`

These are conceptual adapters only; V5.4 does not create a public API.

## 11. Current V5.4 limitations

Requests, agent queue, activity, campaigns, account stops and handoffs use safe local demo structures. There is no Claude connection, server-side persistence, authentication, production event ingestion or external campaign execution. Existing Apps Script and draft adapters remain compatible and separate.

## 12. Required work for actual Claude integration

Build the private authenticated orchestration backend, implement the endpoint adapter behind the contract, connect approved CRM/campaign systems, enforce permission and exclusion policy server-side, persist immutable audit events, add approval identity/signatures, ingest customer-response events, implement retries/idempotency, manage secrets privately, and then connect Claude with narrowly scoped tools to that backend.
