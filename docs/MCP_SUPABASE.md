# Supabase MCP — إعداد Cursor

يربط Cursor مباشرة بمشروع Supabase `tbkajjarkqhsdiabufjv` لتنفيذ SQL، فحص الجداول، الهجرات، والـ Edge Functions من المحادثة.

## التفعيل (مرة واحدة)

1. الملف جاهز في المشروع: `.cursor/mcp.json`
2. أعد تشغيل **Cursor** (أو Reload Window)
3. **Settings → Cursor Settings → Tools & MCP**
4. يجب أن يظهر **supabase** — اضغط **Connect** / **Login**
5. سجّل دخول Supabase واختر المنظمة التي فيها مشروع **SaaS App**
6. وافق على الصلاحيات

## التحقق

اسأل في المحادثة:

> What tables exist in the app schema? Use Supabase MCP.

أو:

> List migrations on project tbkajjarkqhsdiabufjv

## الأمان

| الإعداد | القيمة في المشروع |
|---------|-------------------|
| `project_ref` | `tbkajjarkqhsdiabufjv` فقط (لا وصول لمشاريع أخرى) |
| `features` | database, debugging, development, docs, functions |
| `read_only` | **غير مفعّل** — لتمكين `apply_migration` و `execute_sql` |

للقراءة فقط أضف `&read_only=true` إلى الـ URL في `.cursor/mcp.json`.

## بديل: Personal Access Token (CI)

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=tbkajjarkqhsdiabufjv",
      "headers": {
        "Authorization": "Bearer YOUR_PAT"
      }
    }
  }
}
```

أنشئ PAT من: https://supabase.com/dashboard/account/tokens

## Windows + npx (بديل قديم)

```json
{
  "mcpServers": {
    "supabase": {
      "command": "cmd",
      "args": [
        "/c", "npx", "-y", "@supabase/mcp-server-supabase@latest",
        "--project-ref", "tbkajjarkqhsdiabufjv"
      ]
    }
  }
}
```

## المراجع

- https://supabase.com/docs/guides/getting-started/mcp
