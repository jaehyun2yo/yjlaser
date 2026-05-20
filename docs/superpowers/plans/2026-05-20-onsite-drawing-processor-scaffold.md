# 현장도면가공프로그램 첫 구현 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `현장도면가공프로그램/` 폴더에 C++20/Qt 6/CMake/vcpkg 기반의 실행 가능한 데스크톱 앱 골격, 빈 작업 화면, 로깅, 테스트, 벤치마크, 포터블 배포 기준을 만든다.

**Architecture:** 첫 구현은 실제 CAD 알고리즘을 만들지 않고, 이후 기능을 붙일 수 있는 경계를 먼저 만든다. `config/logging`은 Qt에 의존하지 않는 core 라이브러리로 두고, `app/ui/canvas`는 Qt Widgets 기반 UI shell로 분리한다.

**Tech Stack:** C++20, Qt 6 Widgets, CMake, vcpkg manifest mode, spdlog, Catch2, Google Benchmark, PowerShell packaging script.

---

## Source Spec

- Requirements: `docs/superpowers/specs/2026-05-20-onsite-drawing-processor-design.md`
- Target project folder: `현장도면가공프로그램/`
- First implementation scope: project skeleton, empty Qt main window, logging, tests, benchmark, portable folder rules.
- Explicitly deferred: DXF/AI/PDF/EPS parsing, real CAD edit algorithms, cut/crease classification, bridge insertion, sheet generation, gu-ai insertion, validation algorithms, installer, automatic sequence execution.

## File Map

- Create: `현장도면가공프로그램/CMakeLists.txt`  
  Root build graph, dependencies, app/test/benchmark targets.
- Create: `현장도면가공프로그램/.gitignore`
  Exclude local build, package, log, and IDE outputs from the first configure onward.
- Create: `현장도면가공프로그램/CMakePresets.json`  
  `dev` and `prod` configure/build/test presets using vcpkg toolchain.
- Create: `현장도면가공프로그램/vcpkg.json`  
  Manifest dependencies: `qtbase`, `spdlog`, `catch2`, `benchmark`.
- Create: `현장도면가공프로그램/config/defaults.json`  
  Initial runtime/log/portable config values.
- Create: `현장도면가공프로그램/src/config/AppEnvironment.h`
- Create: `현장도면가공프로그램/src/config/AppEnvironment.cpp`  
  Runtime mode parsing and naming.
- Create: `현장도면가공프로그램/src/logging/Logger.h`
- Create: `현장도면가공프로그램/src/logging/Logger.cpp`  
  spdlog initialization and default logger access.
- Create: `현장도면가공프로그램/src/canvas/CadCanvasWidget.h`
- Create: `현장도면가공프로그램/src/canvas/CadCanvasWidget.cpp`  
  Central CAD canvas shell.
- Create: `현장도면가공프로그램/src/ui/ToolPanelWidget.h`
- Create: `현장도면가공프로그램/src/ui/ToolPanelWidget.cpp`  
  Left edit/drawing tool shell.
- Create: `현장도면가공프로그램/src/ui/RightPanelWidget.h`
- Create: `현장도면가공프로그램/src/ui/RightPanelWidget.cpp`  
  Right automation/validation/report/layer/drawing-info tab shell.
- Create: `현장도면가공프로그램/src/ui/StatusLogWidget.h`
- Create: `현장도면가공프로그램/src/ui/StatusLogWidget.cpp`  
  Bottom coordinate/status/recent-log shell.
- Create: `현장도면가공프로그램/src/app/MainWindow.h`
- Create: `현장도면가공프로그램/src/app/MainWindow.cpp`
- Create: `현장도면가공프로그램/src/app/main.cpp`  
  App entry, logger initialization, main window wiring.
- Create: `현장도면가공프로그램/tests/CMakeLists.txt`
- Create: `현장도면가공프로그램/tests/smoke/AppEnvironmentSmokeTest.cpp`
- Create: `현장도면가공프로그램/tests/smoke/LoggerSmokeTest.cpp`  
  Catch2 smoke tests for non-Qt core.
- Create: `현장도면가공프로그램/benchmarks/CMakeLists.txt`
- Create: `현장도면가공프로그램/benchmarks/smoke/CoreSmokeBenchmark.cpp`  
  Google Benchmark smoke target.
- Create: `현장도면가공프로그램/scripts/package-portable.ps1`  
  Copy release executable, config/docs, create portable folders, run and validate `windeployqt` unless an explicit escape hatch is used.
- Create: `현장도면가공프로그램/docs/architecture.md`
- Create: `현장도면가공프로그램/docs/development.md`
- Create: `현장도면가공프로그램/docs/portable.md`
- Create: `현장도면가공프로그램/README.md`

## Task 1: Create Build Skeleton

**Files:**
- Create: `현장도면가공프로그램/CMakeLists.txt`
- Create: `현장도면가공프로그램/.gitignore`
- Create: `현장도면가공프로그램/CMakePresets.json`
- Create: `현장도면가공프로그램/vcpkg.json`
- Create: `현장도면가공프로그램/config/defaults.json`

- [ ] **Step 1: Create project directories**

Run:

```powershell
New-Item -ItemType Directory -Force `
  "현장도면가공프로그램/config", `
  "현장도면가공프로그램/src/app", `
  "현장도면가공프로그램/src/config", `
  "현장도면가공프로그램/src/logging", `
  "현장도면가공프로그램/src/canvas", `
  "현장도면가공프로그램/src/ui", `
  "현장도면가공프로그램/tests/smoke", `
  "현장도면가공프로그램/benchmarks/smoke", `
  "현장도면가공프로그램/scripts", `
  "현장도면가공프로그램/docs" | Out-Null
```

Expected: directories exist and no source files are created yet.

- [ ] **Step 2: Create project ignore file**

Create `현장도면가공프로그램/.gitignore`:

```gitignore
build/
dist/
logs/
*.user
CMakeUserPresets.json
```

Expected: generated configure/build/package outputs are ignored before any local CMake command runs.

- [ ] **Step 3: Create vcpkg manifest**

Create `현장도면가공프로그램/vcpkg.json`:

```json
{
  "name": "yjlaser-onsite-drawing-processor",
  "version-string": "0.1.0",
  "dependencies": [
    "qtbase",
    "spdlog",
    "catch2",
    "benchmark"
  ]
}
```

- [ ] **Step 4: Create CMake presets**

Create `현장도면가공프로그램/CMakePresets.json`:

```json
{
  "version": 6,
  "cmakeMinimumRequired": {
    "major": 3,
    "minor": 26,
    "patch": 0
  },
  "configurePresets": [
    {
      "name": "dev",
      "displayName": "Development",
      "binaryDir": "${sourceDir}/build/dev",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_TOOLCHAIN_FILE": "$env{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake",
        "YJCAD_BUILD_TESTS": "ON",
        "YJCAD_BUILD_BENCHMARKS": "ON"
      }
    },
    {
      "name": "prod",
      "displayName": "Production",
      "binaryDir": "${sourceDir}/build/prod",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release",
        "CMAKE_TOOLCHAIN_FILE": "$env{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake",
        "YJCAD_BUILD_TESTS": "OFF",
        "YJCAD_BUILD_BENCHMARKS": "OFF"
      }
    }
  ],
  "buildPresets": [
    {
      "name": "dev",
      "configurePreset": "dev",
      "configuration": "Debug"
    },
    {
      "name": "prod",
      "configurePreset": "prod",
      "configuration": "Release"
    }
  ],
  "testPresets": [
    {
      "name": "dev",
      "configurePreset": "dev",
      "configuration": "Debug",
      "output": {
        "outputOnFailure": true
      }
    }
  ]
}
```

- [ ] **Step 5: Create root CMake file**

Create `현장도면가공프로그램/CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.26)

project(YJLaserOnsiteDrawingProcessor
    VERSION 0.1.0
    LANGUAGES CXX
)

option(YJCAD_BUILD_TESTS "Build smoke tests" ON)
option(YJCAD_BUILD_BENCHMARKS "Build smoke benchmarks" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(CTest)
```

- [ ] **Step 6: Create default config**

Create `현장도면가공프로그램/config/defaults.json`:

```json
{
  "runtime": {
    "defaultMode": "production"
  },
  "logging": {
    "directory": "logs",
    "maxFileSizeMb": 5,
    "maxFiles": 5,
    "allowDetailedLogsInProduction": false
  },
  "ui": {
    "workspace": "mixed",
    "showChecklist": true
  },
  "portable": {
    "preferLocalConfig": true,
    "fallbackToAppData": true
  }
}
```

- [ ] **Step 7: Run configure to expose dependency/toolchain problems**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset dev
```

Expected if `VCPKG_ROOT` and dependencies are available: configure succeeds with no build targets yet.  
Expected if `VCPKG_ROOT` is missing: CMake reports that `$env{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake` cannot be found. Set `VCPKG_ROOT` before continuing.

- [ ] **Step 8: Commit build skeleton**

Run:

```powershell
git add 현장도면가공프로그램/CMakeLists.txt `
  현장도면가공프로그램/.gitignore `
  현장도면가공프로그램/CMakePresets.json `
  현장도면가공프로그램/vcpkg.json `
  현장도면가공프로그램/config/defaults.json
git commit -m "chore: 현장도면가공프로그램 빌드 골격 추가"
```

Expected: one commit containing only build/config skeleton files.

## Task 2: Add Runtime Mode and Logging Core

**Files:**
- Create: `현장도면가공프로그램/src/config/AppEnvironment.h`
- Create: `현장도면가공프로그램/src/config/AppEnvironment.cpp`
- Create: `현장도면가공프로그램/src/logging/Logger.h`
- Create: `현장도면가공프로그램/src/logging/Logger.cpp`
- Create: `현장도면가공프로그램/tests/CMakeLists.txt`
- Create: `현장도면가공프로그램/tests/smoke/AppEnvironmentSmokeTest.cpp`
- Create: `현장도면가공프로그램/tests/smoke/LoggerSmokeTest.cpp`

- [ ] **Step 1: Write runtime mode smoke test**

Create `현장도면가공프로그램/tests/smoke/AppEnvironmentSmokeTest.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>

#include "config/AppEnvironment.h"

#include <cstdlib>

namespace {

void setAppEnv(const char* value)
{
#ifdef _WIN32
    _putenv_s("APP_ENV", value);
#else
    setenv("APP_ENV", value, 1);
#endif
}

void clearAppEnv()
{
#ifdef _WIN32
    _putenv_s("APP_ENV", "");
#else
    unsetenv("APP_ENV");
#endif
}

} // namespace

TEST_CASE("runtime mode names are stable")
{
    CHECK(yjcad::runtimeModeName(yjcad::RuntimeMode::Development) == "development");
    CHECK(yjcad::runtimeModeName(yjcad::RuntimeMode::Production) == "production");
}

TEST_CASE("runtime mode parser accepts production aliases")
{
    CHECK(yjcad::runtimeModeFromString("production") == yjcad::RuntimeMode::Production);
    CHECK(yjcad::runtimeModeFromString("prod") == yjcad::RuntimeMode::Production);
    CHECK(yjcad::runtimeModeFromString("release") == yjcad::RuntimeMode::Production);
}

TEST_CASE("runtime mode parser defaults to development for unclear values")
{
    CHECK(yjcad::runtimeModeFromString("") == yjcad::RuntimeMode::Development);
    CHECK(yjcad::runtimeModeFromString("local") == yjcad::RuntimeMode::Development);
}

TEST_CASE("compiled default runtime mode matches the build configuration")
{
#if YJCAD_DEFAULT_PRODUCTION == 1
    CHECK(yjcad::defaultRuntimeMode() == yjcad::RuntimeMode::Production);
#else
    CHECK(yjcad::defaultRuntimeMode() == yjcad::RuntimeMode::Development);
#endif
}

TEST_CASE("APP_ENV overrides the compiled runtime mode")
{
    setAppEnv("production");
    CHECK(yjcad::runtimeModeFromEnvironment() == yjcad::RuntimeMode::Production);

    setAppEnv("development");
    CHECK(yjcad::runtimeModeFromEnvironment() == yjcad::RuntimeMode::Development);

    clearAppEnv();
}
```

- [ ] **Step 2: Write logger smoke test**

Create `현장도면가공프로그램/tests/smoke/LoggerSmokeTest.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>

#include "logging/Logger.h"

#include <filesystem>

TEST_CASE("logger writes a rotating log file")
{
    const auto logDir = std::filesystem::temp_directory_path() / "yjcad_logger_smoke";
    std::filesystem::remove_all(logDir);

    yjcad::initializeLogging({
        .mode = yjcad::RuntimeMode::Development,
        .logDirectory = logDir,
        .console = false
    });

    yjcad::appLogger()->info("smoke log entry");
    yjcad::appLogger()->flush();

    CHECK(std::filesystem::exists(logDir / "yjcad.log"));
}
```

- [ ] **Step 3: Create tests CMake file**

Create `현장도면가공프로그램/tests/CMakeLists.txt`:

```cmake
find_package(Catch2 3 CONFIG REQUIRED)

add_executable(yjcad_tests
    smoke/AppEnvironmentSmokeTest.cpp
    smoke/LoggerSmokeTest.cpp
)
target_link_libraries(yjcad_tests PRIVATE yjcad_core Catch2::Catch2WithMain)

include(Catch)
catch_discover_tests(yjcad_tests)
```

- [ ] **Step 4: Update root CMake for core library and tests**

Replace `현장도면가공프로그램/CMakeLists.txt` with:

```cmake
cmake_minimum_required(VERSION 3.26)

project(YJLaserOnsiteDrawingProcessor
    VERSION 0.1.0
    LANGUAGES CXX
)

option(YJCAD_BUILD_TESTS "Build smoke tests" ON)
option(YJCAD_BUILD_BENCHMARKS "Build smoke benchmarks" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(spdlog CONFIG REQUIRED)

add_library(yjcad_core STATIC
    src/config/AppEnvironment.cpp
    src/logging/Logger.cpp
)
target_include_directories(yjcad_core PUBLIC src)
target_link_libraries(yjcad_core PUBLIC spdlog::spdlog)
target_compile_definitions(yjcad_core PUBLIC
    YJCAD_DEFAULT_PRODUCTION=$<IF:$<CONFIG:Release>,1,0>
)

include(CTest)
if(YJCAD_BUILD_TESTS)
    add_subdirectory(tests)
endif()
```

- [ ] **Step 5: Run tests and verify they fail before implementation**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset dev
cmake --build --preset dev
```

Expected: configure/generate fails because the core source/header files do not exist yet. This is the intentional red step before implementation.

- [ ] **Step 6: Add runtime mode header**

Create `현장도면가공프로그램/src/config/AppEnvironment.h`:

```cpp
#pragma once

#include <string>

namespace yjcad {

enum class RuntimeMode {
    Development,
    Production
};

RuntimeMode runtimeModeFromString(std::string value);
RuntimeMode defaultRuntimeMode();
RuntimeMode runtimeModeFromEnvironment();
std::string runtimeModeName(RuntimeMode mode);
bool isDevelopment(RuntimeMode mode);

} // namespace yjcad
```

- [ ] **Step 7: Add runtime mode implementation**

Create `현장도면가공프로그램/src/config/AppEnvironment.cpp`:

```cpp
#include "config/AppEnvironment.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>

#ifndef YJCAD_DEFAULT_PRODUCTION
#define YJCAD_DEFAULT_PRODUCTION 0
#endif

namespace {

std::string normalized(std::string value)
{
    std::ranges::transform(value, value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

} // namespace

namespace yjcad {

RuntimeMode runtimeModeFromString(std::string value)
{
    value = normalized(std::move(value));
    if (value == "production" || value == "prod" || value == "release") {
        return RuntimeMode::Production;
    }

    return RuntimeMode::Development;
}

RuntimeMode defaultRuntimeMode()
{
    return YJCAD_DEFAULT_PRODUCTION == 1 ? RuntimeMode::Production : RuntimeMode::Development;
}

RuntimeMode runtimeModeFromEnvironment()
{
    const char* value = std::getenv("APP_ENV");
    if (value == nullptr) {
        return defaultRuntimeMode();
    }

    return runtimeModeFromString(value);
}

std::string runtimeModeName(RuntimeMode mode)
{
    switch (mode) {
    case RuntimeMode::Production:
        return "production";
    case RuntimeMode::Development:
        return "development";
    }

    return "development";
}

bool isDevelopment(RuntimeMode mode)
{
    return mode == RuntimeMode::Development;
}

} // namespace yjcad
```

- [ ] **Step 8: Add logger header**

Create `현장도면가공프로그램/src/logging/Logger.h`:

```cpp
#pragma once

#include "config/AppEnvironment.h"

#include <filesystem>
#include <memory>

namespace spdlog {
class logger;
}

namespace yjcad {

struct LoggerOptions {
    RuntimeMode mode;
    std::filesystem::path logDirectory;
    bool console;
};

std::filesystem::path defaultLogDirectory();
void initializeLogging(const LoggerOptions& options);
std::shared_ptr<spdlog::logger> appLogger();

} // namespace yjcad
```

- [ ] **Step 9: Add logger implementation**

Create `현장도면가공프로그램/src/logging/Logger.cpp`:

```cpp
#include "logging/Logger.h"

#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>

#include <cstdlib>
#include <filesystem>
#include <memory>
#include <vector>

namespace {

std::shared_ptr<spdlog::logger>& loggerInstance()
{
    static std::shared_ptr<spdlog::logger> logger;
    return logger;
}

std::filesystem::path appDataLogDirectory()
{
#ifdef _WIN32
    const char* localAppData = std::getenv("LOCALAPPDATA");
    if (localAppData != nullptr && *localAppData != '\0') {
        return std::filesystem::path(localAppData) / "YJLaser" / "OnsiteDrawingProcessor" / "logs";
    }
#endif
    return std::filesystem::current_path() / "logs";
}

} // namespace

namespace yjcad {

std::filesystem::path defaultLogDirectory()
{
    const auto localLogs = std::filesystem::current_path() / "logs";
    std::error_code error;
    std::filesystem::create_directories(localLogs, error);
    if (!error) {
        return localLogs;
    }

    return appDataLogDirectory();
}

void initializeLogging(const LoggerOptions& options)
{
    std::filesystem::create_directories(options.logDirectory);

    std::vector<spdlog::sink_ptr> sinks;
    if (options.console || isDevelopment(options.mode)) {
        sinks.push_back(std::make_shared<spdlog::sinks::stdout_color_sink_mt>());
    }

    const auto logFile = options.logDirectory / "yjcad.log";
    sinks.push_back(std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
        logFile.string(),
        5 * 1024 * 1024,
        5
    ));

    auto logger = std::make_shared<spdlog::logger>("yjcad", sinks.begin(), sinks.end());
    logger->set_level(isDevelopment(options.mode) ? spdlog::level::debug : spdlog::level::info);
    logger->flush_on(spdlog::level::warn);

    spdlog::set_default_logger(logger);
    loggerInstance() = logger;
    logger->info("logger initialized mode={}", runtimeModeName(options.mode));
}

std::shared_ptr<spdlog::logger> appLogger()
{
    if (!loggerInstance()) {
        const auto mode = runtimeModeFromEnvironment();
        initializeLogging({
            .mode = mode,
            .logDirectory = defaultLogDirectory(),
            .console = isDevelopment(mode)
        });
    }

    return loggerInstance();
}

} // namespace yjcad
```

- [ ] **Step 10: Run core tests**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset dev
cmake --build --preset dev
ctest --preset dev
```

Expected: configure and build succeed; `AppEnvironmentSmokeTest` and `LoggerSmokeTest` pass.

- [ ] **Step 11: Commit runtime and logging core**

Run:

```powershell
git add 현장도면가공프로그램/src/config `
  현장도면가공프로그램/src/logging `
  현장도면가공프로그램/tests `
  현장도면가공프로그램/CMakeLists.txt
git commit -m "feat: 실행 모드와 로깅 골격 추가"
```

Expected: one commit containing runtime/logging source and smoke tests.

## Task 3: Add Qt Main Window Shell

**Files:**
- Create: `현장도면가공프로그램/src/canvas/CadCanvasWidget.h`
- Create: `현장도면가공프로그램/src/canvas/CadCanvasWidget.cpp`
- Create: `현장도면가공프로그램/src/ui/ToolPanelWidget.h`
- Create: `현장도면가공프로그램/src/ui/ToolPanelWidget.cpp`
- Create: `현장도면가공프로그램/src/ui/RightPanelWidget.h`
- Create: `현장도면가공프로그램/src/ui/RightPanelWidget.cpp`
- Create: `현장도면가공프로그램/src/ui/StatusLogWidget.h`
- Create: `현장도면가공프로그램/src/ui/StatusLogWidget.cpp`
- Create: `현장도면가공프로그램/src/app/MainWindow.h`
- Create: `현장도면가공프로그램/src/app/MainWindow.cpp`
- Create: `현장도면가공프로그램/src/app/main.cpp`

- [ ] **Step 1: Add CAD canvas widget header**

Create `현장도면가공프로그램/src/canvas/CadCanvasWidget.h`:

```cpp
#pragma once

#include <QWidget>

namespace yjcad {

class CadCanvasWidget final : public QWidget {
    Q_OBJECT

public:
    explicit CadCanvasWidget(QWidget* parent = nullptr);

protected:
    void paintEvent(QPaintEvent* event) override;
};

} // namespace yjcad
```

- [ ] **Step 2: Add CAD canvas widget implementation**

Create `현장도면가공프로그램/src/canvas/CadCanvasWidget.cpp`:

```cpp
#include "canvas/CadCanvasWidget.h"

#include <QColor>
#include <QPainter>
#include <QPaintEvent>
#include <QPen>

namespace yjcad {

CadCanvasWidget::CadCanvasWidget(QWidget* parent)
    : QWidget(parent)
{
    setMinimumSize(720, 480);
    setAutoFillBackground(false);
}

void CadCanvasWidget::paintEvent(QPaintEvent* event)
{
    Q_UNUSED(event);

    QPainter painter(this);
    painter.fillRect(rect(), QColor(28, 31, 34));
    painter.setRenderHint(QPainter::Antialiasing, true);

    painter.setPen(QPen(QColor(70, 76, 82), 1));
    constexpr int grid = 32;
    for (int x = 0; x < width(); x += grid) {
        painter.drawLine(x, 0, x, height());
    }
    for (int y = 0; y < height(); y += grid) {
        painter.drawLine(0, y, width(), y);
    }

    painter.setPen(QColor(214, 221, 228));
    painter.drawText(rect(), Qt::AlignCenter, QStringLiteral("CAD 캔버스 준비"));
}

} // namespace yjcad
```

- [ ] **Step 3: Add left tool panel**

Create `현장도면가공프로그램/src/ui/ToolPanelWidget.h`:

```cpp
#pragma once

#include <QWidget>

namespace yjcad {

class ToolPanelWidget final : public QWidget {
    Q_OBJECT

public:
    explicit ToolPanelWidget(QWidget* parent = nullptr);
};

} // namespace yjcad
```

Create `현장도면가공프로그램/src/ui/ToolPanelWidget.cpp`:

```cpp
#include "ui/ToolPanelWidget.h"

#include <QPushButton>
#include <QStringList>
#include <QVBoxLayout>

namespace yjcad {

ToolPanelWidget::ToolPanelWidget(QWidget* parent)
    : QWidget(parent)
{
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(8, 8, 8, 8);
    layout->setSpacing(6);

    const QStringList tools = {
        QStringLiteral("선택"),
        QStringLiteral("이동"),
        QStringLiteral("삭제"),
        QStringLiteral("레이어/색"),
        QStringLiteral("선"),
        QStringLiteral("원"),
        QStringLiteral("호"),
        QStringLiteral("폴리라인"),
        QStringLiteral("텍스트")
    };

    for (const auto& label : tools) {
        auto* button = new QPushButton(label, this);
        button->setMinimumHeight(30);
        layout->addWidget(button);
    }

    layout->addStretch(1);
}

} // namespace yjcad
```

- [ ] **Step 4: Add right panel**

Create `현장도면가공프로그램/src/ui/RightPanelWidget.h`:

```cpp
#pragma once

#include <QWidget>

namespace yjcad {

class RightPanelWidget final : public QWidget {
    Q_OBJECT

public:
    explicit RightPanelWidget(QWidget* parent = nullptr);

private:
    QWidget* createAutomationTab();
    QWidget* createValidationTab();
    QWidget* createReportTab();
    QWidget* createLayerTab();
    QWidget* createDrawingInfoTab();
    QWidget* createSequenceTab();
};

} // namespace yjcad
```

Create `현장도면가공프로그램/src/ui/RightPanelWidget.cpp`:

```cpp
#include "ui/RightPanelWidget.h"

#include <QFormLayout>
#include <QLabel>
#include <QListWidget>
#include <QPushButton>
#include <QStringList>
#include <QTabWidget>
#include <QVBoxLayout>

namespace {

QWidget* tabWithList(const QStringList& entries)
{
    auto* widget = new QWidget;
    auto* layout = new QVBoxLayout(widget);
    auto* list = new QListWidget(widget);
    list->addItems(entries);
    layout->addWidget(list);
    return widget;
}

} // namespace

namespace yjcad {

RightPanelWidget::RightPanelWidget(QWidget* parent)
    : QWidget(parent)
{
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);

    auto* tabs = new QTabWidget(this);
    tabs->addTab(createAutomationTab(), QStringLiteral("자동화"));
    tabs->addTab(createValidationTab(), QStringLiteral("검수"));
    tabs->addTab(createReportTab(), QStringLiteral("리포트"));
    tabs->addTab(createLayerTab(), QStringLiteral("레이어/속성"));
    tabs->addTab(createDrawingInfoTab(), QStringLiteral("도면 정보"));
    tabs->addTab(createSequenceTab(), QStringLiteral("시퀀스"));
    layout->addWidget(tabs);
}

QWidget* RightPanelWidget::createAutomationTab()
{
    auto* widget = new QWidget;
    auto* layout = new QVBoxLayout(widget);
    const QStringList commands = {
        QStringLiteral("오시/칼선 구분"),
        QStringLiteral("브릿지 삽입"),
        QStringLiteral("도면 정보 분석"),
        QStringLiteral("합판 생성"),
        QStringLiteral("출력 전 검수")
    };
    for (const auto& label : commands) {
        layout->addWidget(new QPushButton(label, widget));
    }
    layout->addStretch(1);
    return widget;
}

QWidget* RightPanelWidget::createValidationTab()
{
    return tabWithList({
        QStringLiteral("대기: 출력 전 검수"),
        QStringLiteral("대기: 미확정 오시/칼선"),
        QStringLiteral("대기: 브릿지 결과")
    });
}

QWidget* RightPanelWidget::createReportTab()
{
    return tabWithList({
        QStringLiteral("가져오기 리포트 대기"),
        QStringLiteral("자동화 실행 결과 대기"),
        QStringLiteral("최종 검수 리포트 대기")
    });
}

QWidget* RightPanelWidget::createLayerTab()
{
    auto* widget = new QWidget;
    auto* layout = new QFormLayout(widget);
    layout->addRow(QStringLiteral("선택 수"), new QLabel(QStringLiteral("0"), widget));
    layout->addRow(QStringLiteral("레이어"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("색상"), new QLabel(QStringLiteral("-"), widget));
    return widget;
}

QWidget* RightPanelWidget::createDrawingInfoTab()
{
    auto* widget = new QWidget;
    auto* layout = new QFormLayout(widget);
    layout->addRow(QStringLiteral("전체 칼선 크기"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("업체명"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("제품명"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("인쇄지"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("정타/후타"), new QLabel(QStringLiteral("-"), widget));
    return widget;
}

QWidget* RightPanelWidget::createSequenceTab()
{
    auto* widget = new QWidget;
    auto* layout = new QVBoxLayout(widget);
    layout->addWidget(new QLabel(QStringLiteral("자동 시퀀스는 후속 단계에서 연결합니다."), widget));
    layout->addStretch(1);
    return widget;
}

} // namespace yjcad
```

- [ ] **Step 5: Add bottom status/log widget**

Create `현장도면가공프로그램/src/ui/StatusLogWidget.h`:

```cpp
#pragma once

#include <QWidget>

namespace yjcad {

class StatusLogWidget final : public QWidget {
    Q_OBJECT

public:
    explicit StatusLogWidget(QWidget* parent = nullptr);
};

} // namespace yjcad
```

Create `현장도면가공프로그램/src/ui/StatusLogWidget.cpp`:

```cpp
#include "ui/StatusLogWidget.h"

#include <QHBoxLayout>
#include <QLabel>

namespace yjcad {

StatusLogWidget::StatusLogWidget(QWidget* parent)
    : QWidget(parent)
{
    auto* layout = new QHBoxLayout(this);
    layout->setContentsMargins(8, 4, 8, 4);
    layout->addWidget(new QLabel(QStringLiteral("좌표: 0, 0"), this));
    layout->addWidget(new QLabel(QStringLiteral("단위: mm"), this));
    layout->addWidget(new QLabel(QStringLiteral("선택: 0"), this));
    layout->addWidget(new QLabel(QStringLiteral("상태: 준비"), this), 1);
    layout->addWidget(new QLabel(QStringLiteral("성능 경고: 없음"), this));
}

} // namespace yjcad
```

- [ ] **Step 6: Add main window**

Create `현장도면가공프로그램/src/app/MainWindow.h`:

```cpp
#pragma once

#include <QMainWindow>

namespace yjcad {

class MainWindow final : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);

private:
    void createToolbar();
    void createDocks();
};

} // namespace yjcad
```

Create `현장도면가공프로그램/src/app/MainWindow.cpp`:

```cpp
#include "app/MainWindow.h"

#include "canvas/CadCanvasWidget.h"
#include "ui/RightPanelWidget.h"
#include "ui/StatusLogWidget.h"
#include "ui/ToolPanelWidget.h"

#include <QDockWidget>
#include <QToolBar>

namespace yjcad {

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
{
    setWindowTitle(QStringLiteral("현장도면가공프로그램"));
    resize(1280, 800);
    setCentralWidget(new CadCanvasWidget(this));
    createToolbar();
    createDocks();
}

void MainWindow::createToolbar()
{
    auto* toolbar = addToolBar(QStringLiteral("주요 실행"));
    toolbar->setMovable(false);
    toolbar->addAction(QStringLiteral("열기"));
    toolbar->addAction(QStringLiteral("저장"));
    toolbar->addAction(QStringLiteral("DXF 출력"));
    toolbar->addSeparator();
    toolbar->addAction(QStringLiteral("되돌리기"));
    toolbar->addAction(QStringLiteral("다시 실행"));
    toolbar->addSeparator();
    toolbar->addAction(QStringLiteral("확대"));
    toolbar->addAction(QStringLiteral("축소"));
    toolbar->addAction(QStringLiteral("맞춤"));
}

void MainWindow::createDocks()
{
    auto* toolDock = new QDockWidget(QStringLiteral("작성/수정"), this);
    toolDock->setWidget(new ToolPanelWidget(toolDock));
    addDockWidget(Qt::LeftDockWidgetArea, toolDock);

    auto* rightDock = new QDockWidget(QStringLiteral("자동화/검수"), this);
    rightDock->setWidget(new RightPanelWidget(rightDock));
    addDockWidget(Qt::RightDockWidgetArea, rightDock);

    auto* statusDock = new QDockWidget(QStringLiteral("상태/로그"), this);
    statusDock->setWidget(new StatusLogWidget(statusDock));
    addDockWidget(Qt::BottomDockWidgetArea, statusDock);
}

} // namespace yjcad
```

- [ ] **Step 7: Add application entry point**

Create `현장도면가공프로그램/src/app/main.cpp`:

```cpp
#include "app/MainWindow.h"
#include "config/AppEnvironment.h"
#include "logging/Logger.h"

#include <QApplication>
#include <QCoreApplication>

#include <filesystem>

int main(int argc, char* argv[])
{
    QApplication app(argc, argv);

    const auto mode = yjcad::runtimeModeFromEnvironment();
    const auto appDirectory = std::filesystem::path(QCoreApplication::applicationDirPath().toStdWString());
    yjcad::initializeLogging({
        .mode = mode,
        .logDirectory = appDirectory / "logs",
        .console = yjcad::isDevelopment(mode)
    });
    yjcad::appLogger()->info("application starting");

    yjcad::MainWindow window;
    window.show();

    const int result = app.exec();
    yjcad::appLogger()->info("application exiting code={}", result);
    return result;
}
```

- [ ] **Step 8: Update root CMake for Qt app**

Replace `현장도면가공프로그램/CMakeLists.txt` with:

```cmake
cmake_minimum_required(VERSION 3.26)

project(YJLaserOnsiteDrawingProcessor
    VERSION 0.1.0
    LANGUAGES CXX
)

option(YJCAD_BUILD_TESTS "Build smoke tests" ON)
option(YJCAD_BUILD_BENCHMARKS "Build smoke benchmarks" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets)
find_package(spdlog CONFIG REQUIRED)

add_library(yjcad_core STATIC
    src/config/AppEnvironment.cpp
    src/logging/Logger.cpp
)
target_include_directories(yjcad_core PUBLIC src)
target_link_libraries(yjcad_core PUBLIC spdlog::spdlog)
target_compile_definitions(yjcad_core PUBLIC
    YJCAD_DEFAULT_PRODUCTION=$<IF:$<CONFIG:Release>,1,0>
)

add_library(yjcad_ui STATIC
    src/app/MainWindow.cpp
    src/canvas/CadCanvasWidget.cpp
    src/ui/ToolPanelWidget.cpp
    src/ui/RightPanelWidget.cpp
    src/ui/StatusLogWidget.cpp
)
target_include_directories(yjcad_ui PUBLIC src)
target_link_libraries(yjcad_ui PUBLIC Qt6::Widgets yjcad_core)

add_executable(onsite_drawing_processor
    src/app/main.cpp
)
target_link_libraries(onsite_drawing_processor PRIVATE yjcad_ui yjcad_core Qt6::Widgets)
set_target_properties(onsite_drawing_processor PROPERTIES
    OUTPUT_NAME "현장도면가공프로그램"
)

include(CTest)
if(YJCAD_BUILD_TESTS)
    add_subdirectory(tests)
endif()
```

- [ ] **Step 9: Build application**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset dev
cmake --build --preset dev
```

Expected: build succeeds and produces `현장도면가공프로그램.exe` under `build/dev`.

- [ ] **Step 10: Run smoke tests after UI compile**

Run:

```powershell
cd 현장도면가공프로그램
ctest --preset dev
```

Expected: all smoke tests still pass.

- [ ] **Step 11: Launch app manually**

Run:

```powershell
cd 현장도면가공프로그램
Get-ChildItem build/dev -Recurse -Filter "현장도면가공프로그램.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName }
```

Expected: a Qt window opens with top toolbar, left tool dock, central CAD canvas, right tabs, and bottom status/log dock.

- [ ] **Step 12: Commit Qt shell**

Run:

```powershell
git add 현장도면가공프로그램/src/app `
  현장도면가공프로그램/src/canvas `
  현장도면가공프로그램/src/ui `
  현장도면가공프로그램/CMakeLists.txt
git commit -m "feat: Qt 작업 화면 골격 추가"
```

Expected: one commit containing the app entry point and UI shell files.

## Task 4: Add Benchmark Target

**Files:**
- Create: `현장도면가공프로그램/benchmarks/CMakeLists.txt`
- Create: `현장도면가공프로그램/benchmarks/smoke/CoreSmokeBenchmark.cpp`

- [ ] **Step 1: Write benchmark source**

Create `현장도면가공프로그램/benchmarks/smoke/CoreSmokeBenchmark.cpp`:

```cpp
#include "config/AppEnvironment.h"

#include <benchmark/benchmark.h>

static void BM_RuntimeModeName(benchmark::State& state)
{
    for (auto _ : state) {
        benchmark::DoNotOptimize(yjcad::runtimeModeName(yjcad::RuntimeMode::Development));
    }
}

BENCHMARK(BM_RuntimeModeName);
```

- [ ] **Step 2: Add benchmark CMake file**

Create `현장도면가공프로그램/benchmarks/CMakeLists.txt`:

```cmake
find_package(benchmark CONFIG REQUIRED)

add_executable(yjcad_benchmarks
    smoke/CoreSmokeBenchmark.cpp
)
target_link_libraries(yjcad_benchmarks PRIVATE yjcad_core benchmark::benchmark benchmark::benchmark_main)
```

- [ ] **Step 3: Update root CMake for benchmark target**

Replace `현장도면가공프로그램/CMakeLists.txt` with:

```cmake
cmake_minimum_required(VERSION 3.26)

project(YJLaserOnsiteDrawingProcessor
    VERSION 0.1.0
    LANGUAGES CXX
)

option(YJCAD_BUILD_TESTS "Build smoke tests" ON)
option(YJCAD_BUILD_BENCHMARKS "Build smoke benchmarks" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets)
find_package(spdlog CONFIG REQUIRED)

add_library(yjcad_core STATIC
    src/config/AppEnvironment.cpp
    src/logging/Logger.cpp
)
target_include_directories(yjcad_core PUBLIC src)
target_link_libraries(yjcad_core PUBLIC spdlog::spdlog)
target_compile_definitions(yjcad_core PUBLIC
    YJCAD_DEFAULT_PRODUCTION=$<IF:$<CONFIG:Release>,1,0>
)

add_library(yjcad_ui STATIC
    src/app/MainWindow.cpp
    src/canvas/CadCanvasWidget.cpp
    src/ui/ToolPanelWidget.cpp
    src/ui/RightPanelWidget.cpp
    src/ui/StatusLogWidget.cpp
)
target_include_directories(yjcad_ui PUBLIC src)
target_link_libraries(yjcad_ui PUBLIC Qt6::Widgets yjcad_core)

add_executable(onsite_drawing_processor
    src/app/main.cpp
)
target_link_libraries(onsite_drawing_processor PRIVATE yjcad_ui yjcad_core Qt6::Widgets)
set_target_properties(onsite_drawing_processor PROPERTIES
    OUTPUT_NAME "현장도면가공프로그램"
)

include(CTest)
if(YJCAD_BUILD_TESTS)
    add_subdirectory(tests)
endif()

if(YJCAD_BUILD_BENCHMARKS)
    add_subdirectory(benchmarks)
endif()
```

- [ ] **Step 4: Build benchmark target**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset dev
cmake --build --preset dev
```

Expected: build succeeds and produces `yjcad_benchmarks`.

- [ ] **Step 5: Run benchmark**

Run:

```powershell
cd 현장도면가공프로그램
Get-ChildItem build/dev -Recurse -Filter "yjcad_benchmarks.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName --benchmark_min_time=0.01 }
```

Expected: output contains `BM_RuntimeModeName`.

- [ ] **Step 6: Commit benchmark target**

Run:

```powershell
git add 현장도면가공프로그램/CMakeLists.txt `
  현장도면가공프로그램/benchmarks
git commit -m "test: 성능 벤치마크 골격 추가"
```

Expected: one commit containing benchmark smoke target.

## Task 5: Add Portable Packaging Script and Project Docs

**Files:**
- Create: `현장도면가공프로그램/scripts/package-portable.ps1`
- Create: `현장도면가공프로그램/docs/architecture.md`
- Create: `현장도면가공프로그램/docs/development.md`
- Create: `현장도면가공프로그램/docs/portable.md`
- Create: `현장도면가공프로그램/README.md`

- [ ] **Step 1: Add portable packaging script**

Create `현장도면가공프로그램/scripts/package-portable.ps1`:

```powershell
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
```

- [ ] **Step 2: Add architecture document**

Create `현장도면가공프로그램/docs/architecture.md`:

```markdown
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
```

- [ ] **Step 3: Add development document**

Create `현장도면가공프로그램/docs/development.md`:

```markdown
# Development

## Prerequisites

- CMake 3.26+
- C++20 compiler
- Qt 6-capable toolchain
- vcpkg with `VCPKG_ROOT` set

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
Get-ChildItem build/dev -Recurse -Filter "yjcad_benchmarks.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName --benchmark_min_time=0.01 }
```

## Production Build

```powershell
cmake --preset prod
cmake --build --preset prod
```

## Runtime Mode

Debug builds default to `development`; Release builds default to `production`.
Set `APP_ENV=development` or `APP_ENV=production` to override the compiled default.
```

- [ ] **Step 4: Add portable document**

Create `현장도면가공프로그램/docs/portable.md`:

```markdown
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
```

- [ ] **Step 5: Add README**

Create `현장도면가공프로그램/README.md`:

```markdown
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
```

- [ ] **Step 6: Build production package**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset prod
cmake --build --preset prod
./scripts/package-portable.ps1
```

Expected: `dist/현장도면가공프로그램-portable/` exists with executable, config, logs, plugins, runtime, licenses, README, portable docs, and `platforms/qwindows.dll`. If `windeployqt` is missing, the script fails unless `-AllowMissingQtRuntime` is explicitly supplied for local diagnostics.

- [ ] **Step 7: Commit packaging and docs**

Run:

```powershell
git add 현장도면가공프로그램/scripts `
  현장도면가공프로그램/docs `
  현장도면가공프로그램/README.md
git commit -m "docs: 포터블 실행 기준과 개발 문서 추가"
```

Expected: one commit containing packaging script and documentation.

## Task 6: Final Verification and Scope Review

**Files:**
- Read: `docs/superpowers/specs/2026-05-20-onsite-drawing-processor-design.md`
- Read: `현장도면가공프로그램/README.md`
- Read: `현장도면가공프로그램/docs/development.md`
- Read: `현장도면가공프로그램/docs/portable.md`

- [ ] **Step 1: Run full dev verification**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset dev
cmake --build --preset dev
ctest --preset dev
Get-ChildItem build/dev -Recurse -Filter "yjcad_benchmarks.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName --benchmark_min_time=0.01 }
```

Expected: configure succeeds, build succeeds, tests pass, benchmark output contains `BM_RuntimeModeName`.

- [ ] **Step 2: Run production build and portable package**

Run:

```powershell
cd 현장도면가공프로그램
cmake --preset prod
cmake --build --preset prod
./scripts/package-portable.ps1
```

Expected: production build succeeds and package script creates `dist/현장도면가공프로그램-portable/`.

- [ ] **Step 3: Launch app from dev build**

Run:

```powershell
cd 현장도면가공프로그램
Get-ChildItem build/dev -Recurse -Filter "현장도면가공프로그램.exe" | Select-Object -First 1 | ForEach-Object { & $_.FullName }
```

Expected: Qt window opens with:

- top toolbar
- left writing/editing tool dock
- central CAD canvas
- right automation/validation/report/layer/drawing-info/sequence tabs
- bottom status/log dock

- [ ] **Step 4: Confirm deferred features remain absent**

Run:

```powershell
rg -n "DxfImporter|AiImporter|BridgeInsertion|SheetGeneration|CutCreaseClassifier|ValidationReportService" 현장도면가공프로그램/src
```

Expected: no matches. First implementation must not accidentally add real CAD automation algorithms.

- [ ] **Step 5: Check generated or local-only outputs before final commit**

Run:

```powershell
git status --short
```

Expected: source/docs files are tracked candidates. Build outputs under `현장도면가공프로그램/build/` and `현장도면가공프로그램/dist/` are not staged because `현장도면가공프로그램/.gitignore` was created in Task 1. If generated outputs still appear, fix the project `.gitignore` before committing:

```gitignore
build/
dist/
logs/
*.user
CMakeUserPresets.json
```

- [ ] **Step 6: Fix ignore rules if generated outputs still appear**

If `build/`, `dist/`, or `logs/` appear in git status, update `현장도면가공프로그램/.gitignore` with:

```gitignore
build/
dist/
logs/
*.user
CMakeUserPresets.json
```

Run:

```powershell
git add 현장도면가공프로그램/.gitignore
git commit -m "chore: 현장도면가공프로그램 생성 파일 제외 보정"
```

Expected: generated build/package/log outputs are ignored.

- [ ] **Step 7: Produce final implementation summary**

Report:

```text
구현 완료:
- 프로젝트 폴더: 현장도면가공프로그램/
- dev/prod CMake preset
- Qt 빈 작업 화면
- spdlog 로깅
- Catch2 smoke tests
- Google Benchmark smoke target
- 포터블 패키징 스크립트와 문서

검증:
- cmake --preset dev
- cmake --build --preset dev
- ctest --preset dev
- yjcad_benchmarks --benchmark_min_time=0.01
- cmake --preset prod
- cmake --build --preset prod
- ./scripts/package-portable.ps1

첫 구현에서 제외된 항목:
- 실제 DXF/AI/PDF/EPS 파싱
- 실제 CAD 편집/자동화 알고리즘
- 설치파일
- 자동 시퀀스 실행
```

## Plan Self-Review

**Spec coverage:**  
Covered: project folder, C++20/Qt 6/CMake/vcpkg skeleton, dev/prod presets, empty main window, mixed screen shell, spdlog logging skeleton, Catch2 smoke tests, Google Benchmark smoke benchmark, portable folder/script/docs, README.  
Deferred by design: file parsers, CAD entity editing, cut/crease classification, bridge insertion, sheet generation, gu-ai insertion, validation algorithms, installer, automatic sequence execution.

**미정 표시 스캔:**  
No unresolved markers are allowed in implementation files. The UI contains initial visible shell text only, not hidden work markers.

**Type consistency:**  
All C++ symbols use namespace `yjcad`. CMake targets are `yjcad_core`, `yjcad_ui`, `onsite_drawing_processor`, `yjcad_tests`, and `yjcad_benchmarks`. The executable output name is `현장도면가공프로그램`.

## DevEx Review Findings

**Mode:** DX TRIAGE
**Product type:** Windows desktop C++/Qt internal tool scaffold
**Primary developer persona:** future YJLaser implementer who must clone the repo, configure Qt/vcpkg, build the app, run smoke tests, and create a portable package without guessing hidden setup steps.
**Empathy narrative:** "I need one known-good path from clean checkout to running app. When it fails, I need the command, missing prerequisite, and next action immediately because the CAD automation work will already be complex."

### Scorecard

| Dimension | Before | After plan update | Notes |
|-----------|--------|-------------------|-------|
| Getting Started | 6/10 | 8/10 | Added early `.gitignore`, explicit build/test/package sequence, and multi-config build preset configuration. |
| Error Messages & Debugging | 6/10 | 8/10 | Packaging now fails with actionable messages instead of silently creating a broken folder. |
| Developer Environment & Tooling | 6/10 | 8/10 | Debug/Release runtime mode defaults now match dev/prod presets and can be overridden with `APP_ENV`. |
| Documentation | 7/10 | 8/10 | Runtime mode and Qt deployment expectations are documented in development/portable/README sections. |

**TTHW estimate:** 20-40 minutes before review -> 10-15 minutes after review, assuming Qt/vcpkg prerequisites are already installed.
**Competitive benchmark:** internal tool scaffold; target is one golden path, clear failure, no silent broken package.
**Magical moment:** after `cmake --preset dev && cmake --build --preset dev`, the developer can launch a real Qt shell with the intended CAD work surface and see logs/tests already wired.

### Implementation Tasks From DX Review

- [x] **T1 (P1)** - Packaging - fail when Qt runtime deployment is incomplete.
  Surfaced by: Error Messages & Debugging. A portable folder without `platforms/qwindows.dll` looks successful but will fail on a field PC.
  Files: `현장도면가공프로그램/scripts/package-portable.ps1`, `docs/portable.md`, `README.md` plan sections.
  Verify: `./scripts/package-portable.ps1` fails when `windeployqt` is unavailable unless `-AllowMissingQtRuntime` is used.
- [x] **T2 (P1)** - Safe cleanup - constrain recursive package cleanup to `dist/`.
  Surfaced by: Developer Environment & Tooling. `Remove-Item -Recurse` needs an absolute path guard before deleting a computed output directory.
  Files: `현장도면가공프로그램/scripts/package-portable.ps1` plan section.
  Verify: script rejects `-OutputDir` outside `dist/` before creating or deleting the target path.
- [x] **T3 (P2)** - Build hygiene - create project `.gitignore` before the first CMake run.
  Surfaced by: Getting Started. Build/package/log outputs should not appear as commit candidates after local verification.
  Files: `현장도면가공프로그램/.gitignore` plan section.
  Verify: `git status --short` after build does not show `build/`, `dist/`, or `logs/`.
- [x] **T4 (P2)** - Preset clarity - make dev/prod presets explicit for multi-config generators.
  Surfaced by: Developer Environment & Tooling. Visual Studio generators can ignore `CMAKE_BUILD_TYPE` unless build/test configuration is specified.
  Files: `현장도면가공프로그램/CMakePresets.json`, `CMakeLists.txt`, `AppEnvironment.cpp` plan sections.
  Verify: dev build defaults to development, prod build defaults to production, `APP_ENV` override still works.
- [x] **T5 (P2)** - Commit accuracy - include changed `CMakeLists.txt` in task-level commits.
  Surfaced by: Getting Started. Task 2 and Task 3 changed root CMake but the original commit commands could omit it.
  Files: Task 2 and Task 3 commit command sections.
  Verify: each task commit contains the CMake changes it depends on.

### Review Tooling Note

`gstack-review-read` could not run in this Windows session because the script file has no associated executable handler in PowerShell. Earlier Bash fallback also failed in this environment, so no GStack JSONL/dashboard artifact was emitted. Per the skill rule, JSONL was not hand-written.

## Eng Review Findings

**Mode:** FULL_REVIEW
**Scope challenge:** Complexity threshold is intentionally exceeded because this is a scaffold plan that creates build, UI, tests, benchmarks, packaging, and docs in one new project folder. The scope remains acceptable because the first implementation still avoids CAD parsing/editing algorithms and only creates execution boundaries.
**What already exists:** Existing Python/PyQt desktop projects in this monorepo prove local desktop distribution patterns, but they do not provide reusable C++/Qt 6 build infrastructure. The plan correctly starts a separate C++ project instead of adapting PyInstaller/Python internals.
**NOT in scope:** DXF/AI/PDF/EPS parsing, CAD entity algorithms, command history, real bridge insertion, real sheet generation, installer, auto-update, and automatic workflow sequencing remain deferred because the first implementation is only the executable scaffold.
**External grounding:** CMake presets are project-shared config while `CMakeUserPresets.json` is user-local per official CMake docs (`https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html`). Qt's Windows deployment docs recommend `windeployqt` for collecting required Qt libraries/plugins and call out `platforms/qwindows.dll` as the Windows platform plugin (`https://doc.qt.io/qt-6/windows-deployment.html`).

### Scope and Architecture

- [x] **E1 (P1, confidence: 8/10)** - Portable logging must write next to the executable, not whatever current working directory launched the app.
  - Why: field PCs and shortcuts can start the executable from a different working directory; logs would be scattered or unwritable.
  - Plan change: `main.cpp` now creates `QApplication` first and initializes logs at `QCoreApplication::applicationDirPath()/logs`.
  - Verify: launch packaged app from outside its folder and confirm `dist/현장도면가공프로그램-portable/logs/yjcad.log` is created.
- [x] **E2 (P2, confidence: 8/10)** - User-local CMake presets must be ignored.
  - Why: CMake documents `CMakeUserPresets.json` as developer-specific; committing it would make one machine's paths leak into shared build config.
  - Plan change: `현장도면가공프로그램/.gitignore` includes `CMakeUserPresets.json`.
  - Verify: create `현장도면가공프로그램/CMakeUserPresets.json` and confirm `git status --short` does not show it.

### Code Quality

- [x] **E3 (P2, confidence: 8/10)** - Runtime mode default should be named and testable instead of embedded only inside environment parsing.
  - Why: dev/prod behavior is a core debugging promise, and the Release default is otherwise easy to regress while refactoring config loading.
  - Plan change: added `defaultRuntimeMode()` and made `runtimeModeFromEnvironment()` call it when `APP_ENV` is unset.
  - Verify: `AppEnvironmentSmokeTest` checks `defaultRuntimeMode()` against `YJCAD_DEFAULT_PRODUCTION`.
- [x] **E4 (P3, confidence: 9/10)** - The intentional red step described the wrong failure phase.
  - Why: after adding source files to `add_library`, missing `.cpp` files usually fail during CMake configure/generate, not during compilation.
  - Plan change: Task 2 Step 5 expectation now says configure/generate fails before implementation.
  - Verify: run Task 2 Step 5 before creating `src/config` and `src/logging` files.

### Test Coverage Diagram

```text
+-------------------------------+-----------------------------+------------------------------+
| Code path                     | Planned coverage            | Remaining gap                |
|-------------------------------+-----------------------------+------------------------------|
| runtimeModeName               | AppEnvironmentSmokeTest     | none                         |
| runtimeModeFromString aliases | AppEnvironmentSmokeTest     | none                         |
| defaultRuntimeMode            | AppEnvironmentSmokeTest     | none                         |
| APP_ENV override              | AppEnvironmentSmokeTest     | none                         |
| initializeLogging             | LoggerSmokeTest             | file write only, acceptable  |
| appLogger lazy init           | indirectly via logger test  | no concurrent init test      |
| Qt main window composition    | manual launch check         | no automated UI smoke yet    |
| benchmark executable          | manual benchmark run        | no perf threshold yet        |
| package-portable.ps1          | manual package command      | no Pester/unit script tests  |
+-------------------------------+-----------------------------+------------------------------+
```

**Test review result:** 3 test gaps remain intentionally accepted for the first scaffold: automated Qt UI smoke, Pester tests for the PowerShell packager, and benchmark threshold assertions. They are not critical because the first implementation target is a local scaffold, but they should be reconsidered before real CAD algorithms land.

### Failure Modes

| Flow | Failure mode | Covered now | Handling expected |
|------|--------------|-------------|------------------|
| Configure | `VCPKG_ROOT` missing | manual configure step | CMake error plus docs guidance |
| Build | Qt/spdlog/Catch2/benchmark package missing | configure/build command | vcpkg/CMake failure |
| Runtime logging | app launched outside exe folder | plan fixed | executable-adjacent `logs/` |
| Package | `windeployqt` missing | plan fixed | fail unless explicit diagnostic bypass |
| Package cleanup | `OutputDir` points outside `dist/` | plan fixed | reject before delete |
| UI launch | Qt platform plugin missing | package validation | fail package if `qwindows.dll` absent |

**Critical silent gaps:** 0 after the plan updates above.

### Performance Review

No runtime performance issue blocks this scaffold. The plan has a Google Benchmark target, keeps config/logging independent from Qt, and defers heavy CAD parsing/rendering. The benchmark is only a smoke target, so real thresholds must be added when geometry/import services begin.

### Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Build skeleton | root config, config/ | none |
| Runtime/logging core | src/config, src/logging, tests/ | Build skeleton |
| Qt shell | src/app, src/canvas, src/ui | Runtime/logging core |
| Benchmark | benchmarks/, root CMake | Runtime/logging core |
| Packaging/docs | scripts/, docs/, README | Qt shell |

Parallel lanes:
- Lane A: Build skeleton -> runtime/logging core.
- Lane B: Qt shell after Lane A.
- Lane C: Benchmark after Lane A; can run in parallel with Qt shell if both coordinate root `CMakeLists.txt` edits.
- Lane D: Packaging/docs after Qt shell.

Recommended execution: keep this sequential for the first scaffold because several tasks rewrite root `CMakeLists.txt`. Parallel work is possible only after Task 2 if one worker owns UI files and another owns benchmark files, with one integrator owning `CMakeLists.txt`.

### Implementation Tasks From Eng Review

- [x] **T1 (P1, human: ~30min / CC: ~5min)** - Runtime - make portable logs executable-adjacent.
  - Surfaced by: Architecture review.
  - Files: `현장도면가공프로그램/src/app/main.cpp`.
  - Verify: packaged app writes under its own `logs/` folder.
- [x] **T2 (P2, human: ~20min / CC: ~5min)** - Config - expose and test compiled default runtime mode.
  - Surfaced by: Code quality and test review.
  - Files: `src/config/AppEnvironment.h`, `src/config/AppEnvironment.cpp`, `tests/smoke/AppEnvironmentSmokeTest.cpp`.
  - Verify: `ctest --preset dev`.
- [x] **T3 (P2, human: ~5min / CC: ~2min)** - Build hygiene - ignore `CMakeUserPresets.json`.
  - Surfaced by: Architecture review and official CMake preset guidance.
  - Files: `현장도면가공프로그램/.gitignore`.
  - Verify: `git status --short`.
- [x] **T4 (P3, human: ~5min / CC: ~2min)** - Plan accuracy - correct the expected red-step failure phase.
  - Surfaced by: Code quality review.
  - Files: implementation plan Task 2 Step 5.
  - Verify: read the step and confirm it says configure/generate failure.

### Eng Review Completion Summary

- Step 0 Scope Challenge: scope accepted as-is; many files are justified by scaffold boundaries.
- Architecture Review: 2 issues found, 2 fixed in the plan.
- Code Quality Review: 2 issues found, 2 fixed in the plan.
- Test Review: coverage diagram produced, 3 accepted non-critical follow-up gaps.
- Performance Review: 0 blocking issues.
- NOT in scope: written above.
- What already exists: written above.
- TODOS.md updates: 0 added; existing TODO files are for other subprojects and do not block this scaffold.
- Failure modes: 0 critical silent gaps after updates.
- Outside voice: skipped; no separate reviewer agent was permitted by current tool policy.
- Parallelization: 4 lanes identified, sequential execution recommended.

### Eng Review Tooling Note

`gstack-review-log` could not persist metadata in this Windows session. Direct PowerShell execution has no file association for the script; Bash can find `gstack-review-read`, but `gstack-review-log` depends on `bun` for JSON validation and `bun` is not available in that Bash environment. `jq` is also unavailable, so the eng review task JSONL artifact was not emitted. No hand-written JSONL was created.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | NOT RUN | Not requested for this implementation scaffold. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | NOT RUN | No code diff to review yet; this is still plan-stage. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR WITH NOTES | 4 issues found and fixed in plan; 0 critical gaps; 3 non-critical future test gaps accepted. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT RUN | First implementation UI is a shell; visual review can wait until real interactions exist. |
| DX Review | `/plan-devex-review` | Developer setup, build, test, packaging | 1 | CLEAR WITH NOTES | Score 6/10 -> 8/10; TTHW 20-40 min -> 10-15 min; fixed packaging failure behavior, safe cleanup, gitignore timing, multi-config presets, and task commit accuracy. |

- **UNRESOLVED:** 0 DX/Eng decisions. No TODO was added because review follow-ups are not blocking this scaffold.
- **VERDICT:** DX + ENG CLEARED WITH NOTES - ready to execute the scaffold implementation plan.
