/**
 * Builder Tools
 */

import type { ToolConfig } from '@kamiyo/agents';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface BuilderToolsConfig {
  workDir: string;
  solanaRpcUrl?: string;
  maxFileSizeBytes?: number;
}

const MAX_FILE_SIZE = 1024 * 1024; // 1MB default
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//, /sudo\s/, /chmod\s+777/, />\s*\/dev\//, /mkfs/,
  /curl.*\|.*sh/, /wget.*\|.*sh/, /eval\s*\(/, /\$\(.*\).*\|.*sh/,
];

function isPathSafe(filePath: string, workDir: string): boolean {
  const normalized = path.normalize(filePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return false;
  const resolved = path.resolve(workDir, normalized);
  return resolved.startsWith(path.resolve(workDir));
}

function isCommandSafe(command: string): boolean {
  return !BLOCKED_PATTERNS.some(pattern => pattern.test(command));
}

export function createBuilderTools(config: BuilderToolsConfig): ToolConfig[] {
  const { workDir, solanaRpcUrl = 'https://api.mainnet-beta.solana.com', maxFileSizeBytes = MAX_FILE_SIZE } = config;

  return [
    {
      name: 'builder_write_file',
      description: 'Write content to a file in the workspace. Use for generating code, configs, or documentation.',
      parameters: {
        filePath: { type: 'string', description: 'Relative path from workspace root', required: true },
        content: { type: 'string', description: 'File content to write', required: true },
      },
      handler: async (params) => {
        try {
          const filePath = params.filePath as string;
          const content = params.content as string;

          if (!isPathSafe(filePath, workDir)) {
            return { success: false, error: 'Invalid path: must be relative to workspace' };
          }

          if (content.length > maxFileSizeBytes) {
            return { success: false, error: `File too large: ${content.length} > ${maxFileSizeBytes} bytes` };
          }

          const normalizedPath = path.normalize(filePath);
          const fullPath = path.join(workDir, normalizedPath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, 'utf-8');

          return { success: true, data: { path: normalizedPath, bytes: content.length } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to write file' };
        }
      },
    },

    {
      name: 'builder_read_file',
      description: 'Read a file from the workspace to understand existing code or configs.',
      parameters: {
        filePath: { type: 'string', description: 'Relative path from workspace root', required: true },
      },
      handler: async (params) => {
        try {
          const filePath = params.filePath as string;

          if (!isPathSafe(filePath, workDir)) {
            return { success: false, error: 'Invalid path: must be relative to workspace' };
          }

          const normalizedPath = path.normalize(filePath);
          const fullPath = path.join(workDir, normalizedPath);
          const stat = await fs.stat(fullPath);

          if (stat.size > maxFileSizeBytes) {
            return { success: false, error: `File too large: ${stat.size} > ${maxFileSizeBytes} bytes` };
          }

          const content = await fs.readFile(fullPath, 'utf-8');

          return { success: true, data: { path: normalizedPath, content, bytes: content.length } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to read file' };
        }
      },
    },

    {
      name: 'builder_list_files',
      description: 'List files in a directory to understand project structure.',
      parameters: {
        directory: { type: 'string', description: 'Relative directory path (default: root)', required: false },
        recursive: { type: 'boolean', description: 'List recursively', required: false },
      },
      handler: async (params) => {
        try {
          const directory = (params.directory as string) || '.';
          const recursive = params.recursive as boolean;

          const normalizedPath = path.normalize(directory);
          if (normalizedPath.startsWith('..')) {
            return { success: false, error: 'Invalid path: must be relative to workspace' };
          }

          const fullPath = path.join(workDir, normalizedPath);

          async function listDir(dir: string, prefix = ''): Promise<string[]> {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const files: string[] = [];

            for (const entry of entries) {
              const relativePath = path.join(prefix, entry.name);
              if (entry.isDirectory()) {
                if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                  files.push(...await listDir(path.join(dir, entry.name), relativePath));
                } else {
                  files.push(relativePath + '/');
                }
              } else {
                files.push(relativePath);
              }
            }
            return files;
          }

          const files = await listDir(fullPath);
          return { success: true, data: { directory: normalizedPath, files, count: files.length } };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to list files' };
        }
      },
    },

    {
      name: 'builder_run_command',
      description: 'Run a shell command in the workspace (npm, pnpm, anchor, cargo, etc.)',
      parameters: {
        command: { type: 'string', description: 'Command to run', required: true },
        timeout: { type: 'number', description: 'Timeout in seconds (default 60)', required: false },
      },
      handler: async (params) => {
        try {
          const command = params.command as string;
          const timeout = Math.min(((params.timeout as number) || 60) * 1000, 600000);

          if (!isCommandSafe(command)) {
            return { success: false, error: 'Command blocked for security' };
          }

          const { stdout, stderr } = await execAsync(command, {
            cwd: workDir,
            timeout,
            env: { ...process.env, SOLANA_RPC_URL: solanaRpcUrl },
            maxBuffer: 10 * 1024 * 1024,
          });

          return {
            success: true,
            data: {
              stdout: stdout.slice(0, 10000),
              stderr: stderr.slice(0, 5000),
              truncated: stdout.length > 10000 || stderr.length > 5000,
            },
          };
        } catch (error) {
          const execError = error as { stdout?: string; stderr?: string; message?: string };
          return {
            success: false,
            error: execError.message || 'Command failed',
            data: {
              stdout: execError.stdout?.slice(0, 5000),
              stderr: execError.stderr?.slice(0, 5000),
            },
          };
        }
      },
    },

    {
      name: 'builder_create_anchor_project',
      description: 'Initialize a new Anchor project for Solana development',
      parameters: {
        name: { type: 'string', description: 'Project name (lowercase, no spaces)', required: true },
      },
      handler: async (params) => {
        try {
          const name = params.name as string;

          if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
            return { success: false, error: 'Invalid name: use lowercase letters, numbers, hyphens, underscores' };
          }

          const projectDir = path.join(workDir, name);
          await fs.mkdir(projectDir, { recursive: true });

          // Create basic Anchor structure
          await fs.mkdir(path.join(projectDir, 'programs', name, 'src'), { recursive: true });
          await fs.mkdir(path.join(projectDir, 'tests'), { recursive: true });
          await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });

          // Anchor.toml
          const anchorToml = `[features]
seeds = false
skip-lint = false

[programs.devnet]
${name.replace(/-/g, '_')} = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
`;
          await fs.writeFile(path.join(projectDir, 'Anchor.toml'), anchorToml);

          // Cargo.toml for workspace
          const cargoToml = `[workspace]
members = [
    "programs/*"
]

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
`;
          await fs.writeFile(path.join(projectDir, 'Cargo.toml'), cargoToml);

          // Program Cargo.toml
          const programCargoToml = `[package]
name = "${name.replace(/-/g, '_')}"
version = "0.1.0"
description = "Created by KAMIYO Agent Factory"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name.replace(/-/g, '_')}"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.31.1"
`;
          await fs.writeFile(path.join(projectDir, 'programs', name, 'Cargo.toml'), programCargoToml);

          // Basic lib.rs
          const libRs = `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod ${name.replace(/-/g, '_')} {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`;
          await fs.writeFile(path.join(projectDir, 'programs', name, 'src', 'lib.rs'), libRs);

          return {
            success: true,
            data: {
              projectDir: name,
              files: [
                'Anchor.toml',
                'Cargo.toml',
                `programs/${name}/Cargo.toml`,
                `programs/${name}/src/lib.rs`,
              ],
            },
          };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to create project' };
        }
      },
    },

    {
      name: 'builder_generate_typescript_sdk',
      description: 'Generate TypeScript SDK client for an Anchor program',
      parameters: {
        programName: { type: 'string', description: 'Name of the Anchor program', required: true },
        idlPath: { type: 'string', description: 'Path to IDL JSON file', required: true },
        outputPath: { type: 'string', description: 'Output directory for SDK', required: true },
      },
      handler: async (params) => {
        try {
          const programName = params.programName as string;
          const idlPath = params.idlPath as string;
          const outputPath = params.outputPath as string;

          // Read IDL
          const idlContent = await fs.readFile(path.join(workDir, idlPath), 'utf-8');
          const idl = JSON.parse(idlContent);

          // Generate client
          const clientCode = `/**
 * ${programName} TypeScript SDK
 * Generated by KAMIYO Agent Factory
 */

import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

// IDL embedded for convenience
export const IDL: Idl = ${JSON.stringify(idl, null, 2)};

export const PROGRAM_ID = new PublicKey('${idl.address || idl.metadata?.address || '11111111111111111111111111111111'}');

export class ${programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')}Client {
  program: Program;
  provider: AnchorProvider;

  constructor(connection: Connection, wallet: Keypair) {
    this.provider = new AnchorProvider(
      connection,
      { publicKey: wallet.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
      { commitment: 'confirmed' }
    );
    this.program = new Program(IDL, this.provider);
  }

  // Generated methods would go here based on IDL instructions
}

export default ${programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')}Client;
`;

          const fullOutputPath = path.join(workDir, outputPath);
          await fs.mkdir(fullOutputPath, { recursive: true });
          await fs.writeFile(path.join(fullOutputPath, 'index.ts'), clientCode);

          return {
            success: true,
            data: {
              outputPath,
              files: ['index.ts'],
              programId: idl.address || idl.metadata?.address,
            },
          };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to generate SDK' };
        }
      },
    },

    {
      name: 'builder_verify_build',
      description: 'Verify that the project builds correctly (TypeScript, Rust, etc.)',
      parameters: {
        projectType: { type: 'string', description: 'Project type: typescript, anchor, cargo', required: true, enum: ['typescript', 'anchor', 'cargo'] },
        directory: { type: 'string', description: 'Project directory', required: false },
      },
      handler: async (params) => {
        try {
          const projectType = params.projectType as string;
          const directory = (params.directory as string) || '.';
          const projectDir = path.join(workDir, directory);

          let command: string;
          switch (projectType) {
            case 'typescript':
              command = 'npx tsc --noEmit';
              break;
            case 'anchor':
              command = 'anchor build';
              break;
            case 'cargo':
              command = 'cargo check';
              break;
            default:
              return { success: false, error: 'Unknown project type' };
          }

          const { stdout, stderr } = await execAsync(command, {
            cwd: projectDir,
            timeout: 300000, // 5 min for builds
          });

          return {
            success: true,
            data: {
              projectType,
              buildOutput: stdout.slice(0, 5000),
              warnings: stderr.slice(0, 2000),
            },
          };
        } catch (error) {
          const execError = error as { stderr?: string; message?: string };
          return {
            success: false,
            error: 'Build failed',
            data: { buildErrors: execError.stderr?.slice(0, 5000) || execError.message },
          };
        }
      },
    },

    {
      name: 'builder_deploy_program',
      description: 'Deploy an Anchor program to Solana (devnet or mainnet)',
      parameters: {
        projectDir: { type: 'string', description: 'Anchor project directory', required: true },
        cluster: { type: 'string', description: 'Cluster: devnet or mainnet', required: true, enum: ['devnet', 'mainnet'] },
        keypairPath: { type: 'string', description: 'Path to deployer keypair', required: true },
      },
      handler: async (params) => {
        try {
          const projectDir = params.projectDir as string;
          const cluster = params.cluster as string;
          const keypairPath = params.keypairPath as string;

          const fullProjectDir = path.join(workDir, projectDir);

          // Update Anchor.toml with correct cluster
          const anchorTomlPath = path.join(fullProjectDir, 'Anchor.toml');
          let anchorToml = await fs.readFile(anchorTomlPath, 'utf-8');
          anchorToml = anchorToml.replace(/cluster = ".*"/, `cluster = "${cluster}"`);
          anchorToml = anchorToml.replace(/wallet = ".*"/, `wallet = "${keypairPath}"`);
          await fs.writeFile(anchorTomlPath, anchorToml);

          // Deploy
          const rpcUrl = cluster === 'mainnet'
            ? 'https://api.mainnet-beta.solana.com'
            : 'https://api.devnet.solana.com';

          const { stdout, stderr } = await execAsync(
            `anchor deploy --provider.cluster ${rpcUrl}`,
            { cwd: fullProjectDir, timeout: 600000 }
          );

          // Extract program ID from output
          const programIdMatch = stdout.match(/Program Id: ([A-Za-z0-9]+)/);
          const programId = programIdMatch ? programIdMatch[1] : null;

          return {
            success: true,
            data: {
              cluster,
              programId,
              deployOutput: stdout.slice(0, 5000),
              warnings: stderr.slice(0, 2000),
            },
          };
        } catch (error) {
          const execError = error as { stderr?: string; message?: string };
          return {
            success: false,
            error: 'Deployment failed',
            data: { deployErrors: execError.stderr?.slice(0, 5000) || execError.message },
          };
        }
      },
    },
  ];
}

export const BUILDER_TOOL_NAMES = [
  'builder_write_file',
  'builder_read_file',
  'builder_list_files',
  'builder_run_command',
  'builder_create_anchor_project',
  'builder_generate_typescript_sdk',
  'builder_verify_build',
  'builder_deploy_program',
] as const;
