const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const ingestionSource=src('MarketingV6ReportIngestion.gs');
const contactSource=src('MarketingV6ContactIngestion.gs');
const canonicalSource=src('MarketingV6CanonicalIdentity.gs');
const routerSource=src('MarketingV6RouterExtension.gs');

function fakeUtilities(){
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;}
  };
}
function makeContext(tables){
  tables=tables||{MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[]};
  var ctx={Utilities:fakeUtilities(),Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp};
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  vm.runInContext(contactSource,ctx,{filename:'MarketingV6ContactIngestion.gs'});
  vm.runInContext(canonicalSource,ctx,{filename:'MarketingV6CanonicalIdentity.gs'});
  ctx.v6RequireContactRecipientHeaders_=function(){return true;};
  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
  ctx.__tables=tables;
  return ctx;
}

// 1. Real-world bug reproduction: externalSystem='SALESFORCE_EXPORT' (not the bare literal
// 'SALESFORCE') with externalAccountId populated must still resolve salesforceAccountId,
// and canonicalSalesforceIdStatus must read RESOLVED.
(function accountResolvedTest(){
  var tables={MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[]};
  var ctx=makeContext(tables);
  var result=ctx.v6IngestAuthoritativeContacts_({
    sourceSystem:'SALESFORCE_EXPORT',
    accounts:[{externalAccountId:'SF-ACC-9',accountName:'Acme Freight',amOwner:'Jane'}],
    contacts:[]
  });
  assert.equal(result.accountsUpserted,1);
  var row=tables.MKT_ACCOUNTS[0];
  assert.equal(row.salesforceAccountId,'SF-ACC-9','SALESFORCE_EXPORT must populate salesforceAccountId, not just externalAccountId');
  assert.equal(row.externalAccountId,'SF-ACC-9');
  assert.equal(row.canonicalSalesforceIdStatus,'RESOLVED');
  console.log('canonical identity test 1 (SALESFORCE_EXPORT account resolves salesforceAccountId): PASS');
})();

// 2. Account with no externalAccountId at all -> UNRESOLVED (never fabricated)
(function accountUnresolvedTest(){
  var tables={MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[]};
  var ctx=makeContext(tables);
  ctx.v6IngestAuthoritativeContacts_({
    sourceSystem:'SALESFORCE_EXPORT',
    accounts:[{accountName:'No External Id Co'}],
    contacts:[]
  });
  var row=tables.MKT_ACCOUNTS[0];
  assert.equal(row.salesforceAccountId,'');
  assert.equal(row.canonicalSalesforceIdStatus,'UNRESOLVED');
  console.log('canonical identity test 2 (missing externalAccountId stays UNRESOLVED): PASS');
})();

// 3. Same bug/fix for contacts: salesforceContactId + canonicalSalesforceIdStatus
(function contactResolvedTest(){
  var tables={MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[]};
  var ctx=makeContext(tables);
  ctx.v6IngestAuthoritativeContacts_({
    sourceSystem:'SALESFORCE_EXPORT',
    accounts:[{externalAccountId:'SF-ACC-1',accountName:'Acme Freight'}],
    contacts:[{externalAccountId:'SF-ACC-1',externalContactId:'SF-CON-1',email:'valid@example.invalid'}]
  });
  var contactRow=tables.MKT_CONTACTS_SECURE[0];
  assert.equal(contactRow.salesforceContactId,'SF-CON-1');
  assert.equal(contactRow.canonicalSalesforceIdStatus,'RESOLVED');
  console.log('canonical identity test 3 (SALESFORCE_EXPORT contact resolves salesforceContactId): PASS');
})();

// 4. Contact with no externalContactId -> UNRESOLVED
(function contactUnresolvedTest(){
  var tables={MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[]};
  var ctx=makeContext(tables);
  ctx.v6IngestAuthoritativeContacts_({
    sourceSystem:'SALESFORCE_EXPORT',
    accounts:[{externalAccountId:'SF-ACC-2',accountName:'No Contact Id Co'}],
    contacts:[{externalAccountId:'SF-ACC-2',contactId:'CON-MANUAL',email:'x@example.invalid'}]
  });
  var contactRow=tables.MKT_CONTACTS_SECURE[0];
  assert.equal(contactRow.salesforceContactId,'');
  assert.equal(contactRow.canonicalSalesforceIdStatus,'UNRESOLVED');
  console.log('canonical identity test 4 (missing externalContactId stays UNRESOLVED): PASS');
})();

// 5. Non-Salesforce source never populates the Salesforce mirror fields (regression: the
// robust /SALESFORCE/ match must not become "match anything")
(function nonSalesforceSourceTest(){
  var tables={MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[]};
  var ctx=makeContext(tables);
  ctx.v6IngestAuthoritativeContacts_({
    sourceSystem:'MANUAL_UPLOAD',
    accounts:[{externalAccountId:'EXT-1',accountName:'Manual Co'}],
    contacts:[]
  });
  var row=tables.MKT_ACCOUNTS[0];
  assert.equal(row.salesforceAccountId,'','non-Salesforce source must not populate salesforceAccountId');
  assert.equal(row.canonicalSalesforceIdStatus,'UNRESOLVED');
  console.log('canonical identity test 5 (non-Salesforce source stays UNRESOLVED, no false positive match): PASS');
})();

// 6. v6AuraAuditCanonicalIds_ returns safe aggregate counts only, no PII
(function auditTest(){
  var tables={
    MKT_ACCOUNTS:[
      {accountId:'ACC-1',accountName:'A',canonicalSalesforceIdStatus:'RESOLVED'},
      {accountId:'ACC-2',accountName:'B',canonicalSalesforceIdStatus:'UNRESOLVED'},
      {accountId:'ACC-3',accountName:'C'}
    ],
    MKT_CONTACTS_SECURE:[
      {contactId:'CON-1',email:'x@example.invalid',canonicalSalesforceIdStatus:'RESOLVED'}
    ]
  };
  var ctx=makeContext(tables);
  var audit=ctx.v6AuraAuditCanonicalIds_();
  assert.equal(audit.accounts.total,3);
  assert.equal(audit.accounts.RESOLVED,1);
  assert.equal(audit.accounts.UNRESOLVED,1);
  assert.equal(audit.accounts.MISSING,1,'a record with no canonicalSalesforceIdStatus field at all counts as MISSING, not UNRESOLVED');
  assert.equal(audit.contacts.total,1);
  assert.equal(audit.contacts.RESOLVED,1);
  assert(!JSON.stringify(audit).includes('example.invalid'),'audit must never leak PII');
  assert(!JSON.stringify(audit).includes('accountName'));
  console.log('canonical identity test 6 (audit safe aggregates, MISSING vs UNRESOLVED distinction): PASS');
})();

assert(routerSource.includes('v6AuraAuditCanonicalIds:v6AuraAuditCanonicalIds_'),'router must expose v6AuraAuditCanonicalIds');
console.log('V6 canonical identity bridge: ALL PASS');
