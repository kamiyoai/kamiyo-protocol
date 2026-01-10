/*
 * tetsuo-core: Logging implementation
 */

#include "log.h"
#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include <string.h>
#include <unistd.h>

static tetsuo_log_fn g_log_callback = NULL;
static tetsuo_log_level_t g_log_level = TETSUO_LOG_LEVEL;

static const char *level_names[] = {
    "OFF", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"
};

static const char *level_colors[] = {
    "",        /* OFF */
    "\x1b[31m", /* ERROR - red */
    "\x1b[33m", /* WARN - yellow */
    "\x1b[32m", /* INFO - green */
    "\x1b[36m", /* DEBUG - cyan */
    "\x1b[90m", /* TRACE - gray */
};

void tetsuo_log_set_callback(tetsuo_log_fn fn) {
    g_log_callback = fn;
}

void tetsuo_log_set_level(tetsuo_log_level_t level) {
    /* Cap at compile-time level */
    if (level > TETSUO_LOG_LEVEL) {
        level = TETSUO_LOG_LEVEL;
    }
    g_log_level = level;
}

tetsuo_log_level_t tetsuo_log_get_level(void) {
    return g_log_level;
}

void tetsuo_log_write(tetsuo_log_level_t level, const char *file,
                      int line, const char *fmt, ...) {
    if (level > g_log_level) return;
    if (level > TETSUO_LOG_LEVEL) return;

    va_list args;
    va_start(args, fmt);

    if (g_log_callback) {
        /* Custom callback handles formatting */
        char buf[1024];
        vsnprintf(buf, sizeof(buf), fmt, args);
        g_log_callback(level, file, line, "%s", buf);
    } else {
        /* Default: write to stderr */
        time_t now = time(NULL);
        struct tm *tm = localtime(&now);

        /* Extract filename from path */
        const char *filename = strrchr(file, '/');
        filename = filename ? filename + 1 : file;

        /* Check if stderr is a tty for colors */
        int use_color = isatty(fileno(stderr));

        if (use_color) {
            fprintf(stderr, "%s%02d:%02d:%02d %5s\x1b[0m %s:%d: ",
                    level_colors[level],
                    tm->tm_hour, tm->tm_min, tm->tm_sec,
                    level_names[level], filename, line);
        } else {
            fprintf(stderr, "%02d:%02d:%02d %5s %s:%d: ",
                    tm->tm_hour, tm->tm_min, tm->tm_sec,
                    level_names[level], filename, line);
        }

        vfprintf(stderr, fmt, args);
        fprintf(stderr, "\n");
        fflush(stderr);
    }

    va_end(args);
}

#if TETSUO_LOG_LEVEL >= 4
void tetsuo_log_hex(tetsuo_log_level_t level, const char *label,
                    const uint8_t *data, size_t len) {
    if (level > g_log_level) return;

    char hex[256];
    size_t hex_len = 0;

    for (size_t i = 0; i < len && hex_len < sizeof(hex) - 3; i++) {
        hex_len += snprintf(hex + hex_len, sizeof(hex) - hex_len, "%02x", data[i]);
        if (i < len - 1 && hex_len < sizeof(hex) - 1) {
            hex[hex_len++] = ' ';
        }
    }

    if (len > 0 && hex_len < sizeof(hex)) {
        hex[hex_len] = '\0';
    }

    tetsuo_log_write(level, __FILE__, __LINE__, "%s (%zu bytes): %s%s",
                     label, len, hex, len * 3 > sizeof(hex) ? "..." : "");
}
#endif
