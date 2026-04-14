Connect using `{{ws_url}}` without a token, then send these frames:

```text
> creator c_upsert_err_1
/upsertprofile jane_doe Jane Doe Should fail without auth
```

Expected response:
- `|creator|error|c_upsert_err_1|<message>`

Check:
- response command is `error`
- requestId is `c_upsert_err_1`
- the error message indicates authentication is required

Notes:
- This validates that `/upsertprofile` is restricted to authenticated users.
