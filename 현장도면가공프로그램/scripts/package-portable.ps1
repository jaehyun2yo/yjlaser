param(
    [string]$BuildDir = "build/prod",
    [string]$OutputDir = "dist/현장도면가공프로그램-portable",
    [switch]$AllowMissingQtRuntime
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path ".").Path
$distRoot = Join-Path $projectRoot "dist"
New-Item -ItemType Directory -Force $distRoot | Out-Null
$distRoot = (Resolve-Path $distRoot).Path

$outputResolved = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    [System.IO.Path]::GetFullPath($OutputDir)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDir))
}

$outputLeaf = Split-Path -Leaf $outputResolved
if ([string]::IsNullOrWhiteSpace($outputLeaf)) {
    throw "OutputDir must include a folder name under dist."
}

$trimChars = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
$distPrefix = $distRoot.TrimEnd($trimChars) + [System.IO.Path]::DirectorySeparatorChar
if (-not $outputResolved.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDir must stay under $distRoot for safe cleanup. Requested: $outputResolved"
}

$exe = Get-ChildItem -Path $BuildDir -Recurse -Filter "현장도면가공프로그램.exe" | Select-Object -First 1
if (-not $exe) {
    throw "현장도면가공프로그램.exe not found under $BuildDir. Run: cmake --build --preset prod"
}

if (Test-Path -LiteralPath $outputResolved) {
    Remove-Item -LiteralPath $outputResolved -Recurse -Force
}

New-Item -ItemType Directory -Force `
    $outputResolved, `
    (Join-Path $outputResolved "config"), `
    (Join-Path $outputResolved "logs"), `
    (Join-Path $outputResolved "platforms"), `
    (Join-Path $outputResolved "plugins"), `
    (Join-Path $outputResolved "runtime"), `
    (Join-Path $outputResolved "licenses") | Out-Null

$targetExe = Join-Path $outputResolved "현장도면가공프로그램.exe"
Copy-Item $exe.FullName $targetExe
Copy-Item "config/defaults.json" (Join-Path $outputResolved "config/defaults.json")
Copy-Item "README.md" (Join-Path $outputResolved "README.txt")
Copy-Item "docs/portable.md" (Join-Path $outputResolved "portable.md")

$windeployqt = Get-Command windeployqt -ErrorAction SilentlyContinue
if (-not $windeployqt) {
    if ($AllowMissingQtRuntime) {
        Write-Warning "windeployqt not found. Qt DLL/plugin validation was intentionally bypassed."
    } else {
        throw "windeployqt not found. Install Qt tools or rerun with -AllowMissingQtRuntime only for local diagnostics."
    }
} else {
    & $windeployqt.Source $targetExe --no-translations
    if ($LASTEXITCODE -ne 0) {
        throw "windeployqt failed with exit code $LASTEXITCODE"
    }
}

$platformPlugin = Join-Path $outputResolved "platforms/qwindows.dll"
if (-not (Test-Path -LiteralPath $platformPlugin) -and -not $AllowMissingQtRuntime) {
    throw "Qt platform plugin missing: $platformPlugin. Ensure windeployqt is on PATH."
}

Write-Host "Portable package created: $outputResolved"
