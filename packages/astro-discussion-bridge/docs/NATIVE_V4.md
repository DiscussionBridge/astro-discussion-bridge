# Native Astro V4 development integration

The single packet is wire V4, candidate `discussionbridge-v4-core-20261029-r7`,
implementation `0.4.0-alpha.1`, release null. The pinned portable schema/runtime
and their CANDIDATE/ARTIFACTS/ROUTES provenance are private package modules.
Native state format1 is internal storage. There is no earlier development wire
selector, initialization/adoption workflow or alternate codec.

### Fixed-policy URLs and native transport

V4 configuration, topic/origin checks, source and publication URL operations use
the pinned R7 domain policy even when Node's native URL parser has older Unicode
data. Ordinary derived-origin serialization is retained; international derived
origins use the pinned hostname consistently across runtimes. Original configured
and wire URLs, stored source URLs, native identities, reservation keys and exact
receipts are not rewritten. An incompatible retained scope fails closed for
reconciliation; it is not silently converted or assigned another identity.

Ordinary ASCII URLs still use native fetch. For internationalized authorities,
the server uses Node HTTPS with the pinned ASCII hostname for DNS and SNI,
mandatory certificate chain/time verification, and Node/OpenSSL's X509 hostname
matching. Its hostname checker compares the certificate to that same pinned
ASCII name, without reapplying Node's potentially different ICU domain policy.
Partial-label and multi-label wildcards are not accepted. Native parsers can
reject OR map these differently across runtimes. This is a local
transport input, not a replacement wire URL or ownership grant. No failed network
request or possibly accepted mutation is retried through another transport.
Credentials remain header-only, cookies and redirects are refused, and the same
request timeout and streaming response bounds apply. Custom fetch implementations
remain explicit overrides. No new dependency, runtime floor, trust-root setting,
receiver field or hosting extension is required.

Server-rendered comments share the existing topic-route checks through the local
fixed-policy integration. The browser Simple loader and public URL helper do not
import the server SDK or HTTPS transport. This does not claim that every external
platform/browser/DNS estate supports every Unicode spelling; native installation
and live HTTPS qualification remain separate gates.

The package root, `server-url`, `controlled-creation` and `operational-state`
entries are server-only. Native pages and components use these normal package
imports so Astro retains the SDK's installed schema/data boundary instead of
bundling its file-backed runtime into a prerender chunk. The existing integration
preserves only those exact entries as normal Node imports during SSR and refuses
their browser imports. It does not add the package root to `ssr.external`, which
would also externalize component/browser subpaths. Its exact pre-resolver also
handles framework-package crawling without an absolute build-host path.
Components and browser enhancement still compile normally; operators do not add
a build hook, copied schema file or site-specific Vite workaround.

Maintainer CI also runs `npm run test:normal-consumer`: an ordinary production
installation of the saved archive and native two-page Astro build, including
documented native server API imports inside actual prerendered pages, without
the no-install fixtures' resolution aliases, parser overrides or custom Vite options.
This is local installation/build coverage, not external forum or deployment proof.

### Selected-source Retry after a definite To02 refusal

An authenticated, codec-validated To02 `invalid_field`/HTTP422 refusal is retained
with its exact request and actual response evidence. An unchanged refused request
does not automatically retransmit on the next build or restart. Transport errors,
malformed responses and unlinked historical errors remain uncertain exact intents;
an operator selection cannot turn them into definite refusals.

After correcting the cause, use the existing protected connection environment and
select the current source/refused mutation reported by `source-status`:

```sh
discussionbridge-astro retry-source --state-file /private/to-state.json \
  --docs-dir /site/src/content/docs --site-url https://site.example \
  --route-base articles --lane docs --source-file /site/src/content/docs/article.md \
  --refused-mutation-id <actual-current-refused-mutation-id>
```

This action stages one Retry in the same source journal. It does not render,
publish, start a build or mint a request ID. Run the normally configured native
build afterward. Its complete census, current source capture, native file CAS,
current To authority and scoped accepted-predecessor checks still apply. Native
asset articles use the existing actual Content capture, not a CLI renderer or
saved HTML substituted for the current source. The action itself checks current
native root/file/identity, source metadata and authority; a bound source requires
the exact current scoped record. A never-created source uses normal creation
identity/collision checks with a null predecessor, without inventing a record ID.

For an unchanged refused article the fresh request changes only `mutation_id`;
the refused source revision, complete article evidence, actual dates and still
current predecessor remain unchanged. Exact refusal/request/history remain
immutable and the selected action-to-successor link is durable before dispatch.
Repeated or stale action selection cannot mint another successor. A new refusal
stops again; an uncertain successor retains its exact request for reconciliation.
A genuinely changed current complete snapshot follows the ordinary edition path,
not an unchanged Retry or a fabricated edit/date. A staged action whose source
snapshot changed is retained as superseded, without creating its Retry request.

Absent historical candidate/hash/correlation diagnostics remain unknown rather
than being fabricated or used as a new retrospective evidence gate. Actual exact
request linkage and witnessed authenticated typed refusal are still necessary,
as are current source/capture/authority/ownership checks. This mechanism covers
only To02 `invalid_field`/422; other errors, From work and source-move refusals do
not acquire an explicit Retry path from it.

Configure `discourseUrl` and actual `siteUrl` on the normal Astro integration.
Plugin-free Simple, Full and Interactive presentation uses native Discourse
reads/embed and does not require a publication connection. Optional
`DISCUSSIONBRIDGE_FORUM_NAME` uses the validated native forum title when unset;
a supplied connected V4 label is authoritative.

`publishOnBuild` is optional and requires `enabled:true`, connection credentials,
actual `docsDir`, a private `stateFile` outside that directory, and the existing
consumer route convention (`routeBase`). Only published interactive Markdown
with `discussionSync:true` enters the source writer. Imported From pages never
feed back. A complete native identity census precedes dispatch. Real nullable
source dates and all source authors are retained. Complete sanitized HTML bytes
and SHA precede full/generated delivery selection; the exact generated link and
full-envelope measurement come from the sole portable V4 helper. Changed native
source advances its opaque revision using the accepted predecessor. Exact
pending mutation/accepted receipt survives lost responses and native commit
failure. Topic/resource/external identities are preserved. Canonical or native
path drift requires the separately defined source-move mechanism.

### Native article preparation and managed image URLs

The private journal retains the original article together with its captured
article URL. Existing supported preparation resolves copied link/image targets
against that URL over the complete article, then records complete prepared
bytes/SHA before delivery/excerpt selection. Plain text and image-only content
are valid sources. A preparation limitation does not make their format invalid.
A genuinely changed complete prepared snapshot advances the existing opaque
revision/CAS path with actual source dates unchanged; changing the packet or a
generated marker alone does not invent an edition. Pending requests, accepted
snapshots and history are never retrofitted.

Astro-managed Markdown images require the actual native `render(entry)` context
to obtain generated asset URLs. The normal integration still performs its
complete census and closure pass at config:done, then stages those published
sources as awaiting native rendering. Bind the existing server-only publication
options to the consumer's actual collection/route. The native page uses the
existing helper and returns its committed frontmatter to Discussion:

```astro
---
import { render } from 'astro:content';
import { experimental_AstroContainer as Container } from 'astro/container';
import { fileURLToPath } from 'node:url';
import { captureNativeRenderedSource } from 'astro-discussion-bridge/controlled-creation';
import Discussion from 'astro-discussion-bridge/Discussion.astro';
import { publicationOptions, nativeProjectRoot } from '../../discussionbridge.server.mjs';
// entry comes from this consumer's getStaticPaths/native collection.
const { entry } = Astro.props;
const { Content } = await render(entry);
const container = await Container.create();
const { frontmatter } = await captureNativeRenderedSource(publicationOptions, {
  filePath: fileURLToPath(new URL(entry.filePath, nativeProjectRoot)),
  sourceArticleUrl: Astro.url.href,
  nativeBody: entry.body,
  render: () => container.renderToString(Content, { request: Astro.request }),
});
---
<Content />
<Discussion frontmatter={frontmatter} />
```

`publicationOptions` is the same actual `{docsDir,stateFile,siteUrl,discourseUrl,
routeBase,controlledCreation}` configuration used by publication preparation;
`nativeProjectRoot` is the native configured root URL. Keep that module server
only and credentials outside public bundles. No new public route is needed.
The helper supports the proven native Markdown entry binding, rechecks current
published eligibility, original file/body/base and scope under the same writer,
then uses the existing preparation/resolve/CAS/native commit engine. A renderer
failure, changed source/base, missing capture or unresolved prior handoff retains
the exact private state and a limitation; it does not guess an asset URL, publish
an empty image, infer deletion or replace uncertain requests. `source-status`
reports `nativeRender` and the actual pending detail. The consumer owns its
collection, route, layout and native install/configuration.

From content first verifies the immutable complete cooked wire bytes/SHA/count
and UTF8. Its native copy uses that edition's `Source.topic_url` as the captured
base, with separate prepared/native output evidence. A later canonical change
never rebases accepted article references or rewrites source transport hashes.

Ordinary build preparation reconciles accepted current V4 sources that are now
unpublished/ineligible or have disappeared after a complete stable configured
census. Failed/partial scans, changed scope/root or missing pre-guard upgrade
evidence stop locally without inferred deletion. The same native writer and
exact withdrawal engine handles this lifecycle and the protected explicit
`withdraw-source` command. That command also accepts the native
owner's explicit `policy_excluded` stop intent. It durably sends the exact
nonnull accepted revision and scoped mutation. It preserves discussion/history
and never silently resolves a withdrawn binding. Exact uncertain source request B
is retained unreplayed on closure: only established accepted A plus scoped current
Record A can produce CAS withdrawal A; another current revision needs local
reconciliation. There is no guessed predecessor, inferred receipt or implicit
republish. A preexisting V4 accepted path already missing before its complete
census guard can be established requires native reconciliation.

The receiver's `content_preservation_unavailable` is a To-only V4-02/V4-29
HTTP422 response with `retryable:false` and null retry delay. The source engine
recognizes it only after the active codec validates an actual response for its
exact request. It durably retains the rejected request, complete capture, exact
six-field response and historical codec provenance before returning. Restart or
another build does not retransmit that same snapshot; `source-status` exposes
the safe code/route/status. A locally constructed matching exception, malformed
response, wrong route/status or interrupted transport cannot create this receipt;
uncertain requests retain the existing exact replay path.

A genuinely changed current prepared snapshot may continue through the existing
writer/scope and known accepted predecessor/CAS; a bound source first checks
its scoped current Record. A never-created source uses its normal null expected
revision and external-identity collision checks. Old rejected requests/captures
remain immutable history. Changing a packet/version, waiting, or reading Record
does not establish receiver repair for identical input; that readiness mechanism
is not declared. No global/manual gate or fabricated source edition is added.
Historical rejection provenance is retained across V4 upgrades without retagging
it or requiring its old candidate to equal the current loader. This handling
does not turn a local preparation limitation into a receiver response, From
Failure or Work attention. The ordinary current-authority To source-move engine
and full native source profile are described in [Native source URL moves](NATIVE_SOURCE_URL_MOVES.md).
Local native/loopback evidence is separate from installed/public qualification.

`fromDiscourse` is optional and requires `enabled:true`, current connection
credentials, `docsDir`, private `stateFile`, and the actual site's collection and
consumer-owned routes. Initial/change feed checkpoints, source reservations,
claim/lease generations, complete UTF8 content, native ownership/CAS and static
prepare are durable. New pages retain normal consumer defaults; existing
unmanaged frontmatter survives updates. Nonempty selected native metadata needs
the actual consumer's repository-ID availability/assignment resolver; without
one it stops before claiming. Source authors are provenance, not that resolver.

The normal build hook captures the actual rendered output. Deployment remains
explicit: configure an absolute executable, structured argv and actual cwd, or
use `cms-record-build`/`cms-deploy` with the protected private state. Native
commands use no shell/visible window and hold current fencing authority. A
successful receipt replays settlement without rerunning the command. An uncertain
process owner blocks another execution. Real command supervision establishes
the direct child boundary; service descendants and provider rollback require
the actual deployment owner.

`cms-finalize` verifies the actual anonymous canonical rendered fragment against
the prepared content/identity/revision/mode, then sends the exact durable
transaction. Publicly verified time comes from that successful fetch. It does
not copy a source marker or impose metadata-response caps on complete native
content. `cms-abort` restores only the exact owned prior native file when current
authority permits; it does not execute deployment rollback. Accepted receiver
attention has its checked native-administrator retry barrier.

## Native From presentation URL changes

`cms-prepare-url-move --mapping-id UUID --new-url HTTPS_URL` is an explicit
native owner action against an existing receiver-authorized publication cycle.
Use the same private connection, docs/site/state arguments as other CMS commands.
It does not create a policy/source revision or administrator retry cycle. The
current native route mechanism is the consumer collection's `slug` frontmatter:
one safe slug beneath the configured routeBase. The Markdown file/native ID,
resource/external/topic identity, source dates and complete article bytes remain
unchanged. A consumer with another route convention requires its actual native
binding. Existing relative references that were not prepared with captured
source targets stop locally; a URL-only action never rewrites accepted content.

The command first records exact intent and inspects the existing owned native
edition. V4-21 reserves the new URL under the current mapping revision and lease.
The same file then receives the native slug and an ownership receipt containing
the actual move ID, public nonce, canonical URL and current lease generation.
The consumer-owned article must expose these receipt fields, in addition to the
existing native/resource/source-revision/mode markers:

```astro
<article
  data-discussionbridge-cms-native={receipt.native_id}
  data-discussionbridge-cms-resource={receipt.resource_id}
  data-discussionbridge-cms-revision={entry.data.discussionbridgeSourceRevision}
  data-discussionbridge-cms-mode={entry.data.discussionCommentsDisplay}
  data-discussionbridge-cms-canonical={receipt.canonical_url}
  data-discussionbridge-cms-move={receipt.move_id}
  data-discussionbridge-cms-nonce={receipt.proof_nonce}
  data-discussionbridge-cms-ownership={entry.data.discussionbridgeCmsOwnershipSha256}
>
```

The existing native build/deploy command path captures actual output and renews
the current move authority. Profile `discussionbridge-astro-static-html-move-1`
checks the whole actual owned article/content/discussion against the native
build, plus these exact receipt fields in both build and anonymous public HTML.
A marker alone is insufficient. Only successful proof permits V4-22. Exact
uncertain requests and successful child receipts replay without a second native
command. URL ancestry and the move command receipt are durable; older verified
transactions remain immutable.

After URL commit the pipeline performs V4-18 against the new binding. Its result
reports `requiresFreshBuild:true`: run a **fresh native build and deployment**
before V4-19. The first deployment is not reused as post18 publication settlement;
even `cms-record-build` rejects a pre-prepare move artifact. No recursive build,
fake deployment receipt or fabricated verification time is generated.

`cms-abort-url-move --work-id UUID` restores only the exact local owned prior
URL metadata when current authority permits. Actual applied restoration reports
`native_change_applied:true`; receiver attention retains both reservations and
does not imply a Work failure or deployment rollback. Edited/uncertain native
objects, changed source/mapping/lease generation, and already-applied replacement
generations require explicit reconciliation. This is destination presentation
movement (21–23), not To-source movement (28–30) or installed/public qualification.

The current cleaner cannot faithfully emit audio/video/provider media. Such
actual markup stops before cleaner/hash/native mutation, preserving the complete
underlying source and an explicit limitation. From retains a private complete
source/work limitation, without inventing a general V4 Failure code, claiming
receiver attention or continually renewing/reclaiming it. Its existing last
verified publication remains identified. Exact sanitizer/provider/URI/default
choices are still discussion. Code, marked Mermaid/math, tables and existing
fallback links retain their native paths; supported full media playback is not
claimed.

Actual Astro/Shiki `pre[data-language]` metadata is carried to the existing
direct-child `code.language-*` marker before complete preparation/hash/count.
Highlighting spans and the native rendered code text remain in place; language
is never inferred from code contents. This retains the markers consumed by the
existing RichContent Mermaid/math renderer and portable code consumers. A
conflicting or unrepresentable native language identity is a Bridge limitation,
with the original retained. The raw renderer and prepared article are separately
captured. Shiki may already omit a code block's final newline in its raw output;
Bridge does not reconstruct missing source bytes or claim that difference is
universally harmless. Previously accepted/pending articles are not rewritten.

The existing cleaner has no bound equivalent for actual inline/external script
function or event handlers. Known removed functions stop locally with the
specific function named for operator decision. Nonempty JSON/JSON-LD script
blocks are reported as DATA loss, not executable function. Other script content
reports its declared type without assuming its execution meaning. Escaped
displayed code and comments are not live functions. These diagnostics do not
select an execution, provider, URI, fallback or default policy; retaining the
original alone does not make a broken copy equivalent.

Consumer themes own menus/header/footer and collection archives/Latest/public
pagination. No theme is installed or injected. Native source URL proof/nonce
extraction and administrator retry integration remain specific unresolved native
mechanisms. Local native builds, loopback verification and harmless OS children
are author checks, not installed/public/scale/browser/release qualification.
Repeated in-process native consumer fixtures use Astro's supported `force:true` full-build
option to clear content-layer/incremental cache. Ordinary deployed/incremental
cache behavior and public route disappearance still need installed qualification;
this fixture setting is not imposed by the production integration.

## Administrator attention recovery

The r6 `attention-recovery-1` extension keeps earlier V4 records, exact pending requests and captured sources intact. Old terminal work is never reclaimed locally. Core administrators request a fresh native-state Check, inspect the returned facts, then explicitly retry ready selected work. A supported retry creates a new work ID, cycle and fencing generation; the adapter discovers it through the positive recovery feed and rechecks actual native state after the exact targeted claim. Old transaction history remains retained. An already installed successor resumes its own exact journal after restart.

Native-owner commands use the same configured server credentials and explicit `--state-file`, `--docs-dir` and `--site-url` values as existing native commands:

- `cms-check-attention` reads actual native state and reports one immutable observation for each Core inspection. It does not restore files, replay uncertain mutations, build, deploy or claim work.
- `cms-attention-status` displays safe inspection IDs, state, issues, restoration operations and successor handoff status.
- `cms-restore-baseline --inspection-id ID --journal-sha256 HASH` explicitly restores the exact retained verified baseline under native writer locks. It persists its restoration intent before any file write, preserves foreign edits and can resume the same recorded operation. Source restoration alone is not public restoration.
- `cms-baseline-command --restoration-operation-id ID --command-file FILE` is a separate explicit native-owner action for a configured structured build/deploy command. It never reuses an expired work lease. Starting/running/uncertain receipts block another command; a successful exact operation returns its retained receipt without rerunning. Check and Restore never start this command implicitly.
- `cms-recover-attention` discovers only Core-admitted successors and installs a new lease after fresh actual-native checks. Normal From staging also polls the recovery channel when it holds attention history.

Applied static candidates, foreign or partial content, missing retained baseline/build evidence, unresolved URL moves, unknown HTTP mutation outcomes and active or uncertain native commands remain blocked. Static prepared work may be retried only after actual restored native and public baseline proof and the explicit Core settlement-and-retry action. A supported independent backup restoration does not require a fabricated local restoration-operation ID. No applied static candidate adoption is implied.
