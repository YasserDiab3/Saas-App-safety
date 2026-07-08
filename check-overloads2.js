const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
// Get prosrc from the 4-param overload
const sql="select p.prosrc from pg_proc p join pg_namespace n on p.pronamespace=n.oid where p.proname='create_tenant_for_current_user' and n.nspname='app' and p.pronargs=4";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
const src=rows[0].prosrc;
const checks=['is_consumer_email_domain','phone_country_code','phone_number','terms_version','org_code','generate_org_code','v_trial.*14'];
console.log('4-param overload fields:');
checks.forEach(f=>console.log('  '+f+': '+(src.includes(f.replace('.*14',''))||new RegExp(f).test(src)?'✅':'❌')));
console.log('v_trial days:',src.includes('14')?'14':'OLD');
console.log('Has phone update:',src.includes('phone_country_code')&&src.includes('phone_number')?'✅':'❌');
console.log('Has work email check:',src.includes('is_consumer_email_domain')?'✅':'❌');
}else console.log('No 4-param function found');
});
});
req.write(body);
req.end();
