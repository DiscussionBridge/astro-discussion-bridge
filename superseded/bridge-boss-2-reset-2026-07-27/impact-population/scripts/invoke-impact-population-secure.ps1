[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Preflight', 'Plan')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$CredentialTarget,

  [Parameter(Mandatory = $true)]
  [string]$DiscourseUrl,

  [Parameter(Mandatory = $true)]
  [string]$RequestActor,

  [Parameter(Mandatory = $true)]
  [string]$ConfigPath,

  [string]$ReportOut
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-WindowsCredentialSecret {
  param([Parameter(Mandatory = $true)][string]$Target)

  if (-not ('DiscussionBridge.NativeCredentialMethods' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DiscussionBridge {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct NativeCredential {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  public static class NativeCredentialMethods {
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr credential);
  }

  public static class ProcessOutputForwarder {
    public static void Attach(Process process) {
      process.OutputDataReceived += (_, eventArgs) => {
        if (eventArgs.Data != null) Console.Out.WriteLine(eventArgs.Data);
      };
      process.ErrorDataReceived += (_, eventArgs) => {
        if (eventArgs.Data != null) Console.Error.WriteLine(eventArgs.Data);
      };
    }
  }
}
'@
  }

  $credentialPointer = [IntPtr]::Zero
  try {
    $read = [DiscussionBridge.NativeCredentialMethods]::CredRead(
      $Target,
      1,
      0,
      [ref]$credentialPointer
    )
    if (-not $read) {
      throw 'The required Windows Credential Manager entry could not be read.'
    }
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
      $credentialPointer,
      [type][DiscussionBridge.NativeCredential]
    )
    if ($credential.CredentialBlobSize -eq 0) {
      return ''
    }
    if (($credential.CredentialBlobSize % 2) -ne 0) {
      throw 'The Windows credential has an unsupported representation.'
    }
    return [Runtime.InteropServices.Marshal]::PtrToStringUni(
      $credential.CredentialBlob,
      [int]($credential.CredentialBlobSize / 2)
    )
  } finally {
    if ($credentialPointer -ne [IntPtr]::Zero) {
      [DiscussionBridge.NativeCredentialMethods]::CredFree($credentialPointer)
    }
  }
}

function Assert-ExactDiscourseApiKey {
  param([AllowNull()][string]$Secret)

  if ($null -eq $Secret -or $Secret -notmatch '\A[0-9a-fA-F]{64}\z') {
    throw 'The stored credential is not an exact Discourse API key; no request was made.'
  }
}

if ($Mode -eq 'Plan' -and [string]::IsNullOrWhiteSpace($ReportOut)) {
  throw 'Plan mode requires ReportOut.'
}
if ($Mode -eq 'Preflight' -and -not [string]::IsNullOrEmpty($ReportOut)) {
  throw 'Preflight mode does not accept ReportOut.'
}
if (-not [Uri]::IsWellFormedUriString($DiscourseUrl, [UriKind]::Absolute)) {
  throw 'DiscourseUrl must be an absolute URL.'
}
if ([string]::IsNullOrWhiteSpace($RequestActor)) {
  throw 'RequestActor is required.'
}

$secret = $null
$process = $null
$startInfo = $null
try {
  $secret = Get-WindowsCredentialSecret -Target $CredentialTarget

  Assert-ExactDiscourseApiKey -Secret $secret

  $repositoryRoot = Split-Path -Parent $PSScriptRoot
  $cliPath = Join-Path $repositoryRoot 'packages\astro-discussion-bridge\dist\cli.js'
  if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
    throw 'The built DiscussionBridge CLI was not found.'
  }

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = (Get-Command node -ErrorAction Stop).Source
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $startInfo.Environment.Remove('DISCOURSE_API_KEY') | Out-Null
  $startInfo.Environment.Remove('DISCOURSE_DIAGNOSTICS_API_KEY') | Out-Null
  $startInfo.Environment['DISCOURSE_URL'] = $DiscourseUrl
  $startInfo.Environment['DISCOURSE_POST_AS'] = $RequestActor
  $startInfo.Environment['DISCOURSE_DIAGNOSTICS_API_KEY'] = $secret
  $startInfo.ArgumentList.Add($cliPath)
  $startInfo.ArgumentList.Add(
    $(if ($Mode -eq 'Preflight') { 'preflight-impact-population' } else { 'plan-impact-population' })
  )
  $startInfo.ArgumentList.Add('--config')
  $startInfo.ArgumentList.Add((Resolve-Path -LiteralPath $ConfigPath).Path)
  if ($Mode -eq 'Plan') {
    $startInfo.ArgumentList.Add('--report-out')
    $startInfo.ArgumentList.Add([IO.Path]::GetFullPath($ReportOut))
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [DiscussionBridge.ProcessOutputForwarder]::Attach($process)
  if (-not $process.Start()) {
    throw 'The isolated DiscussionBridge process could not be started.'
  }
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    exit $process.ExitCode
  }
} finally {
  if ($null -ne $startInfo) {
    $startInfo.Environment.Remove('DISCOURSE_DIAGNOSTICS_API_KEY') | Out-Null
  }
  if ($null -ne $process) {
    $process.Dispose()
  }
  $secret = $null
  $startInfo = $null
  $process = $null
}
