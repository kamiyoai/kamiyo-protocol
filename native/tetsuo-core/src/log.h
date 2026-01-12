/*
 * Logging with compile-time level control
 *
 * -DTETSUO_LOG_LEVEL=N (0=off, 1=error, ..., 5=trace)
 * Default: error in release, debug otherwise.
 */

#ifndef TETSUO_LOG_H
#define TETSUO_LOG_H

#include <stdint.h>
#include <stddef.h>

/* Log levels */
typedef enum {
    TETSUO_LOG_OFF = 0,
    TETSUO_LOG_ERROR = 1,
    TETSUO_LOG_WARN = 2,
    TETSUO_LOG_INFO = 3,
    TETSUO_LOG_DEBUG = 4,
    TETSUO_LOG_TRACE = 5,
} tetsuo_log_level_t;

/* Log callback type */
typedef void (*tetsuo_log_fn)(tetsuo_log_level_t level, const char *file,
                               int line, const char *fmt, ...);

/* Set custom log callback (NULL to reset to default stderr) */
void tetsuo_log_set_callback(tetsuo_log_fn fn);

/* Set runtime log level (capped by compile-time TETSUO_LOG_LEVEL) */
void tetsuo_log_set_level(tetsuo_log_level_t level);

/* Get current log level */
tetsuo_log_level_t tetsuo_log_get_level(void);

/* Internal logging function */
void tetsuo_log_write(tetsuo_log_level_t level, const char *file,
                      int line, const char *fmt, ...);

/* Default compile-time log level */
#ifndef TETSUO_LOG_LEVEL
#ifdef NDEBUG
#define TETSUO_LOG_LEVEL 1  /* ERROR only in release */
#else
#define TETSUO_LOG_LEVEL 4  /* DEBUG in debug builds */
#endif
#endif

/* Logging macros - compile to nothing if level is too low */
#if TETSUO_LOG_LEVEL >= 1
#define LOG_ERROR(fmt, ...) \
    tetsuo_log_write(TETSUO_LOG_ERROR, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_ERROR(fmt, ...) ((void)0)
#endif

#if TETSUO_LOG_LEVEL >= 2
#define LOG_WARN(fmt, ...) \
    tetsuo_log_write(TETSUO_LOG_WARN, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_WARN(fmt, ...) ((void)0)
#endif

#if TETSUO_LOG_LEVEL >= 3
#define LOG_INFO(fmt, ...) \
    tetsuo_log_write(TETSUO_LOG_INFO, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_INFO(fmt, ...) ((void)0)
#endif

#if TETSUO_LOG_LEVEL >= 4
#define LOG_DEBUG(fmt, ...) \
    tetsuo_log_write(TETSUO_LOG_DEBUG, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_DEBUG(fmt, ...) ((void)0)
#endif

#if TETSUO_LOG_LEVEL >= 5
#define LOG_TRACE(fmt, ...) \
    tetsuo_log_write(TETSUO_LOG_TRACE, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#else
#define LOG_TRACE(fmt, ...) ((void)0)
#endif

/* Hex dump helper for debugging */
#if TETSUO_LOG_LEVEL >= 4
void tetsuo_log_hex(tetsuo_log_level_t level, const char *label,
                    const uint8_t *data, size_t len);
#define LOG_HEX(label, data, len) \
    tetsuo_log_hex(TETSUO_LOG_DEBUG, label, data, len)
#else
#define LOG_HEX(label, data, len) ((void)0)
#endif

#endif /* TETSUO_LOG_H */
