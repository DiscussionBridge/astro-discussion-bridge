# Impact Population Secure Credential Transport

Status: implementation evidence only; not yet approved for live operator use.

## Absolute credential rule

Every Discussion Bridge operation uses a user-created Discourse API key.
Discussion Bridge does not replace that credential with OAuth, a Windows
credential, an invented service account, or another authorization scheme.

A durable named Bridge identity is an operating record backed by a
user-created Discourse API key. It records the key's Discourse actor, purpose,
scope, owner, storage reference, audit policy, rotation policy, and revocation
status. Storage tooling may protect and reference the key, but it does not
change the credential source or authority.

## Supported execution surface

The proposed live surface is a normal Windows PowerShell window, not the
Codex/app terminal. The earlier failures showed that the app terminal made
interactive prompt state, multiline continuation, and clipboard behavior
ambiguous. The final runbook must be reviewed as one complete sequence before
any command is run; it must not be delivered incrementally.

## Boundary

The Impact population commands consume a Discourse API key, but the operator
must never place that key in command text, process arguments, PSReadLine
history, interactive terminal input, clipboard parsing, logs, reports, or a
persistent plaintext file outside the approved protected vault workflow.

The primary workflow is the existing protected vault record used by Bridge Boss
1. The CLI accepts its non-secret path through
`--diagnostics-api-key-file` or `DISCOURSE_DIAGNOSTICS_API_KEY_FILE`, reads
exactly one unformatted 64-character key line, and rejects empty, formatted,
or multi-key records before network access. This preserves Phil's established
vault/Context/Notepad operating model without terminal key handling.

The current Windows storage adapter in
`scripts/invoke-impact-population-secure.ps1` reads a user-created Discourse API
key stored as a named Generic Credential in Windows Credential Manager. Windows
Credential Manager is only a local protected storage provider; it is not the
credential or identity authority. Only the non-secret storage target name is an
argument. The launcher validates the stored Discourse key as exactly 64
hexadecimal characters; it does not trim, join, repair, hash, partially
display, or fingerprint malformed material.

The Windows adapter is optional. It is not required when the established
protected vault record is available.

After validation, the launcher creates one isolated Node process and injects
the key only into that process environment. Existing Discourse key variables
are removed from the child environment before the validated key is installed.
The CLI path, command, config, report path, site URL, actor, and credential
target are passed independently; the key is never added to the argument list.
The Discourse client scrubs the exact key if a remote response or network error
reflects it. The launcher forwards stdout and stderr concurrently in real time,
so per-topic progress and rate-limit waits remain visible without a redirected
pipe deadlock. It removes the key from its process-start state and disposes the
child process on success or failure.

The transport does not create or provision credentials. The normal product
model is a durable, named Bridge machine identity backed by a user-created
Discourse API key with the minimum Discourse permissions needed for its assigned
read or write lane. The key belongs in an approved protected store and is reused
for routine authorized tasks without copying, recreating, or revoking it per
run.

Credential rotation follows a defined policy. Revocation is reserved for
compromise, suspected misuse, identity retirement, or a material permission
change. The currently exposed historical keys are an exceptional remediation
case, not the normal operating model.

### Acquisition and setup burden

Context, Notepad, the existing vault, and manual copy have historically been a
workable one-time provisioning path outside the Codex terminal. They must not
become a per-task ritual. A durable credential should be provisioned once into
an approved protected provider, then selected by its non-secret identity or
target name for later authorized runs.

The benefit of that added step is that every subsequent PowerShell command
contains only the non-secret credential target name. The key is not pasted into
PowerShell, placed in PSReadLine history, passed in process arguments, or stored
in a plaintext file. Windows protects the stored value for the signed-in user,
and the launcher supplies it only to the isolated planner child.

If review concludes that this GUI step is more burdensome than the established
Context/Notepad workflow, the alternative must still provide the same
properties. In particular, an unsaved Notepad value cannot be converted into a
PowerShell environment variable through a literal assignment, `Read-Host`, or
an unreviewed clipboard command. No alternative is approved merely because it
worked in a different terminal previously.

## Execution contract

The final operator runbook must:

1. Begin only after revocation and history-remediation confirmation.
2. Use the approved durable Bridge read identity and its user-created Discourse
   API key from the configured protected storage provider. Do not create, copy,
   rotate, or revoke a key merely to run this task.
3. Use a normal Windows PowerShell window and single-line, noninteractive
   invocations. It must not use PowerShell
   backticks, `Read-Host`, clipboard text, stdin paste, or key literals.
4. Run the canonical one-topic preflight first and stop on any failure.
5. Run the paced 307-topic planner only after preflight passes.
6. Show every completed topic and every bounded rate-limit wait.
7. Remove transient process credential state after use. Leave the durable
   credential in its protected provider unless the security or rotation policy
   requires action.
8. Inspect the create-only report and confirm its zero-write declaration before
   any population or publication decision.

Automatic bounded retries within one invocation are not separate operator
attempts. A separately initiated invocation is an operator attempt; stop after
two failed attempts and return evidence to the implementation lane.

## Canary evidence

Automated tests use only a fake 64-character hexadecimal canary. They:

- store the canary in a session-scoped fake Windows Credential Manager entry;
- pass only the credential target name through the launcher argument list;
- verify the exact key reaches the mocked Discourse authentication header;
- verify malformed, whitespace-split, empty, wrong-length, non-hex, and
  multi-record values fail before any request;
- verify reflected credentials are redacted from output;
- verify preflight performs only the canonical topic and raw-post GETs;
- verify planner progress and its create-only zero-write report;
- verify the canary is absent from stdout, stderr, and serialized evidence;
- verify progress reaches the parent before a delayed child exits;
- exercise a large simultaneous stdout/error boundary without deadlock; and
- delete the fake Windows credential after the test.

The production launcher contains no test credential provider or TLS-bypass
switch. Tests use the real Windows Credential Manager read path and trust a
short-lived local test certificate through the test process environment.

## Remaining gates

- Confirm both historically exposed keys are revoked as exceptional remediation.
- Remediate and non-secretly verify all relevant PowerShell history, process
  environment, clipboard, transcript, temporary-file, and captured-output
  locations.
- Demonstrate the transport with a fake canary in the exact operator terminal
  surface and verify no canary leakage.
- Define the durable identity's scope, owner, audit trail, rotation interval,
  and compromise/revocation procedure.
- Obtain Code Boss approval of the implementation and the final exact
  Phil-facing runbook.

Until every gate passes, operator use remains blocked.

## Handoff warning

Do not infer normal credential doctrine from this incident runbook. Literal-key
history exposure and malformed clipboard capture were exceptional failures in
one operator surface. They do not change the settled product rule that routine
Bridge operations use durable user-created Discourse API keys through Phil's
known operator workflow and improved Bridge tooling.

When this work moves to a successor task, transfer the product invariant, the
known vault/Context/Notepad workflow, the distinction between normal operation
and exceptional remediation, and the reasons for every settled decision.
Transferring only files, commits, and current gate status is insufficient.

Before resuming this runbook after a handoff, present the Bridge Boss Successor
Readiness Checkpoint: invariants, known working workflows, exceptional
incidents, current blocked/unblocked state, exact next action, and out-of-scope
work. Wait for Phil's acceptance before issuing a command or changing design.
