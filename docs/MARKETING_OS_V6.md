# DGL Marketing OS V6

V6 is report/data-driven. AM users do not enter Marketing OS; Salesforce remains the commercial source of truth. Manual intake is retained only as an exception. The private Apps Script/Data Hub boundary from V5.5 remains in place, including browser-session authentication, recipient resolution, Gmail test drafts, Marketing approval, account-only response stops, AM handoff, and attribution.

Report/data → opportunity detection → frequency and suppression evaluation → Campaign Studio → Gmail test draft → Marketing approval → audience snapshot → provider-neutral execution → automatic Drive archive → response and attribution.

Production requires resolved recipients, frequency clearance, exclusions, copy and creative QA, approval, execution ID, archive readiness and a configured bulk provider. Gmail never performs bulk sends. Until the V6 Apps Script pack is deployed, the UI reports `BACKEND FEATURE NOT DEPLOYED`; until a bulk provider is configured, production reports `BULK PROVIDER NOT CONFIGURED`.

Claude is not connected and remains a future architecture layer. Public frontend code contains no tokens, customer contact data, credentials, pricing, credit data, or private Drive URLs.
