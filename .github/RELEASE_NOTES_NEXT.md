### ⚠️ Breaking changes

**Completion now requires the token issued at presign.**

A completion names its own key. Tolerating an absent token meant anyone who
could reach the endpoint could assert that an arbitrary object had been
uploaded — firing `onComplete` for a key they never touched — and on any route
without middleware the same request was answered with a working presigned GET
URL for that key.

The current client already sends the token, so a matched client and server need
no change. A deployment still serving clients older than 0.7.0 can opt out per
route, and those clients can then complete but still receive no presigned
download URL:

```ts
upload.image().requireCompletionToken(false)   // TypeScript
```
```go
pushduck.AllowUntokenedCompletion()            // Go
```
```python
Route(schema=image(), require_completion_token=False)   # Python
```

**`.paths()` and `.expiresIn()` no longer mutate the route.**

They return a new route, so a discarded return value silently loses the
setting. There is no error and no warning:

```ts
const route = upload.image().maxSize("5MB");
route.paths({ prefix: "avatars" });   // ← discarded; the prefix is lost
createRouter({ avatar: route });
```

Reassign, or chain in one expression:

```ts
const route = upload.image().maxSize("5MB").paths({ prefix: "avatars" });
```

### 🔐 Security

- **Completion was an unauthenticated read oracle (TypeScript).** On a route
  with no middleware, `POST ?action=complete` with any `key` returned a signed
  GET URL for that object. Fixed by requiring the completion token by default,
  and by issuing the download signature only against proof that the caller
  presigned the key — so the compatibility opt-out above cannot reopen it.
  Go and Python returned unsigned URLs and were never exposed to the read
  oracle, but their completion hooks were reachable the same way and are fixed
  by the same default.
