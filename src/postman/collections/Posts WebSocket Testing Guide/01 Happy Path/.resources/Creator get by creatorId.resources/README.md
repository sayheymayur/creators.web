Connect using `{{ws_url}}`, then send these frames:

```text
> creator c_get_1
/get {{creator_id}}
```

Expected response:
- `|creator|get|c_get_1|{"creator":{...}}`

Check:
- response command is `get`
- requestId is `c_get_1`
- JSON body contains `creator`
- the returned creator matches `{{creator_id}}`

If the creator does not exist, use the dedicated not-found request in the auth and validation folder.
