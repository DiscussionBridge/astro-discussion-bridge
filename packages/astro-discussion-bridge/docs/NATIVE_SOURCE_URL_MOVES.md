# Native source URL moves (V4 development)

This is the ordinary, current-authority To source28–31 implementation. It uses
the configured Astro collection's **same physical Markdown source**, its native
`slug` field and the existing source writer. It does not move a From destination,
rename an authored file, create another topic, or initialize an earlier record.
The current V4 development packet remains unchanged.

The protected native operator supplies the existing publication options, actual
physical source file, exact same-origin target URL, and actual build/deploy
executable, argument array and working directory. No shell command string is
executed. Normal installation/rendering does not require a replacement theme or
this proof wrapper. Source moves require the following explicit consumer binding.

## Actual native source binding

The consumer's existing native collection schema must retain Bridge metadata.
Its actual route must use the supported authored `slug` (falling back to its own
native entry ID), so the requested URL roundtrips through the configured
`siteUrl`/`routeBase`. Collection/root/template selection remains the operator's;
the adapter does not discover arbitrary collections or infer a production site.

Inside the real prerendered native route, use public `getCollection`/`render` and
the native server `AstroContainer` to render its real `Content`. Call the
server-only `captureControlledSourceNative(options, input)` export from
`astro-discussion-bridge/controlled-creation`, supplying:

```ts
{
  filePath: actualPhysicalEntryFile,
  nativeBody: entry.body,
  sourceArticleUrl: Astro.url.href,
  render: () => container.renderToString(Content, { request: Astro.request })
}
```

The public API's actual `entry.filePath` must be bound to that physical file
under the configured root, not guessed from an entry ID. Capture is permitted
only within the actual native `build` process after the complete configured
source census. Runtime/pageview rendering cannot perform this capture.

Render one actual source article using `sourceArticleAttributes(captured.source)`
from `astro-discussion-bridge`, one `h1` with
`data-discussionbridge-source-title`, and one content boundary with
`data-discussionbridge-source-content={captured.frontmatter.discussionbridgeExternalId}`.
The content boundary must contain the **entire** `captured.source.nativeHtml`,
not the portable excerpt. Pass the returned current frontmatter to the existing
native Discussion component. The consumer retains its layout/navigation.
Do not add a proxy route or put server secrets in a page module.

The capture uses real native rendering and final asset URLs. It resolves only
actual relative anchor/image attributes against the retained captured article
base; other native bytes/functions/data remain native. The complete prepared
source must still match the accepted full hash/count. Actual native build output
comes only from Astro's `astro:build:done` generated-file manifest. Generated
local images/scripts/styles are captured with actual file bytes and hashes.

Before a move, a real complete native prepared snapshot that differs from the
pre-build Markdown renderer uses the existing ordinary publisher and predecessor
CAS. No bytes are trimmed to claim equality, and no native date is invented.
Unchanged original/unowned metadata can reuse that accepted native preparation
during the next census; actual Content is still rendered and checked afterward.
This avoids alternating between the pre-build and actual native preparations.
Once a move owns the source, this ordinary02 path is suppressed entirely.

## Protected native sequence

All functions below are server-only exports from `astro-discussion-bridge`:

```ts
await beginControlledSourceUrlMove(options, sourceFile, newUrl);
await runControlledSourceCommand(options, sourceFile, "build", actualBuildArgv);
await runControlledSourceCommand(options, sourceFile, "deploy", actualDeployArgv);
await finalizeControlledSourceUrlMove(options, sourceFile);
```

`actualBuildArgv` and `actualDeployArgv` each have absolute `executable`, explicit
`args`, absolute `cwd` and optional positive `timeoutMs`. Native commands use
`shell:false`, `windowsHide:true`, private journal state and no logged output.
The OS source writer is released while the child builds; durable source fence
and command ownership remain. A successful exact command receipt returns without
running again. A running/starting/uncertain owner blocks another command until
actual process/effect reconciliation. Child termination is observed before
recording the result; this does not certify arbitrary spawned descendants or a
remote deployment provider's rollback behavior.

Known local writer contention is deferred only within the existing command
deadline; it never counts as a successful authority check. A current native
file/fence/scope check is still required before success. Periodic checks do not
build an unbounded queue. Actual OS exit/close is also saved under the private
`stateFile.source-commands/commandId.json` path, so an observed child outcome is
not lost if its terminated native writer lock is still busy. The source owner
continues to block another command until actual source/effect reconciliation.

The complete accepted article, original URL, source/native/resource/topic IDs,
title, all author provenance, native dates and unowned frontmatter stay fixed.
Only native slug, real URL edition and owned challenge/receipt metadata change.
Generated excerpts retain their selected article and historical selection
snapshot; only their owned Read More target changes. Oversized projections stop
before prepare/native mutation; no fresh excerpt is selected during a move.

Native deployment success alone does not finalize. The adapter anonymously reads
the exact configured new URL without credentials or redirects, verifies the
entire actual owned native article/title/authors/IDs/current revision/issued nonce,
its native dependencies and owned generated asset bytes, and records the actual
check time. A source marker or copied portable SHA cannot substitute for this
full source proof. The source profile is `discussionbridge-astro-source-html-1`,
distinct from the From destination fragment profile.

## Durable receipt and recovery

The component-private ownership receipt binds actual connection/scope/origins,
root device/inode, unchanged physical relative path, stable IDs, current URL and
edition, a real private monotonic source fence, original/prepared/native snapshot
digests and actual issued move/nonce. Canonical bytes are UTF8 of the existing
portable `semanticIdentity` encoding over the closed local receipt. It has no
invented From mapping, server lease or generation-zero convention. Its snapshot
excludes only the receipt digest field itself to avoid self-reference.

Exact28/29/30 requests are saved before dispatch and replayed identically after
uncertain responses, with current source/fence/scope checks. Read-only31 history
and04 metadata corroborate state; neither supplies a missing mutation receipt.
The source engine suppresses ordinary02/05 for an active owned move. Native edits,
closure, changed receiver authority or an applied replacement generation require
reconciliation; a later build does not silently replace that intent.

Accepted29 is retained as a Record receipt with separate current-edition ancestry.
Old02 bodies/results and original captures remain immutable. Later unchanged02
uses the29 edition as both current revision and predecessor, retaining original
target meanings and generated selection; it does not mint a date or revision.

`abortControlledSourceUrlMove(options, sourceFile, restoreExactLocalFile?)` uses
the exact saved old ownership. Optional local restoration requires exact current
owned output; it is not proof of public/provider rollback. An applied or uncertain
move truthfully reports `native_change_applied:true` and retains both reservations
in attention. Unknown native state cannot produce a fabricated old receipt.
`controlledSourceUrlHistory(options, sourceFile, cursor?)` reads bounded history.

A validated route29 `content_preservation_unavailable`422 saves its exact typed
rejection and request/proof history before suppressing identical retransmission.
Malformed or transport outcomes remain uncertain. This is not a From Failure,
receiver retry grant or new manual/global gate. Applied/rejected replacement
recovery beyond the declared current path remains explicit reconciliation.

## Qualification limits

This profile binds actual static/prerendered consumer builds, configured slug
routes and generated local assets. Installed collection/schema/template/root,
protected credentials, build/deploy argv and actual public surface are required
native inputs. Browser function execution, external provider availability,
dynamic runtime publication, CDN rewriting, scale and installed/public deployment
are separate qualifications. A local native/loopback test is not those results.
No new HTML execution, URI, provider, default, fallback or content-eligibility
policy is selected by this integration.
