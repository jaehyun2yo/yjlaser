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
