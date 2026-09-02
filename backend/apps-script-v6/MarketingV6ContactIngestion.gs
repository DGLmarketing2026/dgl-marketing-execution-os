function v6ContactText_(value){return String(value==null?'':value).trim();}
function v6ContactBool_(value){var x=v6ContactText_(value).toUpperCase();return value===true||x==='TRUE'||x==='YES'||x==='SI'||x==='SÍ'||x==='1'||x==='Y';}
function v6ContactEmail_(value){return v6ContactText_(value).toLowerCase();}
function v6ContactEmailValid_(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v6ContactEmail_(value));}
function v6ContactHash_(value){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,String(value||''),Utilities.Charset.UTF_8);
  return bytes.map(function(b){var n=(b<0?b+256:b).toString(16);return n.length===1?'0'+n:n;}).join('').substring(0,12).toUpperCase();
}
function v6ContactAccountKey_(value){return v6ContactText_(value).toLowerCase().replace(/\s+/g,' ');}
function v6ContactRowsSafe_(name){try{return v6Rows_(name);}catch(_){return [];}}
function v6ContactExisting_(rows,fields,record){return (rows||[]).filter(function(row){return fields.every(function(field){return v6ContactText_(row[field])===v6ContactText_(record[field]);});})[0]||null;}
function v6ContactAccountId_(record,accounts){
  var source=v6ContactText_(record.externalSystem||record.sourceSystem||'SALESFORCE').toUpperCase(),external=v6ContactText_(record.externalAccountId||record.salesforceAccountId);
  var found=(accounts||[]).filter(function(row){return v6ContactText_(row.externalSystem).toUpperCase()===source&&v6ContactText_(row.externalAccountId||row.salesforceAccountId)===external;})[0];
  if(external&&found&&found.accountId)return v6ContactText_(found.accountId);
  var supplied=v6ContactText_(record.accountId);if(supplied)return supplied;
  var name=v6ContactAccountKey_(record.accountName);if(name)return 'ACC-'+v6ContactHash_(name);
  throw new Error('ACCOUNT IDENTITY REQUIRED');
}
function v6ContactId_(record,accountId){
  var supplied=v6ContactText_(record.contactId);if(supplied)return supplied;
  var external=v6ContactText_(record.externalContactId||record.salesforceContactId);if(!external)throw new Error('CONTACT IDENTITY REQUIRED');
  return 'CON-'+v6ContactHash_([v6ContactText_(record.externalSystem||record.sourceSystem||'SALESFORCE').toUpperCase(),external,accountId].join('|'));
}
function v6IngestAuthoritativeContacts_(payload){
  var p=payload||{},source=v6ContactText_(p.sourceSystem||'SALESFORCE').toUpperCase(),accounts=Array.isArray(p.accounts)?p.accounts:[],contacts=Array.isArray(p.contacts)?p.contacts:[],now=new Date().toISOString();
  if(!source)throw new Error('AUTHORIZED SOURCE REQUIRED');
  v6RequireContactRecipientHeaders_('MKT_ACCOUNTS');v6RequireContactRecipientHeaders_('MKT_CONTACTS_SECURE');
  var accountRows=v6ContactRowsSafe_('MKT_ACCOUNTS'),accountMap={},metrics={sourceSystem:source,accountsReceived:accounts.length,accountsUpserted:0,contactsReceived:contacts.length,contactsUpserted:0,contactsWithoutEmail:0,contactsInvalidEmail:0,contactsDoNotContact:0,rejected:0,syncedAt:now};
  accounts.forEach(function(input){
    try{
      var raw=Object.assign({},input||{},{sourceSystem:source}),accountId=v6ContactAccountId_(raw,accountRows),old=v6ContactExisting_(accountRows,['accountId'],{accountId:accountId})||{},external=v6ContactText_(raw.externalAccountId||raw.salesforceAccountId),owner=v6ContactText_(raw.amOwner||raw.accountManager||old.amOwner||old.accountManager),record=Object.assign({},old,{accountId:accountId,externalSystem:source,externalAccountId:external||v6ContactText_(old.externalAccountId),salesforceAccountId:source==='SALESFORCE'?(external||v6ContactText_(old.salesforceAccountId)):v6ContactText_(old.salesforceAccountId),accountName:v6ContactText_(raw.accountName||old.accountName),amOwner:owner,status:v6ContactText_(raw.status||old.status||'ACTIVE').toUpperCase(),sourceUpdatedAt:v6ContactText_(raw.sourceUpdatedAt||old.sourceUpdatedAt),createdAt:v6ContactText_(old.createdAt||now),updatedAt:now});
      v6UpsertByKey_('MKT_ACCOUNTS',['accountId'],record);accountRows=accountRows.filter(function(x){return v6ContactText_(x.accountId)!==accountId;});accountRows.push(record);if(external)accountMap[source+'|'+external]=accountId;metrics.accountsUpserted++;
    }catch(_){metrics.rejected++;}
  });
  contacts.forEach(function(input){
    try{
      var raw=Object.assign({},input||{},{sourceSystem:source}),externalAccount=v6ContactText_(raw.externalAccountId||raw.salesforceAccountId),accountId=accountMap[source+'|'+externalAccount]||v6ContactAccountId_(raw,accountRows),contactId=v6ContactId_(raw,accountId),existing=v6ContactExisting_(v6ContactRowsSafe_('MKT_CONTACTS_SECURE'),['contactId'],{contactId:contactId})||{},email=v6ContactEmail_(Object.prototype.hasOwnProperty.call(raw,'email')?raw.email:existing.email),valid=!!email&&v6ContactEmailValid_(email),dnc=raw.doNotContact!=null||raw.dnc!=null?v6ContactBool_(raw.doNotContact||raw.dnc):v6ContactBool_(existing.doNotContact||existing.dnc),externalContact=v6ContactText_(raw.externalContactId||raw.salesforceContactId),record=Object.assign({},existing,{contactId:contactId,accountId:accountId,externalSystem:source,externalContactId:externalContact||v6ContactText_(existing.externalContactId),salesforceContactId:source==='SALESFORCE'?(externalContact||v6ContactText_(existing.salesforceContactId)):v6ContactText_(existing.salesforceContactId),email:email,emailStatus:!email?'MISSING':valid?'VALID':'INVALID',doNotContact:dnc,status:v6ContactText_(raw.status||existing.status||'ACTIVE').toUpperCase(),sourceUpdatedAt:v6ContactText_(raw.sourceUpdatedAt||existing.sourceUpdatedAt),createdAt:v6ContactText_(existing.createdAt||now),updatedAt:now});
      v6UpsertByKey_('MKT_CONTACTS_SECURE',['contactId'],record);metrics.contactsUpserted++;if(!email)metrics.contactsWithoutEmail++;else if(!valid)metrics.contactsInvalidEmail++;if(dnc)metrics.contactsDoNotContact++;
    }catch(_){metrics.rejected++;}
  });
  return metrics;
}
