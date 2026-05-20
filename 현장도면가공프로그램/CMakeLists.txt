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
