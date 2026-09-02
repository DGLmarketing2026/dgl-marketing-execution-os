function v6RecipientText_(value){return String(value==null?'':value).trim();}
function v6RecipientUpper_(value){return v6RecipientText_(value).toUpperCase();}
function v6RecipientBool_(value){var x=v6RecipientUpper_(value);return value===true||x==='TRUE'||x==='YES'||x==='SI'||x==='SÍ'||x==='1'||x==='Y';}
function v6RecipientEmailValid_(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v6RecipientText_(value).toLowerCase());}
function v6RecipientRows_(name){try{return v6Rows_(name);}catch(_){return [];}}
function v6RecipientActiveExclusion_(rows,accountId,contactId,now){return (rows||[]).filter(function(row){
  var active=row.active===''||row.active==null?!['INACTIVE','EXPIRED','CLEARED'].includes(v6RecipientUpper_(row.status)):v6RecipientBool_(row.active),expires=row.expiresAt?new Date(row.expiresAt):null,notExpired=!expires||isNaN(expires.getTime())||expires>now,accountMatch=!v6RecipientText_(row.accountId)||v6RecipientText_(row.accountId)===accountId,contactMatch=!v6RecipientText_(row.contactId)||v6RecipientText_(row.contactId)===contactId;
  return active&&notExpired&&accountMatch&&contactMatch;
})[0]||null;}
function v6RecipientCampaignContext_(campaignId){
  var campaigns=v6RecipientRows_('MKT_CAMPAIGNS'),campaign=campaigns.filter(function(row){return v6RecipientText_(row.campaignId||row.id)===campaignId;})[0]||{},scopeId=v6RecipientText_(campaign.scopeId||campaign.audienceId),scopes=v6RecipientRows_('MKT_CAMPAIGN_SCOPES'),scope=scopes.filter(function(row){return v6RecipientText_(row.scopeId||row.audienceId)===scopeId||v6RecipientText_(row.campaignId)===campaignId;})[0]||{};
  scopeId=v6RecipientText_(scope.scopeId||scope.audienceId||scopeId);return {campaign:campaign,scope:scope,scopeId:scopeId,campaignType:v6RecipientText_(campaign.campaignType||campaign.objective||scope.campaignType||scope.opportunityType)};
}
function v6RecipientSafeStatus_(status,eligible,excluded,reason,frequency,exclusions){return {audienceResolved:status==='RECIPIENTS RESOLVED',audienceStatus:status,eligibleContactCount:Number(eligible||0),excludedContactCount:Number(excluded||0),reasonCode:v6RecipientUpper_(reason||status).replace(/[^A-Z0-9_ -]/g,'').substring(0,80),frequencyStatus:frequency||'PENDING BACKEND EVALUATION',exclusionStatus:exclusions||'PENDING BACKEND EVALUATION',exclusionsCleared:exclusions==='CLEAR'};}
function v6RecipientPersistStatus_(campaignId,scopeId,status){var now=new Date().toISOString(),record={audienceRecipientId:'STATUS:'+campaignId,recordType:'AUDIENCE_STATUS',campaignId:campaignId,scopeId:scopeId,audienceResolved:status.audienceResolved,audienceStatus:status.audienceStatus,eligibleContactCount:status.eligibleContactCount,excludedContactCount:status.excludedContactCount,reasonCode:status.reasonCode,frequencyStatus:status.frequencyStatus,exclusionStatus:status.exclusionStatus,exclusionsCleared:status.exclusionsCleared,resolvedAt:now,updatedAt:now};v6UpsertByKey_('MKT_AUDIENCES',['audienceRecipientId'],record);return status;}
function v6ResolveRecipients_(payload){
  var p=payload||{},campaignId=v6RecipientText_(p.campaignId),now=new Date(),stamp=now.toISOString();if(!campaignId)throw new Error('campaignId REQUIRED');
  var ctx=v6RecipientCampaignContext_(campaignId),scopeAccounts=v6RecipientRows_('MKT_SCOPE_ACCOUNTS').filter(function(row){var same=v6RecipientText_(row.campaignId)===campaignId||ctx.scopeId&&v6RecipientText_(row.scopeId||row.audienceId)===ctx.scopeId,blocked=['SUPPRESSED','EXCLUDED','BLOCKED'].includes(v6RecipientUpper_(row.eligibilityStatus||row.status));return same&&!blocked;});
  if(!scopeAccounts.length)return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_('ACCOUNT SCOPE UNRESOLVED',0,0,'NO_SCOPE_ACCOUNTS','NOT EVALUATED','NOT EVALUATED'));
  var accountIds={};scopeAccounts.forEach(function(row){var id=v6RecipientText_(row.accountId);if(id)accountIds[id]=true;});if(!Object.keys(accountIds).length)return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_('ACCOUNT SCOPE UNRESOLVED',0,0,'ACCOUNT_ID_REQUIRED','NOT EVALUATED','NOT EVALUATED'));
  var contacts=v6RecipientRows_('MKT_CONTACTS_SECURE').filter(function(row){return accountIds[v6RecipientText_(row.accountId)]&&v6RecipientUpper_(row.status||'ACTIVE')!=='INACTIVE';});
  if(!contacts.length)return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_('NO CONTACTS AVAILABLE',0,0,'NO_CONTACTS','NOT EVALUATED','CLEAR'));
  var exclusions=v6RecipientRows_('MKT_EXCLUSIONS'),eligible=0,excluded=0,frequencyBlocked=0,exclusionBlocked=0;
  contacts.forEach(function(contact){
    var accountId=v6RecipientText_(contact.accountId),contactId=v6RecipientText_(contact.contactId),email=v6RecipientText_(contact.email).toLowerCase(),reason='CLEAR',exclusion=null,frequency={status:'CLEAR',eligible:true};
    if(v6RecipientBool_(contact.doNotContact||contact.dnc)){reason='DO_NOT_CONTACT';exclusionBlocked++;}
    else if(!email){reason='EMAIL_MISSING';exclusionBlocked++;}
    else if(!v6RecipientEmailValid_(email)||v6RecipientUpper_(contact.emailStatus)==='INVALID'){reason='EMAIL_INVALID';exclusionBlocked++;}
    else if((exclusion=v6RecipientActiveExclusion_(exclusions,accountId,contactId,now))){reason='ACTIVE_EXCLUSION';exclusionBlocked++;}
    else{frequency=v6FrequencyStatus_({accountId:accountId,contactId:contactId,campaignId:campaignId,campaignType:ctx.campaignType});if(!frequency.eligible){reason='FREQUENCY_'+v6RecipientUpper_(frequency.status).replace(/[^A-Z0-9]+/g,'_');frequencyBlocked++;}}
    var ok=reason==='CLEAR';if(ok)eligible++;else excluded++;v6UpsertByKey_('MKT_AUDIENCES',['audienceRecipientId'],{audienceRecipientId:'AUD:'+campaignId+':'+contactId,recordType:'RECIPIENT',campaignId:campaignId,scopeId:ctx.scopeId,accountId:accountId,contactId:contactId,email:email,eligibilityStatus:ok?'ELIGIBLE':'EXCLUDED',exclusionReason:reason,frequencyStatus:v6RecipientUpper_(frequency.status||'NOT EVALUATED'),resolvedAt:stamp,updatedAt:stamp});
  });
  var status=eligible>0?'RECIPIENTS RESOLVED':'NO ELIGIBLE CONTACTS';return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_(status,eligible,excluded,status==='RECIPIENTS RESOLVED'?'ELIGIBLE_CONTACTS_FOUND':'ALL_CONTACTS_EXCLUDED','CLEAR','CLEAR'));
}
function v6AudienceStatus_(payload){
  var campaignId=v6RecipientText_((payload||{}).campaignId);if(!campaignId)throw new Error('campaignId REQUIRED');var row=v6RecipientRows_('MKT_AUDIENCES').filter(function(x){return v6RecipientText_(x.audienceRecipientId)==='STATUS:'+campaignId;})[0];
  if(!row)return v6RecipientSafeStatus_('RECIPIENT RESOLUTION PENDING',0,0,'NOT_RESOLVED','PENDING BACKEND EVALUATION','PENDING BACKEND EVALUATION');return v6RecipientSafeStatus_(v6RecipientUpper_(row.audienceStatus),Number(row.eligibleContactCount||0),Number(row.excludedContactCount||0),row.reasonCode,row.frequencyStatus,row.exclusionStatus);
}
