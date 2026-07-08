const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select n.nspname,p.proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where p.proname='api_me'";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
console.log('Status:',res.statusCode);
if(res.statusCode===200||res.statusCode===201){
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
rows.forEach(r=>console.log('Schema:',r.nspname,'Name:',r.proname));
}else console.log('No api_me found');
}else console.log('Error:',d);
});
});
req.write(body);
req.end();
