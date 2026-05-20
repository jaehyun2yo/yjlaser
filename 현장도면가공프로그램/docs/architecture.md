# Architecture

## Scope

This project is a dedicated onsite drawing processor for YJLaser field processing.
The first implementation creates the application shell only. Real CAD parsing and
automation algorithms are intentionally outside this first cut.

## Boundaries

- `src/config`: runtime mode and configuration helpers. No Qt dependency.
- `src/logging`: spdlog setup and application logger access. No UI logic.
- `src/app`: QApplication entry point and MainWindow composition.
- `src/canvas`: CAD canvas widgets and later viewport/selection rendering.
- `src/ui`: dock panels and shell UI widgets.
- `tests`: Catch2 smoke tests for non-Qt core.
- `benchmarks`: Google Benchmark smoke targets and later performance fixtures.

## Dependency Direction

`app/ui/canvas` may depend on Qt. `config/logging` should remain usable from
tests and benchmarks without creating a QApplication.
