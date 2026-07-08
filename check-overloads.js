const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select p.proname,p.pronargs,p.proargnames::text,p.prosrc from pg_proc p join pg_namespace n on p.pronamespace=n.oid where p.proname='create_tenant_for_current_user' and n.nspname='app'";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
console.log('Found '+rows.length+' overload(s):');
rows.forEach((r,i)=>console.log(i+': pronargs='+r.pronargs+', argnames='+r.proargnames));
}else console.log('No function found');
});
});
req.write(body);
req.end();
