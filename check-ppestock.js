const https=require('https'),fs=require('fs');
const token=fs.readFileSync('.env','utf8').match(/SUPABASE_ACCESS_TOKEN=(.+)/)[1];
const sql="select count(*)::int as cnt, coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) as sample from (select id, data->>'itemCode' as code, data->>'itemName' as name from app.records where sheet='PPEStock' limit 3) r";
const body=JSON.stringify({query:sql});
const opts={hostname:'api.supabase.com',path:'/v1/projects/tbkajjarkqhsdiabufjv/database/query',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
const req=https.request(opts,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{console.log(d);});});
req.write(body);req.end();
