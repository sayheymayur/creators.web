Connect using `{{ws_url}}`, then send these frames:

```text
> creator c_list_1
/list music 30
```

Expected response:
- `|creator|list|c_list_1|{"creators":[...],"nextCursor":null}`

Check:
- response command is `list`
- requestId is `c_list_1`
- JSON body contains `creators`
- `nextCursor` is present and may be `null`

Notes:
- The command syntax is `/list [q] [category] [limit] [beforeCursor]`.
- Adjust the sample arguments if your server expects category in a different position.
