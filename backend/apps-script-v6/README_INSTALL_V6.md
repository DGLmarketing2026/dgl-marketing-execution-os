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

## Private account/contact ingestion and recipient resolution

The production data path is `Salesforce or another authorized private source -> v6IngestAuthoritativeContacts -> MKT_ACCOUNTS / MKT_CONTACTS_SECURE -> MKT_SCOPE_ACCOUNTS -> v6ResolveRecipients -> MKT_EXCLUSIONS / MKT_FREQUENCY_LEDGER -> MKT_AUDIENCES -> policy gates`.

`accountId` remains the canonical V6 join key. External and Salesforce identifiers are stored as a private crosswalk and never replace an existing `accountId`. Ingestion is server-side, idempotent and returns aggregate metrics only. Recipient APIs return only safe status fields and counts; names, emails, phones and other PII never reach GitHub Pages or GitHub source.

Contacts are excluded when DNC, missing/invalid email, an active exclusion, account pressure or contact pressure applies. A scope with no account IDs, an account with no contacts and a campaign with zero eligible contacts remain safely unresolved.

The V6 router exposes `v6ResolveRecipients` / `v6AudienceStatus` and compatibility aliases `v55ResolveRecipients` / `v55AudienceStatus`, because the current V6.6.1 browser adapter intentionally keeps those established action names. During production integration, ensure the authenticated base router delegates those two actions to `routeMarketingV6_`; do not duplicate or replace token validation.

Required private headers for this phase:

- `MKT_ACCOUNTS`: `accountId, externalSystem, externalAccountId, salesforceAccountId, accountName, amOwner, status, sourceUpdatedAt, createdAt, updatedAt`.
- `MKT_CONTACTS_SECURE`: `contactId, accountId, externalSystem, externalContactId, salesforceContactId, email, emailStatus, doNotContact, status, sourceUpdatedAt, createdAt, updatedAt`.
- `MKT_CAMPAIGN_SCOPES`: `scopeId, audienceId, campaignId, campaignType, opportunityType, updatedAt`.
- `MKT_SCOPE_ACCOUNTS`: `scopeId, audienceId, campaignId, accountId, eligibilityStatus, updatedAt`.
- `MKT_EXCLUSIONS`: `exclusionId, accountId, contactId, status, active, reasonCode, expiresAt, updatedAt`.
- `MKT_AUDIENCES`: `audienceRecipientId, recordType, campaignId, scopeId, accountId, contactId, email, eligibilityStatus, exclusionReason, frequencyStatus, audienceResolved, audienceStatus, eligibleContactCount, excludedContactCount, reasonCode, exclusionStatus, exclusionsCleared, resolvedAt, updatedAt`.

All six tables are private. Only aggregate audience status fields may leave Apps Script. Validate existing headers before adding missing columns; do not overwrite or recreate populated sheets.

Run `v6AuditContactRecipientSchema_()` first and inspect only its safe schema metrics. After approval, run `v6EnsureContactRecipientSchema_()`; it appends missing headers at the end and never deletes, renames, moves or recreates anything. It is idempotent. Ingestion preserves historical columns by merging existing rows before upsert, reads account ownership from `amOwner` or `accountManager`, and leaves fields such as `firstName`, `lastName`, `title`, `language` and `marketingStatus` untouched. Recipient exclusions accept `expiresAt` or historical `endDate`, `reasonCode` or historical `reason`, and both `active` and status-based semantics.

Do not maintain recurring manual account/contact lists. Gmail remains Test Draft / QA only and `MKT_V6_PROVIDER_READY` remains `false`. Before production use, create/validate the private sheet schemas, configure the authorized source sync, run contract tests and a private dry run, then deploy a new version of the existing Web App deployment. Keep the same deployment and URL; do not create another Web App.
