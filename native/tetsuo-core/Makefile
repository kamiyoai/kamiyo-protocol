# tetsuo-core: Standalone Makefile
# For quick builds without CMake

CC ?= gcc
AR ?= ar
CFLAGS = -std=c11 -Wall -Wextra -Wpedantic -fPIC
LDFLAGS = -lpthread

# Detect architecture
UNAME_M := $(shell uname -m)
ifeq ($(UNAME_M),x86_64)
    CFLAGS += -mbmi2 -madx
endif

# mcl pairing library support
# Set USE_MCL=1 to enable real Groth16 verification
# Requires: brew install mcl (macOS) or apt install libmcl-dev (Linux)
# Or build from source: git clone https://github.com/herumi/mcl && cd mcl && make && make install PREFIX=./deps/mcl
ifeq ($(USE_MCL),1)
    CFLAGS += -DTETSUO_USE_MCL
    # Check for local installation first, then system
    ifneq ($(wildcard deps/mcl/include/mcl),)
        MCL_INC = -Ideps/mcl/include
        MCL_LIB = -Ldeps/mcl/lib -lmcl
    else
        MCL_INC ?= $(shell pkg-config --cflags mcl 2>/dev/null || echo "-I/usr/local/include")
        MCL_LIB ?= $(shell pkg-config --libs mcl 2>/dev/null || echo "-L/usr/local/lib -lmcl")
    endif
    CFLAGS += $(MCL_INC)
    LDFLAGS += $(MCL_LIB)
endif

# Build modes
ifeq ($(DEBUG),1)
    CFLAGS += -g -O0 -fsanitize=address,undefined
    LDFLAGS += -fsanitize=address,undefined
else
    CFLAGS += -O3 -DNDEBUG -march=native -mtune=native -flto
    LDFLAGS += -flto
endif

# Directories
SRC_DIR = src
BUILD_DIR = build
LIB_DIR = lib

# Sources
SRCS = $(SRC_DIR)/field.c \
       $(SRC_DIR)/arena.c \
       $(SRC_DIR)/verify.c \
       $(SRC_DIR)/pairing.c \
       $(SRC_DIR)/log.c \
       $(SRC_DIR)/error.c \
       $(SRC_DIR)/api.c

OBJS = $(SRCS:$(SRC_DIR)/%.c=$(BUILD_DIR)/%.o)
DEPS = $(OBJS:.o=.d)

# Targets
STATIC_LIB = $(LIB_DIR)/libtetsuo.a
SHARED_LIB = $(LIB_DIR)/libtetsuo.so

.PHONY: all clean static shared install test bench

all: static shared

static: $(STATIC_LIB)

shared: $(SHARED_LIB)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(LIB_DIR):
	mkdir -p $(LIB_DIR)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -MMD -MP -c $< -o $@

$(STATIC_LIB): $(OBJS) | $(LIB_DIR)
	$(AR) rcs $@ $(OBJS)

$(SHARED_LIB): $(OBJS) | $(LIB_DIR)
	$(CC) -shared $(LDFLAGS) $(OBJS) -o $@

# Include dependency files
-include $(DEPS)

clean:
	rm -rf $(BUILD_DIR) $(LIB_DIR)

install: $(STATIC_LIB) $(SHARED_LIB)
	install -d $(DESTDIR)/usr/local/lib
	install -d $(DESTDIR)/usr/local/include
	install -m 644 $(STATIC_LIB) $(DESTDIR)/usr/local/lib/
	install -m 755 $(SHARED_LIB) $(DESTDIR)/usr/local/lib/
	install -m 644 $(SRC_DIR)/tetsuo.h $(DESTDIR)/usr/local/include/
	ldconfig 2>/dev/null || true

# Test target (requires test files)
test: static
	@echo "Building tests..."
	$(CC) $(CFLAGS) -I$(SRC_DIR) tests/test_field.c $(STATIC_LIB) -o $(BUILD_DIR)/test_field
	$(CC) $(CFLAGS) -I$(SRC_DIR) tests/test_verify.c $(STATIC_LIB) -o $(BUILD_DIR)/test_verify
ifeq ($(USE_MCL),1)
	$(CC) $(CFLAGS) -I$(SRC_DIR) tests/test_pairing.c $(STATIC_LIB) $(MCL_LIB) -Wl,-rpath,@executable_path/../deps/mcl/lib -o $(BUILD_DIR)/test_pairing
endif
	@echo "Running tests..."
	$(BUILD_DIR)/test_field
	$(BUILD_DIR)/test_verify
ifeq ($(USE_MCL),1)
	DYLD_LIBRARY_PATH=$(PWD)/deps/mcl/lib $(BUILD_DIR)/test_pairing
endif

# Benchmark target
bench: static
	@echo "Building benchmarks..."
	$(CC) $(CFLAGS) -I$(SRC_DIR) bench/bench_field.c $(STATIC_LIB) -o $(BUILD_DIR)/bench_field
	$(CC) $(CFLAGS) -I$(SRC_DIR) bench/bench_verify.c $(STATIC_LIB) -o $(BUILD_DIR)/bench_verify
	@echo "Run: $(BUILD_DIR)/bench_field && $(BUILD_DIR)/bench_verify"

# Print configuration
info:
	@echo "CC      = $(CC)"
	@echo "CFLAGS  = $(CFLAGS)"
	@echo "LDFLAGS = $(LDFLAGS)"
	@echo "ARCH    = $(UNAME_M)"
