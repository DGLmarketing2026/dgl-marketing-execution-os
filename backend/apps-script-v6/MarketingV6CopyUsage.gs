function v6Append_(name,record){var s=v6Sheet_(name),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];s.appendRow(h.map(function(k){return record[k]==null?'':record[k];}));return {status:'RECORDED'};}
function v6CopyUsage_(payload){return {usage:v6Rows_('MKT_COPY_USAGE').filter(function(x){return !payload.accountId||String(x.accountId)===String(payload.accountId);})};}
function v6RecordCopyUsage_(payload){return v6Append_('MKT_COPY_USAGE',payload);}
