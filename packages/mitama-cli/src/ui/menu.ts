import inquirer from 'inquirer';
import chalk from 'chalk';

export enum MainMenuAction {
  WALLET = 'wallet',
  REGISTER = 'register',
  STATUS = 'status',
  MY_AGENT = 'my_agent',
  SIGNAL = 'signal',
  SWARM = 'swarm',
  EXIT = 'exit',
}

export enum WalletAction {
  VIEW = 'view',
  AIRDROP = 'airdrop',
  BACK = 'back',
}

export enum SwarmAction {
  CREATE = 'create',
  VOTE = 'vote',
  VIEW = 'view',
  BACK = 'back',
}

export async function showMainMenu(hasWallet: boolean, hasAgent: boolean): Promise<MainMenuAction> {
  const choices = [
    {
      name: hasWallet
        ? chalk.green('◉') + ' Wallet ' + chalk.gray('(connected)')
        : chalk.yellow('○') + ' Setup Wallet',
      value: MainMenuAction.WALLET,
    },
    {
      name: hasAgent
        ? chalk.gray('◉ Register Agent (registered)')
        : chalk.white('○ Register Agent'),
      value: MainMenuAction.REGISTER,
      disabled: !hasWallet ? chalk.gray('setup wallet first') : false,
    },
    {
      name: '◎ View Registry',
      value: MainMenuAction.STATUS,
    },
    {
      name: '◉ My Agent',
      value: MainMenuAction.MY_AGENT,
      disabled: !hasAgent ? chalk.gray('register first') : false,
    },
    new inquirer.Separator(chalk.gray('  ─────────────────────────')),
    {
      name: '◈ Submit Signal',
      value: MainMenuAction.SIGNAL,
      disabled: !hasAgent ? chalk.gray('register first') : false,
    },
    {
      name: '◇ Swarm Actions',
      value: MainMenuAction.SWARM,
      disabled: !hasAgent ? chalk.gray('register first') : false,
    },
    new inquirer.Separator(chalk.gray('  ─────────────────────────')),
    {
      name: chalk.gray('Exit'),
      value: MainMenuAction.EXIT,
    },
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select action:',
      choices,
      pageSize: 12,
    },
  ]);

  return action;
}

export async function showWalletMenu(): Promise<WalletAction> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Wallet:',
      choices: [
        { name: 'View Balance', value: WalletAction.VIEW },
        { name: 'Request Airdrop ' + chalk.gray('(devnet)'), value: WalletAction.AIRDROP },
        { name: chalk.gray('← Back'), value: WalletAction.BACK },
      ],
    },
  ]);
  return action;
}

export async function showSwarmMenu(): Promise<SwarmAction> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Swarm Actions:',
      choices: [
        { name: 'Create Proposal', value: SwarmAction.CREATE },
        { name: 'Vote on Proposal', value: SwarmAction.VOTE },
        { name: 'View Active Proposals', value: SwarmAction.VIEW },
        { name: chalk.gray('← Back'), value: SwarmAction.BACK },
      ],
    },
  ]);
  return action;
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message,
      default: false,
    },
  ]);
  return confirm;
}

export async function inputText(message: string, defaultValue?: string): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);
  return value;
}

export async function selectOption<T>(message: string, choices: { name: string; value: T }[]): Promise<T> {
  const { value } = await inquirer.prompt([
    {
      type: 'list',
      name: 'value',
      message,
      choices,
    },
  ]);
  return value;
}

export function pressEnterToContinue(): Promise<void> {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: chalk.gray('Press Enter to continue...'),
    },
  ]).then(() => {});
}
