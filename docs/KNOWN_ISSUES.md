# Known Issues

This page records confirmed issues that operators may encounter while using or
building Discussion Bridge sites. It distinguishes product defects from
upstream framework behavior and keeps workarounds bounded.

## Astro

### Starlight

#### 1. Build Logs `Entry docs -> 404 was not found`

**Status:** Confirmed upstream Starlight behavior; GitHub issue prepared but not
yet filed.

**Impact:** Low. The message adds noise to otherwise successful builds. The
generated site and fallback 404 page continue to work.

**Observed message:**

```text
Entry docs -> 404 was not found.
```

**Confirmed reproduction:**

- a clean stock Starlight control at `examples/stock-starlight`
- Astro `^7.0.4`
- Starlight `^0.41.2`
- no Discussion Bridge integration or component wiring required
- `npm run build` completes successfully and then prints the message

**Likely source:**

Starlight's generated 404 route checks for an optional user-authored `404`
entry with `getEntry("docs", "404")`. When `src/content/docs/404.md` does not
exist, Astro reports the missing entry even though Starlight correctly falls
back to its generated 404 page.

**Controls already tested:**

- `disable404Route: true` removes the message, confirming that the injected
  Starlight 404 route is involved.
- Adding `src/content/docs/404.md` removes the missing-entry message but causes
  a route-conflict warning because the docs catch-all also tries to render
  `/404`. This is not a clean workaround.

**Current operator guidance:**

- If the build succeeds and the generated 404 page works, treat the message as
  a known warning.
- Do not add `src/content/docs/404.md` solely to silence it.
- Use `disable404Route: true` only when the site deliberately supplies and
  verifies another 404 implementation.

**Possible upstream fix:**

Starlight could probe for the optional custom 404 entry without emitting a
missing-entry diagnostic for the expected absence, or otherwise suppress that
expected miss inside its generated 404 route. The fallback behavior should
remain unchanged.

**Prepared GitHub issue:**

Title:

```text
Generated 404 route logs "Entry docs -> 404 was not found" when no custom 404 entry exists
```

Body:

```markdown
### What happened?

A clean Starlight build succeeds but prints:

`Entry docs -> 404 was not found.`

The site has no `src/content/docs/404.md`, so Starlight should use its generated
fallback 404 page. The fallback works; the unexpected part is the missing-entry
diagnostic during an otherwise successful build.

### Reproduction

1. Create a stock Starlight site using Astro `^7.0.4` and Starlight `^0.41.2`.
2. Do not create `src/content/docs/404.md`.
3. Run `npm run build`.
4. Observe that the build succeeds and then logs
   `Entry docs -> 404 was not found.`

A minimal control is available in
`examples/stock-starlight` in the DiscussionBridge/astro-discussion-bridge
repository.

### Additional findings

- `disable404Route: true` removes the message.
- Adding `src/content/docs/404.md` removes the missing-entry message but creates
  a route conflict because the docs catch-all also attempts to render `/404`.
- The likely source is the generated Starlight 404 route probing the optional
  docs entry with `getEntry("docs", "404")`.

### Expected behavior

The generated fallback 404 route should continue to work without logging a
missing-entry diagnostic when the optional custom `404` docs entry is absent.

### Possible direction

Probe for the optional entry without emitting a diagnostic for the expected
absence, or suppress that expected miss inside the generated 404 route.
```

Before filing, reproduce once against the current Starlight release and replace
the version ranges above with the exact installed versions.

## Discourse

### Granular API Keys Cannot Read Every Diagnostics Endpoint

**Status:** Confirmed in Discussion Bridge field testing. The upstream question
about a supported granular scope for these site-level reads remains open.
Discussion Bridge provides a bounded fallback.

**Impact:** A least-privilege granular publishing key can perform normal
publishing work but may receive `403 Forbidden` from site-level endpoints used
by `check-discourse`. One granular key therefore cannot currently provide every
publishing and setup-diagnostics capability that Discussion Bridge needs.

With the exercised granular key configuration, the publishing key could read
`/categories.json` and `/tags.json`, but could not read all of:

- `/site/settings.json`
- `/site.json`
- `/embed/info`
- exact page-URL reconciliation search

This affects automatic discovery of authoring limits, user-specific tag
capabilities, and some existing-topic reconciliation checks. It does not mean
routine publishing must use a global key.

**Current operator guidance:**

- Use a granular publishing key for `publish-new`, `sync-existing`, and
  `publish-and-sync`.
- Use a separate global/admin-capable diagnostics key only for
  `check-discourse` setup checks that require the unavailable reads.
- Keep the diagnostics key out of ordinary publishing builds and CI unless its
  use is explicit and protected.
- When a broader diagnostics key is unavailable, configure known authoring
  limits explicitly and treat unavailable capability checks as unresolved.

The desired future state is a granular diagnostics/read key that can access the
required metadata and reconciliation endpoints. Until Discourse exposes or
confirms those scopes, the documented publishing-key plus diagnostics-key
model remains the least-privilege operational fallback.

Background and upstream clarification:
[Confirming API access to authoring-limit site settings](https://meta.discourse.org/t/confirming-api-access-to-authoring-limit-site-settings/407937).
The thread confirms the public/client endpoint pattern; its granular-scope
follow-up has not yet received an upstream answer.
