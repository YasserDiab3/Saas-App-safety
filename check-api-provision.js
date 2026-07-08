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
if(Array.isArray(rows)&&rows.length>0){
const src=rows[0].prosrc;
console.log('Params:', src.match(/p_phone_country/) ? 'has phone params' : 'NO phone params');
console.log('Has terms_version:', src.includes('terms_version'));
console.log('Has org_code:', src.includes('org_code'));
console.log('Returns org_code:', src.includes('org_code') ? '✅' : '❌');
}else console.log('No api_provision_tenant found');
});
});
req.write(body);
req.end();
