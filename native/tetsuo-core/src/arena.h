/*
 * tetsuo-core: Lock-free arena allocator
 *
 * Zero-fragmentation memory management for proof verification
 * Cache-line aligned allocations for optimal performance
 */

#ifndef TETSUO_ARENA_H
#define TETSUO_ARENA_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <stdatomic.h>

#define CACHE_LINE_SIZE 64
#define ARENA_DEFAULT_SIZE (1024 * 1024)  /* 1 MB */

typedef struct arena_block {
    struct arena_block *next;
    size_t size;
    size_t used;
    _Alignas(CACHE_LINE_SIZE) uint8_t data[];
} arena_block_t;

typedef struct {
    arena_block_t *current;
    arena_block_t *head;
    size_t block_size;
    size_t total_allocated;
    size_t peak_usage;
    _Atomic(uint32_t) ref_count;
} arena_t;

/* Arena lifecycle */
arena_t *arena_create(size_t block_size);
void arena_destroy(arena_t *arena);
void arena_reset(arena_t *arena);

/* Allocation */
void *arena_alloc(arena_t *arena, size_t size);
void *arena_alloc_aligned(arena_t *arena, size_t size, size_t alignment);
void *arena_calloc(arena_t *arena, size_t count, size_t size);

/* Temporary allocations with checkpoint/restore */
typedef struct {
    arena_block_t *block;
    size_t position;
} arena_checkpoint_t;

arena_checkpoint_t arena_checkpoint(arena_t *arena);
void arena_restore(arena_t *arena, arena_checkpoint_t checkpoint);

/* Reference counting for shared arenas */
void arena_ref(arena_t *arena);
void arena_unref(arena_t *arena);

/* Stats */
size_t arena_used(const arena_t *arena);
size_t arena_peak(const arena_t *arena);

/*
 * Scratch arena: thread-local temporary allocator
 * Auto-resets after each verification batch
 * Call scratch_arena_destroy() before thread exit to prevent leaks
 */
arena_t *scratch_arena_get(void);
void scratch_arena_reset(void);
void scratch_arena_destroy(void);

#endif /* TETSUO_ARENA_H */
