# Historical sent email audit

The private list endpoint returns recipient/job metadata, subject, delivery evidence,
send-time family, current campaign family and provenance/integrity classifications.
It never returns HTML. The private `v6AuraEmailPerformanceJob` endpoint accepts an exact
job ID and returns persisted queue subject/HTML on demand. It does not reconstruct mail,
render templates, invent Gmail IDs or write queue/creative records.

Send-time family comes from job playbookId, then job campaignFamily. Current family
comes from MKT_CAMPAIGNS campaignType/objective. Missing historic checksums remain
missing. Existing checksums are verified with the canonical persisted-job checksum
function. These checks confirm stored evidence integrity, not Gmail delivery.

The UI displays 25 filtered jobs per page, newest sent first. CSV includes all filtered
rows, not only the current page, and excludes HTML. The detail dialog displays the exact
persisted HTML in an empty-sandbox iframe with no referrer and disabled interaction.
HTML download contains exactly the persisted body. Historical and current family
differences are explicitly shown; no historical send is relabeled.

`RUN_AURA_CAMPANA_A_RECONCILE_METADATA_ONLY` is an explicit admin maintenance wrapper.
It is not exposed over HTTP or called automatically. Under a ScriptLock it validates
both exact campaign/scope records before writing only the requested canonical cells.
All other cells, createdAt, queue history, scope membership and properties are untouched.
It reports field-level before/after changes and makes no writes on a second invocation.
Missing/duplicate records, missing columns or mismatched scope campaign fail closed.
Partial write failures can be retried idempotently; Sheets does not provide a transaction
across the two records. Do not run until separately authorized after merge and sync.

Tests synthesize 109 historical sent recipients across 23 accounts, including legacy
Retention content without invented provenance; these numbers are fixtures, not a fresh
LIVE data inspection. This initiative performs no production execution or deployment.
