# DGL Marketing OS — Acquisition Automation V2

## Rule
Normal New Business Acquisition must run without manual landing creation, lead lists, spreadsheet uploads, CSV handoffs or account-by-account preparation.

## Architecture
Traffic / Prospecting
→ Acquisition Signal
→ Campaign Brief
→ Automatic Market / Language / Service selection
→ Landing generation
→ Public landing runtime
→ Lead form
→ Private Data Hub
→ Validation
→ Deduplication
→ Qualification
→ Salesforce Lead
→ New Business
→ Opportunity
→ Customer
→ Revenue attribution

Existing Account Growth remains separate:
NOVA / Salesforce → AM Intelligence → AURA → Marketing OS → Retention / Reactivation / QNB / Cross-Sell.

## Automatic language policy
- Brazil / Brasil → pt-BR
- LATAM markets → es
- USA / international default → en
- Explicit `languageOverride` is allowed for exceptions.

## Server automation
`v6AcqAutomationTick_` runs hourly after one-time trigger installation.
Each run:
1. evaluates acquisition signals;
2. generates/reuses landing records idempotently;
3. publishes URLs when the public runtime is configured;
4. evaluates new lead submissions;
5. validates and deduplicates;
6. routes new leads to Salesforce when the connector is configured;
7. records safe aggregate run status.

## Evergreen bootstrap
Setup creates six non-PII evergreen acquisition signals so the system does not start empty:
- USA inland / multiservice
- LATAM inland / multiservice / ES
- Brazil inland / multiservice / pt-BR
- USA FTL
- USA LTL
- USA Drayage

They are strategy/config records only, not fake leads or fake performance data.

## Data privacy
GitHub contains only code and public-safe templates.
Lead PII is written only to `MKT_ACQ_LEADS` in the private Data Hub.
The public runtime never exposes the Data Hub or private credentials.

## Truthful blockers
The engine must not show external providers as LIVE until configured:
- Paid / Meta / Google
- LinkedIn
- Outbound provider
- Salesforce lead endpoint
- Attribution connector

## Public landing runtime
A separate Apps Script web app serves landing pages and accepts forms. This keeps publishing and lead capture independent of GitHub commits.

## Data Hub tables
- MKT_ACQ_SIGNALS
- MKT_ACQ_LANDING_PAGES
- MKT_ACQ_LEADS
- MKT_ACQ_RUNS

## No manual landing requirement
The Landing Pages module is now a monitoring/control surface for automatically generated pages. A manual builder is not part of the normal operating path.
