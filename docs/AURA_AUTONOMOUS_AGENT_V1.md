# AURA — Autonomous Marketing Agent V1

AURA is DGL's persistent Marketing Agent. It runs inside the Apps Script backend and keeps working when Claude Code is closed, no chat is open, or the user is offline. Claude Code only develops it. NOVA (RFQs and quotations) stays an independent system.

## Architecture

| Layer | File | Role |
|---|---|---|
| Runtime | `MarketingV6AuraAgentRuntime.gs` | Agent loop, approval model, channel adapters, persistence, hourly tick, Command Center payload |
| Decision engine | `MarketingV6AuraAgentIntelligence.gs` | Campaign planner, opportunity analysis, monthly report, daily priorities, command model |
| Command Center | `assets/js/aura-dashboard-v1.js` | Status, lanes, approvals, "Ask AURA" command bar, decision rationale, prepared-plan summary |

**Persistence.** The agent keeps its state in these sheets:
- `AURA_AGENT_RUNS`
- `AURA_AGENT_TASKS`
- `AURA_AGENT_DECISIONS`
- `AURA_AGENT_ACTIONS`
- `AURA_AGENT_APPROVALS`
- `AURA_AGENT_EVENTS`
- `AURA_AGENT_MEMORY`
- `AURA_AGENT_METRICS`

**Unattended runs.** `auraAgentTick` runs hourly from a time trigger. The trigger is installed only when someone presses **ACTIVATE HOURLY RUNTIME** in the Command Center.

## Agent loop

`OBSERVE → ANALYZE → DECIDE → PLAN → PREPARE → APPROVAL → EXECUTE → VERIFY → MEASURE → NEXT_ACTION`

- Transitions are validated.
- Ids are deterministic, so a task is never duplicated.
- A lease prevents concurrent cycles.
- A failed task retries on the next cycle and is blocked after 3 attempts.
- **AUTO work runs during PREPARE, before any approval.** The human approves a campaign that is already prepared, not a request to start preparing one.

## Decision ledger

`AURA_AGENT_DECISIONS` has one row per task (`DEC:<taskId>`). The row is completed as the task moves through the loop and records:
- what AURA observed and which data source it used;
- what it decided and why;
- priority and planned action;
- approval requirement;
- execution result and metric result;
- next action.

## Approval model

| Policy | Actions |
|---|---|
| AUTO | Read data, classify opportunities, resolve audience and language, choose family / angle / creative system, prepare the campaign plan, analyze opportunities, monthly report, daily priorities, ingest bounces and replies, measure, AM hand-off |
| APPROVAL_REQUIRED | Customer email send, social publishing, WordPress, Salesforce write, Drive sharing, paid budget |
| BLOCKED | Unknown action types, destructive actions, editing SENT history, resending Campaign A, changing send mode, missing authorization (`SOURCE_NOT_CONNECTED`), no eligible recipients |

Rules:
- An external action can never be configured below APPROVAL_REQUIRED.
- One approval covers the whole campaign task.
- **Phase 1:** external execution stays disabled even after approval (`EXTERNAL_EXECUTION_DISABLED_PHASE_V1`). The send continues through the governed flow: Campaign Studio → DRY_RUN → governed GO LIVE.

## Campaign planner (AUTO, counts only)

The planner reads `MKT_OPPORTUNITIES`, `MKT_CONTACTS_SECURE` and `MKT_EMAIL_QUEUE`. It produces:
- eligible accounts (suppressed accounts excluded);
- recipients after exact-email dedupe, DNC, invalid email and **30-day resend protection** (which also protects every Campaign A recipient);
- ES / EN / PT distribution;
- dominant service;
- creative system, angle and CTA.

The server playbook mirrors `creative-library-v5`, and a test asserts both stay the same. No email address or name leaves the planner.

## Command model

Commands are typed in "Ask AURA" or sent through `v6AuraAgentCommand` (token-protected and audited). Each one becomes an Agent Run:

| Instruction | Intent | Result |
|---|---|---|
| Run the next reactivation campaign | RUN_CAMPAIGN | Prepared plan + ONE approval |
| Find accounts with cross-sell opportunities | FIND_OPPORTUNITIES | Analysis by owner / service / window |
| Review QNB opportunities | FIND_OPPORTUNITIES (QNB) | Analysis |
| Prepare next week's social content | PREPARE_SOCIAL | BLOCKED: Metricool not connected |
| Find SEO opportunities | FIND_SEO | BLOCKED: Search Console not connected |
| Prepare the monthly marketing report | MONTHLY_REPORT | Report stored in `AURA_AGENT_MEMORY` |
| Show me what Marketing should prioritize today | PRIORITIZE_TODAY | Ranked priorities |

Spanish phrasing works too, for example "Lanza la próxima campaña de retención". A command only advances its own task and never runs unrelated work.

## Channel adapters

Gmail, Sheets, Drive, Salesforce, Metricool, WordPress and Analytics each expose PREPARE, PREVIEW, EXECUTE, VERIFY and MEASURE.

## Human intervention

The user only needs to:
1. ask AURA, or let it detect work on its own;
2. approve once per campaign;
3. run the governed send while Phase 1 lasts.

Users never execute Apps Script functions, edit Script Properties, choose languages or contacts, or calculate KPIs.

## Next phases (not in V1)

- Connect Metricool and Search Console.
- Let an approved campaign build its DRY_RUN jobs automatically through the Campaign Studio governed pipeline.
- Phase 2: execute approved external actions.
