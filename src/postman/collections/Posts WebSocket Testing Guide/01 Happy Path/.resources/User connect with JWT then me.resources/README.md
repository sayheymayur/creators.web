Connect using the request URL with `?token={{token}}`, then send these frames:

```text
> user req2
/me
```

Expected response:
- `|user|me|req2|{"id":...,"email":...,"display_name":...,"role":...,"created_at":...}`

Use this when the server accepts JWT on initial connection and binds the user immediately.
