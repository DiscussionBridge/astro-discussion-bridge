# OBBBA Law USC source-cache policy

The OLRC USC XML ZIP archives used by the Law as Amended pipeline are official
source inputs, but they are large, reproducible working data rather than Git
content.

- Store the 40 downloaded archives only under the repository-local,
  Git-ignored `.discussionbridge-cache/obbba-law-usc-archives-YYYY-MM-DD/`
  directory.
- Persist the small archive evidence manifest under `docs/evidence/`. It records
  the exact source URL, release point, archive byte length, SHA-256, expected XML
  member, uncompressed size, and CRC for every archive.
- Retain the local cache through XML extraction, current/prior comparison, page
  generation, acceptance review, and deployment evidence collection.
- The cache is rebuildable and may be deleted after those gates complete. It is
  not a durable artifact store and must never be committed.
- A later rebuild must fetch only the URLs in the reviewed release plan and must
  match the reviewed archive evidence hashes. Upstream byte drift is a new
  review event, not something the tool repairs or accepts silently.
