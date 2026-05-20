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
