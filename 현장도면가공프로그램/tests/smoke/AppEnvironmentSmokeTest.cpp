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
