/**
 * DGL Marketing OS V5.5 — Real Gmail Test Draft
 * Add this as a NEW Apps Script file: MarketingV55TestDraft.gs
 *
 * IMPORTANT:
 * - Creates a Gmail DRAFT only. Never sends.
 * - Recipient is resolved server-side as the effective/active Google Workspace user.
 * - Does not use audience/customer recipients.
 * - Persists only whitelisted campaign creative fields before creating the test draft.
 */

function createMarketingV55TestDraft_(input) {
  var d = input || {};
  var campaignId = String(d.campaignId || '').trim();
  if (!campaignId) throw new Error('campaignId is required');

  var campaign = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS, 'campaignId', campaignId);
  if (!campaign) throw new Error('Campaign not found: ' + campaignId);

  var draftData = d.draft || d;
  var subject = String(draftData.subject || '').trim();
  var htmlBody = String(draftData.htmlBody || '').trim();
  var textBody = String(draftData.textBody || '').trim();
  var patch = draftData.campaignPatch || {};

  if (!subject) throw new Error('Test draft subject is required');
  if (!htmlBody) throw new Error('Test draft HTML is required');
  if (subject.length > 250) throw new Error('Test draft subject is too long');
  if (htmlBody.length > 500000) throw new Error('Test draft HTML is too large');

  // Persist only Marketing-owned creative fields.
  var allowedCreativeFields = [
    'campaignName','audienceId','language','templateId',
    'subject','preheader','headline','body','body2','cta','ctaUrl',
    'heroUrl','logoUrl','senderName','replyTo'
  ];

  allowedCreativeFields.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      campaign[key] = patch[key] == null ? '' : patch[key];
    }
  });

  campaign.updatedAt = mktV55Now_();
  mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS, 'campaignId', campaign, 'CMP');

  var recipient =
    Session.getEffectiveUser().getEmail() ||
    Session.getActiveUser().getEmail();

  if (!recipient) {
    throw new Error('Could not resolve the internal Google Workspace test recipient');
  }

  if (!textBody) textBody = mktV55StripHtml_(htmlBody);
  if (!textBody) textBody = 'DGL Marketing OS V5.5 test draft. Open the HTML version in Gmail.';

  var options = {
    htmlBody: htmlBody,
    name: String(campaign.senderName || 'DGL Freight Broker')
  };

  if (campaign.replyTo) options.replyTo = String(campaign.replyTo);

  // Always a draft. Never GmailApp.sendEmail().
  var draft = GmailApp.createDraft(
    recipient,
    '[DGL TEST] ' + subject,
    textBody,
    options
  );

  var result = {
    ok: true,
    status: 'TEST DRAFT CREATED',
    campaignId: campaignId,
    requestId: campaign.requestId || '',
    draftId: draft.getId(),
    createdAt: mktV55Now_(),
    recipientScope: 'CURRENT WORKSPACE USER',
    sent: false
  };

  mktV55Audit_(
    'TEST_DRAFT_CREATED',
    {
      campaignId: campaignId,
      requestId: campaign.requestId || '',
      externalId: draft.getId(),
      actor: 'MARKETING'
    },
    'COMPLETED',
    result
  );

  return result;
}

function mktV55StripHtml_(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safe direct test from Apps Script editor.
 * It creates a draft only when a real V5.5 campaign already exists.
 * Replace TEST_CAMPAIGN_ID temporarily only if you want to test from the editor.
 */
function testMarketingV55CreateDraft_() {
  throw new Error(
    'Use Campaign Studio > CREATE TEST DRAFT after deploying v55CreateTestDraft. ' +
    'This prevents accidental editor-side test content.'
  );
}
