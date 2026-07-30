[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Write', 'Delete')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$Target
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace DiscussionBridgeTest {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct NativeCredential {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  public static class NativeCredentialMethods {
    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref NativeCredential credential, uint flags);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string target, uint type, uint flags);
  }
}
'@

if ($Action -eq 'Delete') {
  $deleted = [DiscussionBridgeTest.NativeCredentialMethods]::CredDelete($Target, 1, 0)
  if (-not $deleted -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168) {
    throw 'The fake Windows credential could not be deleted.'
  }
  exit 0
}

$canary = [Environment]::GetEnvironmentVariable(
  'DISCUSSION_BRIDGE_TRANSPORT_TEST_CANARY',
  [EnvironmentVariableTarget]::Process
)
$isEmptyCanary = [Environment]::GetEnvironmentVariable(
  'DISCUSSION_BRIDGE_TRANSPORT_TEST_EMPTY',
  [EnvironmentVariableTarget]::Process
) -eq '1'
[Environment]::SetEnvironmentVariable(
  'DISCUSSION_BRIDGE_TRANSPORT_TEST_CANARY',
  $null,
  [EnvironmentVariableTarget]::Process
)
[Environment]::SetEnvironmentVariable(
  'DISCUSSION_BRIDGE_TRANSPORT_TEST_EMPTY',
  $null,
  [EnvironmentVariableTarget]::Process
)
if ($isEmptyCanary) {
  $canary = ''
}
if ($null -eq $canary) {
  throw 'The fake credential fixture requires a canary record.'
}

$blob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($canary)
try {
  $credential = [DiscussionBridgeTest.NativeCredential]::new()
  $credential.Type = 1
  $credential.TargetName = $Target
  $credential.UserName = 'DiscussionBridge transport canary'
  $credential.CredentialBlobSize = [uint32]($canary.Length * 2)
  $credential.CredentialBlob = $blob
  $credential.Persist = 1
  if (-not [DiscussionBridgeTest.NativeCredentialMethods]::CredWrite([ref]$credential, 0)) {
    throw 'The fake Windows credential could not be written.'
  }
} finally {
  if ($blob -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($blob)
  }
  $canary = $null
}
