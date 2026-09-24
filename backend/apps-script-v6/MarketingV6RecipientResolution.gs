function v6RecipientText_(value){return String(value==null?'':value).trim();}
function v6RecipientUpper_(value){return v6RecipientText_(value).toUpperCase();}
function v6RecipientBool_(value){var x=v6RecipientUpper_(value);return value===true||x==='TRUE'||x==='YES'||x==='SI'||x==='SÍ'||x==='1'||x==='Y';}
function v6RecipientEmailValid_(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v6RecipientText_(value).toLowerCase());}
function v6RecipientRows_(name){return v6Rows_(name);}
function v6RecipientExclusionReason_(row){return v6RecipientUpper_((row||{}).reasonCode||(row||{}).reason||'ACTIVE_EXCLUSION').replace(/[^A-Z0-9_ -]/g,'').substring(0,80)||'ACTIVE_EXCLUSION';}
function v6RecipientActiveExclusion_(rows,accountId,contactId,now){return (rows||[]).filter(function(row){
  var active=row.active===''||row.active==null?!['INACTIVE','EXPIRED','CLEARED'].includes(v6RecipientUpper_(row.status)):v6RecipientBool_(row.active),end=row.expiresAt||row.endDate,expires=end?new Date(end):null,notExpired=!expires||isNaN(expires.getTime())||expires>now,accountMatch=!v6RecipientText_(row.accountId)||v6RecipientText_(row.accountId)===accountId,contactMatch=!v6RecipientText_(row.contactId)||v6RecipientText_(row.contactId)===contactId;
  return active&&notExpired&&accountMatch&&contactMatch;
})[0]||null;}
function v6RecipientCampaignContext_(campaignId){
  var campaigns=v6RecipientRows_('MKT_CAMPAIGNS'),campaign=campaigns.filter(function(row){return v6RecipientText_(row.campaignId||row.id)===campaignId;})[0]||{},scopeId=v6RecipientText_(campaign.scopeId||campaign.audienceId),scopes=v6RecipientRows_('MKT_CAMPAIGN_SCOPES'),scope=scopes.filter(function(row){return v6RecipientText_(row.scopeId||row.audienceId)===scopeId||v6RecipientText_(row.campaignId)===campaignId;})[0]||{};
  scopeId=v6RecipientText_(scope.scopeId||scope.audienceId||scopeId);return {campaign:campaign,scope:scope,scopeId:scopeId,campaignType:v6RecipientText_(campaign.campaignType||campaign.objective||scope.campaignType||scope.opportunityType)};
}
function v6RecipientSafeStatus_(status,eligible,excluded,reason,frequency,exclusions){return {audienceResolved:status==='RECIPIENTS RESOLVED',audienceStatus:status,eligibleContactCount:Number(eligible||0),excludedContactCount:Number(excluded||0),reasonCode:v6RecipientUpper_(reason||status).replace(/[^A-Z0-9_ -]/g,'').substring(0,80),frequencyStatus:frequency||'PENDING BACKEND EVALUATION',exclusionStatus:exclusions||'PENDING BACKEND EVALUATION',exclusionsCleared:exclusions==='CLEAR'};}
function v6RecipientPersistStatus_(campaignId,scopeId,status){var now=new Date().toISOString(),record={audienceRecipientId:'STATUS:'+campaignId,recordType:'AUDIENCE_STATUS',campaignId:campaignId,scopeId:scopeId,audienceResolved:status.audienceResolved,audienceStatus:status.audienceStatus,eligibleContactCount:status.eligibleContactCount,excludedContactCount:status.excludedContactCount,reasonCode:status.reasonCode,frequencyStatus:status.frequencyStatus,exclusionStatus:status.exclusionStatus,exclusionsCleared:status.exclusionsCleared,resolvedAt:now,updatedAt:now};v6UpsertByKey_('MKT_AUDIENCES',['audienceRecipientId'],record);return status;}
// ONE full-table read + in-memory merge + ONE full-table write for every RECIPIENT row this
// resolution pass produces, instead of one v6UpsertByKey_ (its own full read+scan+write) PER
// contact -- only used when the caller opts in via payload.batchWrite (see v6ResolveRecipients_
// below). Falls back to v6BatchUpsertByKey_ when available (MarketingV6FrequencyControl.gs,
// always true in the real Apps Script project); a caller/test that never sets batchWrite:true
// never reaches this function at all, so its absence in an isolated test harness is harmless.
function v6RecipientBatchUpsertAudiences_(records){
  if(typeof v6BatchUpsertByKey_==='function')return v6BatchUpsertByKey_('MKT_AUDIENCES',['audienceRecipientId'],records);
  records.forEach(function(r){v6UpsertByKey_('MKT_AUDIENCES',['audienceRecipientId'],r);});
  return {created:records.length,updated:0};
}
function v6ResolveRecipients_(payload){
  var p=payload||{},campaignId=v6RecipientText_(p.campaignId),now=new Date(),stamp=now.toISOString();if(!campaignId)throw new Error('campaignId REQUIRED');
  ['MKT_CAMPAIGN_SCOPES','MKT_SCOPE_ACCOUNTS','MKT_CONTACTS_SECURE','MKT_EXCLUSIONS','MKT_AUDIENCES'].forEach(function(name){v6RequireContactRecipientHeaders_(name);});
  var ctx=v6RecipientCampaignContext_(campaignId),scopeAccounts=v6RecipientRows_('MKT_SCOPE_ACCOUNTS').filter(function(row){var same=v6RecipientText_(row.campaignId)===campaignId||ctx.scopeId&&v6RecipientText_(row.scopeId||row.audienceId)===ctx.scopeId,blocked=['SUPPRESSED','EXCLUDED','BLOCKED'].includes(v6RecipientUpper_(row.eligibilityStatus||row.status));return same&&!blocked;});
  if(!scopeAccounts.length)return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_('ACCOUNT SCOPE UNRESOLVED',0,0,'NO_SCOPE_ACCOUNTS','NOT EVALUATED','NOT EVALUATED'));
  var accountIds={};scopeAccounts.forEach(function(row){var id=v6RecipientText_(row.accountId);if(id)accountIds[id]=true;});if(!Object.keys(accountIds).length)return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_('ACCOUNT SCOPE UNRESOLVED',0,0,'ACCOUNT_ID_REQUIRED','NOT EVALUATED','NOT EVALUATED'));
  var contacts=v6RecipientRows_('MKT_CONTACTS_SECURE').filter(function(row){return accountIds[v6RecipientText_(row.accountId)]&&v6RecipientUpper_(row.status||'ACTIVE')!=='INACTIVE';});
  if(!contacts.length)return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_('NO CONTACTS AVAILABLE',0,0,'NO_CONTACTS','NOT EVALUATED','CLEAR'));
  // Preloaded ONCE regardless of batchWrite -- v6FrequencyStatus_'s optional second argument
  // (MarketingV6FrequencyControl.gs) means this always replaces N per-contact
  // v6Rows_('MKT_FREQUENCY_LEDGER') full-table reads with exactly one, for every caller.
  var exclusions=v6RecipientRows_('MKT_EXCLUSIONS'),ledgerRows=v6RecipientRows_('MKT_FREQUENCY_LEDGER'),eligible=0,excluded=0,frequencyBlocked=0,exclusionBlocked=0;
  // batchWrite:true (opt-in; default false keeps every existing caller's exact behavior) defers
  // every MKT_AUDIENCES write to one final batch instead of one v6UpsertByKey_ call per contact --
  // the other O(n) write this function otherwise performs. See MarketingV6AuraCampanaA.gs, the
  // pipeline this was added for.
  var batchWrite=!!p.batchWrite,pendingAudienceRecords=[];
  var security=v6RecipientSecurityEvidence_();
  contacts=v6RecipientUniqueCandidates_(contacts);
  contacts.forEach(function(contact){
    var accountId=v6RecipientText_(contact.accountId),contactId=v6RecipientText_(contact.contactId),email=v6RecipientText_(contact.email).toLowerCase(),reason='CLEAR',exclusion=null,frequency={status:'CLEAR',eligible:true};
    var securityReason=contact.securityReason||v6RecipientSecurityCheck_(contact,security);
    if(securityReason!=='CLEAR'){reason=securityReason;exclusionBlocked++;}
    else if(v6RecipientBool_(contact.doNotContact||contact.dnc)){reason='DO_NOT_CONTACT';exclusionBlocked++;}
    else if(!email){reason='EMAIL_MISSING';exclusionBlocked++;}
    else if(!v6RecipientEmailValid_(email)||v6RecipientUpper_(contact.emailStatus)==='INVALID'){reason='EMAIL_INVALID';exclusionBlocked++;}
    else if((exclusion=v6RecipientActiveExclusion_(exclusions,accountId,contactId,now))){reason='EXCLUSION_'+v6RecipientExclusionReason_(exclusion).replace(/[^A-Z0-9]+/g,'_');exclusionBlocked++;}
    else{frequency=v6FrequencyStatus_({accountId:accountId,contactId:contactId,campaignId:campaignId,campaignType:ctx.campaignType},ledgerRows);if(!frequency.eligible){reason='FREQUENCY_'+v6RecipientUpper_(frequency.status).replace(/[^A-Z0-9]+/g,'_');frequencyBlocked++;}}
    var ok=reason==='CLEAR';if(ok)eligible++;else excluded++;
    var record={audienceRecipientId:'AUD:'+campaignId+':'+contactId,recordType:'RECIPIENT',campaignId:campaignId,scopeId:ctx.scopeId,accountId:accountId,contactId:contactId,email:email,eligibilityStatus:ok?'ELIGIBLE':'EXCLUDED',exclusionReason:reason,frequencyStatus:v6RecipientUpper_(frequency.status||'NOT EVALUATED'),resolvedAt:stamp,updatedAt:stamp};
    if(batchWrite)pendingAudienceRecords.push(record);else v6UpsertByKey_('MKT_AUDIENCES',['audienceRecipientId'],record);
  });
  if(batchWrite&&pendingAudienceRecords.length)v6RecipientBatchUpsertAudiences_(pendingAudienceRecords);
  var status=eligible>0?'RECIPIENTS RESOLVED':'NO ELIGIBLE CONTACTS';return v6RecipientPersistStatus_(campaignId,ctx.scopeId,v6RecipientSafeStatus_(status,eligible,excluded,status==='RECIPIENTS RESOLVED'?'ELIGIBLE_CONTACTS_FOUND':'ALL_CONTACTS_EXCLUDED','CLEAR','CLEAR'));
}
function v6AudienceStatus_(payload){
  var campaignId=v6RecipientText_((payload||{}).campaignId);if(!campaignId)throw new Error('campaignId REQUIRED');var row=v6RecipientRows_('MKT_AUDIENCES').filter(function(x){return v6RecipientText_(x.audienceRecipientId)==='STATUS:'+campaignId;})[0];
  if(!row)return v6RecipientSafeStatus_('RECIPIENT RESOLUTION PENDING',0,0,'NOT_RESOLVED','PENDING BACKEND EVALUATION','PENDING BACKEND EVALUATION');return v6RecipientSafeStatus_(v6RecipientUpper_(row.audienceStatus),Number(row.eligibleContactCount||0),Number(row.excludedContactCount||0),row.reasonCode,row.frequencyStatus,row.exclusionStatus);
}

// Deterministic sending evidence. Missing NOVA match alone is never a suppression.
function v6RecipientSecurityEvidence_(){
  return {contacts:v6Rows_('MKT_CONTACTS_SECURE'),exclusions:v6Rows_('MKT_EXCLUSIONS'),events:v6Rows_('MKT_EMAIL_EVENTS'),responses:v6Rows_('MKT_RESPONSES'),stops:v6Rows_('MKT_ACCOUNT_STOPS')};
}
function v6RecipientSecurityCheck_(r,evidence){
  var e=evidence||v6RecipientSecurityEvidence_(),email=String(r.email||'').trim().toLowerCase(),id=String(r.contactId||''),account=String(r.accountId||'');
  var matching=e.contacts.filter(function(c){return String(c.email||'').trim().toLowerCase()===email;});
  var identities={};matching.forEach(function(c){identities[String(c.accountId)+'|'+String(c.contactId)]=true;});
  if(Object.keys(identities).length>1)return 'IDENTITY_AMBIGUOUS';
  if(matching.some(function(c){return c.accountId&&String(c.accountId)!==account;}))return 'IDENTITY_AMBIGUOUS';
  if(matching.some(function(c){return v6RecipientBool_(c.doNotContact)||v6RecipientBool_(c.dnc);}))return 'DO_NOT_CONTACT';
  if(matching.some(function(c){return /^(INVALID|HARD_BOUNCE|BLOCKED)$/.test(String(c.emailStatus||'').toUpperCase());}))return 'EMAIL_INVALID';
  function contactMatch(x){return !!((x.contactId&&String(x.contactId)===id)||(x.email&&String(x.email).trim().toLowerCase()===email));}
  if(e.events.some(function(x){return contactMatch(x)&&x.eventType==='BOUNCE'&&/^(HARD_BOUNCE|BLOCKED)$/.test(x.reasonCode);}))return 'DELIVERY_SUPPRESSED';
  if(e.exclusions.some(function(x){return x.email&&String(x.email).trim().toLowerCase()===email&&v6RecipientActiveExclusion_([Object.assign({},x,{accountId:'',contactId:''})],account,id,new Date());}))return 'EXCLUSION_ACTIVE';
  var stops=e.stops.concat(e.responses.filter(function(x){return /^(REPLY|CUSTOMER_REPLIED|RFQ|QUOTE|LOAD|UNSUBSCRIBE|SPAM_COMPLAINT)$/.test(String(x.eventType||x.responseType).toUpperCase());}));
  if(stops.some(function(x){
    if(/^(INACTIVE|CLEARED|EXPIRED)$/.test(String(x.status||'').toUpperCase()))return false;
    if(x.accountId&&String(x.accountId)!==account)return false;
    if(/^(ACCOUNT|ACCOUNT_ONLY|ACCOUNT_WIDE)$/.test(String(x.scope||'').toUpperCase()))return String(x.accountId||'')===account;
    if(x.contactId||x.email)return contactMatch(x);
    return String(x.accountId||'')===account; // ambiguous scope fails closed
  }))return 'RESPONSE_STOP';
  return 'CLEAR';
}
function v6RecipientUniqueCandidates_(rows){
  var byEmail={};
  rows.forEach(function(r){var email=String(r.email||'').trim().toLowerCase(),key=email||('missing:'+r.contactId);(byEmail[key]||(byEmail[key]=[])).push(r);});
  return Object.keys(byEmail).sort().map(function(k){
    var group=byEmail[k],ids={};group.forEach(function(r){ids[String(r.accountId)+'|'+String(r.contactId)]=true;});
    var r=Object.assign({},group[0]);
    if(Object.keys(ids).length>1)r.securityReason='IDENTITY_AMBIGUOUS';
    if(group.some(function(x){return v6RecipientBool_(x.doNotContact)||v6RecipientBool_(x.dnc);}))r.doNotContact=true;
    return r;
  });
}
// A pipeline response stage is not evidence that every sibling contact replied.
// Unknown scope remains blocked; explicit account stops always win.
function v6RecipientPipelineStopped_(stage,r,evidence){
  if(!stage)return false;
  if(stage==='CLOSED / SUPPRESSED')return true;
  if(stage!=='RESPONDED'&&stage!=='RFQ RECEIVED')return typeof v6PipelineAdvanced_==='function'&&v6PipelineAdvanced_(stage);
  var e=evidence||v6RecipientSecurityEvidence_(),scoped=e.responses.concat(e.stops).filter(function(x){return String(x.accountId||'')===String(r.accountId||'');});
  if(!scoped.length||scoped.some(function(x){return !x.contactId&&!x.email||/^(ACCOUNT|ACCOUNT_ONLY|ACCOUNT_WIDE)$/.test(String(x.scope||'').toUpperCase());}))return true;
  return v6RecipientSecurityCheck_(r,e)!=='CLEAR';
}
