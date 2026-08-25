# AM → Marketing Automation V5.5

## Operating model

**AM decides WHAT. Marketing executes HOW.**

The active lifecycle is: AM Request → Marketing Preparation → Marketing Approval → Campaign Active → Customer Response → Handoff to AM. Agent Control is future architecture only; Claude is not connected and the active workflow does not call an agent contract.

## Request model and ownership

The standardized request contains `id`, `createdAt`, `amOwner`, `portfolioName`, `accountName`, `accountCount`, `objective`, `service`, `messageAngle`, `priority`, `commercialContext`, `requestedOutcome`, `targetWindow`, `lane`, `qnbWindow`, `audienceId`, `audienceCount`, `exclusions`, `status`, `campaignId`, `automationStatus`, `marketingStatus`, and `campaignName`.

AM owns account selection, commercial objective, service opportunity, context, exclusions, priority, and desired outcome. Marketing owns campaign strategy, copy, creative system, sequence, CTA, QA, test draft, approval, activation, and measurement.

## Validation

Every request requires AM owner, account or portfolio, account count, objective, service, priority, and requested outcome. QNB additionally requires a QNB window; Lane Campaign requires a lane. Cross-Sell preserves the target service selected by AM. Invalid requests remain `NEEDS CLARIFICATION`, show all missing fields, and cannot enter preparation.

## Deterministic playbooks

`assets/js/marketing-playbooks-v55.js` implements QNB 0–14, QNB 15–30, QNB 30+, Retention Risk, Reactivation, Cross-Sell Service, Account Nurture, Lane Campaign, Relationship Renewal, and Service Campaign. Each defines purpose, angle, CTA, creative default, and sequence. QNB always defaults to DGL Executive Minimal and does not use promotional truck hero photography.

## Preparation and approval

`PREPARE CAMPAIGN` validates the request, resolves its deterministic playbook, builds campaign context, stores a safe local campaign record, and opens Campaign Studio with the AM fields and playbook strategy populated. Marketing may edit copy and creative before approval.

The draft-first lifecycle is Campaign Ready → Create Test Draft → Marketing Review → Marketing Approval → Activate. Activation, audience sends, resume, material active-campaign changes, and paid launches require explicit Marketing approval. Commercial intent, ownership, pricing, credit, exclusions, DNC status, PII, and restricted commercial data are never changed automatically.

## Account-level stops and handoff

A confirmed response stops only the responding account. The stop record stores campaign ID, account ID, reason, timestamp, response type, `scope = ACCOUNT_ONLY`, and `remainingCampaignAccountsContinue = true`. Other eligible campaign accounts continue.

The workflow creates an AM handoff with campaign, request, account, AM owner, response type/date, objective, service, next action, and handoff status. Supported statuses are `PENDING`, `HANDED_TO_AM`, `ACKNOWLEDGED`, and `CLOSED`.

## Attribution and KPIs

The executive funnel is AM Requests → Campaigns Active → Responses → RFQs → Quotes → Loads. Secondary outcomes are recovered accounts, retained accounts, cross-sell opportunities, and AM handoffs. Opens and clicks remain channel metrics, not executive KPIs. SLA placeholders track AM Request → Campaign Ready and Response → AM Handoff.

## Backend boundary

`assets/js/marketing-backend-adapter-v55.js` exposes the V5.5 backend interface in `LOCAL_DEMO` mode and declares `PRIVATE_BACKEND_REQUIRED` as the execution boundary. Local records contain fictional, non-PII data only. Existing private Apps Script hooks remain available for later authenticated execution. No backend URL, credential, token, customer email, pricing, credit, or sensitive profitability data is stored in the public frontend.

## Future Claude boundary

Agent Control remains available only as `FUTURE AUTOMATION LAYER · CLAUDE NOT CONNECTED`. It is isolated from AM intake, campaign preparation, approval, activation, response handling, and handoff. A future phase may connect an authenticated private agent backend without changing AM commercial ownership or Marketing governance.
