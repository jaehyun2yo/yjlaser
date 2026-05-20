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
