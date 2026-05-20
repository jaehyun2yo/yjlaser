# Portable Runtime

The first distribution target is a portable folder for onsite Windows PCs.
It must run without administrator permission and without requiring internet access.

## Build

```powershell
cmake --preset prod
cmake --build --preset prod
```

## Package

```powershell
./scripts/package-portable.ps1
```

## Expected Folder Shape

```text
현장도면가공프로그램-portable/
+-- 현장도면가공프로그램.exe
+-- config/
+-- logs/
+-- platforms/
+   +-- qwindows.dll
+-- plugins/
+-- runtime/
+-- licenses/
+-- README.txt
```

The package script fails by default when `windeployqt` is missing because field PCs
need Qt DLLs and `platforms/qwindows.dll` inside the portable folder. Use
`-AllowMissingQtRuntime` only for local packaging diagnostics, not for field distribution.
The portable folder must not include customer drawings or sensitive logs.
