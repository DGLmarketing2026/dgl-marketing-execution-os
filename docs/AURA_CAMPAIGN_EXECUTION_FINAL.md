# AURA campaign execution — final fixes (2026-09-29)

Base: `origin/main` e54bc17 (PRs #9, #11, #12 and #13). Branch: `fix/aura-campaign-execution-final`.
Nothing was deployed. There was no clasp push, no GO_LIVE and no email send, and `AURA_SEND_MODE` was not changed.

## 1. Campaign intake

For a new Sheet or report, Marketing answers one campaign-level question: **WHAT TYPE OF CAMPAIGN IS THIS?**

The answer is one of `ACTIVATION`, `RETENTION`, `REACTIVATION`, `QUOTED_NOT_BOOKED` or `CROSS_SELL`. The router action `v6AuraCampaignIntake` calls `v6AuraCampaignIntake_` to resolve it. AURA then sets the rest automatically:

- Language is chosen per contact (EN, ES or PT).
- The visual system is the family's existing premium DGL system.
- Copy and CTA come from the family's own templates.
- The execution unit is the contact/email.

Campaign Studio, creative approvals, test-draft verification and creative-set approval are all unchanged.

## 2. Campaign A source (counts derived from the data rows)

The authoritative source is the live tab `Marketing_DGL_14-09-2026 › Campana A - HA prioritaria`. Its range `A1:L231` is 231 physical rows, of which rows 1–4 are the title, the summary line (*"227 contactos en 65 cuentas"*), a blank row and the header row. The physical row count is never used as a contact count.

Counts are derived from the latest capture on every run:

| Field | Live source |
| --- | --- |
| `SOURCE_DATA_ROWS` | 227 |
| `SOURCE_CONTACT_ROWS` | 224 |
| `SOURCE_EMAIL_ROWS` | 224 |
| `UNSENDABLE_SOURCE_ROWS` | 3 |
| `UNIQUE_EMAILS` | derived on each run (not verified against the live file) |
| `EXACT_DUPLICATE_EMAIL_ROWS` | derived on each run (not verified against the live file) |

The read-only editor function `RUN_AURA_CAMPANA_A_SOURCE_STATS` computes all of these from the live tab, with no writes and no sends.

The 3 unsendable rows are account-only rows with no contact and no email (Mack Farms; North American Freight Forwarding Inc.; Ruhe Logistic SA de CV MExico). They stay candidates, are reported as `SOURCE_MISSING_CONTACT_EMAIL`, and are never fabricated or silently dropped. They never block the run: every valid row continues.

Validation is structural, with no expected count. An incomplete row is marked on that row only (`SOURCE_MISSING_CONTACT_EMAIL`, `SOURCE_ACCOUNT_MISSING`). The build, dispatch and Studio approvals fail closed only when the source has nothing sendable: `SOURCE_EMPTY` or `SOURCE_NO_EMAILS`.

There is one candidate per source data row, and distinct emails are never collapsed by account, company or domain.

The only dedupe is the exact normalized email (trimmed, lower-cased): the same mailbox on several rows receives once, and the additional rows stay candidates, reported as `DUPLICATE_SOURCE_EMAIL`. This is fixed in code; no Script Property is involved.

The pipeline also lost contacts in four ways, all now fixed:

- **Owner rejection:** when the report parser rejected an account for having no AM owner, every contact of that account was dropped. Source membership now wins over this rejection.
- **Account-level stops:** contacts at CLOSED / SUPPRESSED / OWNER REQUIRED accounts were stopped. They are now kept.
- **Account-wide frequency gate:** the competing-campaign gate was evaluated across the whole account. It is now contact-level.
- **Stale source rows:** rows from older, longer captures were still read. Only the latest capture is used now.

Contacts that exist only in `MKT_CONTACTS_SECURE` are not part of the authoritative audience. They are reported in `contactsSecureNotInSource` and are never queued.

## 3. Hard safety at contact level only

Contacts are blocked only for contact-level reasons:

- DNC
- invalid or malformed email
- hard bounce (`BOUNCED` / `HARD_BOUNCE`)
- non-sendable email status
- an explicit contact exclusion, or an email-keyed exclusion
- duplicate source row
- contact-level frequency

Account-wide exclusion rows whose reason is CLOSED, SUPPRESSED or OWNER REQUIRED are ignored for source contacts. Other account-wide exclusions, such as DNC, still apply.

For pipeline stages:

- `CLOSED / SUPPRESSED` and `CAMPAIGN ACTIVE` are account-status stages. They no longer stop a source contact, and the job records `accountStatusOverride`.
- Real engagement stages still stop the contact, and the governed stale cross-family override still applies to them. These stages are RESPONDED, RFQ, QUOTED, LOAD, RETAINED and COOLDOWN.

`v6FrequencyStatus_`, when given a `contactId`, now reads the competing-campaign gate from that contact's own ledger rows. Account-scoped calls behave exactly as before.

## 4 and 7. Premium designs and Campaign Studio

The V5 premium systems (editorial, split, route, service, case and minimal, including the photographic hero) were moved **verbatim** into `assets/js/creative-render-v5.js`:

- Studio V5 delegates to this renderer. Its output is byte-identical: 30 system/objective combinations were compared against `e54bc17`.
- The governed Studio V6 uses the same renderer, so the generic V6 renderer is gone.
- The visual system is auto-selected from the existing `OBJECTIVES[*].recommendedSystem` mapping. All systems remain selectable in Studio.

## 5. Copy isolation

Intake names such as `ACTIVATION` normalize to the existing objective names. Activation uses only the Activation copy table. If that table is unavailable, copy generation throws `ACTIVATION_COPY_UNAVAILABLE` instead of falling through to Reactivation.

Campaign A job variables no longer inject `Multiservicio`.

## 6. One canonical email output

The HTML is the same at every stage: preview (Studio) = stored approved creative = Gmail test draft = DRY_RUN job = LIVE dispatch. The only change after approval is the literal merge of the tokens `{{firstName}}`, `{{company}}`, `{{service}}` and `{{lane}}`.

Campaign A jobs carry `renderContract = GOVERNED_TOKEN_MERGE_V1`. At dispatch, the governed merge is re-derived from the stored creative, in addition to the existing checksum chain. Dispatch **blocks** when:

- the render contract is missing: `GOVERNED_RENDER_CONTRACT_MISSING`
- the creative checksum does not match: `GOVERNED_HTML_CHECKSUM_MISMATCH`
- the HTML has drifted, even when the job checksums were updated consistently: `GOVERNED_HTML_DRIFT`
- the subject has drifted: `GOVERNED_SUBJECT_DRIFT`

## 8. Duplicate audit

`v6AuraJobDuplicateKey_` is `campaignId | accountId | contactId | step | normalized family`. It is used by the shared duplicate-sent guard, by the queue audit and by the Campaign A dispatch:

- A historical Retention job and the current Activation job for the same contact are not duplicates.
- Duplicates within the same family are still detected.

The 109 historical SENT rows are never rewritten.

## Evidence

- `tests/aura-campaign-execution-final.test.js` contains 21 regression cases.
- Full suite: 59/59 test files pass.
- Browser visual QA ran against the real `index.html` with a fixture backend adapter. It covered Activation, Retention and Reactivation, on desktop (1440×900) and mobile (375×812):
  - The premium editorial system rendered with the hero photo, in ES, EN and PT.
  - The page had no horizontal overflow.
  - There were no console errors.
