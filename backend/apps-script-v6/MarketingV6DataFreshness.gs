// AURA Retention data-freshness gate.
//
// Investigated first (per docs/README_INSTALL_V6.md, DGL_MARKETING_OS_CANONICAL_STATE.md,
// AUDIT_FINDINGS_2026-09-02.md, confirmed by direct inspection): there is no documented or
// implemented automated cadence anywhere in this codebase that refreshes the upstream
// report source spreadsheet itself (MKT_V6_REPORT_SOURCE_ID / the real 'DGL_REPORT_SOURCE_V6')
// from Salesforce/NOVA. The only existing cadence is v6InstallOpportunityRefreshTrigger_'s
// six-hour trigger, which reads that source snapshot to rebuild MKT_OPPORTUNITIES -- it does
// not, and cannot, refresh the source itself. AUDIT_FINDINGS_2026-09-02.md explicitly names
// this as an open gap ("the opportunity layer is consuming an August snapshot rather than an
// automatically refreshed upstream source").
//
// Since no separate freshness threshold is documented anywhere for the source itself, this
// gate reuses the exact same six-hour constant as the trigger that consumes it (not a new,
// invented number): the source should be at least as fresh as the cycle that depends on it.
//
// What remains an external gap this code cannot invent: an automated Salesforce/NOVA ->
// MKT_V6_REPORT_SOURCE_ID refresh (typically a scheduled Salesforce Data Export, a Flow, or
// an ETL connector) -- see docs/AURA_DEPLOYMENT.md.
var MKT_V6_REPORT_FRESHNESS_STALE_THRESHOLD_HOURS=6;

function v6AuraCheckReportFreshness_(){
  var file=DriveApp.getFileById(MKT_V6_REPORT_SOURCE_ID),lastUpdated=file.getLastUpdated(),now=new Date();
  var hoursSinceLastUpdate=(now.getTime()-lastUpdated.getTime())/3600000;
  var stale=hoursSinceLastUpdate>MKT_V6_REPORT_FRESHNESS_STALE_THRESHOLD_HOURS;
  return {
    status:stale?'STALE':'FRESH',
    hoursSinceLastUpdate:hoursSinceLastUpdate,
    staleThresholdHours:MKT_V6_REPORT_FRESHNESS_STALE_THRESHOLD_HOURS,
    lastUpdatedIso:lastUpdated.toISOString()
  };
}
