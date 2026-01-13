/*
 * Logging with compile-time level control
 *
 * -DDARK_FOREST_LOG_LEVEL=N (0=off, 1=error, ..., 5=trace)
 * Default: error in release, debug otherwise.
 */

#ifndef DARK_FOREST_LOG_H
#define DARK_FOREST_LOG_H

#include <stdint.h>
#include <stddef.h>

/* Log levels */
typedef enum {
    DARK_FOREST_LOG_OFF = 0,
    DARK_FOREST_LOG_ERROR = 1,
    DARK_FOREST_LOG_WARN = 2,
    DARK_FOREST_LOG_INFO = 3,
    DARK_FOREST_LOG_DEBUG = 4,
    DARK_FOREST_LOG_TRACE = 5,
} dark_forest_log_level_t;

/* Log callback type */
typedef void (*dark_forest_log_fn)(dark_forest_log_level_t level, const char *file,
                               int line, const char *fmt, ...);

/* Set custom log callback (NULL to reset to default stderr) */
void dark_forest_log_set_callback(dark_forest_log_fn fn);

/* Set runtime log level (capped by compile-time DARK_FOREST_LOG_LEVEL) */
void dark_forest_log_set_level(dark_forest_log_level_t level);

/* Get current log level */
dark_forest_log_level_t dark_forest_log_get_level(void);

/* Internal logging function */
void dark_forest_log_write(dark_forest_log_level_t level, const char *file,
                      int line, const char *fmt, ...);

/* Default compile-time log level */
#ifndef DARK_FOREST_LOG_LEVEL
#ifdef NDEBUG
#define DARK_FOREST_LOG_LEVEL 1  /* ERROR only in release */
#else
#define DARK_FOREST_LOG_LEVEL 4  /* DEBUG in debug builds */
#endif
#endif

/* Logging macros - compile to nothing if level is too low */
#if DARK_FOREST_LOG_LEVEL >= 1
#define LOG_ERROR(fmt, ...) \
    dark_forest_log_write(DARK_FOREST_LOG_ERROR, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_ERROR(fmt, ...) ((void)0)
#endif

#if DARK_FOREST_LOG_LEVEL >= 2
#define LOG_WARN(fmt, ...) \
    dark_forest_log_write(DARK_FOREST_LOG_WARN, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_WARN(fmt, ...) ((void)0)
#endif

#if DARK_FOREST_LOG_LEVEL >= 3
#define LOG_INFO(fmt, ...) \
    dark_forest_log_write(DARK_FOREST_LOG_INFO, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_INFO(fmt, ...) ((void)0)
#endif

#if DARK_FOREST_LOG_LEVEL >= 4
#define LOG_DEBUG(fmt, ...) \
    dark_forest_log_write(DARK_FOREST_LOG_DEBUG, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_DEBUG(fmt, ...) ((void)0)
#endif

#if DARK_FOREST_LOG_LEVEL >= 5
#define LOG_TRACE(fmt, ...) \
    dark_forest_log_write(DARK_FOREST_LOG_TRACE, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_TRACE(fmt, ...) ((void)0)
#endif

/* Hex dump helper for debugging */
#if DARK_FOREST_LOG_LEVEL >= 4
void dark_forest_log_hex(dark_forest_log_level_t level, const char *label,
                    const uint8_t *data, size_t len);
#define LOG_HEX(label, data, len) \
    dark_forest_log_hex(DARK_FOREST_LOG_DEBUG, label, data, len)
#else
#define LOG_HEX(label, data, len) ((void)0)
#endif

#endif /* DARK_FOREST_LOG_H */
