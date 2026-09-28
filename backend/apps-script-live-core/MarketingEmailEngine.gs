/**
 * DGL Marketing Email Engine
 * Creates designed Gmail drafts from approved Marketing campaigns.
 * Draft-first by design.
 */

const MKT_EMAIL_TEMPLATES = {
  'executive-dark': { background:'#050711', card:'#0b1020', text:'#ffffff', muted:'#b6becf', border:'#222a40' },
  'clean-white':    { background:'#f5f7fa', card:'#ffffff', text:'#141827', muted:'#5d6475', border:'#e3e7ee' },
  'service-hero':   { background:'#050711', card:'#0b1020', text:'#ffffff', muted:'#b6becf', border:'#222a40' },
  'qnb-minimal':    { background:'#f5f7fa', card:'#ffffff', text:'#141827', muted:'#5d6475', border:'#e3e7ee' }
};

function mktMerge_(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, function(_, key) {
    return vars[key] == null ? '' : String(vars[key]);
  });
}

function mktEscapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function renderMarketingEmailHtml_(campaign, vars) {
  const t = MKT_EMAIL_TEMPLATES[campaign.templateId] || MKT_EMAIL_TEMPLATES['executive-dark'];
  const green = '#77B82A';
  const subject = mktMerge_(campaign.subject, vars);
  const preheader = mktMerge_(campaign.preheader, vars);
  const headline = mktMerge_(campaign.headline, vars);
  const body = mktMerge_(campaign.body, vars);
  const body2 = mktMerge_(campaign.body2, vars);
  const cta = mktMerge_(campaign.cta, vars);
  const qnb = campaign.templateId === 'qnb-minimal';

  const logo = campaign.logoUrl
    ? '<img src="'+mktEscapeHtml_(campaign.logoUrl)+'" alt="DGL Freight Broker" style="display:block;max-width:190px;max-height:72px;border:0;">'
    : '<div style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;letter-spacing:1px;color:'+t.text+';">DGL <span style="font-size:11px;font-weight:700;letter-spacing:2px;color:'+green+';">FREIGHT BROKER</span></div>';

  const hero = campaign.heroUrl && !qnb
    ? '<tr><td><img src="'+mktEscapeHtml_(campaign.heroUrl)+'" alt="" width="100%" style="display:block;width:100%;max-height:310px;object-fit:cover;border:0;"></td></tr>'
    : '';

  return '<!doctype html><html><body style="margin:0;padding:0;background:'+t.background+';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">'+mktEscapeHtml_(preheader)+'</div>'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:'+t.background+';">'
    + '<tr><td align="center" style="padding:26px 12px;">'
    + '<table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:'+t.card+';border:1px solid '+t.border+';border-radius:18px;overflow:hidden;">'
    + '<tr><td style="padding:28px 34px;border-bottom:1px solid '+t.border+';">'+logo+'</td></tr>'
    + hero
    + '<tr><td style="padding:'+(qnb?'38px 38px 30px':'42px 38px')+';font-family:Arial,sans-serif;color:'+t.text+';">'
    + '<div style="height:4px;width:58px;background:'+green+';margin-bottom:22px;border-radius:8px;"></div>'
    + '<div style="font-size:'+(qnb?'28px':'34px')+';line-height:1.08;font-weight:900;letter-spacing:-.4px;color:'+t.text+';">'+mktEscapeHtml_(headline)+'</div>'
    + '<p style="font-size:16px;line-height:1.65;color:'+t.muted+';margin:25px 0 0;">'+mktEscapeHtml_(body)+'</p>'
    + '<p style="font-size:16px;line-height:1.65;color:'+t.muted+';margin:12px 0 0;">'+mktEscapeHtml_(body2)+'</p>'
    + '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;"><tr><td bgcolor="'+green+'" style="border-radius:9px;">'
    + '<a href="'+mktEscapeHtml_(campaign.ctaUrl || '#')+'" style="display:inline-block;padding:15px 24px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none;color:#081005;">'+mktEscapeHtml_(cta)+' &nbsp;→</a>'
    + '</td></tr></table></td></tr>'
    + '<tr><td style="padding:22px 34px;border-top:1px solid '+t.border+';font-family:Arial,sans-serif;color:'+t.muted+';font-size:12px;line-height:1.55;">'
    + '<strong style="color:'+t.text+';">DGL Freight Broker</strong><br>FTL · LTL · Drayage · Intermodal · Cross-Border<br>'
    + '<span style="color:'+green+';">Your inland freight partner.</span></td></tr>'
    + '</table></td></tr></table></body></html>';
}

function createMarketingCampaign(campaign) {
  campaign = campaign || {};
  const now = new Date();
  const id = campaign.campaignId || ('MKT-' + Utilities.getUuid());
  const record = Object.assign({
    campaignId:id,
    status:'Draft',
    createdAt:now,
    updatedAt:now
  }, campaign);
  mktUpsertRows_('MKT_CAMPAIGNS',['campaignId'],[record]);
  return record;
}

function getMarketingCampaign_(campaignId) {
  const c = mktReadAll_('MKT_CAMPAIGNS').find(x => String(x.campaignId) === String(campaignId));
  if (!c) throw new Error('Campaign not found: ' + campaignId);
  return c;
}

function queueMarketingAudienceDrafts(campaignId, audienceId) {
  const campaign = getMarketingCampaign_(campaignId);
  const audience = mktReadAll_('MKT_AUDIENCES').filter(x =>
    String(x.audienceId) === String(audienceId) &&
    String(x.eligible).toLowerCase() !== 'false'
  );
  const contacts = mktReadAll_('MKT_CONTACTS_SECURE');
  const accounts = mktReadAll_('MKT_ACCOUNTS');

  const rows = [];
  audience.forEach(a => {
    const c = contacts.find(x => String(x.contactId) === String(a.contactId));
    const acc = accounts.find(x => String(x.accountId) === String(a.accountId));
    if (!c || !acc || !c.email) return;

    const vars = {
      firstName:c.firstName || '',
      company:acc.accountName || '',
      service:campaign.service || a.service || ''
    };
    const subject = mktMerge_(campaign.subject, vars);
    const html = renderMarketingEmailHtml_(campaign, vars);

    rows.push({
      jobId:Utilities.getUuid(),
      campaignId,
      audienceId,
      accountId:a.accountId,
      contactId:a.contactId,
      email:c.email,
      firstName:c.firstName || '',
      company:acc.accountName || '',
      service:vars.service,
      subject,
      htmlBody:html,
      replyTo:campaign.replyTo || '',
      status:'Pending',
      createdAt:new Date()
    });
  });

  mktUpsertRows_('MKT_EMAIL_QUEUE',['jobId'],rows);
  return { ok:true, queued:rows.length };
}

function processMarketingEmailQueue(limit) {
  limit = Math.max(1, Math.min(Number(limit || 20), 50));
  const sh = mktSheet_('MKT_EMAIL_QUEUE');
  const headers = mktHeaders_(sh);
  const rows = mktReadAll_('MKT_EMAIL_QUEUE').filter(x => String(x.status) === 'Pending').slice(0,limit);

  let drafted = 0, failed = 0;
  rows.forEach(job => {
    try {
      const options = { htmlBody:job.htmlBody, name:'DGL Freight Broker' };
      if (job.replyTo) options.replyTo = job.replyTo;
      const draft = GmailApp.createDraft(job.email, job.subject, 'Please view this email in HTML.', options);
      job.status = 'Drafted';
      job.gmailDraftId = draft.getId();
      job.processedAt = new Date();
      job.error = '';
      drafted++;
    } catch (err) {
      job.status = 'Error';
      job.error = String(err && err.message || err);
      job.processedAt = new Date();
      failed++;
    }
    mktUpsertRows_('MKT_EMAIL_QUEUE',['jobId'],[job]);
  });

  return { ok:true, drafted, failed };
}
