[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$RailwayProjectId,

    [Parameter(Mandatory)]
    [string]$RailwayEnvironmentId,

    [Parameter(Mandatory)]
    [string]$RailwayServiceId,

    [Parameter(Mandatory)]
    [string]$ProjectRef,

    [string]$DopplerProject = 'yjlaser',

    [string]$DopplerConfig = 'prd',

    [string]$NewTokenName = "railway-webhard-api-rotation-$([guid]::NewGuid().ToString('N'))",

    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credential-rotation-lock.ps1')
$script:ApiDirectory = Resolve-Path (
    Join-Path (Split-Path $PSScriptRoot -Parent) 'webhard-api'
)

function Invoke-ProcessCaptured {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [AllowNull()]
        [string]$InputValue,

        [hashtable]$EnvironmentVariables = @{},

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
    foreach ($entry in $EnvironmentVariables.GetEnumerator()) {
        $startInfo.Environment[$entry.Key] = $entry.Value
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
    $stderr = $stderrTask.GetAwaiter().GetResult()

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Stdout = $stdout
        Stderr = $stderr
        Operation = $Operation
    }
}

function Get-DopplerTokenCheck {
    param(
        [Parameter(Mandatory)]
        [string]$Token
    )

    $result = Invoke-ProcessCaptured `
        -Executable $script:DopplerExecutable `
        -Arguments @('me', '--json', '--silent') `
        -InputValue $null `
        -EnvironmentVariables @{ DOPPLER_TOKEN = $Token } `
        -Operation 'Doppler token metadata check'

    if ($result.ExitCode -eq 0) {
        try {
            $metadata = $result.Stdout | ConvertFrom-Json
            if ($metadata.type) {
                return [pscustomobject]@{
                    State = 'Accepted'
                    Metadata = $metadata
                }
            }
        }
        catch {
            return [pscustomobject]@{
                State = 'Indeterminate'
                Metadata = $null
            }
        }
    }

    $combinedOutput = "$($result.Stdout)`n$($result.Stderr)"
    if ($combinedOutput -match '401|unauthorized|invalid.*token|authentication.*failed|access token.*invalid') {
        return [pscustomobject]@{
            State = 'Rejected'
            Metadata = $null
        }
    }

    return [pscustomobject]@{
        State = 'Indeterminate'
        Metadata = $null
    }
}

function Get-DopplerTokenMetadata {
    param(
        [Parameter(Mandatory)]
        [string]$Token
    )

    $check = Get-DopplerTokenCheck -Token $Token
    if ($check.State -ne 'Accepted') {
        return $null
    }

    return $check.Metadata
}

function Test-DopplerTokenReadAccess {
    param(
        [Parameter(Mandatory)]
        [string]$Token
    )

    $result = Invoke-ProcessCaptured `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'secrets', '--only-names', '--silent',
            '--project', $DopplerProject,
            '--config', $DopplerConfig
        ) `
        -InputValue $null `
        -EnvironmentVariables @{ DOPPLER_TOKEN = $Token } `
        -Operation 'Doppler token read check'

    return $result.ExitCode -eq 0 -and
        $result.Stdout -match 'DATABASE_URL' -and
        $result.Stdout -match 'SESSION_SECRET'
}

function Set-RailwayDopplerToken {
    param(
        [Parameter(Mandatory)]
        [string]$Token
    )

    $result = Invoke-ProcessCaptured `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'variable', 'set', 'DOPPLER_TOKEN', '--stdin',
            '--skip-deploys', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $Token `
        -Operation 'Railway DOPPLER_TOKEN update'

    if ($result.ExitCode -ne 0) {
        throw 'Railway DOPPLER_TOKEN update failed'
    }
}

function Get-RailwayDopplerToken {
    $result = Invoke-ProcessCaptured `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'variable', 'list', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $null `
        -Operation 'Railway DOPPLER_TOKEN read-back'

    if ($result.ExitCode -ne 0) {
        throw 'Railway DOPPLER_TOKEN read-back failed'
    }

    return [string](($result.Stdout | ConvertFrom-Json).DOPPLER_TOKEN)
}

function Get-DopplerServiceTokens {
    $result = Invoke-ProcessCaptured `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'configs', 'tokens',
            '--project', $DopplerProject,
            '--config', $DopplerConfig,
            '--json', '--silent'
        ) `
        -InputValue $null `
        -Operation 'Doppler service token list'

    if ($result.ExitCode -ne 0) {
        throw 'Doppler service token list failed'
    }

    return @($result.Stdout | ConvertFrom-Json)
}

function Remove-DopplerTokenAndVerify {
    param(
        [Parameter(Mandatory)]
        [string]$Slug
    )

    [void](Invoke-ProcessCaptured `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'configs', 'tokens', 'revoke',
            '--project', $DopplerProject,
            '--config', $DopplerConfig,
            '--slug', $Slug,
            '--silent'
        ) `
        -InputValue $null `
        -Operation 'Doppler service token revoke')

    $stillPresent = @(
        Get-DopplerServiceTokens | Where-Object { $_.slug -eq $Slug }
    ).Count -gt 0
    if ($stillPresent) {
        throw 'Doppler service token revoke state is indeterminate'
    }
}

$script:DopplerExecutable = (Get-Command doppler).Source
$script:NodeExecutable = (Get-Command node.exe).Source
$railwayShimDirectory = Split-Path (Get-Command railway.ps1).Source -Parent
$script:RailwayCliScript = Join-Path `
    $railwayShimDirectory `
    'node_modules\@railway\cli\bin\railway.js'

$oldToken = Get-RailwayDopplerToken
if ($oldToken -notmatch '^dp\.st\.[A-Za-z0-9._-]+$') {
    throw 'Railway DOPPLER_TOKEN is missing or has an unexpected shape'
}

$oldMetadata = Get-DopplerTokenMetadata -Token $oldToken
if ($null -eq $oldMetadata -or $oldMetadata.type -ne 'service_token') {
    throw 'Railway DOPPLER_TOKEN authentication failed'
}

$proposedNameMatches = @(
    Get-DopplerServiceTokens | Where-Object { $_.name -eq $NewTokenName }
)
$newTokenNameAvailable = $proposedNameMatches.Count -eq 0

if (-not $Execute) {
    [pscustomobject]@{
        Ready = $true
        CurrentTokenName = $oldMetadata.name
        CurrentTokenSlug = $oldMetadata.slug
        CurrentTokenAuthenticated = $true
        NewTokenNameAvailable = $newTokenNameAvailable
        ChangesApplied = $false
    } | ConvertTo-Json
    exit 0
}

if (-not $newTokenNameAvailable) {
    throw 'New Doppler service token name already exists; use a unique name'
}

$newToken = $null
$newMetadata = $null
$railwayUpdated = $false
$createAttempted = $false
$railwayWriteAttempted = $false
$oldTokenRevoked = $false
$revokeAttempted = $false
$rotationDirectUrl = $null
$rotationLock = $null

try {
    $rotationDirectUrl = (doppler secrets get DIRECT_URL --plain --raw `
        --project $DopplerProject --config $DopplerConfig --silent).Trim()
    if (
        $LASTEXITCODE -ne 0 -or
        $rotationDirectUrl -notmatch [regex]::Escape($ProjectRef)
    ) {
        throw 'Doppler DIRECT_URL does not match the credential rotation project'
    }
    $rotationLock = Start-CredentialRotationLock `
        -ApiDirectory $script:ApiDirectory `
        -DirectUrl $rotationDirectUrl `
        -ProjectRef $ProjectRef

    if ((Get-RailwayDopplerToken) -cne $oldToken) {
        throw 'Railway DOPPLER_TOKEN changed before the rotation lock was acquired'
    }
    if (@(
        Get-DopplerServiceTokens | Where-Object { $_.name -eq $NewTokenName }
    ).Count -ne 0) {
        throw 'New Doppler service token name appeared before the rotation lock was acquired'
    }

    $createAttempted = $true
    $newToken = (doppler configs tokens create $NewTokenName `
        --project $DopplerProject `
        --config $DopplerConfig `
        --access read `
        --plain `
        --silent).Trim()
    if ($LASTEXITCODE -ne 0 -or $newToken -notmatch '^dp\.st\.[A-Za-z0-9._-]+$') {
        throw 'New Doppler service token creation failed'
    }

    $newMetadata = Get-DopplerTokenMetadata -Token $newToken
    if ($null -eq $newMetadata -or $newMetadata.type -ne 'service_token') {
        throw 'New Doppler service token authentication failed'
    }
    if (-not (Test-DopplerTokenReadAccess -Token $newToken)) {
        throw 'New Doppler service token read verification failed'
    }

    $railwayWriteAttempted = $true
    Set-RailwayDopplerToken -Token $newToken
    $railwayUpdated = $true

    $boundToken = Get-RailwayDopplerToken
    if ($boundToken -cne $newToken) {
        throw 'Railway DOPPLER_TOKEN read-back mismatch'
    }

    $revokeAttempted = $true
    Remove-DopplerTokenAndVerify -Slug $oldMetadata.slug
    $oldTokenCheck = Get-DopplerTokenCheck -Token $oldToken
    if ($oldTokenCheck.State -ne 'Rejected') {
        throw 'Old Doppler service token revoke state is indeterminate'
    }
    $oldTokenRevoked = $true

    [pscustomobject]@{
        NewTokenName = $newMetadata.name
        NewTokenSlug = $newMetadata.slug
        RailwayBindingUpdated = $railwayUpdated
        NewTokenReadVerified = $true
        OldTokenRevoked = $oldTokenRevoked
        OldTokenRejected = $true
    } | ConvertTo-Json
}
catch {
    $originalError = $_.Exception.Message
    $cleanupErrors = [System.Collections.Generic.List[string]]::new()
    $newTokenCanBeRevoked = -not $railwayWriteAttempted

    if ($railwayWriteAttempted -and -not $revokeAttempted) {
        try {
            Set-RailwayDopplerToken -Token $oldToken
            if ((Get-RailwayDopplerToken) -cne $oldToken) {
                throw 'Railway DOPPLER_TOKEN rollback read-back mismatch'
            }
            $newTokenCanBeRevoked = $true
        }
        catch {
            $cleanupErrors.Add('Railway DOPPLER_TOKEN rollback failed')
        }
    }

    if ($createAttempted -and -not $revokeAttempted) {
        if (-not $newTokenCanBeRevoked) {
            $cleanupErrors.Add('New Doppler token preserved because Railway rollback was not proven')
        }
        else {
            try {
                $cleanupSlugs = @()
                if ($null -ne $newMetadata) {
                    $cleanupSlugs = @($newMetadata.slug)
                }
                else {
                    $cleanupSlugs = @(
                        Get-DopplerServiceTokens |
                            Where-Object { $_.name -eq $NewTokenName } |
                            ForEach-Object { $_.slug }
                    )
                    if ($cleanupSlugs.Count -eq 0) {
                        throw 'Indeterminate token creation could not be reconciled by unique name'
                    }
                }

                foreach ($slug in ($cleanupSlugs | Select-Object -Unique)) {
                    Remove-DopplerTokenAndVerify -Slug $slug
                }
            }
            catch {
                $cleanupErrors.Add('New Doppler service token cleanup failed')
            }
        }
    }

    if ($cleanupErrors.Count -eq 0) {
        throw $originalError
    }
    throw "$originalError; $($cleanupErrors -join '; ')"
}
finally {
    if ($null -ne $rotationLock) {
        Stop-CredentialRotationLock -LockHandle $rotationLock
    }
    $oldToken = $null
    $newToken = $null
    $boundToken = $null
    $rotationDirectUrl = $null
    [GC]::Collect()
}
