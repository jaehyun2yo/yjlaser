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
