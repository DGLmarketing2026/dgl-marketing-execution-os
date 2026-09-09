# Acquisition Automation V2 — One-time deployment boundary

The code is designed so recurring operation is automatic. Only initial deployment/configuration requires a person or authorized deployment agent.

## Private Marketing Apps Script project
Add/update:
- `MarketingV6AcquisitionEngine.gs`
- `MarketingV6AcquisitionWordPress.gs`
- `MarketingV6RouterExtension.gs`

Deploy a new version of the existing private Marketing OS web app.

Run once:
`v6AcqSetup_()`

This creates the acquisition Data Hub tables, evergreen signals and one deduplicated hourly trigger.

## Public Acquisition Apps Script project
Create a separate Apps Script project from:
- `AcquisitionPublicRuntime.gs`

Set Script Property:
- `MKT_DATA_HUB_ID` = DGL Marketing Data Hub spreadsheet ID

Deploy as a Web App with the access level approved by DGL for public lead forms.

Copy the deployment `/exec` URL into the PRIVATE Marketing Apps Script Script Property:
- `ACQ_PUBLIC_LANDING_BASE_URL`

After this property exists, the next hourly acquisition run upgrades generated pages to `LIVE` automatically and writes their public URLs.

## Salesforce routing
When the approved Salesforce/New Business intake endpoint exists, set in the PRIVATE Marketing Apps Script project:
- `ACQ_SALESFORCE_LEAD_ENDPOINT`
- `ACQ_SALESFORCE_TOKEN` if required

No code change is required afterward. Pending leads route automatically on the next hourly run.

## Optional connector properties
These only change health state when the real connector is available:
- `ACQ_PAID_CONNECTOR`
- `ACQ_LINKEDIN_CONNECTOR`
- `ACQ_OUTBOUND_CONNECTOR`
- `ACQ_ATTRIBUTION_CONNECTOR`

Do not populate these with placeholder values.

## WordPress publisher (https://www.dglus.com)
Create a WordPress Application Password for a publishing user, then set in the
PRIVATE Marketing Apps Script Script Properties (never commit these):
- `ACQ_WP_BASE_URL` — e.g. `https://www.dglus.com`
- `ACQ_WP_USERNAME`
- `ACQ_WP_APP_PASSWORD`

The next hourly tick upserts one WordPress page per (campaign, service,
language) — evergreen pages are updated in place, never duplicated.

The `dgl_*` custom fields written by the publisher (`dgl_campaign_key`,
`dgl_service`, `dgl_language`, `dgl_cycle_id`, `dgl_seo_description`,
`dgl_canonical`, `dgl_utm_source`, `dgl_utm_medium`, `dgl_utm_campaign`,
`dgl_noindex`) must be registered as `show_in_rest` on the WordPress side
(functions.php or a small must-use plugin) for the REST API to accept them.
Real per-page SEO title/description rendering also depends on whichever SEO
plugin (Yoast, Rank Math, etc.) DGL runs on that WordPress install — map its
meta keys once, on the WordPress side, to `dgl_seo_description` /
`dgl_canonical`.

## Automated QA (optional)
Set `ACQ_WORDPRESS_QA=1` to enable the automated QA runner inside the same
hourly tick. Each run creates private/noindex EN/ES/PT-BR page variants,
validates HTTP + rendered content + UTM fields, submits one synthetic lead
through the real public form (isolated to `MKT_ACQ_QA_LEADS`, never
`MKT_ACQ_LEADS`, never Salesforce), records PASS/FAIL in `MKT_ACQ_QA_RUNS`,
and archives/deletes the QA WordPress pages when done. Leave unset (or `0`)
in normal production operation once initial QA has passed, to avoid
recurring WordPress churn.

## Bimonthly cycle
No configuration required — the cycle gate (Sep/Nov/Jan/Mar/May/Jul, 2
months each) runs automatically inside the hourly tick and is idempotent per
cycle via the `ACQ_LAST_CYCLE_ID` Script Property it manages itself. Optional:
- `ACQ_CYCLE_ARCHIVE_FOLDER_ID` — Drive folder for the automatic per-cycle
  CSV report; falls back to the existing results archive folder if unset.

## GA4 (connector contract only)
- `ACQ_GA4_PROPERTY_ID` — when set, acquisition status reports
  `CONNECTOR REQUIRED` (the property id alone does not pull traffic data; the
  GA4 Data API integration is a separate follow-on task). When unset, status
  is `NOT CONFIGURED`. No traffic/conversion number is ever fabricated.
