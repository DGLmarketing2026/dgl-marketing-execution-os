function v6MarkContactEmailInvalid_(payload){
  var p=payload||{},contactId=String(p.contactId||'').trim();
  if(!contactId)throw new Error('contactId REQUIRED');
  var existing=v6Rows_('MKT_CONTACTS_SECURE').filter(function(r){return String(r.contactId||'')===contactId;})[0]||{};
  var record=Object.assign({},existing,{contactId:contactId,email:p.email!=null?p.email:existing.email,emailStatus:'INVALID',updatedAt:new Date().toISOString()});
  return v6UpsertByKey_('MKT_CONTACTS_SECURE',['contactId'],record);
}

function v6RegisterExclusion_(payload){
  var p=payload||{},contactId=String(p.contactId||'').trim(),accountId=String(p.accountId||'').trim();
  var exclusionId='UNSUB:'+(contactId||accountId);
  return v6UpsertByKey_('MKT_EXCLUSIONS',['exclusionId'],{
    exclusionId:exclusionId,accountId:accountId,contactId:contactId,status:'ACTIVE',active:true,
    reasonCode:'UNSUBSCRIBE',expiresAt:'',updatedAt:new Date().toISOString()
  });
}

// AURA event-type vocabulary aliases: external callers (AM Platform, mail/CRM webhooks)
// may send the plain names below; they map onto the original internal event types
// without changing stored pipeline semantics or introducing a second vocabulary.
var MKT_V6_RESPONSE_EVENT_ALIASES_={QUOTE:'QUOTE_SIGNAL',LOAD:'LOAD_SIGNAL'};

function v6ClassifyResponseEvent_(rawEvent){
  var e=rawEvent||{},eventType=String(e.eventType||'').toUpperCase(),accountId=e.accountId||'',action='IGNORED',result=null;
  eventType=MKT_V6_RESPONSE_EVENT_ALIASES_[eventType]||eventType;
  if(eventType==='REPLY'){
    result=v6UpsertPipelineStage_({accountId:accountId,response:true,responseAt:e.occurredAt,campaignId:e.campaignId,executionId:e.executionId,amOwner:e.amOwner});
    action='PIPELINE_UPDATED';
  }else if(eventType==='RFQ'){
    result=v6UpsertPipelineStage_({accountId:accountId,rfqAt:e.occurredAt,campaignId:e.campaignId,executionId:e.executionId,amOwner:e.amOwner});
    action='PIPELINE_UPDATED';
  }else if(eventType==='QUOTE_SIGNAL'){
    result=v6UpsertPipelineStage_({accountId:accountId,quoteAt:e.occurredAt,campaignId:e.campaignId,executionId:e.executionId,amOwner:e.amOwner});
    action='PIPELINE_UPDATED';
  }else if(eventType==='LOAD_SIGNAL'){
    // attributedRevenue is only set when the raw event explicitly carries an amount from
    // the source system (real-time signal); it is never fabricated here. The authoritative
    // batch cross-check against NOVA's own Monto field remains v6IngestCommercialOutcomes_.
    var loadPayload={accountId:accountId,loadAt:e.occurredAt,campaignId:e.campaignId,executionId:e.executionId,amOwner:e.amOwner};
    if(e.amount!=null&&e.amount!=='')loadPayload.attributedRevenue=Number(e.amount);
    result=v6UpsertPipelineStage_(loadPayload);
    action='PIPELINE_UPDATED';
  }else if(eventType==='BOUNCE'){
    result=v6MarkContactEmailInvalid_({contactId:e.contactId,email:e.email});
    action='CONTACT_MARKED_INVALID';
  }else if(eventType==='UNSUBSCRIBE'){
    result=v6RegisterExclusion_({accountId:e.accountId,contactId:e.contactId});
    action='EXCLUSION_REGISTERED';
  }
  return {eventId:e.eventId,eventType:e.eventType,accountId:e.accountId||'',action:action,result:result};
}
