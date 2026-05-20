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
