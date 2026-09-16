// Canonical ID Bridge audit (read-only).
//
// Diagnosis (confirmed by direct inspection of MarketingV6ContactIngestion.gs before this
// branch): v6IngestAuthoritativeContacts_ only populated salesforceAccountId /
// salesforceContactId when sourceSystem was the exact literal 'SALESFORCE'. Real
// authoritative extracts arrive with externalSystem = 'SALESFORCE_EXPORT', which failed
// that exact-match gate, so externalAccountId/externalContactId were always populated but
// the Salesforce-specific mirror fields never were -- even though the underlying identity
// was already present. Fixed in MarketingV6ContactIngestion.gs (v6ContactIsSalesforceSource_,
// a /SALESFORCE/ substring test on the uppercased source, not a second hardcoded literal).
// This file only reads MKT_ACCOUNTS / MKT_CONTACTS_SECURE and returns safe counts -- no
// accountName, no email, no PII, no per-record detail.
function v6CanonicalIdText_(v){return String(v==null?'':v).trim();}
function v6CanonicalIdCounts_(rows,statusField){
  var counts={RESOLVED:0,UNRESOLVED:0,MISSING:0};
  (rows||[]).forEach(function(r){
    if(!Object.prototype.hasOwnProperty.call(r,statusField)||v6CanonicalIdText_(r[statusField])===''){counts.MISSING++;return;}
    var v=v6CanonicalIdText_(r[statusField]).toUpperCase();
    if(v==='RESOLVED')counts.RESOLVED++;else if(v==='UNRESOLVED')counts.UNRESOLVED++;else counts.MISSING++;
  });
  return counts;
}
function v6AuraAuditCanonicalIds_(){
  var accounts=v6Rows_('MKT_ACCOUNTS'),contacts=v6Rows_('MKT_CONTACTS_SECURE');
  return {
    status:'CANONICAL_ID_AUDIT',
    accounts:Object.assign({total:accounts.length},v6CanonicalIdCounts_(accounts,'canonicalSalesforceIdStatus')),
    contacts:Object.assign({total:contacts.length},v6CanonicalIdCounts_(contacts,'canonicalSalesforceIdStatus')),
    auditedAt:new Date().toISOString()
  };
}
