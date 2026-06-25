-- Reset legacy help center global store so clients load expanded defaults from frontend
-- (until platform admin saves custom content again).

delete from app.help_center_global
 where id = 'default'
   and (
     coalesce(jsonb_array_length(data->'sections'), 0) < 20
     or not exists (
       select 1
         from jsonb_array_elements(coalesce(data->'sections', '[]'::jsonb)) el
        where el->>'id' = 'terms-of-use'
     )
   );
