/**
 * MCP Server Demo
 *
 * Demonstrates the Model Context Protocol integration:
 * - Tool listing
 * - Tool invocation
 * - ZK reputation tools
 */

import {
  createMCPHandler,
  KAMIYO_MCP_TOOLS,
  KAMIYO_MCP_SERVER,
  type MCPToolCallRequest,
} from '@kamiyo/daydreams';

import {
  printBanner,
  printSeparator,
  printSuccess,
  printError,
  printInfo,
  printData,
  vice,
  cristal,
  teen,
  mind,
} from './banner.js';

async function main() {
  printBanner();

  // Create MCP Handler
  printSeparator('MCP SERVER INITIALIZATION');

  const handler = createMCPHandler({
    network: 'devnet',
    qualityThreshold: 85,
    maxPrice: 0.01,
    autoDispute: true,
  });

  const serverInfo = handler.getServerInfo();
  printSuccess(`Server: ${serverInfo.name} v${serverInfo.version}`);
  printData('Tools Available', String(serverInfo.tools.length));

  // List all tools
  printSeparator('AVAILABLE MCP TOOLS');

  const tools = handler.listTools();

  // Group tools by category
  const paymentTools = tools.filter((t) => !t.name.includes('reputation') && !t.name.includes('proof') && !t.name.includes('commitment') && !t.name.includes('tier'));
  const reputationTools = tools.filter((t) => t.name.includes('reputation') || t.name.includes('proof') || t.name.includes('commitment') || t.name.includes('tier'));

  console.log(vice('  Payment Tools:'));
  for (const tool of paymentTools) {
    console.log(teen(`    ${tool.name}`));
    console.log(mind(`      ${tool.description.slice(0, 80)}...`));
  }
  console.log();

  console.log(vice('  ZK Reputation Tools:'));
  for (const tool of reputationTools) {
    console.log(teen(`    ${tool.name}`));
    console.log(mind(`      ${tool.description.slice(0, 80)}...`));
  }

  // Demonstrate tool invocation
  printSeparator('TOOL INVOCATION');

  // 1. Generate Commitment
  console.log(vice('  1. kamiyo_generate_commitment'));

  const commitmentRequest: MCPToolCallRequest = {
    name: 'kamiyo_generate_commitment',
    arguments: { score: 85 },
  };

  const commitmentResult = await handler.handleToolCall(commitmentRequest);
  if (!commitmentResult.isError && commitmentResult.content[0]?.text) {
    const parsed = JSON.parse(commitmentResult.content[0].text);
    printSuccess('Commitment generated');
    printData('Commitment', parsed.commitment?.slice(0, 24) + '...');
    printData('Tier', `${parsed.tierName} (${parsed.tier})`);
  } else {
    printError(commitmentResult.content[0]?.text || 'Unknown error');
  }
  console.log();

  // 2. Prove Reputation
  console.log(vice('  2. kamiyo_prove_reputation'));

  const proveRequest: MCPToolCallRequest = {
    name: 'kamiyo_prove_reputation',
    arguments: { tier: 2 },
  };

  const proveResult = await handler.handleToolCall(proveRequest);
  if (!proveResult.isError && proveResult.content[0]?.text) {
    const parsed = JSON.parse(proveResult.content[0].text);
    if (parsed.success) {
      printSuccess('Proof generated');
      printData('Threshold', String(parsed.threshold));
      printData('Tier', parsed.tierName);
    } else {
      printError(parsed.error || 'Proof generation failed');
    }
  }
  console.log();

  // 3. Get Reputation Tier
  console.log(vice('  3. kamiyo_get_reputation_tier'));

  const tierRequest: MCPToolCallRequest = {
    name: 'kamiyo_get_reputation_tier',
    arguments: {},
  };

  const tierResult = await handler.handleToolCall(tierRequest);
  if (!tierResult.isError && tierResult.content[0]?.text) {
    const parsed = JSON.parse(tierResult.content[0].text);
    printSuccess('Tier retrieved');
    printData('Current Tier', `${parsed.name} (${parsed.tier})`);
  }
  console.log();

  // 4. Check if can prove tier
  console.log(vice('  4. kamiyo_can_prove_tier'));

  for (const tier of [1, 2, 3, 4]) {
    const canProveRequest: MCPToolCallRequest = {
      name: 'kamiyo_can_prove_tier',
      arguments: { tier },
    };

    const canProveResult = await handler.handleToolCall(canProveRequest);
    if (!canProveResult.isError && canProveResult.content[0]?.text) {
      const parsed = JSON.parse(canProveResult.content[0].text);
      const tierNames = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'];
      const indicator = parsed.canProve ? cristal('YES') : teen('NO');
      console.log(`    Can prove ${tierNames[tier]}: ${indicator}`);
    }
  }
  console.log();

  // 5. Simulated payment tools
  console.log(vice('  5. kamiyo_check_balance'));

  const balanceRequest: MCPToolCallRequest = {
    name: 'kamiyo_check_balance',
    arguments: {},
  };

  const balanceResult = await handler.handleToolCall(balanceRequest);
  if (!balanceResult.isError && balanceResult.content[0]?.text) {
    const parsed = JSON.parse(balanceResult.content[0].text);
    printSuccess('Balance checked (simulated)');
    printData('Balance', `${parsed.balance} SOL`);
    printData('Pending', `${parsed.pending} SOL`);
    printData('Available', `${parsed.available} SOL`);
  }
  console.log();

  // 6. Quality stats
  console.log(vice('  6. kamiyo_get_quality_stats'));

  const statsRequest: MCPToolCallRequest = {
    name: 'kamiyo_get_quality_stats',
    arguments: {},
  };

  const statsResult = await handler.handleToolCall(statsRequest);
  if (!statsResult.isError && statsResult.content[0]?.text) {
    const parsed = JSON.parse(statsResult.content[0].text);
    printSuccess('Quality stats retrieved');
    printData('Total Calls', String(parsed.totalCalls));
    printData('Avg Quality', `${parsed.avgQuality}%`);
  }

  // Tool Schema Details
  printSeparator('TOOL SCHEMA EXAMPLE');

  const exampleTool = tools.find((t) => t.name === 'kamiyo_prove_reputation');
  if (exampleTool) {
    console.log(vice(`  ${exampleTool.name}`));
    console.log();
    console.log(teen('  Description:'));
    console.log(mind(`    ${exampleTool.description}`));
    console.log();
    console.log(teen('  Input Schema:'));
    console.log(cristal(JSON.stringify(exampleTool.inputSchema, null, 4).split('\n').map(l => '    ' + l).join('\n')));
  }

  // MCP Integration Usage
  printSeparator('INTEGRATION USAGE');

  console.log(vice('  Daydreams Integration:'));
  console.log(teen(`
    import { createMcpExtension } from '@daydreamsai/mcp';
    import { createKamiyoMCPConfig } from '@kamiyo/daydreams';

    const mcpExtension = createMcpExtension([
      createKamiyoMCPConfig({ network: 'devnet' }),
    ]);

    const agent = createDreams({
      extensions: [mcpExtension],
    });
  `));

  console.log(vice('  Standalone Server:'));
  console.log(teen(`
    npx @kamiyo/daydreams mcp-server --network devnet
  `));

  // Footer
  console.log();
  console.log(teen('='.repeat(110)));
  console.log();
  console.log(vice('  MCP enables any AI agent to use Kamiyo payment + reputation tools'));
  console.log(cristal('  https://modelcontextprotocol.io'));
  console.log();
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
