type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  component: string;
  msg: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  const { level, component, msg, ...extra } = entry;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${component}]`;
  const suffix = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  const line = `${prefix} ${msg}${suffix}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(component: string) {
  return {
    debug: (msg: string, extra?: Record<string, unknown>) =>
      emit({ level: 'debug', component, msg, ...extra }),
    info: (msg: string, extra?: Record<string, unknown>) =>
      emit({ level: 'info', component, msg, ...extra }),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      emit({ level: 'warn', component, msg, ...extra }),
    error: (msg: string, extra?: Record<string, unknown>) =>
      emit({ level: 'error', component, msg, ...extra }),
  };
}
