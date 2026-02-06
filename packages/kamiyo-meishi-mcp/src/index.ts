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

    let keypair: Keypair;
    const secretKey = process.env.SOLANA_PRIVATE_KEY;
    if (secretKey) {
      keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
    } else {
      keypair = Keypair.generate();
    }

    this.ctx = createToolContext({
      connection,
      keypair,
      programId: process.env.MEISHI_PROGRAM_ID,
    });

    this.setupHandlers();
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
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error.message,
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
server.run().catch(console.error);
