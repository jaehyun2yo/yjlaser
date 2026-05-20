#include "config/AppEnvironment.h"

#include <benchmark/benchmark.h>

static void BM_RuntimeModeName(benchmark::State& state)
{
    for (auto _ : state) {
        benchmark::DoNotOptimize(yjcad::runtimeModeName(yjcad::RuntimeMode::Development));
    }
}

BENCHMARK(BM_RuntimeModeName);
