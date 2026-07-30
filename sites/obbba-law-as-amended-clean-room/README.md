# Law as Amended Clean Room

This directory is the empty OBBBA-specific site/adapter evidence root for the
replacement OBBBA Law as Amended data pipeline.

It is not DiscussionBridge Core and is not part of the reusable Astro adapter
package contract. Promotion into portable product code requires a separate
Product and architecture decision.

Legacy Law scripts, tests, fixtures, caches, generated data, and derived
evidence are denied. Nothing from the post-origin implementation may be copied
or imported. Sound product ideas and branding may be restated from first
principles and implemented anew.

The clean-room flow is official-source-first:

```text
official acquisition -> preserved raw evidence -> neutral parsing
-> reviewed legal-state evidence -> Astro presentation
-> optional forum discussion binding
```

The boundary contract is `boundary.json`.

No implementation has been admitted yet.
