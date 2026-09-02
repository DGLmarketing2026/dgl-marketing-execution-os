# Apply Order — DGL Marketing OS V6.6 Recovery

## 1. Preserve current production baseline
Do not delete or roll back current `main`. Treat commit `e7d0e5f4ecdcc68e4f9123b53d35740a5783b6d5` as the audited baseline.

## 2. Persist canonical state
Add `DGL_MARKETING_OS_CANONICAL_STATE.md` at repository root.

## 3. Apply the automatic bootstrap bridge
Replace `assets/js/campaign-scope-bridge-v6.js` with the proposed V6.6.1 file in this pack.

## 4. Add the bootstrap test
Adapt/add `tests/v6-auto-bootstrap.test.js` to the repository test suite and run it with the existing V6 tests.

## 5. Do not declare success yet
The frontend bootstrap fix does not create authoritative contacts. Recipient resolution remains blocked until the private contact source is populated.

## 6. Private data integration
Populate and maintain authoritative private sources for accounts, contacts, exclusions and marketing-touch frequency history. Do not put those records in GitHub.

## 7. Freshness
Automate the upstream Salesforce/report-generation refresh that feeds `DGL_REPORT_SOURCE_V6`. Then run/trigger `v6RefreshOpportunitiesFromReports_()` and pipeline sync.

## 8. Documentation/test cleanup
Replace stale sample/demo documentation and stale V6 loader assertions.

## 9. Production provider
Keep `MKT_V6_PROVIDER_READY=false` until all prior gates pass and a real approved provider is integrated.
