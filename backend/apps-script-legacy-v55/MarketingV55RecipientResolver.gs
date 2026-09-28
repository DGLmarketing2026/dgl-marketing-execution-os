/**
 * DGL Marketing OS V5.5 — Private Recipient Resolution
 * Resolves real recipient contacts privately from MKT_ACCOUNTS,
 * MKT_CONTACTS_SECURE and MKT_EXCLUSIONS into MKT_AUDIENCES.
 * No fake contacts. No recipient emails returned to GitHub Pages.
 */

function resolveMarketingV55Recipients_(input) {
  var d = input || {};
  var campaignId = String(d.campaignId || '').trim();
  if (!campaignId) throw new Error('campaignId is required');

  var campaign = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS, 'campaignId', campaignId);
  if (!campaign) throw new Error('Campaign not found: ' + campaignId);

  var request = campaign.requestId
    ? mktV55Find_(MKT_V55.SHEETS.REQUESTS, 'requestId', campaign.requestId)
    : null;
  if (!request) throw new Error('AM Request not found for campaign: ' + campaignId);

  var audienceId = String(
    campaign.audienceId || request.audienceId || ('SCOPE-' + request.requestId)
  ).trim();

  var accounts = mktV55ReadAll_('MKT_ACCOUNTS');
  var contacts = mktV55ReadAll_('MKT_CONTACTS_SECURE');
  var exclusions = mktV55ReadAll_('MKT_EXCLUSIONS');
  var audienceRows = mktV55ReadAll_('MKT_AUDIENCES');

  var accountIds = mktV55ResolveAccountIds_(request, audienceId, accounts, audienceRows);

  if (!accountIds.length) {
    var emptyResult = {
      ok:false,campaignId:campaignId,requestId:request.requestId,audienceId:audienceId,
      audienceResolved:false,audienceStatus:'ACCOUNT SCOPE UNRESOLVED',
      accountCount:0,eligibleContacts:0,excludedContacts:0,
      reason:'No real account IDs are available for this AM Request scope.',
      activationAllowed:false
    };
    mktV55Audit_('RECIPIENT_RESOLUTION_BLOCKED',
      {campaignId:campaignId,requestId:request.requestId},'BLOCKED',emptyResult);
    return emptyResult;
  }

  var now = new Date(), eligible = 0, excluded = 0, considered = 0, reasonCounts = {};

  accountIds.forEach(function(accountId) {
    contacts.filter(function(c) {
      return String(c.accountId || '') === String(accountId);
    }).forEach(function(contact) {
      considered++;
      var reason = mktV55ContactExclusionReason_(contact, accountId, exclusions, now);
      var isEligible = !reason;
      if (isEligible) eligible++;
      else {
        excluded++;
        reasonCounts[reason] = Number(reasonCounts[reason] || 0) + 1;
      }

      mktV55UpsertAudienceContact_({
        audienceId:audienceId,
        audienceName:(request.portfolioName || request.accountName || 'AM Request Scope'),
        accountId:accountId,
        contactId:contact.contactId || '',
        campaignType:request.objective || campaign.campaignType || '',
        service:request.service || campaign.service || '',
        reasonCode:'AM_REQUEST_SCOPE',
        sourceReport:'AM Request ' + request.requestId,
        eligible:isEligible ? 'TRUE' : 'FALSE',
        exclusionReason:reason || '',
        score:'',
        updatedAt:mktV55Now_()
      });
    });
  });

  var resolved = eligible > 0;
  var status = resolved ? 'RECIPIENTS RESOLVED'
    : (considered ? 'NO ELIGIBLE CONTACTS' : 'NO CONTACTS AVAILABLE');

  campaign.audienceId = audienceId;
  campaign.updatedAt = mktV55Now_();
  mktV55Upsert_(MKT_V55.SHEETS.CAMPAIGNS, 'campaignId', campaign, 'CMP');

  request.audienceId = audienceId;
  request.audienceCount = eligible;
  request.updatedAt = mktV55Now_();
  mktV55Upsert_(MKT_V55.SHEETS.REQUESTS, 'requestId', request, 'AMR');

  var result = {
    ok:resolved,campaignId:campaignId,requestId:request.requestId,audienceId:audienceId,
    audienceResolved:resolved,audienceStatus:status,accountCount:accountIds.length,
    contactsConsidered:considered,eligibleContacts:eligible,excludedContacts:excluded,
    exclusionSummary:reasonCounts,activationAllowed:resolved
  };

  mktV55Audit_(resolved ? 'RECIPIENTS_RESOLVED' : 'RECIPIENT_RESOLUTION_BLOCKED',
    {campaignId:campaignId,requestId:request.requestId},
    resolved ? 'COMPLETED' : 'BLOCKED',result);

  return result;
}

function getMarketingV55AudienceStatus_(input) {
  var d = input || {};
  var campaignId = String(d.campaignId || '').trim();
  if (!campaignId) throw new Error('campaignId is required');

  var campaign = mktV55Find_(MKT_V55.SHEETS.CAMPAIGNS, 'campaignId', campaignId);
  if (!campaign) throw new Error('Campaign not found: ' + campaignId);

  var request = campaign.requestId
    ? mktV55Find_(MKT_V55.SHEETS.REQUESTS, 'requestId', campaign.requestId)
    : null;

  var audienceId = String(
    campaign.audienceId ||
    (request && request.audienceId) ||
    (request ? ('SCOPE-' + request.requestId) : '')
  ).trim();

  if (!audienceId) {
    return {campaignId:campaignId,audienceId:'',audienceResolved:false,
      audienceStatus:'ACCOUNT SCOPE UNRESOLVED',eligibleContacts:0,
      excludedContacts:0,activationAllowed:false};
  }

  var rows = mktV55ReadAll_('MKT_AUDIENCES').filter(function(r) {
    return String(r.audienceId || '') === audienceId &&
      String(r.contactId || '').trim() !== '';
  });

  var eligible = rows.filter(function(r) {
    return String(r.eligible || '').toUpperCase() === 'TRUE';
  }).length;

  var excluded = rows.length - eligible;

  return {
    campaignId:campaignId,requestId:campaign.requestId || '',audienceId:audienceId,
    audienceResolved:eligible > 0,
    audienceStatus:eligible > 0 ? 'RECIPIENTS RESOLVED'
      : (rows.length ? 'NO ELIGIBLE CONTACTS' : 'NO CONTACTS AVAILABLE'),
    eligibleContacts:eligible,excludedContacts:excluded,activationAllowed:eligible > 0
  };
}

function assertMarketingV55AudienceResolved_(campaignId) {
  var status = getMarketingV55AudienceStatus_({campaignId:campaignId});
  if (!status.audienceResolved) {
    throw new Error('Recipient resolution required before activation: ' + status.audienceStatus);
  }
  return status;
}

function mktV55ResolveAccountIds_(request, audienceId, accounts, audienceRows) {
  var ids = {};
  audienceRows.forEach(function(r) {
    if (String(r.audienceId || '') === String(audienceId) && String(r.accountId || '').trim()) {
      ids[String(r.accountId).trim()] = true;
    }
  });

  if (request.accountId) ids[String(request.accountId).trim()] = true;

  var requestedName = String(request.accountName || '').trim().toLowerCase();
  if (requestedName) {
    var matches = accounts.filter(function(a) {
      return String(a.accountName || '').trim().toLowerCase() === requestedName;
    });
    if (matches.length === 1 && matches[0].accountId) {
      ids[String(matches[0].accountId).trim()] = true;
    }
  }
  return Object.keys(ids);
}

function mktV55ContactExclusionReason_(contact, accountId, exclusions, now) {
  if (String(contact.doNotContact || '').toLowerCase() === 'true') return 'DO_NOT_CONTACT';

  var status = String(contact.marketingStatus || '').trim().toUpperCase();
  if (['UNSUBSCRIBED','BLOCKED','SUPPRESSED','INACTIVE'].indexOf(status) !== -1) {
    return 'CONTACT_' + status;
  }

  if (!String(contact.email || '').trim()) return 'MISSING_EMAIL';

  var activeExclusion = exclusions.find(function(x) {
    var sameAccount = !String(x.accountId || '').trim() || String(x.accountId || '') === String(accountId);
    var sameContact = !String(x.contactId || '').trim() || String(x.contactId || '') === String(contact.contactId || '');
    var active = String(x.active || '').toLowerCase() === 'true';
    if (!active || !sameAccount || !sameContact) return false;
    var startOk = !x.startDate || new Date(x.startDate) <= now;
    var endOk = !x.endDate || new Date(x.endDate) >= now;
    return startOk && endOk;
  });

  return activeExclusion ? String(activeExclusion.reason || 'ACTIVE_EXCLUSION') : '';
}

function mktV55UpsertAudienceContact_(row) {
  var sh = mktV55Sheet_('MKT_AUDIENCES');
  var headers = mktV55Headers_('MKT_AUDIENCES');
  var rows = sh.getDataRange().getValues();

  var cAudience = headers.indexOf('audienceId');
  var cAccount = headers.indexOf('accountId');
  var cContact = headers.indexOf('contactId');
  if (cAudience < 0 || cAccount < 0 || cContact < 0) {
    throw new Error('MKT_AUDIENCES headers are incomplete');
  }

  var rowNumber = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][cAudience]) === String(row.audienceId) &&
        String(rows[i][cAccount]) === String(row.accountId) &&
        String(rows[i][cContact]) === String(row.contactId)) {
      rowNumber = i + 1;
      break;
    }
  }

  var values = headers.map(function(h) {
    var v = row[h];
    return v == null ? '' : v;
  });

  if (rowNumber > 0) sh.getRange(rowNumber,1,1,headers.length).setValues([values]);
  else sh.appendRow(values);

  return row;
}
