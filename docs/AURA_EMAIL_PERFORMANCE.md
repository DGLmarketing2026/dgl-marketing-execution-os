# AURA recipient performance

The `v6AuraEmailPerformance` API is allowlisted only in the existing authenticated
private backend. It returns PII and must not be added to public routes. The Overview
reads queue, responses and events without triggering ingestion, sending or property writes.
Each detail row represents one recipient send job; multiple sends to one contact remain
separate, with campaign and job provenance. CSV uses the same filters as the table,
UTF-8 with BOM, quoted fields and spreadsheet formula escaping.

`v6AuraIngestGmailDsn_({start: 0})` is an admin-only ingestion entry point, not a
public HTTP route. When explicitly operated after deployment it creates or extends
`MKT_EMAIL_EVENTS`, reconciles real SENT/FAILED/REPLY evidence, and reads up to 50 Gmail
threads per page from the last 90 days. Continue with the returned `nextStart` until null.
It installs no trigger and does not change send mode. A script lock prevents concurrent
duplicate inserts; message ID plus job ID makes reprocessing idempotent. Partial failures
can be retried. Existing event columns and sheet data are preserved.

Only structured DSN recipient blocks with recognized enhanced status codes are ingested.
An email address must resolve to exactly one SENT job preceding the notification. Ambiguous
or unattributable messages are deliberately skipped for manual review; they are never
guessed onto another campaign. Hard bounces invalidate the contact and create a permanent
contact exclusion. Blocked and soft bounces never invalidate contacts or enqueue retries.

SENT is not DELIVERED. No tracking pixel or click redirect is introduced. Without real,
sourced OPEN/CLICK events those summary and row values are null, shown as N/A / NOT TRACKED
and exported as NOT_TRACKED. No account-level response is attributed to individual contacts
without a campaign and recipient match. Dates filter sent, failed or reply timestamps (UTC).

This branch has not been deployed or run against LIVE. It does not establish or verify
the current LIVE Script Property `AURA_SEND_MODE`; the earlier remote mode check failed.
Deployment and any ingestion scheduling require a separate operational step.
