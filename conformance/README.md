# pushduck conformance suite

A language-neutral test suite for pushduck **server** implementations.

The wire protocol is specified in prose at
[`docs/content/docs/protocol.mdx`](../docs/content/docs/protocol.mdx). Prose is
necessary and not sufficient: the specification says that a file failing
validation is reported *per file* as a `200` with `results[].success: false`,
not as a `4xx` for the whole request — and while writing the Bun test suite the
author of this repository read that rule, implemented the assertion backwards,
and only discovered it because the reference server disagreed.

Someone implementing this in Go or Python from the same prose would make the
same mistake, and nothing would tell them. That is what this suite is for.

## What it is

A directory of JSON fixtures and a runner that points at a base URL. Fixtures
describe a request and the shape of an acceptable response. They contain no
language-specific constructs, so a Go or Python implementation can run the same
files through its own runner if it prefers not to depend on Node.

```
conformance/
  fixtures/*.json   the cases
  runner/           a reference runner (TypeScript)
  README.md
```

## Running it against a server

```bash
pnpm conformance --url http://localhost:3000/api/upload
```

The suite exercises the routes below, so an implementation under test must
expose them. This is deliberately part of the contract: without a fixed route
surface, no fixture could assert anything about validation.

| Route          | Constraint                            |
| -------------- | ------------------------------------- |
| `imageUpload`  | images only, max 5 MB                 |
| `fileUpload`   | any type, max 50 MB                   |
| `privateUpload`| any type, max 5 MB, requires auth     |

`privateUpload` must reject a request without `Authorization` with a `401`
`UNAUTHORIZED` problem document, and accept `Authorization: Bearer conformance-token`.

## Why responses are matched by shape

A presigned URL contains a signature, a timestamp and a credential scope. A key
contains whatever the implementation's key generator produced. None of that can
be compared by equality across implementations, and requiring it to match would
specify things the protocol deliberately leaves open.

So `expect.body` is a *pattern*. Plain values must match exactly; objects and
arrays are matched recursively; and these matchers describe the rest:

| Matcher                     | Passes when                                  |
| --------------------------- | -------------------------------------------- |
| `{"$type": "string"}`       | the value has that JSON type                 |
| `{"$contains": "X-Amz-"}`   | a string contains that substring             |
| `{"$matches": "^https://"}` | a string matches that regular expression     |
| `{"$absent": true}`         | the key is missing or `null`                 |
| `{"$any": true}`            | the key is present with any value            |

Unlisted response keys are ignored, so an implementation may return additional
fields — that is what makes the protocol extensible without breaking this suite.

## Adding a case

Every bug found in any implementation should become a fixture here. That is the
point: a defect found once in TypeScript is then impossible to ship in Go.

Fixtures are ordinary JSON, so adding one requires no code:

```json
{
  "name": "rejects an unknown route with 404",
  "spec": "Endpoint and dispatch",
  "request": { "method": "POST", "query": { "route": "noSuchRoute" }, "body": { "files": [] } },
  "expect": { "status": 404, "body": { "code": "NOT_FOUND" } }
}
```

`spec` names the section of `protocol.mdx` the case comes from, so a failure
points at the rule rather than only at the assertion.
