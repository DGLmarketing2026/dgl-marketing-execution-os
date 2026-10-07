/** Private recipient reporting. Reads never ingest Gmail or send mail.
 * DSN ingestion uses a dedicated hourly trigger; reporting never invokes a dispatcher.
 */
var AURA_EMAIL_EVENT_TYPES_ = ['SENT','FAILED','BOUNCE','SOFT_BOUNCE','DELIVERED','OPEN','CLICK','REPLY','UNSUBSCRIBE','SPAM_COMPLAINT'];
// Public name only for Apps Script's scheduler; never exposed by the HTTP router.
function auraIngestGmailDsn() { return v6AuraIngestGmailDsn_(); }
function v6AuraInstallDsnTrigger_() {
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var matches=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='auraIngestGmailDsn';});
    if(!matches.length)matches=[ScriptApp.newTrigger('auraIngestGmailDsn').timeBased().everyHours(1).create()];
    matches.slice(1).forEach(function(t){ScriptApp.deleteTrigger(t);});
    return {handler:'auraIngestGmailDsn',installed:true};
  } finally {lock.releaseLock();}
}
function v6AuraEmailDate_(value) {
  if(!value)return '';
  var d=new Date(value);return isFinite(d.getTime())?d.toISOString():'';
}
// Admin-only reconciliation: materialize authoritative queue/response evidence without
// inferring delivery, opens or clicks. The report also reads these sources directly.
function v6AuraReconcileEmailEvents_() {
  var queue=v6Rows_('MKT_EMAIL_QUEUE'),known={};v6Rows_('MKT_EMAIL_EVENTS').forEach(function(e){known[e.eventId]=true;});
  var pending=[];
  queue.forEach(function(q){
    if(!q.jobId||!/^(SENT|FAILED)$/.test(q.status))return;
    var event={eventId:'QUEUE:'+q.jobId+':'+q.status,jobId:q.jobId,campaignId:q.campaignId,accountId:q.accountId,contactId:q.contactId,email:q.email,eventType:q.status,occurredAt:v6AuraEmailDate_(q.processedAt),source:'MKT_EMAIL_QUEUE',externalId:q.jobId,reasonCode:q.status==='FAILED'?'SEND_FAILED':'',reasonText:q.error||'',createdAt:new Date().toISOString()};
    if(!known[event.eventId]){known[event.eventId]=true;pending.push(event);}
  });
  var sentByCampaign={};queue.forEach(function(q){if(q.status==='SENT')(sentByCampaign[q.campaignId]=sentByCampaign[q.campaignId]||[]).push(q);});
  v6Rows_('MKT_RESPONSES').forEach(function(r){
    if(!/^(REPLY|CUSTOMER_REPLIED)$/.test(String(r.eventType||r.responseType).toUpperCase())||!r.responseId)return;
    var jobs=(sentByCampaign[r.campaignId]||[]).filter(function(q){return q.status==='SENT'&&v6AuraEmailDate_(q.processedAt||q.sentAt)&&v6AuraEmailDate_(q.processedAt||q.sentAt)<=v6AuraEmailDate_(r.responseAt)&&q.campaignId===r.campaignId&&((r.contactId&&r.contactId===q.contactId)||(r.email&&String(r.email).toLowerCase()===String(q.email).toLowerCase()));});
    if(jobs.length!==1)return;
    var q=jobs[0],eventId='REPLY:'+r.responseId;
    if(!known[eventId]){known[eventId]=true;pending.push({eventId:eventId,jobId:q.jobId,campaignId:q.campaignId,accountId:q.accountId,contactId:q.contactId,email:q.email,eventType:'REPLY',occurredAt:v6AuraEmailDate_(r.responseAt),source:'MKT_RESPONSES',externalId:r.externalMessageId||r.responseId,createdAt:new Date().toISOString()});}
  });
  if(pending.length){if(typeof v6BatchUpsertByKey_==='function')v6BatchUpsertByKey_('MKT_EMAIL_EVENTS',['eventId'],pending);else pending.forEach(function(e){v6UpsertByKey_('MKT_EMAIL_EVENTS',['eventId'],e);});}
  return {written:pending.length};
}
function v6AuraEmailPerformance_() {
  var events=v6Rows_('MKT_EMAIL_EVENTS'),responses=v6Rows_('MKT_RESPONSES'),queue=v6Rows_('MKT_EMAIL_QUEUE');
  var campaigns=v6Rows_('MKT_CAMPAIGNS'),contacts=v6Rows_('MKT_CONTACTS_SECURE'),accounts=v6Rows_('MKT_ACCOUNTS');
  var indexes={};
  function find(list,key,value){
    if(!value)return {};
    var id=key+'@'+(list===campaigns?'c':list===contacts?'k':list===accounts?'a':'x');
    if(!indexes[id]){indexes[id]={};list.forEach(function(r){var k=String(r[key]);if(!(k in indexes[id]))indexes[id][k]=r;});}
    return indexes[id][String(value)]||{};
  }
  var eventsByJob={};events.forEach(function(e){if(e.jobId)(eventsByJob[e.jobId]=eventsByJob[e.jobId]||[]).push(e);});
  // Tracking availability requires a real event with explicit source provenance.
  var tracking={opened:events.some(function(e){return e.eventType==='OPEN'&&e.source&&v6AuraEmailDate_(e.occurredAt);})?'TRACKED':'NOT_TRACKED',clicked:events.some(function(e){return e.eventType==='CLICK'&&e.source&&v6AuraEmailDate_(e.occurredAt);})?'TRACKED':'NOT_TRACKED'};
  var rows=queue.map(function(q){
    var c=find(campaigns,'campaignId',q.campaignId),ct=find(contacts,'contactId',q.contactId),a=find(accounts,'accountId',q.accountId);
    var ev=eventsByJob[q.jobId]||[];
    function at(type){return ev.filter(function(e){return e.eventType===type&&e.source;}).map(function(e){return v6AuraEmailDate_(e.occurredAt);}).filter(Boolean).sort()[0]||'';}
    var replies=responses.filter(function(r){return r.campaignId===q.campaignId&&((r.contactId&&r.contactId===q.contactId)||(r.email&&String(r.email).toLowerCase()===String(q.email).toLowerCase()))&&/^(REPLY|CUSTOMER_REPLIED)$/.test(String(r.eventType||r.responseType).toUpperCase());});
    replies=replies.filter(function(r){
      if(r.jobId)return r.jobId===q.jobId;
      var prior=queue.filter(function(j){return j.status==='SENT'&&j.campaignId===r.campaignId&&((r.contactId&&r.contactId===j.contactId)||(r.email&&String(r.email).toLowerCase()===String(j.email).toLowerCase()))&&v6AuraEmailDate_(j.processedAt||j.sentAt)&&v6AuraEmailDate_(j.processedAt||j.sentAt)<=v6AuraEmailDate_(r.responseAt||r.occurredAt);});
      return prior.length===1&&prior[0].jobId===q.jobId;
    });
    var replyAt=at('REPLY')||replies.map(function(r){return v6AuraEmailDate_(r.responseAt||r.occurredAt);}).filter(Boolean).sort()[0]||'';
    var bounce=ev.filter(function(e){return /^(BOUNCE|SOFT_BOUNCE)$/.test(e.eventType);}).sort(function(x,y){return String(y.occurredAt).localeCompare(String(x.occurredAt));})[0]||{};
    return {jobId:q.jobId,accountId:q.accountId,contactId:q.contactId,company:q.company||a.accountName||'',contactName:q.contactName||[q.firstName||ct.firstName,ct.lastName].filter(Boolean).join(' '),email:q.email||'',campaignId:q.campaignId||'',campaignFamily:q.campaignFamily||c.campaignFamily||c.campaignType||'',service:q.service||c.service||'',language:q.preferredLanguage||q.language||'',amOwner:q.amOwner||a.amOwner||'',sendStatus:q.status||'UNKNOWN',sentAt:at('SENT')||(q.status==='SENT'?v6AuraEmailDate_(q.sentAt||q.processedAt):''),failedAt:at('FAILED')||(q.status==='FAILED'?v6AuraEmailDate_(q.failedAt||q.processedAt):''),bounceStatus:bounce.eventType||'',bounceReason:bounce.reasonCode||'',bounceAt:v6AuraEmailDate_(bounce.occurredAt),replied:!!replyAt,replyAt:replyAt,tracked:v6AuraJobTracked_(q,ev),opened:v6AuraJobTracked_(q,ev)?!!at('OPEN'):null,openAt:at('OPEN'),clicked:v6AuraJobTracked_(q,ev)?!!at('CLICK'):null,clickAt:at('CLICK')};
  });
  var summary={sent:0,failed:0,bounced:0,replied:0,opened:null,clicked:null};
  rows.forEach(function(r){if(r.sentAt||r.sendStatus==='SENT')summary.sent++;if(r.failedAt||r.sendStatus==='FAILED')summary.failed++;if(r.bounceStatus)summary.bounced++;if(r.replied)summary.replied++;v6AuraAddTracked_(summary,r);});
  tracking={opened:rows.some(function(r){return r.tracked;})?'TRACKED':'NOT_TRACKED',clicked:rows.some(function(r){return r.tracked;})?'TRACKED':'NOT_TRACKED',trackedJobs:rows.filter(function(r){return r.tracked;}).length};
  rows.forEach(function(r,i){Object.assign(r,v6AuraJobEvidence_(queue[i],find(campaigns,'campaignId',r.campaignId)));});
  var sentRows=rows.filter(function(r){return r.sendStatus==='SENT';});
  summary.sentRecipientJobs=sentRows.length;
  summary.sentUniqueEmails=new Set(sentRows.map(function(r){return String(r.email||'').trim().toLowerCase();}).filter(Boolean)).size;
  summary.sentUniqueAccounts=new Set(sentRows.map(function(r){return r.accountId;}).filter(Boolean)).size;
  Object.assign(summary,v6AuraRatesOrNull_(summary));
  return {summary:summary,rows:rows,tracking:tracking,scopes:v6AuraEmailKpiScopes_(rows,queue,campaigns,tracking)};
}
function v6AuraJobTracked_(q,ev){return !!String(q.trackingBaseUrl==null?'':q.trackingBaseUrl).trim()||/[?&]aura_t=o&/.test(String(q.htmlBody||''))||(ev||[]).some(function(e){return /^(OPEN|CLICK)$/.test(e.eventType)&&e.source&&v6AuraEmailDate_(e.occurredAt);});}
// Tracked-only accumulation: opened/clicked stay null until a tracked job is in scope; rate
// denominators are tracked SENT jobs minus their bounces.
function v6AuraAddTracked_(t,r){
  if(!r.tracked)return;
  if(t.opened==null)t.opened=0;if(t.clicked==null)t.clicked=0;
  if(r.sendStatus==='SENT'){t.trackedSent=(t.trackedSent||0)+1;if(r.bounceStatus)t.trackedBounced=(t.trackedBounced||0)+1;}
  if(r.opened)t.opened++;if(r.clicked)t.clicked++;
}
function v6AuraRatesOrNull_(c){
  var delivered=Math.max(0,(c.sent||0)-(c.bounced||0));
  if(typeof v6AuraEngagementRates_!=='function')return {delivered:delivered,openRate:null,ctr:null,ctor:null};
  var r=v6AuraEngagementRates_({sent:c.trackedSent||0,bounced:c.trackedBounced||0,opened:c.opened,clicked:c.clicked});
  return {delivered:delivered,deliveredBasis:'SENT_MINUS_BOUNCED',trackedDelivered:r.delivered,openRate:r.openRate,ctr:r.ctr,ctor:r.ctor};
}
// KPI scopes per campaign. A campaign can carry SENT history from an earlier family (Campaign A:
// 109 historical Retention + 214 Reactivation = 323 all-time), so the current run, the current
// family, the historical family sends and all-time are reported separately and never mixed.
// CURRENT_RUN = SENT jobs of the latest governed GO LIVE run (goLiveRunId) when present, else
// the current family. SENT is never presented as DELIVERED (delivered = sent - bounced).
function v6AuraEmailKpiScopes_(rows,queue,campaigns,tracking){
  var byCampaign={},jobById={};queue.forEach(function(q){jobById[q.jobId]=q;});
  var currentFamily={};campaigns.forEach(function(c){currentFamily[String(c.campaignId)]=String(c.campaignType||c.objective||'');});
  if(typeof CAMPANA_A_CAMPAIGN_ID_!=='undefined'&&typeof CAMPANA_A_JOB_FAMILY_!=='undefined')currentFamily[CAMPANA_A_CAMPAIGN_ID_]=CAMPANA_A_JOB_FAMILY_;
  // Commercial outcomes are campaign-level evidence (MKT_RESPONSES), never inferred from engagement.
  var pipeline={};v6Rows_('MKT_RESPONSES').forEach(function(r){var t=String(r.eventType||r.responseType||'').toUpperCase(),k=t==='RFQ'?'rfq':/^QUOTE(_SIGNAL)?$/.test(t)?'quote':/^LOAD(_SIGNAL)?$/.test(t)?'load':'';if(!k||!r.campaignId)return;var p=pipeline[r.campaignId]||(pipeline[r.campaignId]={rfq:0,quote:0,load:0});p[k]++;});
  function blank(){return {sent:0,bounced:0,failed:0,replied:0,opened:null,clicked:null};}
  function add(t,r){if(r.sendStatus==='SENT')t.sent++;if(r.sendStatus==='FAILED')t.failed++;if(r.bounceStatus)t.bounced++;if(r.replied)t.replied++;v6AuraAddTracked_(t,r);}
  rows.forEach(function(r){
    if(!r.campaignId)return;
    var c=byCampaign[r.campaignId]||(byCampaign[r.campaignId]={campaignId:r.campaignId,currentFamily:currentFamily[r.campaignId]||'',latestRunId:'',lastSentAt:'',allTime:blank(),currentFamilyRun:blank(),historical:blank(),currentRun:blank(),historicalFamilies:{}});
    var q=jobById[r.jobId]||{},fam=String(q.playbookId||r.sentFamily||'');
    if(q.goLiveRunId&&String(q.goLiveRunId)>c.latestRunId&&r.sendStatus==='SENT')c.latestRunId=String(q.goLiveRunId);
    add(c.allTime,r);if(r.sentAt&&String(r.sentAt)>c.lastSentAt)c.lastSentAt=String(r.sentAt);
    if(c.currentFamily&&fam.toUpperCase()===c.currentFamily.toUpperCase())add(c.currentFamilyRun,r);
    else if(r.sendStatus==='SENT'){add(c.historical,r);c.historicalFamilies[fam||'UNKNOWN']=(c.historicalFamilies[fam||'UNKNOWN']||0)+1;}
  });
  rows.forEach(function(r){var c=byCampaign[r.campaignId],q=jobById[r.jobId]||{};if(!c)return;
    var inRun=c.latestRunId?String(q.goLiveRunId)===c.latestRunId:(c.currentFamily&&String(q.playbookId||'').toUpperCase()===c.currentFamily.toUpperCase());
    if(inRun)add(c.currentRun,r);});
  Object.keys(byCampaign).forEach(function(id){var c=byCampaign[id];c.pipeline=pipeline[id]||{rfq:0,quote:0,load:0};['allTime','currentFamilyRun','historical','currentRun'].forEach(function(k){Object.assign(c[k],v6AuraRatesOrNull_(c[k]));});});
  return byCampaign;
}
function v6AuraJobEvidence_(job,campaign) {
  var family=job.playbookId||job.campaignFamily||'',checksum=job.recipientContentChecksum,hasChecksum=checksum!==null&&checksum!==undefined&&checksum!=='';
  return {subject:job.subject||'',playbookId:job.playbookId||'',sentFamily:family,campaignFamily:family,
    currentCampaignFamily:campaign.campaignType||campaign.objective||'',
    creativeProvenance:job.creativeId&&job.creativeApprovalId&&hasChecksum?'CAMPAIGN_STUDIO_APPROVED':job.status==='SENT'&&!job.creativeId&&!job.creativeApprovalId&&!hasChecksum?'LEGACY_PRE_CANONICAL':'UNVERIFIED',
    integrityStatus:!hasChecksum?'LEGACY_CHECKSUM_NOT_AVAILABLE':String(v6AuraJobContentChecksum_(job.subject,job.htmlBody))===String(checksum)?'VERIFIED':'MISMATCH'};
}
function v6AuraEmailPerformanceJob_(payload) {
  var id=String((payload||{}).jobId||'');
  if(!id.trim())return {status:'INVALID_REQUEST',error:'jobId REQUIRED'};
  var jobs=v6Rows_('MKT_EMAIL_QUEUE').filter(function(q){return q.jobId===id;});
  if(!jobs.length)return {status:'NOT_FOUND',jobId:id};
  if(jobs.length!==1)return {status:'AMBIGUOUS_JOB_ID',jobId:id};
  var job=jobs[0],row=v6AuraEmailPerformance_().rows.filter(function(r){return r.jobId===id;})[0];
  row.engagement=v6Rows_('MKT_EMAIL_EVENTS').filter(function(e){return e.jobId===id&&/^(OPEN|CLICK)$/.test(e.eventType);}).map(function(e){return {eventType:e.eventType,ctaId:e.ctaId||'',firstAt:v6AuraEmailDate_(e.occurredAt),lastAt:v6AuraEmailDate_(e.lastOccurredAt||e.occurredAt),count:Number(e.eventCount||1)};});
  // Explicit fields only: no reconstructed content, invented IDs or historical writes.
  ['firstName','status','processedAt','createdAt','sequenceStep','subject','htmlBody','replyTo','creativeId','creativeVersion','creativeApprovalId','htmlChecksum','recipientRenderedChecksum','recipientContentChecksum'].forEach(function(k){row[k]=job[k]==null?'':job[k];});
  return row;
}
// Parse each RFC 3464 recipient block independently. Unattributed/ambiguous DSNs are
// skipped rather than assigned to the latest campaign for an email address.
function v6AuraParseDsn_(raw) {
  if(!/delivery-status|Delivery Status Notification|Undelivered Mail/i.test(raw))return [];
  return String(raw).split(/(?=Final-Recipient:)/i).slice(1).map(function(block){
    var email=(block.match(/^Final-Recipient:\s*rfc822;\s*([^\s<>;]+)/im)||[])[1];
    var status=(block.match(/^Status:\s*([245]\.\d+\.\d+)/im)||[])[1]||'';
    var diagnostic=(block.match(/^Diagnostic-Code:[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/im)||[])[0]||'';
    if(!email||!status)return null;
    var hard=status==='5.1.1'||/550\s+5\.1\.1/.test(diagnostic),blocked=status==='5.4.1'||/550\s+5\.4\.1/.test(diagnostic);
    if(!hard&&!blocked&&status.charAt(0)!=='4')return null;
    return {email:email.toLowerCase(),eventType:status.charAt(0)==='4'?'SOFT_BOUNCE':'BOUNCE',reasonCode:hard?'HARD_BOUNCE':blocked?'BLOCKED':'TEMPORARY',reasonText:diagnostic.slice(0,1000)};
  }).filter(Boolean);
}
function v6AuraIngestDsnMessage_(message) {
  var parsed=v6AuraParseDsn_(message.getRawContent()),queue=v6Rows_('MKT_EMAIL_QUEUE'),count=0;
  var when=v6AuraEmailDate_(message.getDate()),id=message.getId();
  parsed.forEach(function(d){
    var matches=queue.filter(function(q){return String(q.email||'').toLowerCase()===d.email&&q.status==='SENT'&&v6AuraEmailDate_(q.processedAt||q.sentAt)<=when;});
    if(matches.length!==1)return;
    var q=matches[0],eventId='DSN:'+id+':'+q.jobId;
    if(v6Rows_('MKT_EMAIL_EVENTS').some(function(e){return e.eventId===eventId;})){
      // Upgrade previously ingested BLOCKED events once; preserve a manually cleared row.
      if(d.reasonCode==='BLOCKED'&&q.contactId&&!v6Rows_('MKT_EXCLUSIONS').some(function(e){return e.exclusionId==='BLOCKED_DSN:'+q.contactId;}))
        v6UpsertByKey_('MKT_EXCLUSIONS',['exclusionId'],{exclusionId:'BLOCKED_DSN:'+q.contactId,accountId:q.accountId,contactId:q.contactId,status:'ACTIVE',active:true,reasonCode:'BLOCKED',expiresAt:'',updatedAt:when});
      return;
    }
    var event=Object.assign({},d,{eventId:eventId,jobId:q.jobId,campaignId:q.campaignId,accountId:q.accountId,contactId:q.contactId,occurredAt:when,source:'GMAIL_DSN',externalId:id,createdAt:new Date().toISOString()});
    // Apply safety before recording completion: a retry after a partial failure is safe.
    if(d.reasonCode==='HARD_BOUNCE'&&q.contactId){
      v6ClassifyResponseEvent_(event);
      v6UpsertByKey_('MKT_EXCLUSIONS',['exclusionId'],{exclusionId:'HARD_BOUNCE:'+q.contactId,accountId:q.accountId,contactId:q.contactId,status:'ACTIVE',active:true,reasonCode:'HARD_BOUNCE',expiresAt:'',updatedAt:when});
    }
    else if(d.reasonCode==='BLOCKED'){
      if(!q.contactId)throw new Error('BLOCKED_DSN_CONTACT_ID_REQUIRED');
      v6UpsertByKey_('MKT_EXCLUSIONS',['exclusionId'],{exclusionId:'BLOCKED_DSN:'+q.contactId,accountId:q.accountId,contactId:q.contactId,status:'ACTIVE',active:true,reasonCode:'BLOCKED',expiresAt:'',updatedAt:when});
    }
    else if(d.eventType==='SOFT_BOUNCE')v6ClassifyResponseEvent_(event);
    v6UpsertByKey_('MKT_EMAIL_EVENTS',['eventId'],event);count++;
  });return count;
}
function v6AuraIngestGmailDsn_(options) {
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    v6AuraEnsureEmailEvents_();
    v6AuraReconcileEmailEvents_();
    var props=PropertiesService.getScriptProperties(),saved=props.getProperty('AURA_DSN_PROGRESS'),progress=saved?JSON.parse(saved):null;
    if(!progress){var end=Math.floor(Date.now()/1000);progress={start:0,end:end,begin:end-90*86400};props.setProperty('AURA_DSN_PROGRESS',JSON.stringify(progress));}
    var start=progress.start,count=0;
    var query='in:anywhere after:'+progress.begin+' before:'+progress.end+' {subject:"Delivery Status Notification" subject:"Undelivered Mail" from:mailer-daemon}';
    var threads=GmailApp.search(query,start,50);
    threads.forEach(function(t){t.getMessages().forEach(function(m){count+=v6AuraIngestDsnMessage_(m);});});
    var next=threads.length===50?start+50:null;
    if(next===null)props.deleteProperty('AURA_DSN_PROGRESS');
    else {progress.start=next;props.setProperty('AURA_DSN_PROGRESS',JSON.stringify(progress));}
    return {ingested:count,nextStart:next};
  } finally {lock.releaseLock();}
}
