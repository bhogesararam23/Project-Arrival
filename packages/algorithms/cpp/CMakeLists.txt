cmake_minimum_required(VERSION 3.16)
project(arrival_algorithms CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler warnings and diagnostic configuration
if(MSVC)
    add_compile_options(/W4 /permissive-)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
    option(ENABLE_SANITIZERS "Enable Address and Undefined Behavior Sanitizers" OFF)
    if(ENABLE_SANITIZERS)
        add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=address,undefined)
    endif()
endif()

include_directories(include)

add_library(arrival_entity_resolution STATIC
    src/entity_resolution.cpp
)

add_executable(arrival_entity_resolution_test
    test/entity_resolution_test.cpp
)
target_link_libraries(arrival_entity_resolution_test PRIVATE arrival_entity_resolution)

add_executable(arrival_entity_resolution_bench
    bench/entity_resolution_bench.cpp
)
target_link_libraries(arrival_entity_resolution_bench PRIVATE arrival_entity_resolution)
