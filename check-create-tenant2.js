const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select length(prosrc) as len, left(prosrc,1000) as start, right(prosrc,400) as end from pg_proc where proname='create_tenant_for_current_user' and pronamespace=(select oid from pg_namespace where nspname='app')";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
const r=rows[0];
console.log('Length:',r.len);
console.log('START:',r.start.slice(0,600));
console.log('---');
console.log('END:',r.end);
}else console.log('No function');
});
});
req.write(body);
req.end();
