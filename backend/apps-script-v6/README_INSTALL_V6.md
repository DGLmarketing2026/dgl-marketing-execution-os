# Marketing OS V6 Apps Script source pack

Copy these `.gs` files into the existing private V5.5 Apps Script project, then route authenticated `v6*` actions through `routeMarketingV6_`. Keep the existing token validation and JSONP response wrapper ahead of this router.

The pack uses `DGL_MARKETING_DATA_HUB` and the prepared `MARKETING_CAMPAIGN_ARCHIVE` folders. It contains no credentials, contact data, or provider secrets. `MKT_V6_PROVIDER_READY` intentionally defaults to `false`; Gmail remains test-draft QA only and is never used for bulk send.

The real private source snapshot is `DGL_REPORT_SOURCE_V6`. After deployment, run `v6RefreshOpportunitiesFromReports_()` once to populate `MKT_OPPORTUNITIES`. Optionally run `v6InstallOpportunityRefreshTrigger_()` once to install a six-hour opportunity refresh.

The trigger refreshes opportunities from the private report source. It does not replace the future upstream Salesforce/report-generation refresh that updates the source snapshot itself. Production queue/start stays blocked until a provider integration is configured and server-side eligibility gates pass.
