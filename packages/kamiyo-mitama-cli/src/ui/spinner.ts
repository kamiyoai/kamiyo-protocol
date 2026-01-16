import ora, { Ora } from 'ora';
import chalk from 'chalk';

let currentSpinner: Ora | null = null;

export function startSpinner(text: string): Ora {
  if (currentSpinner) {
    currentSpinner.stop();
  }
  currentSpinner = ora({
    text: chalk.gray(text),
    color: 'cyan',
    spinner: 'dots',
  }).start();
  return currentSpinner;
}

export function succeedSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(chalk.green(text));
    currentSpinner = null;
  }
}

export function failSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.fail(chalk.red(text));
    currentSpinner = null;
  }
}

export function stopSpinner(): void {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = chalk.gray(text);
  }
}
