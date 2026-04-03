import chalk from 'chalk';
import type { OutputFormat } from './config.js';

let quiet = false;
let verbose = false;

export function setQuiet(value: boolean): void {
  quiet = value;
}

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

export function banner(): void {
  if (quiet) return;
  console.log(chalk.bold('Reality Fork CLI'));
}

export function info(message: string): void {
  if (quiet) return;
  console.log(message);
}

export function success(message: string): void {
  if (quiet) return;
  console.log(chalk.green(message));
}

export function warn(message: string): void {
  console.error(chalk.yellow(message));
}

export function error(message: string): void {
  console.error(chalk.red(message));
}

export function dim(message: string): void {
  if (quiet) return;
  console.log(chalk.gray(message));
}

export function debug(message: string): void {
  if (!verbose || quiet) return;
  console.error(chalk.gray(message));
}

export function print(data: unknown, format: OutputFormat): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      info('No results.');
      return;
    }
    console.table(data);
    return;
  }

  if (data && typeof data === 'object') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (typeof data === 'string') {
    info(data);
  }
}
