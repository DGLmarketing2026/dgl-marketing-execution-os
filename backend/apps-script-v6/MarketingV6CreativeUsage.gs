function v6CreativeUsage_(payload){return {usage:v6Rows_('MKT_CREATIVE_USAGE').filter(function(x){return !payload.assetId||String(x.assetId)===String(payload.assetId);})};}
function v6RecordCreativeUsage_(payload){return v6Append_('MKT_CREATIVE_USAGE',payload);}
