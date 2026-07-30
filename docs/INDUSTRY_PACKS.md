# Industry packs — HSEHub 360

Starter datasets tagged `_demo=true` and `_pack=<id>` so they can be wiped with demo cleanup.

| Pack id | Title | Contents |
|---------|-------|----------|
| `construction` | Construction | Compliance checklists (scaffold/excavation/WAH), sample Incident, PTW, Observation |
| `oil_gas` | Oil & Gas | H2S/LOTO/PTW checklists, Incident, NearMiss, PTW, Training |

## Inject from Settings

Backup → Industry packs → choose pack → Inject.

Uses the same `api_upsert_demo_rows` path as the generic demo pack.

## Not included

Full regulatory libraries (OSHA manuals, country law packs) or automatic site templates per country.
