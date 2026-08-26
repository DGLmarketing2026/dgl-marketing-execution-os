function v6AccountPipeline_(){return {records:v6Rows_('MKT_ACCOUNT_PIPELINE')};}
function v6PipelineSummary_(){var r=v6Rows_('MKT_ACCOUNT_PIPELINE'),s={};r.forEach(function(x){s[x.stage]=(s[x.stage]||0)+1;});return {total:r.length,byStage:s};}
