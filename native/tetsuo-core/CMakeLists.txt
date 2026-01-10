cmake_minimum_required(VERSION 3.16)
project(tetsuo-core VERSION 0.1.0 LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Build options
option(TETSUO_BUILD_SHARED "Build shared library" ON)
option(TETSUO_BUILD_STATIC "Build static library" ON)
option(TETSUO_BUILD_TESTS "Build tests" OFF)
option(TETSUO_BUILD_BENCH "Build benchmarks" OFF)
option(TETSUO_ENABLE_ASM "Enable assembly optimizations" ON)

# Compiler flags
if(CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra -Wpedantic")
    set(CMAKE_C_FLAGS_RELEASE "-O3 -DNDEBUG -march=native -mtune=native")
    set(CMAKE_C_FLAGS_DEBUG "-g -O0 -fsanitize=address,undefined")

    if(TETSUO_ENABLE_ASM AND CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -mbmi2 -madx")
    endif()

    # LTO for release builds
    if(CMAKE_BUILD_TYPE STREQUAL "Release")
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -flto")
        set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -flto")
    endif()
endif()

if(MSVC)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} /W4")
    set(CMAKE_C_FLAGS_RELEASE "/O2 /DNDEBUG")
endif()

# Source files
set(TETSUO_SOURCES
    src/field.c
    src/arena.c
    src/verify.c
    src/api.c
)

set(TETSUO_HEADERS
    src/tetsuo.h
    src/field.h
    src/arena.h
    src/verify.h
)

# Static library
if(TETSUO_BUILD_STATIC)
    add_library(tetsuo_static STATIC ${TETSUO_SOURCES})
    target_include_directories(tetsuo_static PUBLIC src)
    set_target_properties(tetsuo_static PROPERTIES
        OUTPUT_NAME tetsuo
        POSITION_INDEPENDENT_CODE ON
    )
endif()

# Shared library
if(TETSUO_BUILD_SHARED)
    add_library(tetsuo SHARED ${TETSUO_SOURCES})
    target_include_directories(tetsuo PUBLIC src)
    set_target_properties(tetsuo PROPERTIES
        VERSION ${PROJECT_VERSION}
        SOVERSION 0
        C_VISIBILITY_PRESET hidden
    )

    if(UNIX AND NOT APPLE)
        target_link_libraries(tetsuo PRIVATE pthread)
    endif()
endif()

# Installation
include(GNUInstallDirs)

install(TARGETS tetsuo tetsuo_static
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

install(FILES src/tetsuo.h
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)

# Tests
if(TETSUO_BUILD_TESTS)
    enable_testing()
    add_executable(test_field tests/test_field.c)
    target_link_libraries(test_field tetsuo_static)
    add_test(NAME field_test COMMAND test_field)

    add_executable(test_verify tests/test_verify.c)
    target_link_libraries(test_verify tetsuo_static)
    add_test(NAME verify_test COMMAND test_verify)
endif()

# Benchmarks
if(TETSUO_BUILD_BENCH)
    add_executable(bench_field bench/bench_field.c)
    target_link_libraries(bench_field tetsuo_static)

    add_executable(bench_verify bench/bench_verify.c)
    target_link_libraries(bench_verify tetsuo_static)
endif()

# pkg-config
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/tetsuo.pc.in
    ${CMAKE_CURRENT_BINARY_DIR}/tetsuo.pc
    @ONLY
)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/tetsuo.pc
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/pkgconfig
)
