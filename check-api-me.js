const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select prosrc from pg_proc where proname='api_me' and pronamespace=(select oid from pg_namespace where nspname='public')";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
const src=rows[0].prosrc;
const checks={org_code:false,phone_country_code:false,phone_number:false,photo_url:false,full_name:false,tenant:false};
Object.keys(checks).forEach(k=>checks[k]=src.includes(k));
console.log('api_me fields:');
Object.entries(checks).forEach(([k,v])=>console.log('  '+k+': '+(v?'✅':'❌')));
console.log('Has latest 0031 migration:',src.includes('photo_url')?'✅':'❌ (missing photo_url)');
}else console.log('No function found');
});
});
req.end();
