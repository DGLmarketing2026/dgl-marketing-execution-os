# AURA Platform Upgrade V1

## 1. Email engagement tracking (OPEN / CLICK)

File: `backend/apps-script-v6/MarketingV6AuraTracking.gs`. The web app `doGet` handles `?aura_t=o|c` first. Every other request goes through the existing router unchanged.

Tracking is **off by default**. To turn it on, set these Script Properties:

| Property | Value |
|---|---|
| `AURA_TRACKING_ENABLED` | `TRUE` |
| `AURA_TRACKING_BASE_URL` | this web app's `https://script.google.com/macros/s/<id>/exec` URL |

`AURA_TRACKING_SECRET` is created automatically and never leaves Script Properties.

How it works:
- **Token.** `base64url(jobId).HMAC-SHA256`. There is no email, name or company in any URL. A forged or altered token records nothing and redirects nowhere.
- **CLICK.** The destination is the n-th approved CTA (`mailto:`/`https:`) of the job's approved creative. There is no URL parameter, so open redirects are impossible.
- **Events.** Writes to `MKT_EMAIL_EVENTS` are idempotent:
  - one OPEN row per job (`OPEN:<jobId>`);
  - one CLICK row per job and CTA (`CLICK:<jobId>:<cta>`);
  - repeats only increment `eventCount` and `lastOccurredAt`.
- **Attribution.** Each event records job, campaign, account, contact, creative, creative version and CTA.
- **SENT jobs only.** Tracking applies only to SENT jobs, and it never modifies the job row.
- **Governed render.** Tracking is part of the deterministic governed render, so dispatch verification re-derives it byte for byte. Already SENT jobs are never rebuilt.
- **Apps Script limits.** Web apps cannot return an image MIME type or an HTTP 302:
  - the pixel request is recorded and answered with an empty body;
  - a click answers a minimal page that forwards to the approved destination, with a visible fallback link.

**Signal quality.** OPEN is a weak signal: Gmail image proxies and Apple Mail Privacy Protection pre-fetch images (false opens), and image blocking hides real opens. CLICK is the stronger signal. Without tracking evidence, OPEN, CLICK and their rates are shown as `NOT TRACKED` / `N/A`, never as 0.

## 2. KPIs and denominators

`v6AuraEmailPerformance_().scopes[campaignId]` reports four separate scopes:

| Scope | What it counts |
|---|---|
| `currentRun` | SENT jobs of the latest governed GO LIVE run (`goLiveRunId`) |
| `currentFamilyRun` | the campaign's current family |
| `historical` | SENT jobs of other (earlier) families, with a breakdown in `historicalFamilies` |
| `allTime` | everything |

Campaign A: current run 214, historical Retention 109, all-time 323.

Definitions:
- `delivered = sent − bounced`. SENT is never presented as DELIVERED.
- OR = unique opens ÷ delivered.
- CTR = unique clicks ÷ delivered.
- CTOR = unique clicks ÷ unique opens.
- RFQ, QUOTE and LOAD are campaign-level counts from `MKT_RESPONSES`.

## 3. Performance

| | Before | After |
|---|---|---|
| AURA Overview | 7 requests in 2 sequential waves; the Campaign A audit recomputed MatchReport and StoppedBreakdown, which were also requested separately | 1 request (`v6AuraCommandCenter`); each Data Hub table read once per execution (`v6WithRowsMemo_`); one spreadsheet open |
| Sheet reads (test model) | 22 reads, 22 spreadsheet opens | 14 reads (including 4 new agent tables), 1 open |
| Refresh after a write | 5 requests | 3 requests (datasets only) |
| Repeated reads | none cached | 30 s in-memory cache with in-flight de-duplication (never browser storage) |
| `v6AuraEmailPerformance_` | O(rows × table) lookups | indexed lookups |
| Reconcile | re-read the events table for every queue row | preloads event ids once and writes one batch |

## 4. AURA Agent Runtime V1

File: `backend/apps-script-v6/MarketingV6AuraAgentRuntime.gs`. NOVA stays a separate system.

**Sheets.** `AURA_AGENT_RUNS`, `TASKS`, `DECISIONS`, `ACTIONS`, `APPROVALS`, `EVENTS`, `MEMORY`, `METRICS`.

**Lifecycle.** `OBSERVE → ANALYZE → DECIDE → PLAN → PREPARE → [APPROVAL] → EXECUTE → VERIFY → MEASURE → NEXT_ACTION → COMPLETED`, plus `BLOCKED`, `FAILED` and `CANCELLED`. Transitions are validated.

**Approval model.**

| Level | Covers |
|---|---|
| `AUTO` | internal reads and bookkeeping (ingest bounces/replies, reconcile, measure) |
| `REVIEW` | internal work prepared for a human look |
| `APPROVAL_REQUIRED` | every external effect: customer send, social, WordPress, Salesforce write, Drive sharing, paid budget |
| `BLOCKED` | delete, modify SENT history, resend Campaign A, change send mode, and any unknown action type |

Rules:
- An external action can never be configured below `APPROVAL_REQUIRED`.
- One approval gates a whole campaign task.
- **V1 never executes an external action, even after approval.** The channel adapter returns `EXTERNAL_EXECUTION_DISABLED_PHASE_V1` and the task points to the governed flow: Campaign Studio → DRY_RUN → governed GO LIVE.

**Channel adapters.** Gmail, Sheets, Drive, Salesforce, Metricool, WordPress and Analytics each expose `prepare`, `preview`, `execute`, `verify` and `measure`.

**Scopes.** REACTIVATION, RETENTION, QNB, CROSS_SELL, ACCOUNT_GROWTH, NURTURE, EMAIL, SOCIAL, EVENT, CONTENT, SEO, GEO, WEB, ANALYTICS and INTERNAL_MARKETING. Scopes without a connected data source are registered as `NOT_CONNECTED` and detect nothing; nothing is simulated.

**Unattended runs.** `auraAgentTick` runs hourly from a time trigger, so it keeps working when nobody is connected. The trigger is installed only when a user presses **ACTIVATE HOURLY RUNTIME** in the Command Center.

**Safeguards.**
- Ids are deterministic and there is a lease guard, so a repeated or concurrent tick never duplicates work.
- A failed task retries on the next tick and is blocked after 3 attempts.
- Bounces and replies use the existing DSN ingestion (`v6AuraIngestGmailDsn_`) unchanged; the agent schedules it hourly as an AUTO task.

## 5. AURA Command Center (frontend)

The AURA Overview is now the Agent Command Center. It has these sections:
- AURA status
- Today's priorities
- Detected opportunities
- Action queue
- Waiting for approval (Approve / Reject records the decision only)
- Running
- Blocked
- Completed
- Next best actions
- Recent results

It also shows campaign KPIs by scope. Users never need to know `RUN_AURA_*` function names.

## 6. Creative Intelligence

`DGL_CREATIVE_LIBRARY_V5.resolveTreatment(context)` describes the selected system on ten dimensions: CREATIVE_SYSTEM, LAYOUT_FAMILY, CONTENT_HIERARCHY, IMAGE_STRATEGY, CTA_STRATEGY, SERVICE_CONTEXT, CAMPAIGN_OBJECTIVE, AUDIENCE_CONTEXT, LANGUAGE and MOBILE_RULES.

- `registerTreatment` extends the registry.
- `registerReference` is the reference ingestion hook. A reference stays `PENDING_ANALYSIS` and influences nothing until a real analysis is supplied.
- Every CTA is functional (`mailto:`/`https:`) and trackable.

## 7. Responsive QA

All six systems were measured at 375 × 812, 390 × 844 and 430 × 932:
- no horizontal overflow;
- CTA tap target 46 px tall, or 63 px when the label wraps;
- headline 28 px, body copy at least 14 px (11 px only for service tags);
- hero images fluid with their aspect ratio preserved.

## Activation checklist (after merge and deploy — not done by this PR)

1. Deploy the backend to the existing deployment, keeping the same URL.
2. Optional: set the tracking properties in section 1 so new campaigns are tracked.
3. Open the AURA Command Center and press **ACTIVATE HOURLY RUNTIME**.
