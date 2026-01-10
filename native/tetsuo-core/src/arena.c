/*
 * tetsuo-core: Arena allocator implementation
 *
 * Features:
 * - Cache-line aligned allocations
 * - Lock-free reference counting
 * - Checkpoint/restore for temporary allocations
 * - Thread-local scratch arenas
 */

#include "arena.h"
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/mman.h>
#include <unistd.h>
#include <pthread.h>
#endif

#define ALIGN_UP(x, align) (((x) + (align) - 1) & ~((align) - 1))

/*
 * Platform-specific large allocation
 * Uses mmap/VirtualAlloc for better memory characteristics
 */
static void *alloc_block(size_t size) {
#ifdef _WIN32
    return VirtualAlloc(NULL, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
#else
    void *ptr = mmap(NULL, size, PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (ptr == MAP_FAILED) return NULL;

    /* Advise kernel about usage pattern */
    madvise(ptr, size, MADV_WILLNEED);

    return ptr;
#endif
}

static void free_block(void *ptr, size_t size) {
#ifdef _WIN32
    VirtualFree(ptr, 0, MEM_RELEASE);
#else
    munmap(ptr, size);
#endif
}

static arena_block_t *create_block(size_t data_size) {
    size_t total = sizeof(arena_block_t) + data_size;
    total = ALIGN_UP(total, 4096);  /* Page-align */

    arena_block_t *block = (arena_block_t *)alloc_block(total);
    if (!block) return NULL;

    block->next = NULL;
    block->size = total - sizeof(arena_block_t);
    block->used = 0;

    return block;
}

arena_t *arena_create(size_t block_size) {
    if (block_size == 0) {
        block_size = ARENA_DEFAULT_SIZE;
    }

    arena_block_t *block = create_block(block_size);
    if (!block) return NULL;

    arena_t *arena = (arena_t *)malloc(sizeof(arena_t));
    if (!arena) {
        free_block(block, block->size + sizeof(arena_block_t));
        return NULL;
    }

    arena->current = block;
    arena->head = block;
    arena->block_size = block_size;
    arena->total_allocated = block_size;
    arena->peak_usage = 0;
    atomic_init(&arena->ref_count, 1);

    return arena;
}

void arena_destroy(arena_t *arena) {
    if (!arena) return;

    arena_block_t *block = arena->head;
    while (block) {
        arena_block_t *next = block->next;
        free_block(block, block->size + sizeof(arena_block_t));
        block = next;
    }

    free(arena);
}

void arena_reset(arena_t *arena) {
    /* Reset all blocks to unused */
    arena_block_t *block = arena->head;
    while (block) {
        block->used = 0;
        block = block->next;
    }
    arena->current = arena->head;
}

/*
 * Fast-path allocation with branch prediction hints
 */
void *arena_alloc(arena_t *arena, size_t size) {
    return arena_alloc_aligned(arena, size, 8);
}

void *arena_alloc_aligned(arena_t *arena, size_t size, size_t alignment) {
    arena_block_t *block = arena->current;

    /* Align current position */
    size_t aligned_pos = ALIGN_UP(block->used, alignment);
    size_t required = aligned_pos + size;

    /* Fast path: allocation fits in current block */
    if (__builtin_expect(required <= block->size, 1)) {
        void *ptr = block->data + aligned_pos;
        block->used = required;

        /* Update peak usage */
        size_t total_used = arena_used(arena);
        if (total_used > arena->peak_usage) {
            arena->peak_usage = total_used;
        }

        return ptr;
    }

    /* Slow path: need new block */
    size_t new_size = arena->block_size;
    if (size > new_size) {
        new_size = ALIGN_UP(size + CACHE_LINE_SIZE, 4096);
    }

    /* Check if next block exists and has space */
    if (block->next && (block->next->size >= size)) {
        arena->current = block->next;
        block->next->used = 0;
        return arena_alloc_aligned(arena, size, alignment);
    }

    /* Allocate new block */
    arena_block_t *new_block = create_block(new_size);
    if (!new_block) return NULL;

    new_block->next = block->next;
    block->next = new_block;
    arena->current = new_block;
    arena->total_allocated += new_size;

    return arena_alloc_aligned(arena, size, alignment);
}

void *arena_calloc(arena_t *arena, size_t count, size_t size) {
    /* Check for multiplication overflow */
    if (count != 0 && size > SIZE_MAX / count) {
        return NULL;
    }
    size_t total = count * size;
    void *ptr = arena_alloc(arena, total);
    if (ptr) {
        memset(ptr, 0, total);
    }
    return ptr;
}

arena_checkpoint_t arena_checkpoint(arena_t *arena) {
    return (arena_checkpoint_t){
        .block = arena->current,
        .position = arena->current->used
    };
}

void arena_restore(arena_t *arena, arena_checkpoint_t checkpoint) {
    /* Reset all blocks after checkpoint */
    arena_block_t *block = checkpoint.block->next;
    while (block) {
        block->used = 0;
        block = block->next;
    }

    arena->current = checkpoint.block;
    arena->current->used = checkpoint.position;
}

void arena_ref(arena_t *arena) {
    atomic_fetch_add(&arena->ref_count, 1);
}

void arena_unref(arena_t *arena) {
    if (atomic_fetch_sub(&arena->ref_count, 1) == 1) {
        arena_destroy(arena);
    }
}

size_t arena_used(const arena_t *arena) {
    size_t total = 0;
    arena_block_t *block = arena->head;

    while (block) {
        total += block->used;
        if (block == arena->current) break;
        block = block->next;
    }

    return total;
}

size_t arena_peak(const arena_t *arena) {
    return arena->peak_usage;
}

/*
 * Thread-local scratch arena
 * Provides fast temporary allocations without contention
 */
#ifdef _WIN32
static __declspec(thread) arena_t *tls_scratch = NULL;
#else
static __thread arena_t *tls_scratch = NULL;
#endif

arena_t *scratch_arena_get(void) {
    if (!tls_scratch) {
        tls_scratch = arena_create(256 * 1024);  /* 256 KB per thread */
    }
    return tls_scratch;
}

void scratch_arena_reset(void) {
    if (tls_scratch) {
        arena_reset(tls_scratch);
    }
}

void scratch_arena_destroy(void) {
    if (tls_scratch) {
        arena_destroy(tls_scratch);
        tls_scratch = NULL;
    }
}
