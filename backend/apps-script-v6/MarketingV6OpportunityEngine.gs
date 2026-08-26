var MKT_V6_DATA_HUB_ID='1FXpoBO658ldbr4V8wCKo0luHU3_kqHwYzAnWijA6lBM';
function v6Sheet_(name){return SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).getSheetByName(name);}
function v6Rows_(name){var s=v6Sheet_(name),v=s?s.getDataRange().getValues():[];if(v.length<2)return [];var h=v.shift();return v.map(function(r){var o={};h.forEach(function(k,i){o[k]=r[i];});return o;});}
function v6Opportunities_(payload){return {opportunities:v6Rows_('MKT_OPPORTUNITIES'),source:'DGL_MARKETING_DATA_HUB'};}
function v6OpportunitySummary_(){var rows=v6Rows_('MKT_OPPORTUNITIES');return {total:rows.length,lastEngineRun:new Date().toISOString()};}
function v6RunOpportunityEngine_(){return {status:'ENGINE_RUN_REQUIRES_SOURCE_REPORT_ADAPTER',opportunities:v6Rows_('MKT_OPPORTUNITIES')};}
