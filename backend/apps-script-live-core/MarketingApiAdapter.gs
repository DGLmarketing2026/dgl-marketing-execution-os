/**
 * Marketing API Adapter
 * Integrate this into the EXISTING NOVA doGet dispatcher.
 *
 * Example inside the existing doGet(e):
 *   var mkt = handleMarketingApi_(e);
 *   if (mkt) return mkt;
 *   // existing NOVA doGet logic...
 */

function handleMarketingApi_(e) {
  if (!e || !e.parameter) return null;
  const action = String(e.parameter.action || '');

  const marketingActions = [
    'mktHealth','mktAudiences','mktCampaigns','mktCreateCampaign',
    'mktQueueDrafts','mktProcessDrafts','mktSetupHub','mktRebuildAudiences'
  ];
  if (marketingActions.indexOf(action) === -1) return null;

  const callback = String(e.parameter.callback || '');
  let result;

  try {
    if (action === 'mktHealth') {
      result = { ok:true, service:'DGL Marketing Hub' };
    } else if (action === 'mktSetupHub') {
      result = setupMarketingDataHub();
    } else if (action === 'mktRebuildAudiences') {
      result = rebuildMarketingAudiences();
    } else if (action === 'mktAudiences') {
      result = getMarketingAudiences();
    } else if (action === 'mktCampaigns') {
      result = mktReadAll_('MKT_CAMPAIGNS');
    } else if (action === 'mktCreateCampaign') {
      result = createMarketingCampaign(JSON.parse(e.parameter.payload || '{}'));
    } else if (action === 'mktQueueDrafts') {
      result = queueMarketingAudienceDrafts(e.parameter.campaignId, e.parameter.audienceId);
    } else if (action === 'mktProcessDrafts') {
      result = processMarketingEmailQueue(Number(e.parameter.limit || 20));
    }

    return mktJsonp_(callback, { ok:true, result:result });
  } catch (err) {
    return mktJsonp_(callback, { ok:false, error:String(err && err.message || err) });
  }
}

function mktJsonp_(callback, payload) {
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
