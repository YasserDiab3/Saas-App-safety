const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
// search all schemas
const sql="select n.nspname,p.proname,p.prosrc from pg_proc p join pg_namespace n on p.pronamespace=n.oid where p.proname='api_me'";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
const rows=JSON.parse(d);
if(Array.isArray(rows)&&rows.length>0){
rows.forEach(r=>{
console.log('Schema: '+r.nspname+', Name: '+r.proname);
const src=r.prosrc;
const fields=['org_code','phone_country_code','phone_number','photo_url','full_name','tenant'];
console.log('Fields in prosrc:');
fields.forEach(f=>console.log('  '+f+': '+(src.includes(f)?'✅':'❌')));
});
}else{
console.log('No api_me function found at all!');
console.log('Response:',d.slice(0,500));
}
});
});
req.end();
