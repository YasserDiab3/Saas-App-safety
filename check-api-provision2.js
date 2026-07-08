const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select prosrc from pg_proc where proname='api_provision_tenant' and pronamespace=(select oid from pg_namespace where nspname='public')";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){console.log(rows[0].prosrc);}
else console.log('No function found');
});
});
req.write(body);
req.end();
