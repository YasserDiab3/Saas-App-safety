const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select prosrc from pg_proc where proname='create_tenant_for_current_user' and pronamespace=(select oid from pg_namespace where nspname='app')";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
const src=rows[0].prosrc;
const checks=['is_consumer_email_domain','phone_country_code','phone_number','terms_version','org_code','generate_org_code','audit_log'];
console.log('create_tenant_for_current_user:');
checks.forEach(f=>console.log('  '+f+': '+(src.includes(f)?'✅':'❌')));
if(src.includes('is_consumer_email_domain')) console.log('Work email enforcement: ✅');
else console.log('Work email enforcement: ❌ MISSING');
}else console.log('No function found');
});
});
req.write(body);
req.end();
