# Development

## Prerequisites

- CMake 3.26+
- C++20 compiler
- Qt 6-capable toolchain
- vcpkg with `VCPKG_ROOT` set

The presets keep vcpkg's installed packages under
`$env:VCPKG_ROOT/installed/yjlaser-onsite`. Keep `VCPKG_ROOT` on an ASCII path
on Windows; MSVC link response files can fail to resolve dependency libraries
when vcpkg-installed paths contain Korean characters.

## Configure

```powershell
cmake --preset dev
```

## Build

```powershell
cmake --build --preset dev
```

## Test

```powershell
ctest --preset dev
```

## Benchmark

```powershell
Get-ChildItem build/dev -Recurse -Filter "yjcad_benchmarks.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName --benchmark_min_time=0.01s }
```

## Production Build

```powershell
cmake --preset prod
cmake --build --preset prod
```

## Runtime Mode

Debug builds default to `development`; Release builds default to `production`.
Set `APP_ENV=development` or `APP_ENV=production` to override the compiled default.
