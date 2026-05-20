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
