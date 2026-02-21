#!/usr/bin/env node

/**
 * Meishi MCP Server
 *
 * Model Context Protocol server for Meishi Agent Compliance Passports.
 * Provides tools for verifying, inspecting, and managing agent credentials.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

import { MEISHI_TOOL_DEFINITIONS, createToolContext, handleTool } from './tools.js';

dotenv.config();

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'internal error';
}

class MeishiMCPServer {
  private server: Server;
  private ctx: ReturnType<typeof createToolContext>;

  constructor() {
    this.server = new Server(
      { name: 'meishi-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    let keypair = Keypair.generate();
    const secretKey = process.env.SOLANA_PRIVATE_KEY;
    if (secretKey) {
      try {
        keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
      } catch {
        console.error('Warning: Invalid SOLANA_PRIVATE_KEY, using ephemeral keypair');
      }
    }

    this.ctx = createToolContext({
      connection,
      keypair,
      programId: process.env.MEISHI_PROGRAM_ID,
    });

    this.setupHandlers();

    this.server.onerror = (error) => {
      console.error('[Meishi MCP Error]', safeErrorMessage(error));
    };

    const shutdown = async (signal: string) => {
      console.error(`[Meishi MCP] shutting down (${signal})`);
      await this.server.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: MEISHI_TOOL_DEFINITIONS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await handleTool(name, (args ?? {}) as Record<string, unknown>, this.ctx);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: safeErrorMessage(error),
              }),
            },
          ],
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Meishi MCP server running on stdio');
  }
}

const server = new MeishiMCPServer();
server.run().catch((error) => {
  console.error('Failed to start Meishi MCP server:', safeErrorMessage(error));
  process.exit(1);
});
