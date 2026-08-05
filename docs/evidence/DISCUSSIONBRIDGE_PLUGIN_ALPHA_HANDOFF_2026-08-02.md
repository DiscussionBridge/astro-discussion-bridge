# DiscussionBridge for Discourse — Alpha Plugin Handoff

Date: 2026-08-02

Status: product direction settled; implementation not started by this record.

## Controlling Alpha decision

DiscussionBridge will move forward with a near-full-featured free/open-source
Discourse plugin in Alpha. The plugin enhances Discourse core; it does not
replace Discourse embedding, authentication, topic/post storage, permissions,
moderation, composer, replies, likes, quotes, notifications, or normal forum
topic presentation.

Tier 1 remains useful without a plugin:

- `simple` remains DiscussionBridge API-rendered comments;
- `full` remains the standard Discourse comments embed;
- core-only `fullInteractive` remains available for development and
  compatibility testing, but is a plugin-dependent preview and is not a
  recommended public-production Alpha mode.

Production-quality `fullInteractive` is an Alpha plugin capability.

## Exact frame-sizing finding

The responsive Astro-side `embedViewportMaxHeight` ceiling is useful but does
not solve the underlying zero-reply full-app behavior. Live inspection found:

- the Discourse blog full-app example uses dynamic height and enters a topic
  with replies at post `/2`; its embedded document is about 1,193px high;
- the DiscussionBridge Starlight demo enters a topic with replies at post `/2`;
  its embedded document is about 975px high;
- the OBBBA Section 20001 topic has a very long companion first post and no
  replies; its full-app embedded document is about 10,336px high.

The current `70vh` host ceiling therefore turns the long zero-reply document
into a compact outer viewport with an extremely long internal scrollbar. This
is not acceptable as the public `fullInteractive` result. The defect is not
present in `simple` or `full`.

Dynamic height alone is not a correction: it can resize or clamp the iframe,
but it cannot remove the companion first post from the embedded layout.

## Required plugin behavior

The plugin must add a forum-authorized comments-only full-app presentation. It
must use Discourse core full-app behavior and preserve signed-in interaction,
while omitting companion post 1 from the embedded layout so it contributes zero
height. It must render:

- existing replies when present;
- a compact native empty discussion / first-reply state when no replies exist;
- native login, composer, reply, like, quote, edit, moderation, and notification
  behavior as permitted by Discourse;
- natural core resizing for the remaining discussion surface, with a
  forum-approved configurable maximum for long discussions.

The plugin must not delete, truncate, rewrite, or hide the first post on the
normal forum topic. A visual-only `visibility: hidden` treatment is
insufficient because the post can retain its layout height. An unscoped theme
CSS workaround is not the product contract.

The Astro adapter may request comments-only `fullInteractive`, but the
Discourse operator makes and enforces the final decision. The plugin must
validate the request against enabled policy and the authorized embedding host,
connection, category, tag, or lane. Disabled, missing, or unauthorized plugin
behavior must fail safely to an explicitly documented core mode.

## Topic creation and actor authority

The same plugin direction should resolve the observed visitor-triggered
`system` author problem, but only when the plugin owns the creation workflow.

The Alpha path is:

1. An authenticated, forum-authorized DiscussionBridge request creates or
   resolves the companion topic before the comments iframe is exposed.
2. The forum operator configures the service/user identity allowed to create
   that topic.
3. The plugin records the durable source connection and returns the topic ID.
4. The Astro adapter stores/uses that topic ID for later embeds.
5. A reader opening an embed must not silently create the topic as `system`.

This does not authorize arbitrary impersonation. The configured operating
identity, effective author, requesting connection, policy decision, and audit
result must be explicit. Discourse core visitor-triggered embed creation may
remain available only as a separately selected zero-touch compatibility mode,
not as a silent fallback.

## Other cumulative Alpha plugin capabilities

The plugin Alpha scope also retains the previously settled reasons for a
Discourse-side control plane:

- forum-enforced listed/unlisted policy and an operator review queue;
- requested state kept distinct from actual forum state;
- per-connection/host/category/tag/lane policy;
- connection inventory, source mappings, duplicate detection, health and
  diagnostics;
- auditable decisions and safe recovery;
- full-app embedded Mermaid/table presentation parity where supported;
- an architecture usable by Astro, Statamic, and future adapters;
- normal Discourse topics and ordinary core embeds unchanged unless an
  authorized DiscussionBridge policy applies.

## Immediate product posture

- Do not present core-only `fullInteractive` as production-ready Alpha.
- Do not remove the implementation or the demo used for diagnosis.
- Label it plugin-dependent preview until the plugin capability passes.
- Continue to recommend `simple` and `full` for plugin-free public deployments.
- Do not deploy another iframe-height-only workaround for this issue.
- Plugin implementation, repository placement, installation, forum mutation,
  and deployment require their own reviewed boundary.

## Handoff next step

Design the exact plugin v0.1 Alpha contract and skeleton around the cumulative
scope above, beginning with the two end-to-end proofs that currently block the
desired public behavior:

1. comments-only `fullInteractive` for both zero-reply and replied topics;
2. forum-authorized companion-topic creation under an explicitly configured
   non-`system` operating identity before embed exposure.

No production or forum state was changed by this handoff.
