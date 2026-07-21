function Start-CredentialRotationLock {
    param(
        [Parameter(Mandatory)]
        [string]$ApiDirectory,

        [Parameter(Mandatory)]
        [string]$DirectUrl,

        [Parameter(Mandatory)]
        [string]$ProjectRef
    )

    $lockMaterial = [Text.Encoding]::UTF8.GetBytes(
        "yjlaser-credential-rotation:$ProjectRef"
    )
    $lockHash = [Security.Cryptography.SHA256]::HashData($lockMaterial)
    $lockKey1 = [BitConverter]::ToInt32($lockHash, 0)
    $lockKey2 = [BitConverter]::ToInt32($lockHash, 4)

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = (Get-Command node.exe).Source
    $startInfo.WorkingDirectory = $ApiDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Environment['DATABASE_TEST_URL'] = $DirectUrl
    $startInfo.Environment['ROTATION_LOCK_KEY_1'] = [string]$lockKey1
    $startInfo.Environment['ROTATION_LOCK_KEY_2'] = [string]$lockKey2

    foreach ($argument in @(
        '-e',
        @'
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const key1 = process.env.ROTATION_LOCK_KEY_1;
const key2 = process.env.ROTATION_LOCK_KEY_2;
if (!/^-?\d+$/.test(key1 || '') || !/^-?\d+$/.test(key2 || '')) {
  process.stdout.write('ERROR\n');
  process.exit(2);
}
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_TEST_URL });
(async () => {
  let acquired = false;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT pg_try_advisory_lock(${key1}::int, ${key2}::int) AS acquired`
    );
    acquired = Boolean(rows[0] && rows[0].acquired);
    if (!acquired) {
      process.stdout.write('BUSY\n');
      return;
    }
    process.stdout.write('ACQUIRED\n');
    const rl = readline.createInterface({ input: process.stdin });
    await new Promise((resolve) => {
      rl.once('line', resolve);
      rl.once('close', resolve);
    });
    await prisma.$queryRawUnsafe(
      `SELECT pg_advisory_unlock(${key1}::int, ${key2}::int)`
    );
    process.stdout.write('RELEASED\n');
  } catch (_) {
    process.stdout.write('ERROR\n');
    process.exitCode = 1;
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
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $readyTask = $process.StandardOutput.ReadLineAsync()
    if (-not $readyTask.Wait(20000)) {
        $process.Kill($true)
        $process.WaitForExit()
        [void]$stderrTask.GetAwaiter().GetResult()
        throw 'Credential rotation lock acquisition timed out'
    }

    $state = $readyTask.GetAwaiter().GetResult()
    if ($state -ne 'ACQUIRED') {
        $process.WaitForExit(20000)
        if (-not $process.HasExited) {
            $process.Kill($true)
            $process.WaitForExit()
        }
        [void]$stderrTask.GetAwaiter().GetResult()
        if ($state -eq 'BUSY') {
            throw 'Another credential rotation already holds the project lock'
        }
        throw 'Credential rotation lock acquisition failed'
    }

    return [pscustomobject]@{
        Process = $process
        StderrTask = $stderrTask
    }
}

function Stop-CredentialRotationLock {
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$LockHandle
    )

    $process = $LockHandle.Process
    if ($process.HasExited) {
        [void]$LockHandle.StderrTask.GetAwaiter().GetResult()
        throw 'Credential rotation lock process exited before release'
    }

    $process.StandardInput.WriteLine('RELEASE')
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(20000)) {
        $process.Kill($true)
        $process.WaitForExit()
        [void]$LockHandle.StderrTask.GetAwaiter().GetResult()
        throw 'Credential rotation lock release timed out'
    }

    $releaseState = $process.StandardOutput.ReadLine()
    [void]$LockHandle.StderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0 -or $releaseState -ne 'RELEASED') {
        throw 'Credential rotation lock release failed'
    }
}
