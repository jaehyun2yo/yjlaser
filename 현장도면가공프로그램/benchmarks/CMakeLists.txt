find_package(benchmark CONFIG REQUIRED)

add_executable(yjcad_benchmarks
    smoke/CoreSmokeBenchmark.cpp
)
target_link_libraries(yjcad_benchmarks PRIVATE yjcad_core benchmark::benchmark benchmark::benchmark_main)
