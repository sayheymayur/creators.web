Connect without a token, then send:

```text
> user err2
/authenticate
```

Expected error format:
- `|user|error|err2|<validation/auth message>`

This verifies validation coverage for a missing JWT argument on `/authenticate`.
