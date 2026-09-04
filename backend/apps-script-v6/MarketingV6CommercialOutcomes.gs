var MKT_V6_COMMERCIAL_OUTCOMES_REPORT='LOADS_ORIGEN_LQ';

function v6ResolveCommercialAccountId_(accountName,accounts){
  var key=v6NormAccount_(accountName),matches=(accounts||[]).filter(function(a){
    return v6NormAccount_(a.accountName)===key&&(v6Text_(a.salesforceAccountId)||v6Text_(a.externalAccountId));
  });
  return matches.length===1?v6Text_(matches[0].accountId):'';
}

function v6IngestCommercialOutcomes_(){
  var rows=v6ReportRows_(MKT_V6_COMMERCIAL_OUTCOMES_REPORT),accounts=v6Rows_('MKT_ACCOUNTS');
  var rowsProcessed=0,resolved=0,unresolvedCount=0,ambiguousCount=0;
  rows.forEach(function(row){
    rowsProcessed++;
    var accountId=v6ResolveCommercialAccountId_(row.Cliente,accounts);
    if(!accountId){unresolvedCount++;return;}
    resolved++;
    var pipelineRows=v6Rows_('MKT_ACCOUNT_PIPELINE').filter(function(r){return String(r.accountId||'')===accountId;}),old=pipelineRows[0]||{};
    var ambiguous=!!v6Text_(old.campaignId)&&v6PipelineAdvanced_(old.currentStage);
    var payload={accountId:accountId,loadId:v6Text_(row.Load),loadAt:v6IsoDate_(row['Fecha load']),attributedRevenue:Number(row.Monto||0)};
    if(ambiguous){
      ambiguousCount++;
      payload.nextAction='MULTI-CAMPAIGN CONCURRENCY — ATTRIBUTION AMBIGUOUS';
    }
    v6PipelineTransition_(payload);
  });
  return {status:'COMMERCIAL_OUTCOMES_INGESTED',rowsProcessed:rowsProcessed,resolved:resolved,unresolvedCount:unresolvedCount,ambiguousCount:ambiguousCount};
}
