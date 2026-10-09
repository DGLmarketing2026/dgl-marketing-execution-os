// Offline service adapter for legacy business-rule tests. Atomic failure/recovery has its own test.
module.exports=function(ctx){
 ctx.PropertiesService=ctx.PropertiesService||{getScriptProperties:()=>({getProperty:()=>null})};
 ctx.Utilities.getUuid=()=> 'synthetic-uuid';
 ctx.LockService={getDocumentLock:()=>({hasLock:()=>false,tryLock:()=>true,releaseLock(){}})};
 const original=ctx.v6Sheet_;
 ctx.v6Sheet_=function(name){const s=original(name);if(!s)return s;s.getSheetId=()=>1;s.getMaxRows=()=>10000;s.getParent=()=>({getId:()=> 'SYNTHETIC_ONLY'});return s;};
 ctx.Sheets={Spreadsheets:{batchUpdate(body,id){
   if(id!=='SYNTHETIC_ONLY')throw Error('production ID rejected');
   const update=body.requests.find(r=>r.updateCells).updateCells;
   const values=update.rows.slice(1).map(row=>row.values.map(c=>Object.values(c.userEnteredValue)[0]));
   const s=ctx.v6Sheet_('MKT_OPPORTUNITIES');
   if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).clearContent();
   if(values.length)s.getRange(2,1,values.length,values[0].length).setValues(values);
   return {replies:[{duplicateSheet:{properties:{sheetId:2}}}]};
 }}};
};
