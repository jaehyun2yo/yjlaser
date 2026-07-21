[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$ProjectRef,

    [Parameter(Mandatory)]
    [string]$RailwayProjectId,

    [Parameter(Mandatory)]
    [string]$RailwayEnvironmentId,

    [Parameter(Mandatory)]
    [string]$RailwayServiceId,

    [Parameter(Mandatory)]
    [uri]$HealthUrl,

    [string]$DopplerProject = 'yjlaser',

    [string]$DopplerConfig = 'prd',

    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credential-rotation-lock.ps1')
$script:ApiDirectory = Resolve-Path (
    Join-Path (Split-Path $PSScriptRoot -Parent) 'webhard-api'
)

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class SupabaseCliCredentialReader
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Credential
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr credentialPtr);

    public static byte[] ReadBlob(string target)
    {
        IntPtr credentialPtr;
        if (!CredRead(target, 1, 0, out credentialPtr))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        try
        {
            Credential credential = Marshal.PtrToStructure<Credential>(credentialPtr);
            byte[] blob = new byte[credential.CredentialBlobSize];
            if (blob.Length > 0)
            {
                Marshal.Copy(credential.CredentialBlob, blob, 0, blob.Length);
            }
            return blob;
        }
        finally
        {
            CredFree(credentialPtr);
        }
    }
}
'@

function Invoke-SecretInputCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [AllowNull()]
        [string]$InputValue,

        [Parameter(Mandatory)]
        [string]$Operation
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.RedirectStandardInput = $null -ne $InputValue

    foreach ($argument in $Arguments) {
        [void]$startInfo.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()

    if ($null -ne $InputValue) {
        $process.StandardInput.Write($InputValue)
        $process.StandardInput.Close()
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    [void]$stderrTask.GetAwaiter().GetResult()

    if ($process.ExitCode -ne 0) {
        throw "$Operation failed with exit code $($process.ExitCode)"
    }

    return $stdout
}

function Set-SupabasePassword {
    param(
        [Parameter(Mandatory)]
        [string]$Endpoint,

        [Parameter(Mandatory)]
        [hashtable]$Headers,

        [Parameter(Mandatory)]
        [string]$Password
    )

    $body = @{ password = $Password } | ConvertTo-Json -Compress
    [void](Invoke-RestMethod -Method Patch -Uri $Endpoint -Headers $Headers -Body $body)
}

function Set-DopplerSecret {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$Value
    )

    [void](Invoke-SecretInputCommand `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'secrets', 'set', $Name,
            '--project', $DopplerProject,
            '--config', $DopplerConfig,
            '--no-interactive', '--silent'
        ) `
        -InputValue $Value `
        -Operation "Doppler $Name update")
}

function Set-RailwayVariable {
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$Value
    )

    [void](Invoke-SecretInputCommand `
        -Executable $script:RailwayExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'variable', 'set', $Name, '--stdin', '--skip-deploys', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $Value `
        -Operation "Railway $Name update")
}

function Request-RailwayRedeploy {
    $output = Invoke-SecretInputCommand `
        -Executable $script:RailwayExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'service', 'redeploy', '--yes', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $null `
        -Operation 'Railway redeploy'

    $guidMatch = [regex]::Match(
        $output,
        '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    )

    if ($guidMatch.Success) {
        return $guidMatch.Value
    }

    return $null
}

function Wait-RailwayDeploymentSuccess {
    param(
        [Parameter(Mandatory)]
        [string]$DeploymentId
    )

    if ([string]::IsNullOrWhiteSpace($DeploymentId)) {
        throw 'Railway redeploy did not return a deployment ID'
    }

    for ($attempt = 1; $attempt -le 48; $attempt += 1) {
        $raw = Invoke-SecretInputCommand `
            -Executable $script:RailwayExecutable `
            -Arguments @(
                $script:RailwayCliScript,
                'deployment', 'list', '--json',
                '--project', $RailwayProjectId,
                '--environment', $RailwayEnvironmentId,
                '--service', $RailwayServiceId
            ) `
            -InputValue $null `
            -Operation 'Railway deployment status read'
        $deployment = @($raw | ConvertFrom-Json) |
            Where-Object { $_.id -eq $DeploymentId } |
            Select-Object -First 1

        if ($null -ne $deployment) {
            if ($deployment.status -eq 'SUCCESS') {
                return
            }
            if ($deployment.status -in @('FAILED', 'CRASHED', 'REMOVED')) {
                throw "Railway deployment entered terminal status $($deployment.status)"
            }
        }
        Start-Sleep -Seconds 5
    }

    throw 'Railway deployment success was not observed before timeout'
}

function Wait-ServiceHealth {
    for ($attempt = 1; $attempt -le 12; $attempt += 1) {
        try {
            $response = Invoke-RestMethod -Method Get -Uri $HealthUrl -TimeoutSec 20
            if ($response.status -eq 'ok') {
                return
            }
        }
        catch {
            # A deployment can briefly close the health endpoint while replacing the instance.
        }
        Start-Sleep -Seconds 5
    }

    throw 'Service health did not recover before timeout'
}

function Get-DatabaseUrlCredentialState {
    param(
        [Parameter(Mandatory)]
        [string]$ConnectionUrl
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = (Get-Command node.exe).Source
    $startInfo.WorkingDirectory = $script:ApiDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Environment['DATABASE_TEST_URL'] = $ConnectionUrl

    foreach ($argument in @(
        '-e',
        @'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_TEST_URL });
(async () => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    process.stdout.write('Accepted');
  } catch (error) {
    const summary = `${error && error.code || ''} ${error && error.message || ''}`;
    if (/P1000|authentication failed|password authentication failed|SASL.*auth|invalid SCRAM/i.test(summary)) {
      process.stdout.write('Rejected');
    } else {
      process.stdout.write('Indeterminate');
    }
  } finally {
    await prisma.$disconnect();
  }
})();
'@
    )) {
        [void]$startInfo.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.StandardInput.Close()

    $completed = $process.WaitForExit(20000)
    if (-not $completed) {
        $process.Kill($true)
        $process.WaitForExit()
        return 'Indeterminate'
    }

    $stdout = $process.StandardOutput.ReadToEnd().Trim()
    [void]$process.StandardError.ReadToEnd()
    if ($process.ExitCode -eq 0 -and $stdout -in @('Accepted', 'Rejected', 'Indeterminate')) {
        return $stdout
    }

    return 'Indeterminate'
}

function Get-DatabaseCredentialState {
    param(
        [Parameter(Mandatory)]
        [string]$DatabaseUrl,

        [Parameter(Mandatory)]
        [string]$DirectUrl
    )

    $databaseState = Get-DatabaseUrlCredentialState -ConnectionUrl $DatabaseUrl
    $directState = Get-DatabaseUrlCredentialState -ConnectionUrl $DirectUrl
    if ($databaseState -eq 'Accepted' -and $directState -eq 'Accepted') {
        return 'Accepted'
    }
    if ($databaseState -eq 'Rejected' -and $directState -eq 'Rejected') {
        return 'Rejected'
    }
    return 'Indeterminate'
}

function Wait-NewCredentialsAccepted {
    param(
        [Parameter(Mandatory)]
        [string]$DatabaseUrl,

        [Parameter(Mandatory)]
        [string]$DirectUrl
    )

    for ($attempt = 1; $attempt -le 6; $attempt += 1) {
        $state = Get-DatabaseCredentialState `
            -DatabaseUrl $DatabaseUrl `
            -DirectUrl $DirectUrl
        if ($state -eq 'Accepted') {
            return $true
        }
        Start-Sleep -Seconds 5
    }

    return $false
}

function Wait-OldCredentialsRejected {
    param(
        [Parameter(Mandatory)]
        [string]$DatabaseUrl,

        [Parameter(Mandatory)]
        [string]$DirectUrl
    )

    for ($attempt = 1; $attempt -le 3; $attempt += 1) {
        $state = Get-DatabaseCredentialState `
            -DatabaseUrl $DatabaseUrl `
            -DirectUrl $DirectUrl
        if ($state -eq 'Rejected') {
            return $true
        }
        Start-Sleep -Seconds 5
    }

    return $false
}

$script:DopplerExecutable = (Get-Command doppler).Source
$script:RailwayExecutable = (Get-Command node.exe).Source
$railwayShimDirectory = Split-Path (Get-Command railway.ps1).Source -Parent
$script:RailwayCliScript = Join-Path `
    $railwayShimDirectory `
    'node_modules\@railway\cli\bin\railway.js'
if (-not (Test-Path -LiteralPath $script:RailwayCliScript)) {
    throw 'Railway CLI script was not found'
}

$oldDatabaseUrl = (doppler secrets get DATABASE_URL --plain --raw `
    --project $DopplerProject --config $DopplerConfig --silent).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to read current Doppler DATABASE_URL'
}

$oldDirectUrl = (doppler secrets get DIRECT_URL --plain --raw `
    --project $DopplerProject --config $DopplerConfig --silent).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to read current Doppler DIRECT_URL'
}

$railwayRaw = railway variable list --json `
    --project $RailwayProjectId `
    --environment $RailwayEnvironmentId `
    --service $RailwayServiceId 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to read Railway variable bindings'
}

$railwayVariables = $railwayRaw | ConvertFrom-Json
if (
    $oldDatabaseUrl -cne [string]$railwayVariables.DATABASE_URL -or
    $oldDirectUrl -cne [string]$railwayVariables.DIRECT_URL
) {
    throw 'Doppler and Railway database bindings diverged before rotation'
}

$databaseBuilder = [UriBuilder]::new($oldDatabaseUrl)
$directBuilder = [UriBuilder]::new($oldDirectUrl)
$oldPassword = [Uri]::UnescapeDataString($databaseBuilder.Password)
$directPassword = [Uri]::UnescapeDataString($directBuilder.Password)

if (
    [string]::IsNullOrWhiteSpace($oldPassword) -or
    $oldPassword -cne $directPassword
) {
    throw 'Current database password binding is missing or inconsistent'
}

if (
    $oldDatabaseUrl -notmatch [regex]::Escape($ProjectRef) -or
    $oldDirectUrl -notmatch [regex]::Escape($ProjectRef)
) {
    throw 'Production project binding check failed'
}

$currentCredentialState = Get-DatabaseCredentialState `
    -DatabaseUrl $oldDatabaseUrl `
    -DirectUrl $oldDirectUrl
if ($currentCredentialState -ne 'Accepted') {
    throw 'Current database credential state is not accepted on both URLs'
}

if (-not $Execute) {
    [pscustomobject]@{
        Ready = $true
        ProjectRef = $ProjectRef
        DopplerBindingsMatchRailway = $true
        PasswordsConsistent = $true
        ChangesApplied = $false
    } | ConvertTo-Json
    exit 0
}

$randomBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(36)
$newPassword = 'Aa1-' + [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$databaseBuilder.Password = $newPassword
$directBuilder.Password = $newPassword
$newDatabaseUrl = $databaseBuilder.Uri.AbsoluteUri
$newDirectUrl = $directBuilder.Uri.AbsoluteUri

$accessToken = [Text.Encoding]::UTF8.GetString(
    [SupabaseCliCredentialReader]::ReadBlob('Supabase CLI:supabase')
).Trim([char]0)
if ($accessToken -notmatch '^sbp_[A-Za-z0-9_-]+$') {
    throw 'Supabase CLI credential shape check failed'
}

$headers = @{
    Authorization = "Bearer $accessToken"
    'Content-Type' = 'application/json'
}
$passwordEndpoint = "https://api.supabase.com/v1/projects/$ProjectRef/database/password"

$supabaseChanged = $false
$supabaseWriteAttempted = $false
$dopplerDatabaseChanged = $false
$dopplerDirectChanged = $false
$dopplerDatabaseWriteAttempted = $false
$dopplerDirectWriteAttempted = $false
$railwayDatabaseChanged = $false
$railwayDirectChanged = $false
$railwayDatabaseWriteAttempted = $false
$railwayDirectWriteAttempted = $false
$newCredentialsAccepted = $false
$oldCredentialsRejected = $false
$unsafeToRollback = $false
$currentStage = 'preflight'
$rotationLock = $null

try {
    $currentStage = 'credential_rotation_lock'
    $rotationLock = Start-CredentialRotationLock `
        -ApiDirectory $script:ApiDirectory `
        -DirectUrl $oldDirectUrl `
        -ProjectRef $ProjectRef

    $currentStage = 'supabase_password_update'
    $supabaseWriteAttempted = $true
    Set-SupabasePassword -Endpoint $passwordEndpoint -Headers $headers -Password $newPassword
    $supabaseChanged = $true

    $currentStage = 'doppler_database_url_update'
    $dopplerDatabaseWriteAttempted = $true
    Set-DopplerSecret -Name 'DATABASE_URL' -Value $newDatabaseUrl
    $dopplerDatabaseChanged = $true
    $currentStage = 'doppler_direct_url_update'
    $dopplerDirectWriteAttempted = $true
    Set-DopplerSecret -Name 'DIRECT_URL' -Value $newDirectUrl
    $dopplerDirectChanged = $true

    $currentStage = 'railway_database_url_update'
    $railwayDatabaseWriteAttempted = $true
    Set-RailwayVariable -Name 'DATABASE_URL' -Value $newDatabaseUrl
    $railwayDatabaseChanged = $true
    $currentStage = 'railway_direct_url_update'
    $railwayDirectWriteAttempted = $true
    Set-RailwayVariable -Name 'DIRECT_URL' -Value $newDirectUrl
    $railwayDirectChanged = $true

    $currentStage = 'railway_redeploy'
    $deploymentId = Request-RailwayRedeploy

    $currentStage = 'new_credentials_verification'
    $newCredentialsAccepted = Wait-NewCredentialsAccepted `
        -DatabaseUrl $newDatabaseUrl `
        -DirectUrl $newDirectUrl
    if (-not $newCredentialsAccepted) {
        throw 'New database credentials were not accepted'
    }

    $currentStage = 'railway_deployment_verification'
    Wait-RailwayDeploymentSuccess -DeploymentId $deploymentId
    $currentStage = 'service_health_verification'
    Wait-ServiceHealth

    $currentStage = 'old_credentials_rejection'
    $oldCredentialsRejected = Wait-OldCredentialsRejected `
        -DatabaseUrl $oldDatabaseUrl `
        -DirectUrl $oldDirectUrl
    if (-not $oldCredentialsRejected) {
        $unsafeToRollback = $true
        throw 'Old database credentials are still accepted'
    }

    [pscustomobject]@{
        SupabasePasswordUpdated = $supabaseChanged
        DopplerBindingsUpdated = $dopplerDatabaseChanged -and $dopplerDirectChanged
        RailwayBindingsUpdated = $railwayDatabaseChanged -and $railwayDirectChanged
        RailwayRedeployRequested = $true
        DeploymentId = $deploymentId
        NewCredentialsAccepted = $newCredentialsAccepted
        OldCredentialsRejected = $oldCredentialsRejected
        RollbackNeeded = $false
    } | ConvertTo-Json
}
catch {
    $originalError = $_.Exception.Message
    $rollbackErrors = [System.Collections.Generic.List[string]]::new()

    if ($unsafeToRollback) {
        throw 'Rotation completed but old credential rejection was not observed'
    }

    if (-not (
        $supabaseWriteAttempted -or
        $dopplerDatabaseWriteAttempted -or
        $dopplerDirectWriteAttempted -or
        $railwayDatabaseWriteAttempted -or
        $railwayDirectWriteAttempted
    )) {
        throw $originalError
    }

    try {
        if ($supabaseWriteAttempted) {
            $passwordOwnedByRun = $false
            $passwordAlreadyRestored = $false
            for ($attempt = 1; $attempt -le 6; $attempt += 1) {
                $oldState = Get-DatabaseCredentialState `
                    -DatabaseUrl $oldDatabaseUrl `
                    -DirectUrl $oldDirectUrl
                $newState = Get-DatabaseCredentialState `
                    -DatabaseUrl $newDatabaseUrl `
                    -DirectUrl $newDirectUrl
                if ($oldState -eq 'Accepted') {
                    $passwordAlreadyRestored = $true
                    break
                }
                if ($newState -eq 'Accepted') {
                    $passwordOwnedByRun = $true
                    break
                }
                Start-Sleep -Seconds 5
            }
            if (-not $passwordAlreadyRestored -and -not $passwordOwnedByRun) {
                throw 'Supabase password rollback ownership is indeterminate'
            }
            if ($passwordOwnedByRun) {
                Set-SupabasePassword -Endpoint $passwordEndpoint -Headers $headers -Password $oldPassword
            }

            $rollbackVerified = $false
            for ($attempt = 1; $attempt -le 6; $attempt += 1) {
                $oldState = Get-DatabaseCredentialState `
                    -DatabaseUrl $oldDatabaseUrl `
                    -DirectUrl $oldDirectUrl
                $newState = Get-DatabaseCredentialState `
                    -DatabaseUrl $newDatabaseUrl `
                    -DirectUrl $newDirectUrl
                if ($oldState -eq 'Accepted' -and $newState -eq 'Rejected') {
                    $rollbackVerified = $true
                    break
                }
                Start-Sleep -Seconds 5
            }

            if (-not $rollbackVerified) {
                throw 'Supabase password rollback state is indeterminate'
            }
        }
    }
    catch {
        $rollbackErrors.Add('Supabase password rollback failed')
    }

    try {
        $currentDopplerDatabaseUrl = (doppler secrets get DATABASE_URL --plain --raw `
            --project $DopplerProject --config $DopplerConfig --silent).Trim()
        $currentDopplerDirectUrl = (doppler secrets get DIRECT_URL --plain --raw `
            --project $DopplerProject --config $DopplerConfig --silent).Trim()
        if (
            $LASTEXITCODE -ne 0 -or
            $currentDopplerDatabaseUrl -cnotin @($oldDatabaseUrl, $newDatabaseUrl) -or
            $currentDopplerDirectUrl -cnotin @($oldDirectUrl, $newDirectUrl)
        ) {
            throw 'Doppler binding rollback ownership conflict'
        }

        if ($dopplerDatabaseWriteAttempted) {
            Set-DopplerSecret -Name 'DATABASE_URL' -Value $oldDatabaseUrl
        }
        if ($dopplerDirectWriteAttempted) {
            Set-DopplerSecret -Name 'DIRECT_URL' -Value $oldDirectUrl
        }

        $restoredDatabaseUrl = (doppler secrets get DATABASE_URL --plain --raw `
            --project $DopplerProject --config $DopplerConfig --silent).Trim()
        $restoredDirectUrl = (doppler secrets get DIRECT_URL --plain --raw `
            --project $DopplerProject --config $DopplerConfig --silent).Trim()
        if (
            $LASTEXITCODE -ne 0 -or
            $restoredDatabaseUrl -cne $oldDatabaseUrl -or
            $restoredDirectUrl -cne $oldDirectUrl
        ) {
            throw 'Doppler binding rollback read-back mismatch'
        }
    }
    catch {
        $rollbackErrors.Add('Doppler binding rollback failed')
    }

    try {
        $currentRailwayRaw = Invoke-SecretInputCommand `
            -Executable $script:RailwayExecutable `
            -Arguments @(
                $script:RailwayCliScript,
                'variable', 'list', '--json',
                '--project', $RailwayProjectId,
                '--environment', $RailwayEnvironmentId,
                '--service', $RailwayServiceId
            ) `
            -InputValue $null `
            -Operation 'Railway rollback ownership read'
        $currentRailway = $currentRailwayRaw | ConvertFrom-Json
        if (
            [string]$currentRailway.DATABASE_URL -cnotin @($oldDatabaseUrl, $newDatabaseUrl) -or
            [string]$currentRailway.DIRECT_URL -cnotin @($oldDirectUrl, $newDirectUrl)
        ) {
            throw 'Railway binding rollback ownership conflict'
        }

        if ($railwayDatabaseWriteAttempted) {
            Set-RailwayVariable -Name 'DATABASE_URL' -Value $oldDatabaseUrl
        }
        if ($railwayDirectWriteAttempted) {
            Set-RailwayVariable -Name 'DIRECT_URL' -Value $oldDirectUrl
        }
        if ($railwayDatabaseWriteAttempted -or $railwayDirectWriteAttempted) {
            $restoredRailwayRaw = Invoke-SecretInputCommand `
                -Executable $script:RailwayExecutable `
                -Arguments @(
                    $script:RailwayCliScript,
                    'variable', 'list', '--json',
                    '--project', $RailwayProjectId,
                    '--environment', $RailwayEnvironmentId,
                    '--service', $RailwayServiceId
                ) `
                -InputValue $null `
                -Operation 'Railway rollback read-back'
            $restoredRailway = $restoredRailwayRaw | ConvertFrom-Json
            if (
                [string]$restoredRailway.DATABASE_URL -cne $oldDatabaseUrl -or
                [string]$restoredRailway.DIRECT_URL -cne $oldDirectUrl
            ) {
                throw 'Railway binding rollback read-back mismatch'
            }

            $rollbackDeploymentId = Request-RailwayRedeploy
            Wait-RailwayDeploymentSuccess -DeploymentId $rollbackDeploymentId
            Wait-ServiceHealth
        }
    }
    catch {
        $rollbackErrors.Add('Railway binding rollback failed')
    }

    if ($rollbackErrors.Count -eq 0) {
        throw "Rotation failed at $currentStage and rollback completed"
    }

    throw "Rotation failed at $currentStage; $($rollbackErrors -join '; ')"
}
finally {
    if ($null -ne $rotationLock) {
        Stop-CredentialRotationLock -LockHandle $rotationLock
    }
    $accessToken = $null
    $oldPassword = $null
    $newPassword = $null
    $directPassword = $null
    $oldDatabaseUrl = $null
    $oldDirectUrl = $null
    $newDatabaseUrl = $null
    $newDirectUrl = $null
    [GC]::Collect()
}
