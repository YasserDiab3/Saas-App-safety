const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
// simple query, no single quotes
const sql='select 1 as ok';
const body=JSON.stringify({query:sql});
console.log('Body:',body);
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>console.log(res.statusCode,JSON.stringify(d)));
});
req.write(body);
req.end();
