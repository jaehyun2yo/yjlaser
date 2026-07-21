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
    [string]$VercelDeploymentId,

    [Parameter(Mandatory)]
    [string]$VercelProjectId,

    [Parameter(Mandatory)]
    [string]$VercelOrgId,

    [string]$VercelProjectName = 'yjlaser',

    [Parameter(Mandatory)]
    [uri]$ApiHealthUrl,

    [Parameter(Mandatory)]
    [uri]$WebsiteUrl,

    [string]$DopplerProject = 'yjlaser',

    [string]$DopplerConfig = 'prd',

    [string]$VercelScope = 'jaehyun2yos-projects',

    [switch]$Execute,

    [switch]$Resume
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credential-rotation-lock.ps1')
$script:ApiDirectory = Resolve-Path (
    Join-Path (Split-Path $PSScriptRoot -Parent) 'webhard-api'
)
$script:RepositoryDirectory = Split-Path $PSScriptRoot -Parent

function Invoke-CapturedProcess {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [AllowNull()]
        [string]$InputValue,

        [hashtable]$EnvironmentVariables = @{},

        [int]$TimeoutSeconds = 120,

        [Parameter(Mandatory)]
        [string]$Operation
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.WorkingDirectory = $script:RepositoryDirectory
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
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        $process.Kill($true)
        $process.WaitForExit()
        [void]$stdoutTask.GetAwaiter().GetResult()
        [void]$stderrTask.GetAwaiter().GetResult()
        throw "$Operation timed out"
    }

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Stdout = $stdoutTask.GetAwaiter().GetResult()
        Stderr = $stderrTask.GetAwaiter().GetResult()
    }
}

function Get-SecretHash {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    return [Convert]::ToHexString(
        [Security.Cryptography.SHA256]::HashData(
            [Text.Encoding]::UTF8.GetBytes($Value)
        )
    ).ToLowerInvariant()
}

function Get-DopplerSecret {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    $result = Invoke-CapturedProcess `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'secrets', 'get', $Name, '--plain', '--raw',
            '--project', $DopplerProject,
            '--config', $DopplerConfig,
            '--silent'
        ) `
        -InputValue $null `
        -Operation "Doppler $Name read"
    if ($result.ExitCode -ne 0) {
        throw "Doppler $Name read failed"
    }
    return $result.Stdout.Trim()
}

function Set-DopplerSessionSecret {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    $result = Invoke-CapturedProcess `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'secrets', 'set', 'SESSION_SECRET',
            '--project', $DopplerProject,
            '--config', $DopplerConfig,
            '--no-interactive', '--silent'
        ) `
        -InputValue $Value `
        -Operation 'Doppler SESSION_SECRET update'
    if ($result.ExitCode -ne 0) {
        throw 'Doppler SESSION_SECRET update failed'
    }
}

function Get-RailwayVariables {
    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'variable', 'list', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $null `
        -Operation 'Railway SESSION_SECRET read'
    if ($result.ExitCode -ne 0) {
        throw 'Railway variables read failed'
    }
    return $result.Stdout | ConvertFrom-Json
}

function Get-RailwaySessionSecret {
    return [string](Get-RailwayVariables).SESSION_SECRET
}

function Set-RailwaySessionSecret {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'variable', 'set', 'SESSION_SECRET', '--stdin', '--skip-deploys', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $Value `
        -Operation 'Railway SESSION_SECRET update'
    if ($result.ExitCode -ne 0) {
        throw 'Railway SESSION_SECRET update failed'
    }
}

function Test-VercelSessionSecret {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    $expectedHash = Get-SecretHash -Value $Value
    $nodeCode = @'
const crypto = require('crypto');
const actual = process.env.SESSION_SECRET || '';
const actualHash = crypto.createHash('sha256').update(actual).digest('hex');
process.stdout.write(actualHash === process.argv[1] ? 'MATCH' : 'MISMATCH');
'@
    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:VercelCliScript,
            'env', 'run', '-e', 'production', '--scope', $VercelScope, '--',
            $script:NodeExecutable, '-e', $nodeCode, $expectedHash
        ) `
        -InputValue $null `
        -Operation 'Vercel SESSION_SECRET comparison'
    return $result.ExitCode -eq 0 -and $result.Stdout.Trim() -eq 'MATCH'
}

function Test-VercelPreviousSessionSecretsAbsent {
    $nodeCode = @'
const previous = process.env.SESSION_SECRET_PREVIOUS || '';
const expiresAt = process.env.SESSION_SECRET_PREVIOUS_EXPIRES_AT || '';
process.stdout.write(previous === '' && expiresAt === '' ? 'CLEAR' : 'PRESENT');
'@
    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:VercelCliScript,
            'env', 'run', '-e', 'production', '--scope', $VercelScope, '--',
            $script:NodeExecutable, '-e', $nodeCode
        ) `
        -InputValue $null `
        -Operation 'Vercel previous session secret check'
    return $result.ExitCode -eq 0 -and $result.Stdout.Trim() -eq 'CLEAR'
}

function Assert-PreviousSessionSecretsAbsent {
    $dopplerNames = Invoke-CapturedProcess `
        -Executable $script:DopplerExecutable `
        -Arguments @(
            'secrets', '--only-names',
            '--project', $DopplerProject,
            '--config', $DopplerConfig,
            '--silent'
        ) `
        -InputValue $null `
        -Operation 'Doppler secret-name check'
    if (
        $dopplerNames.ExitCode -ne 0 -or
        $dopplerNames.Stdout -match 'SESSION_SECRET_PREVIOUS'
    ) {
        throw 'Doppler previous session secret variables must be absent'
    }

    $railwayVariables = Get-RailwayVariables
    if (
        $railwayVariables.PSObject.Properties.Name -contains 'SESSION_SECRET_PREVIOUS' -or
        $railwayVariables.PSObject.Properties.Name -contains 'SESSION_SECRET_PREVIOUS_EXPIRES_AT'
    ) {
        throw 'Railway previous session secret variables must be absent'
    }
    if (-not (Test-VercelPreviousSessionSecretsAbsent)) {
        throw 'Vercel previous session secret variables must be absent'
    }
}

function Set-VercelSessionSecret {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:VercelCliScript,
            'env', 'update', 'SESSION_SECRET', 'production',
            '--yes', '--scope', $VercelScope
        ) `
        -InputValue $Value `
        -Operation 'Vercel SESSION_SECRET update'
    if ($result.ExitCode -ne 0) {
        throw 'Vercel SESSION_SECRET update failed'
    }
}

function Assert-SessionBindings {
    param(
        [Parameter(Mandatory)]
        [string]$ExpectedValue
    )

    if ((Get-DopplerSecret -Name 'SESSION_SECRET') -cne $ExpectedValue) {
        throw 'Doppler SESSION_SECRET read-back mismatch'
    }
    if ((Get-RailwaySessionSecret) -cne $ExpectedValue) {
        throw 'Railway SESSION_SECRET read-back mismatch'
    }
    if (-not (Test-VercelSessionSecret -Value $ExpectedValue)) {
        throw 'Vercel SESSION_SECRET read-back mismatch'
    }
}

function Request-RailwayRedeploy {
    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:RailwayCliScript,
            'service', 'redeploy', '--yes', '--json',
            '--project', $RailwayProjectId,
            '--environment', $RailwayEnvironmentId,
            '--service', $RailwayServiceId
        ) `
        -InputValue $null `
        -Operation 'Railway redeploy'
    if ($result.ExitCode -ne 0) {
        throw 'Railway redeploy request failed'
    }
    $match = [regex]::Match(
        $result.Stdout,
        '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    )
    if (-not $match.Success) {
        throw 'Railway redeploy did not return a deployment ID'
    }
    return $match.Value
}

function Wait-RailwayDeployment {
    param(
        [Parameter(Mandatory)]
        [string]$DeploymentId
    )

    for ($attempt = 1; $attempt -le 48; $attempt += 1) {
        $result = Invoke-CapturedProcess `
            -Executable $script:NodeExecutable `
            -Arguments @(
                $script:RailwayCliScript,
                'deployment', 'list', '--json',
                '--project', $RailwayProjectId,
                '--environment', $RailwayEnvironmentId,
                '--service', $RailwayServiceId
            ) `
            -InputValue $null `
            -Operation 'Railway deployment status read'
        if ($result.ExitCode -ne 0) {
            throw 'Railway deployment status read failed'
        }
        $deployment = @($result.Stdout | ConvertFrom-Json) |
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

function Request-VercelRedeploy {
    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:VercelCliScript,
            'redeploy', $VercelDeploymentId,
            '--target', 'production', '--scope', $VercelScope
        ) `
        -InputValue $null `
        -TimeoutSeconds 300 `
        -Operation 'Vercel production redeploy'
    if ($result.ExitCode -ne 0) {
        throw 'Vercel production redeploy failed'
    }
    $match = [regex]::Match($result.Stdout, 'https://[^\s]+\.vercel\.app')
    if (-not $match.Success) {
        throw 'Vercel redeploy did not return a deployment URL'
    }
    return $match.Value
}

function Get-VercelDeploymentInfo {
    param(
        [Parameter(Mandatory)]
        [string]$Target
    )

    $result = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:VercelCliScript,
            'inspect', $Target, '--format=json',
            '--scope', $VercelScope
        ) `
        -InputValue $null `
        -Operation 'Vercel production deployment inspection'
    if ($result.ExitCode -ne 0) {
        throw 'Vercel production deployment inspection failed'
    }
    return $result.Stdout | ConvertFrom-Json
}

function Assert-VercelDeploymentTarget {
    $linkFile = Join-Path $script:RepositoryDirectory '.vercel\project.json'
    if (-not (Test-Path -LiteralPath $linkFile)) {
        throw 'Vercel project link is missing'
    }
    $link = Get-Content -LiteralPath $linkFile -Raw | ConvertFrom-Json
    if (
        $link.projectId -cne $VercelProjectId -or
        $link.orgId -cne $VercelOrgId -or
        $link.projectName -cne $VercelProjectName
    ) {
        throw 'Vercel linked project identity mismatch'
    }

    $projectResult = Invoke-CapturedProcess `
        -Executable $script:NodeExecutable `
        -Arguments @(
            $script:VercelCliScript,
            'project', 'inspect', $VercelProjectName,
            '--scope', $VercelScope
        ) `
        -InputValue $null `
        -Operation 'Vercel project inspection'
    $projectInspection = "$($projectResult.Stdout)`n$($projectResult.Stderr)"
    if ($projectResult.ExitCode -ne 0 -or $projectInspection -notmatch [regex]::Escape($VercelProjectId)) {
        throw 'Vercel project identity could not be confirmed'
    }

    $deployment = Get-VercelDeploymentInfo -Target $VercelDeploymentId
    $alias = Get-VercelDeploymentInfo -Target ([string]$WebsiteUrl)
    if (
        $deployment.id -cne $VercelDeploymentId -or
        $deployment.name -cne $VercelProjectName -or
        $deployment.target -cne 'production' -or
        $deployment.readyState -cne 'READY' -or
        $alias.id -cne $deployment.id -or
        $alias.name -cne $VercelProjectName -or
        $alias.target -cne 'production' -or
        $alias.readyState -cne 'READY'
    ) {
        throw 'Vercel deployment, linked project, and production alias are not the same Ready target'
    }
}

function Wait-VercelDeploymentAndAlias {
    param(
        [Parameter(Mandatory)]
        [string]$DeploymentUrl
    )

    for ($attempt = 1; $attempt -le 24; $attempt += 1) {
        $deployment = Get-VercelDeploymentInfo -Target $DeploymentUrl
        $alias = Get-VercelDeploymentInfo -Target ([string]$WebsiteUrl)
        if (
            $deployment.name -eq $VercelProjectName -and
            $deployment.target -eq 'production' -and
            $deployment.readyState -eq 'READY' -and
            $alias.id -eq $deployment.id -and
            $alias.name -eq $VercelProjectName -and
            $alias.target -eq 'production' -and
            $alias.readyState -eq 'READY'
        ) {
            return $deployment.id
        }
        if ($deployment.readyState -in @('ERROR', 'CANCELED')) {
            throw "Vercel deployment entered terminal state $($deployment.readyState)"
        }
        Start-Sleep -Seconds 5
    }
    throw 'Vercel deployment and production alias were not aligned before timeout'
}

function Wait-PublicHealth {
    for ($attempt = 1; $attempt -le 12; $attempt += 1) {
        try {
            $api = Invoke-RestMethod -Method Get -Uri $ApiHealthUrl -TimeoutSec 20
            $website = Invoke-WebRequest -Method Get -Uri $WebsiteUrl -TimeoutSec 20 -UseBasicParsing
            if ($api.status -eq 'ok' -and $website.StatusCode -eq 200) {
                return
            }
        }
        catch {
            # Both deployments can briefly replace their active instances.
        }
        Start-Sleep -Seconds 5
    }
    throw 'Public API or website health did not recover before timeout'
}

function Set-AllSessionBindings {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    # Doppler is the durable recovery source. If a later provider remains
    # unavailable, a subsequent -Resume run can read this value and converge
    # the remaining consumers without restoring the exposed old secret.
    Set-DopplerSessionSecret -Value $Value
    Set-VercelSessionSecret -Value $Value
    Set-RailwaySessionSecret -Value $Value
    Assert-SessionBindings -ExpectedValue $Value
    Assert-PreviousSessionSecretsAbsent
}

$script:DopplerExecutable = (Get-Command doppler).Source
$script:NodeExecutable = (Get-Command node.exe).Source
$npmDirectory = Split-Path (Get-Command railway.ps1).Source -Parent
$script:RailwayCliScript = Join-Path $npmDirectory 'node_modules\@railway\cli\bin\railway.js'
$script:VercelCliScript = Join-Path $npmDirectory 'node_modules\vercel\dist\index.js'
foreach ($cliScript in @($script:RailwayCliScript, $script:VercelCliScript)) {
    if (-not (Test-Path -LiteralPath $cliScript)) {
        throw "Required CLI script is missing: $cliScript"
    }
}

$oldSecret = Get-DopplerSecret -Name 'SESSION_SECRET'
$oldRailwaySecret = Get-RailwaySessionSecret
$vercelMatchesDoppler = Test-VercelSessionSecret -Value $oldSecret
$bindingsConsistent = (
    $oldSecret.Length -ge 32 -and
    $oldSecret -ceq $oldRailwaySecret -and
    $vercelMatchesDoppler
)
if ($oldSecret.Length -lt 32) {
    throw 'Doppler SESSION_SECRET is missing or shorter than the required minimum'
}
if (-not $bindingsConsistent -and -not $Resume) {
    throw 'SESSION_SECRET bindings are inconsistent; rerun with -Resume to converge from the Doppler recovery source'
}

$directUrl = Get-DopplerSecret -Name 'DIRECT_URL'
if ($directUrl -notmatch [regex]::Escape($ProjectRef)) {
    throw 'Doppler DIRECT_URL does not match the target project'
}
Assert-VercelDeploymentTarget
Assert-PreviousSessionSecretsAbsent

if (-not $Execute) {
    [pscustomobject]@{
        Ready = $true
        DopplerRailwayVercelMatch = $bindingsConsistent
        MinimumLengthSatisfied = $true
        ResumeMode = [bool]$Resume
        ResumeRequired = -not $bindingsConsistent
        RecoverySource = if ($Resume) { 'Doppler' } else { $null }
        ChangesApplied = $false
    } | ConvertTo-Json
    exit 0
}

$rotationMode = if ($Resume) { 'Resume' } else { 'Rotate' }
if ($Resume) {
    $newSecret = $oldSecret
}
else {
    $randomBytes = [byte[]]::new(48)
    [Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
    $newSecret = [Convert]::ToBase64String($randomBytes).
        TrimEnd('=').
        Replace('+', '-').
        Replace('/', '_')
}
$rotationLock = $null
$recoveryApplied = $false
$bindingWriteAttempted = $false

try {
    $rotationLock = Start-CredentialRotationLock `
        -ApiDirectory $script:ApiDirectory `
        -DirectUrl $directUrl `
        -ProjectRef $ProjectRef

    if ($Resume) {
        # The preflight value can become stale while this execution waits for
        # the advisory lock. Re-read the durable source only after ownership
        # is established so a concurrent rotation can never be overwritten
        # with its predecessor.
        $newSecret = Get-DopplerSecret -Name 'SESSION_SECRET'
        if ($newSecret.Length -lt 32) {
            throw 'Doppler recovery source is missing after lock acquisition'
        }
    }
    Assert-VercelDeploymentTarget
    Assert-PreviousSessionSecretsAbsent
    $bindingWriteAttempted = $true
    Set-AllSessionBindings -Value $newSecret
    $railwayDeploymentId = Request-RailwayRedeploy
    Wait-RailwayDeployment -DeploymentId $railwayDeploymentId
    $vercelDeploymentUrl = Request-VercelRedeploy
    $vercelDeploymentId = Wait-VercelDeploymentAndAlias -DeploymentUrl $vercelDeploymentUrl
    Wait-PublicHealth

    [pscustomobject]@{
        SessionBindingsUpdated = $true
        RailwayDeploymentId = $railwayDeploymentId
        VercelDeploymentId = $vercelDeploymentId
        VercelDeploymentUrl = $vercelDeploymentUrl
        ApiHealth = 'ok'
        WebsiteStatus = 200
        RotationMode = $rotationMode
        CurrentProductionAliasRebound = $true
        ExistingSessionRejectionVerified = $false
        HistoricalDeploymentsChecked = $false
        ForwardRecoveryApplied = $recoveryApplied
    } | ConvertTo-Json
}
catch {
    $originalError = $_.Exception.Message
    if (-not $bindingWriteAttempted) {
        throw $originalError
    }
    try {
        $recoveryApplied = $true
        Set-AllSessionBindings -Value $newSecret
        $railwayDeploymentId = Request-RailwayRedeploy
        Wait-RailwayDeployment -DeploymentId $railwayDeploymentId
        $vercelDeploymentUrl = Request-VercelRedeploy
        $vercelDeploymentId = Wait-VercelDeploymentAndAlias -DeploymentUrl $vercelDeploymentUrl
        Wait-PublicHealth

        [pscustomobject]@{
            SessionBindingsUpdated = $true
            RailwayDeploymentId = $railwayDeploymentId
            VercelDeploymentId = $vercelDeploymentId
            VercelDeploymentUrl = $vercelDeploymentUrl
            ApiHealth = 'ok'
            WebsiteStatus = 200
            RotationMode = $rotationMode
            CurrentProductionAliasRebound = $true
            ExistingSessionRejectionVerified = $false
            HistoricalDeploymentsChecked = $false
            ForwardRecoveryApplied = $true
            InitialFailureContained = $true
        } | ConvertTo-Json
    }
    catch {
        $recoveryError = $_.Exception.Message
        throw "SESSION_SECRET forward recovery failed after initial failure '$originalError'; recovery failure '$recoveryError'"
    }
}
finally {
    if ($null -ne $rotationLock) {
        try {
            Stop-CredentialRotationLock -LockHandle $rotationLock
        }
        catch {
            Write-Warning 'Credential rotation lock cleanup required forced connection closure'
        }
    }
    $oldSecret = $null
    $oldRailwaySecret = $null
    $newSecret = $null
    $directUrl = $null
    [GC]::Collect()
}
