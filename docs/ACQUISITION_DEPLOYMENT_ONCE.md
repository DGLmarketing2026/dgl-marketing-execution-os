# Acquisition Automation V2 — One-time deployment boundary

The code is designed so recurring operation is automatic. Only initial deployment/configuration requires a person or authorized deployment agent.

## Private Marketing Apps Script project
Add/update:
- `MarketingV6AcquisitionEngine.gs`
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
