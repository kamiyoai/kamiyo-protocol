import chalk from 'chalk';

export function printJson(label: string, value: unknown): void {
  console.log(chalk.bold.cyan(label));
  console.log(JSON.stringify(value, null, 2));
}

export function printError(message: string): void {
  console.error(chalk.bold.red('error: ') + message);
}

export function printOk(message: string): void {
  console.log(chalk.bold.green('ok: ') + message);
}
