# Campaign Studio governance audit

## Root causes and ownership

Studio previously selected an opportunity during rendering, accepted a stored browser strategy, and layered V5/V6 renderer wrappers. Activation could fall through to Reactivation. A single approval flag conflated language variants, while queue construction could skip a missing language and continue with others.

V6 now owns navigation, private context, language state and approval actions. V5 remains the visual/editor foundation and exact HTML renderer. The renderer registry cannot be replaced by legacy wrappers. The retired opportunity-center scripts remain outside the active load chain; lifecycle-modules-v6 owns the current Activation UI. No Studio render refreshes external sources, approves campaigns, builds queues or dispatches email.

## Source of truth and entry contract

`v6CampaignStudioContext` requires private token authentication and reads the current Data Hub without writes. Its allowlisted response contains campaign identity, aggregate eligible account/contact/language counts, source timestamps and creative approval metadata; it contains no recipient PII. Campaign A uses the existing deterministic recipient/language resolver and current suppression, frequency and pipeline rules.

An existing campaign is opened by campaign ID only. An explicit opportunity click passes scope ID only; the backend re-reads current opportunity rows before preparing that scope. Direct sidebar navigation opens the real campaign selector. Browser strategy/session objects cannot override current backend identity. Context version and campaign ID are checked before rendering.

Campaign identity, audience, scope, objective, service, playbook and message angle are read-only. Copy and compatible layouts remain editable. Campaign A's current canon is Activation / Multiservicio / Current Movement / ACTIVATION_ACCOUNT / MULTILINGUAL, with its existing campaign and scope IDs.

## Language and approval contracts

ES, EN and PT have separate copy, dirty state, creative ID/version, approval ID, checksums and test-draft status. New Campaign A creatives persist canonical codes; legacy language aliases remain readable. Switching tabs does not revoke. Editing copy revokes only that variant; changing shared layout revokes all variants. Failed revocation remains blocking. Reloaded approvals must reproduce the exact stored HTML before they are considered editable approved variants.

Variant approval never approves the campaign. Complete-set approval requires every currently required language to have a valid approved creative, current audience resolution, brand validation and content validation. The campaign stores a fingerprint of the approved set. A replacement or revocation invalidates that fingerprint. A revoked latest version never falls back to an older approved version.

Queue construction and both Campaign A/shared dispatch validation fail closed on incomplete sets. Existing recipient checksum validation is retained. Gmail QA uses the exact selected approved preview HTML and creates drafts only; draft creation is not approval. The Studio exposes no send action.

## Brand and customer copy

The user verified the official DGL Brand Manual and confirmed the DGL / FREIGHT BROKER lockup. This supersedes the earlier contrary logo requirement; no independent Drive verification is claimed here.

The existing `assets/brand/dgl-logo-white.png` is unchanged, SHA256 `06ec3d5bbb2c8c116bfc48f4162b1d89723ca60d16d8cb115572fc76786443ac`. Browser QA requires the canonical URL, a successful image load, positive natural width and the canonical reference in rendered HTML. Missing/broken assets or fallback handlers block approval. Backend Campaign A persistence independently checks the canonical URL, pinned artwork marker, content and language. No wording-based Freight Broker rejection exists.

Frontend and backend share the specified ES/EN/PT Activation copy and Send Requirement intent. The Campaign A layout is a 680px navy/green/white editorial master without a service-specific hero. Customer content excludes internal family labels and prior Retention language. Footer wording is independent of the logo artwork.

## Current metadata versus history

Ensure/reconcile code sets current Campaign A metadata while retaining original creation and unrelated fields. Metadata-only reconciliation additionally covers audience, scope, multilingual designation, playbook and message angle. It does not rewrite historical queue content, subjects, checksums or provenance. The isolated 109-SENT fixture remains byte-for-byte unchanged and reports Retention.

No production function, source refresh, reconciliation, queue builder, dispatcher, Apps Script deployment or Script Property mutation was executed during this development task. A future authorized deployment must include the new governance module and governed schema migration before metadata reconciliation and manual creative approval. This PR does not perform those operations.

## Validation

The full Node test suite covers private routing, current aggregate context, explicit/idempotent scope preparation, source priority, all three language approvals, exact frontend/backend copy, latest-version revocation, failed revocation, complete-set queue/dispatch gates, metadata idempotence and historical immutability. Mock send functions throw if called.

The isolated Playwright browser test uses the actual frontend files and exact repository logo bytes, with backend mocks and external networking blocked. It checks image load/proportions, explicit chooser navigation, ES/EN/PT interactions, keyboard/mouse approval, draft/edit isolation, failed-image blocking, desktop email width and mobile layout. No production credentials or backend data are used. Modified frontend assets share `20260925-1` cache versions.

Validation result: 55/55 Node test scripts and 1/1 isolated browser test passed (56/56 total). Changed JavaScript/Apps Script sources also pass parse-only syntax checks.
