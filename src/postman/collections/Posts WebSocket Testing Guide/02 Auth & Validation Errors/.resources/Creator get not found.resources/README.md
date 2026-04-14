Connect using `{{ws_url}}`, then send these frames:

```text
> creator c_get_missing_1
/get 999999999
```

Expected response:
- either `|creator|get|c_get_missing_1|{"creator":null}` when missing creators resolve to null
- or `|creator|error|c_get_missing_1|<message>` when missing creators are treated as an error

Check:
- requestId is `c_get_missing_1`
- the response clearly indicates that the creator does not exist

Notes:
- Replace `999999999` if your system uses a different obviously-missing ID pattern.
