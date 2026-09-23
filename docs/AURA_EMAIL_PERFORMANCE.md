# AURA recipient performance

The `v6AuraEmailPerformance` API is allowlisted only in the existing authenticated
private backend. It returns PII and must not be added to public routes. The Overview
reads queue, responses and events without triggering ingestion, sending or property writes.
Each detail row represents one recipient send job; multiple sends to one contact remain
separate, with campaign and job provenance. CSV uses the same filters as the table,
UTF-8 with BOM, quoted fields and spreadsheet formula escaping.

`MKT_EMAIL_EVENTS` is part of the governed schema and is created idempotently by
bootstrap, without modifying existing data rows. Its required columns share the single
`AURA_EMAIL_EVENT_HEADERS_` definition.

Bootstrap and the existing AURA cycle ensure one dedicated hourly `auraIngestGmailDsn`
trigger. Its handler only calls `v6AuraIngestGmailDsn_`, never a campaign dispatcher.
The ingestor reconciles real SENT/FAILED/REPLY evidence and reads 50 Gmail threads per
invocation. `AURA_DSN_PROGRESS` stores the offset and fixed 90-day search boundaries
across invocations; failure keeps the same page for retry. Completing a scan clears the
cursor so the next scan includes new arrivals. Neither installer nor ingestor changes
AURA_SEND_MODE. A script lock prevents concurrent
duplicate inserts; message ID plus job ID makes reprocessing idempotent. Partial failures
can be retried. Existing event columns and sheet data are preserved.

Only structured DSN recipient blocks with recognized enhanced status codes are ingested.
An email address must resolve to exactly one SENT job preceding the notification. Ambiguous
or unattributable messages are deliberately skipped for manual review; they are never
guessed onto another campaign. Hard bounces invalidate the contact and create a permanent
contact exclusion. BLOCKED bounces create an active, non-expiring `BLOCKED_DSN:<contactId>` exclusion,
which the existing recipient eligibility and send gates honor for that contact only.
To manually clear it, set active=false and status=CLEARED; re-reading the same DSN
preserves the cleared row. Previously ingested BLOCKED events gain a missing exclusion
once. Blocked and soft bounces never invalidate contacts or enqueue retries.

SENT is not DELIVERED. No tracking pixel or click redirect is introduced. Without real,
sourced OPEN/CLICK events those summary and row values are null, shown as N/A / NOT TRACKED
and exported as NOT_TRACKED. No account-level response is attributed to individual contacts
without a campaign and recipient match. Dates filter sent, failed, reply, bounce, open and click timestamps (UTC).

This branch has not been deployed or run against LIVE. It does not establish or verify
the current LIVE Script Property `AURA_SEND_MODE`; the earlier remote mode check failed.
Deployment remains a separate operational step; the existing bootstrap/cycle will
install the dedicated ingestion schedule after deployment.
