find_package(Catch2 3 CONFIG REQUIRED)

add_executable(yjcad_tests
    smoke/AppEnvironmentSmokeTest.cpp
    smoke/LoggerSmokeTest.cpp
)
target_link_libraries(yjcad_tests PRIVATE yjcad_core Catch2::Catch2WithMain)

include(Catch)
catch_discover_tests(yjcad_tests)
