# DGL Marketing OS — Canonical Architecture V2

## Two separate growth engines

### 1. Existing Account Growth
NOVA / Salesforce
→ AM Platform / AM Intelligence
→ AURA
→ Marketing OS
→ Retention / Reactivation / QNB / Cross-Sell
→ Campaign execution
→ Response
→ AURA
→ AM handoff
→ Salesforce / NOVA
→ RFQ / Quote / Load / Revenue
→ Attribution

AURA does not skip AM when a signal requires Account Management context.

### 2. New Business Acquisition
Traffic / Prospecting
→ Channel
→ Landing Page / Lead Form
→ Private Lead Capture
→ Validation
→ Deduplication
→ Existing-account check
→ Qualification / Scoring
→ Salesforce Lead
→ New Business / Sales
→ Opportunity
→ Customer
→ New-business Revenue Attribution

AM is NOT the owner of this funnel.
Landing Pages are NOT an AM/AURA feature.

## Shared infrastructure
Campaign Studio, approved creative assets, brand rules, analytics foundations and Salesforce identifiers may be shared. Business lifecycle, ownership and metrics must remain separate.

## Privacy
- GitHub: code and public presentation only.
- Private backend / Apps Script: lead intake, routing, account/contact resolution, credentials and integrations.
- Salesforce/NOVA/Data Hub: commercial truth and private business data.
- No customer/contact PII, lead submissions, account lists, credentials or tokens in the public repository.

## Languages
Campaign experience must support:
- es — Español
- en — English
- pt-BR — Português (Brasil)

pt-BR must never fallback to Spanish.

## Channels
Channels is the New Business Acquisition engine:
- Landing Pages
- Paid Media
- LinkedIn Acquisition
- Outbound / Lead Nurture
- Lead Capture
- Lead Routing
- Acquisition Attribution
- Acquisition Journeys

No provider may show LIVE status until the real integration exists.
