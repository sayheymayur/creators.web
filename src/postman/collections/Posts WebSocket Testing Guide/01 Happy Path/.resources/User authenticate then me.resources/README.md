Select the `Messages` tab after connecting and send these frames in order:

```text
> user req1
/authenticate {{token}}
> user req2
/me
```

Expected responses:
- `|user|authenticate|req1|{"ok":true,"user_id":<numeric id>}`
- `|user|me|req2|{"id":...,"email":...,"display_name":...,"role":...,"created_at":...}`

Use this when you want to upgrade a guest connection on the same socket before reading the current user profile.
