# Current V4 native qualification driver

`npm run verify:thousand-pages -- ACTION /absolute/inputs.json ...` invokes the
shipped driver. It imports this installed package's existing native census,
stable identity, operational-state validator, full source profile and typed V4
SDK. It has **no02 publishing implementation** and no protocol/state authority.
Native publication remains the normal installed Astro integration described in
NATIVE_SOURCE_URL_MOVES.md. The historical v1 synthetic runner is not used.

Actions are `plan`, `materialize`, `admit COUNT`, `collect-records`, and
`check-coverage RECEIVER TOPICS PUBLIC`. None installs, builds or deploys a site.
Only explicit `collect-records` makes read-only HTTPS SDK01/03/04 requests; there
is no implicit networking. Every CLI action first verifies the exact normal
archive receipt, member manifest and every installed member, including these
scripts and the single current private SDK pair. A source checkout with changed
files cannot claim to be the pinned installed artifact.

The exact input object has these fields (values are real operator inputs):

```json
{
  "format": 1,
  "runRoot": "/absolute/new-owned-run",
  "targetCount": 1000,
  "contentFile": "/absolute/content-only-seeds.json",
  "subjectReceiptFile": "/absolute/normal-artifact/package-receipt.json",
  "native": { "siteUrl": "https://ACTUAL-SOURCE-ORIGIN/", "routeBase": "articles" },
  "receiver": {
    "origin": "https://ACTUAL-RECEIVER-ORIGIN/",
    "connectionId": "ACTUAL-CONNECTION-ID",
    "scopeRevision": "ACTUAL-CURRENT-SCOPE",
    "lane": "ACTUAL-LANE",
    "categoryId": "ACTUAL-DECIMAL-CATEGORY-ID",
    "actorId": "ACTUAL-DECIMAL-SERVICE-ACTOR-ID",
    "artifactSha256": "ACTUAL-INSTALLED-RECEIVER-SHA256",
    "coreCommit": "ACTUAL-40-HEX-CORE-COMMIT"
  },
  "connectionSecretFile": "/absolute/protected/secret",
  "caFile": "/absolute/scoped-ca.pem"
}
```

These placeholders deliberately fail validation. There is no selected live
origin, connection, category, actor or deployment. The explicit run parent and
all prerequisite files must already exist, outside the new run root. The CA
must be a CA certificate; no TLS-verification bypass is provided. Start the
dedicated collector process with `NODE_EXTRA_CA_CERTS` set to that exact file.
No secret value is accepted in the input object or emitted in results.

The content file is an array of exactly `targetCount` objects, each containing
only `seedKey`, `title`, `slug`, `markdown`, `createdAt`, `updatedAt`, `authors`.
Dates are exact authored fixture timestamps or null; authors use the current
source-provenance shape. Native author assignment is separate. Extract content
from old deterministic generators if useful; never feed their native IDs,
contract/receipt objects, expected old revision or pre-rendered HTML validator.
`seedKey` only joins input evidence. It never becomes a native/external/resource
or topic identity. Actual physical Markdown files, normal native rendering and
receiver receipts establish those facts. Native preparation/byte counts are
remeasured by the existing pipeline, not guessed from seed HTML lengths.

`materialize` refuses an existing run root, creates native/src/content/docs and
immutable originals, and records actual physical root/file identities and
original complete bytes. It never chooses or stores binding IDs/revisions or
renders/excerpts content. The first min(10,count) files have the existing native
interactive+discussionSync opt-in. Later `admit COUNT` enables at most100 more
under the SAME full corpus and shared native writer, with exact input CAS. It
does not narrow docsDir, silently repair a bound/edited source, or create a
second publisher. Keep ordinary complete-census native builds on that root;
use the supported physical entry/body/Content seam and full article template.
The driver supplies server-only `nativeQualificationOptions(input)` for that
normal consumer binding. It supplies no replacement theme or public secret
module. A smaller target is clearly labeled a small fixture, never1000 proof.

`collect-records` requires actual current connection origin/scope/lane/direction,
walks every typed03 continuation to its terminal page, rejects duplicate/missing
IDs, then reads exact04 detail. It records a new immutable observation file.
It does not call02/05, create a topic, assert category/actor authority from
Connection metadata, or qualify receiver native/worker readiness. A real native
receiver administrator must separately provide the complete category/topic/
service-actor census through the actual supported receiver mechanism.

`check-coverage` checks initial-published-corpus evidence: the complete physical
native census, unchanged originals, actual validated accepted source journal,
prepared capture and distinct full native build, exact receiver pages/details,
native topic/category/actor census and retained anonymous whole article/assets.
It rejects missing native capture or partial receiver/public coverage. It does
not manufacture records from Markdown or accept marker-only/source-link-only
proof. Receiver/observer files remain evidence inputs, not a new receipt grammar
or authority. Its output is **offline-evidence-consistency**, qualification
**NOT_RUN**: checking a saved observation cannot prove its observer executed.
Lifecycle-edited/withdrawn cohorts require their own exact phase evidence; they
are not silently substituted into this initial-corpus check.

Topic census input: `{origin, categoryId, actorId, complete:true, topics:[
{topicId,categoryId,actorId}]}`. It must cover exactly the intended native
receiver category; actual topic IDs remain decimal strings. Public input:
`{origin, articles:[{url,status:200,redirected:false,credentials:"omit",
checkedAt,file,bytes,sha256,assets:[{url,status:200,redirected:false,
credentials:"omit",bytes,sha256}]}]}`. HTML evidence files are retained within
the owned evidence root. Native/public article bodies and hashes remain
distinct from complete prepared source, selected excerpt and original Markdown.

Tooling reads have explicit budgets (64MiB input/evidence file, 256KiB CA,
1000positive sources); exceeding a tooling budget stops without truncating or
declaring the source invalid. Incomplete generation retains its owned partial
root; it is never automatically adopted. No cleanup command deletes roots or
old artifacts. Retain evidence and reconcile uncertain state before separately
scoped cleanup using recorded root identity.

Real receiver/HTTPS/native/browser/build/deploy/restart/rollback and incremental
cache qualification remain separate observations. Prior repeated full-build
`force:true` fixtures do not qualify ordinary no-force cache/deletion behavior or
Astro's explicit experimental incremental-build mode. No new content, provider,
URI, fallback, execution, retry, absence or approval policy is selected here.
