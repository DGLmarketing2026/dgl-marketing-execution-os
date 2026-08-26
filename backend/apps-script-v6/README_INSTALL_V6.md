# Marketing OS V6 Apps Script source pack

Deployment order:

1. Copy every V6 source file into the existing private Apps Script project.
2. Route V6 from `MarketingV55Backend` (already done manually in the production project).
3. Save the project.
4. Run `v6RefreshOpportunitiesFromReports_()` once.
5. Optionally run `v6InstallOpportunityRefreshTrigger_()` once.
6. Deploy a **new version of the same existing web app deployment**.
7. Do not create a new deployment.
8. Keep bulk production sending blocked until a provider is configured.

Keep the existing token validation and JSONP response wrapper ahead of the V6 router.

The pack uses `DGL_MARKETING_DATA_HUB` and the prepared `MARKETING_CAMPAIGN_ARCHIVE` folders. It contains no credentials, contact data, or provider secrets. `MKT_V6_PROVIDER_READY` intentionally defaults to `false`; Gmail remains test-draft QA only and is never used for bulk send.

The real private source snapshot is `DGL_REPORT_SOURCE_V6`. After deployment, run `v6RefreshOpportunitiesFromReports_()` once to populate `MKT_OPPORTUNITIES`. Optionally run `v6InstallOpportunityRefreshTrigger_()` once to install a six-hour opportunity refresh.

The trigger refreshes opportunities from the private report source. It does not replace the future upstream Salesforce/report-generation refresh that updates the source snapshot itself. Production queue/start stays blocked until a provider integration is configured and server-side eligibility gates pass.
