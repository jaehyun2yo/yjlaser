# 현장도면가공프로그램

유진레이저 현장가공용 도면 처리 프로그램입니다. 첫 구현은 C++20/Qt 6 기반
프로젝트 골격, 빈 작업 화면, 로깅, 테스트, 벤치마크, 포터블 배포 기준을 제공합니다.

## Current Scope

- Qt Widgets desktop application shell
- Mixed CAD workspace shell
- Development/production runtime mode split
- spdlog-based logging skeleton
- Catch2 smoke tests
- Google Benchmark smoke target
- Portable packaging script

## Out of Scope for First Implementation

- DXF/AI/PDF/EPS parsing
- CAD entity editing algorithms
- Cut/crease classification
- Bridge insertion
- Sheet generation
- Output validation algorithms
- Installer
- Automatic sequence execution

## Development

```powershell
cmake --preset dev
cmake --build --preset dev
ctest --preset dev
```

## Benchmark

```powershell
Get-ChildItem build/dev -Recurse -Filter "yjcad_benchmarks.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName --benchmark_min_time=0.01 }
```

## Portable Build

```powershell
cmake --preset prod
cmake --build --preset prod
./scripts/package-portable.ps1
```

`./scripts/package-portable.ps1 -AllowMissingQtRuntime` is allowed only for local packaging diagnostics when Qt deployment tools are not installed.

## Runtime Mode

Debug builds start in `development`; Release builds start in `production`. Override with `APP_ENV` when diagnosing a packaged build.
