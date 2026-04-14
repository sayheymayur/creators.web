Connect using `{{ws_url}}?token={{token}}`, then send these frames:

```text
> creator c_upsert_1
/upsertprofile jane_doe Jane Doe Hello from WS
```

Expected response:
- `|creator|upsertprofile|c_upsert_1|{"creator":{...}}`

Check:
- response command is `upsertprofile`
- requestId is `c_upsert_1`
- JSON body contains `creator`
- `username` is stored lowercased and sanitized to `[a-z0-9_]`
- `name` matches the submitted display name
- `bio` contains the trailing text joined with spaces

Notes:
- This command requires authentication.
- Replace the sample username, name, and bio with values suitable for your test account if needed.
