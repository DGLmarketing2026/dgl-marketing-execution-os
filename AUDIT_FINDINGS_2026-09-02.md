# DGL Marketing OS V6.6 — Audit Findings

## Executive conclusion

The platform is not lost and does not need a rebuild. The signal/scope layer is materially implemented. The end-to-end automation currently breaks at two consecutive gates: automatic creation of a backend campaign record and authoritative recipient/contact resolution. A third systemic issue is data freshness: the opportunity layer is consuming an August snapshot rather than an automatically refreshed upstream source.

## Status matrix

| Layer | Status | Finding |
|---|---|---|
| Public V6.6 runtime | LIVE | Automation-first loader and integrity guard are active. |
| Opportunity ingestion | LIVE but stale | Opportunity records/scopes exist, but last opportunity refresh is from August. |
| Priority/suppression | LIVE | QNB/Retention/Reactivation/Cross-Sell/Nurture priority model exists. |
| FTL/LTL/Drayage views | LIVE | Render from V6 lifecycle scope data. |
| Automatic scope generation | LIVE | Scope/account tables are populated. |
| Campaign record bootstrap | BROKEN GAP | Automatic scope does not automatically obtain a backend `campaignId`. |
| Recipient resolution | BLOCKED | Authoritative contact source is not populated. |
| Exclusions | ENGINE/SCHEMA READY; DATA EMPTY | Exclusion ledger currently has no operational rows. |
| Frequency/cooldown | ENGINE LIVE; DATA EMPTY | Rules exist, but touch ledger has no history. |
| Policy approval | PARTIAL | Policy rules exist; end-to-end automatic policy progression is not yet closed. |
| Pipeline | STRUCTURALLY LIVE | Pipeline records exist, mostly at opportunity/suppressed stages because downstream gates are blocked. |
| Execution archive | READY BY CODE | No live executions yet. |
| Bulk provider | BLOCKED BY DESIGN | Correctly remains unconfigured. |
| Documentation/tests | STALE | Several files still describe sample/demo or earlier V6 behavior. |

## Root cause chain

1. Reports create opportunities.
2. Opportunities create automatic scopes.
3. Campaign Studio receives the scope.
4. Current scope bridge requires `campaignId` to resolve recipients.
5. No automatic system campaign record is created for that scope.
6. Recipient resolution cannot proceed.
7. Even after that is fixed, the contact master is empty, so there are no authoritative recipients to resolve.
8. Frequency/exclusion engines cannot produce production-grade decisions without their operational ledgers.
9. The upstream report snapshot is stale, so scheduled downstream processing would still recycle old data.

## Patch prepared in this recovery pack

`assets/js/campaign-scope-bridge-v6.js` is a proposed V6.6.1 bridge that:

- bootstraps a system-generated backend record for an automatic scope;
- creates a backend campaign record and persists `campaignId` in the session campaign context;
- resolves recipients after the campaign exists;
- maps recipient/exclusion/frequency results back into the campaign context;
- advances policy approval only when technical gates are clear;
- keeps production sending blocked;
- keeps human review for exceptions;
- does not restore recurring AM manual account selection.

This patch was syntax-checked and passed the included mock auto-bootstrap test. It has NOT been committed to GitHub because the current GitHub integration returned HTTP 403 on write operations.

## Next implementation work

1. Commit canonical-state documentation and the V6.6.1 bridge once repository write access is available.
2. Add/align an automated test covering `scope -> campaignId -> recipients -> policy`.
3. Wire authoritative account/contact ingestion privately.
4. Populate/maintain exclusion and frequency ledgers.
5. Automate the upstream Salesforce/report snapshot refresh.
6. Re-run opportunity/pipeline refresh after source freshness is restored.
7. Update stale README/package-info/tests.
8. Only then evaluate a production bulk provider integration.
