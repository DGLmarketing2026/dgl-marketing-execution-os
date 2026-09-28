/**
 * DGL Marketing Audience Engine
 * Builds campaign audiences from the private Marketing Data Hub.
 */

function rebuildMarketingAudiences() {
  const accounts = mktReadAll_('MKT_ACCOUNTS');
  const contacts = mktReadAll_('MKT_CONTACTS_SECURE');
  const quotes = mktReadAll_('MKT_QUOTES');
  const exclusions = mktReadAll_('MKT_EXCLUSIONS').filter(x => String(x.active).toLowerCase() !== 'false');

  const contactByAccount = {};
  contacts.forEach(c => {
    if (!contactByAccount[c.accountId]) contactByAccount[c.accountId] = [];
    contactByAccount[c.accountId].push(c);
  });

  const excluded = {};
  exclusions.forEach(x => {
    const key = String(x.contactId || '') || ('ACCOUNT:' + String(x.accountId || ''));
    excluded[key] = x.reason || 'Excluded';
  });

  const rows = [];
  const now = new Date();

  function addAudience(audienceId, audienceName, account, contact, campaignType, service, reasonCode, sourceReport, score) {
    const contactKey = String(contact.contactId || '');
    const accountKey = 'ACCOUNT:' + String(account.accountId || '');
    const exclusionReason =
      excluded[contactKey] ||
      excluded[accountKey] ||
      (String(contact.doNotContact).toLowerCase() === 'true' ? 'Do Not Contact' : '');

    rows.push({
      audienceId, audienceName,
      accountId:account.accountId,
      contactId:contact.contactId,
      campaignType, service,
      reasonCode, sourceReport,
      eligible: exclusionReason ? false : true,
      exclusionReason,
      score:Number(score || 0),
      updatedAt:now
    });
  }

  accounts.forEach(a => {
    const cs = contactByAccount[a.accountId] || [];
    const days = Number(a.daysSinceLastLoad || 0);
    cs.forEach(c => {
      if (days >= 60) addAudience('REACTIVATION_60','Reactivation 60+',a,c,'Reactivation','Multiservicio','NO_LOAD_60','reporteCuentas/reporteMigracionTiers',Math.min(100,55 + days/4));
      if (days >= 90) addAudience('REACTIVATION_90','Reactivation 90+',a,c,'Reactivation','Multiservicio','NO_LOAD_90','reporteMigracionTiers',Math.min(100,65 + days/5));
      if (/risk/i.test(String(a.status||''))) addAudience('RETENTION_RISK','Retention / At Risk',a,c,'Retention','Multiservicio','AT_RISK','reporteCuentas/reporteMigracionTiers',85);
    });
  });

  quotes.forEach(q => {
    const a = accounts.find(x => String(x.accountId) === String(q.accountId));
    if (!a) return;
    const cs = contactByAccount[a.accountId] || [];
    const d = Number(q.daysOpen || 0);
    const audienceId = d <= 14 ? 'QNB_0_14' : d <= 30 ? 'QNB_15_30' : 'QNB_30_PLUS';
    const name = d <= 14 ? 'QNB 0-14 days' : d <= 30 ? 'QNB 15-30 days' : 'QNB 30+ days';
    cs.forEach(c => addAudience(audienceId,name,a,c,'Quoted Not Booked',q.service||'Multiservicio','OPEN_QUOTE','closingRate/reporteViernes',Math.min(100,70 + Math.min(d,60)/3)));
  });

  // Replace current audience table for deterministic rebuild.
  const sh = mktSheet_('MKT_AUDIENCES');
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent();
  mktUpsertRows_('MKT_AUDIENCES',['audienceId','accountId','contactId'],rows);

  mktLogSync_('AUDIENCE_ENGINE',{audienceRows:rows.length},'Audiencias reconstruidas');
  return { ok:true, audienceRows:rows.length };
}

function getMarketingAudiences() {
  return mktReadAll_('MKT_AUDIENCES');
}
