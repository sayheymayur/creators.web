Connect without a token, then send:

```text
> user err1
/me
```

Expected error format:
- `|user|error|err1|<auth required message>`

This verifies that `/me` is protected and cannot be called as a guest.
