# OBBBA Impact Population Operator Runbook

Date: 2026-07-25  
Status: Accepted; Code Boss final GET-only regeneration gate PASS

## Objective and authority

Produce the comparison-only report across the 307 configured OBBBA Impact
topics. The operation performs authenticated GET requests and creates one local
JSON report. It performs no Discourse writes and no Astro content writes.

The operation uses the active user-created Discourse API key described as
`read-only diagnostics key`, bound to `obbba-bot` with
Discourse scope `Read-only`.

The key remains in the operator's approved protected credential record. Its
private filesystem location is intentionally excluded from this public
evidence. Before running the sequence, the operator supplies that location in
`DISCOURSE_DIAGNOSTICS_API_KEY_FILE`.

Only the environment-variable reference enters the reviewed command text. The
key does not enter command text, PSReadLine history, an interactive prompt,
stdout, stderr, or the report. The explicit credential-record argument
overrides stale inherited key environment variables.

## Confirmed prerequisites

- Exceptional exposed/test-key revocation and deletion: operator confirmed
  complete.
- Existing granular publishing key: active and out of scope.
- Global diagnostics key: active and out of scope.
- Read-only diagnostics key: active and saved in the protected credential
  store.
- Temporary bulk/diagnostics/import key: not created and not required for this
  first attempt.
- Credential-record path: existence confirmed without reading its contents.
- CLI and configuration paths: present.
- Report output path: absent; create-only behavior is preserved.
- Code implementation: Code Boss PASS; focused 25/25 and full 144/144 tests
  passed.

## Entire command sequence

Run in a normal Windows PowerShell window, one line at a time. Do not use the
Codex/app terminal. Do not paste the visible `PS C:\...>` prompt prefix.

### 1. Enter the repository

```powershell
Set-Location 'C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge'
```

Stop if the path does not exist.

### 2. Build the reviewed CLI

```powershell
npm.cmd --prefix '.\packages\astro-discussion-bridge' run build
```

Use `npm.cmd` explicitly in Windows PowerShell so the command does not resolve
to the execution-policy-blocked `npm.ps1` shim. Do not change the machine or
user PowerShell execution policy. Stop on any build error.

### 3. Run the two-request read-only preflight

```powershell
node '.\packages\astro-discussion-bridge\dist\cli.js' preflight-impact-population --config '.\examples\obbba-impact-population.config.json' --diagnostics-api-key-file $env:DISCOURSE_DIAGNOSTICS_API_KEY_FILE --discourse-url 'https://forum.repealobbba.org' --post-as 'obbba-bot'
```

Expected: visible progress followed by `Preflight PASS`. The command reads only
frozen placeholder topic `1002` and first post `1009`, uses GET requests only,
and writes no report.

Stop immediately if:

- the credential record is absent, empty, formatted incorrectly, contains the wrong
  number of exact 64-character key lines, or otherwise fails validation;
- the response is 401, 403, 404, a terminal 429, or any other failure;
- `Preflight PASS` is absent.

Do not create the temporary bulk key or retry with the Global diagnostics key
without reviewing the sanitized failure first.

### 4. Produce the complete comparison-only report

Run only after Step 3 passes:

```powershell
node '.\packages\astro-discussion-bridge\dist\cli.js' plan-impact-population --config '.\examples\obbba-impact-population.config.json' --diagnostics-api-key-file $env:DISCOURSE_DIAGNOSTICS_API_KEY_FILE --discourse-url 'https://forum.repealobbba.org' --post-as 'obbba-bot' --report-out '.\docs\evidence\OBBBA_IMPACT_POPULATION_CORRECTED_DRY_RUN_2026-07-25.json'
```

Expected: per-topic progress through all 307 configured topics, visible bounded
rate-limit waits when needed, successful completion, and exactly one new
create-only report.

Stop on the first terminal failure. Do not delete or rename evidence, invent a
new output path, switch credentials, or repeatedly retry without review.

### 5. Display the safe report summary

Run only after Step 4 succeeds:

```powershell
Get-Content '.\docs\evidence\OBBBA_IMPACT_POPULATION_CORRECTED_DRY_RUN_2026-07-25.json' -Raw | ConvertFrom-Json | Format-List summary,writes
```

Expected:

- `writes.discourse` is `0`;
- `writes.astroContent` is `0`;
- `summary.total` is `307`;
- `summary.placeholder-suppressed` is `172`;
- `summary.review-required` is `135`;
- `summary.publication-candidate` is `0`.

## Handoff

Return the preflight result, planner completion result, displayed `summary` and
`writes`, and the report path.

The read-only diagnostics key remains durable after ordinary successful use.
The report does not authorize publication. Placeholder topics remain linkable
but unpublished. Developed content requires Bridge Boss review and an explicit
publication disposition before any later Astro content generation or
publishing.
