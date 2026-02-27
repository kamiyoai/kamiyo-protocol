#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(scriptDir, '..');
const indexPath = path.join(mcpRoot, 'src', 'index.ts');

const source = fs.readFileSync(indexPath, 'utf8');

const toolStart = source.indexOf('const TOOL_DEFINITIONS');
const toolEnd = source.indexOf('const CLAW_PROVIDERS');
if (toolStart === -1 || toolEnd === -1 || toolEnd <= toolStart) {
  console.error('Could not locate TOOL_DEFINITIONS block in packages/kamiyo-mcp/src/index.ts');
  process.exit(1);
}

const toolBlock = source.slice(toolStart, toolEnd);
const listedTools = [...toolBlock.matchAll(/\bname:\s*'([^']+)'/g)].map((match) => match[1]);
const spreadArrays = [...toolBlock.matchAll(/\.\.\.tools\.([A-Z_]+)/g)].map((match) => match[1]);

const spreadSourceByArray = {
  PARANET_TOOLS: 'paranet.ts',
  DKG_QUALITY_TOOLS: 'dkg-quality.ts',
  ELFA_TOOL_DEFINITIONS: 'elfa.ts',
  FUNDRY_TOOL_DEFINITIONS: 'fundry.ts',
  KAMINO_TOOL_DEFINITIONS: 'kamino.ts',
  CDP_TOOL_DEFINITIONS: 'cdp.ts',
  MARKET_TOOL_DEFINITIONS: 'market.ts',
  SEARCH_TOOL_DEFINITIONS: 'search.ts',
};

for (const arrayName of spreadArrays) {
  const relativeFile = spreadSourceByArray[arrayName];
  if (!relativeFile) {
    continue;
  }

  const toolFilePath = path.join(mcpRoot, 'src', 'tools', relativeFile);
  if (!fs.existsSync(toolFilePath)) {
    console.error(`Spread source missing for ${arrayName}: ${toolFilePath}`);
    process.exit(1);
  }

  const toolSource = fs.readFileSync(toolFilePath, 'utf8');
  for (const match of toolSource.matchAll(/\bname:\s*'([^']+)'/g)) {
    listedTools.push(match[1]);
  }
}

const switchStart = source.indexOf('switch (name)');
const switchEnd = source.indexOf('default:', switchStart);
if (switchStart === -1 || switchEnd === -1 || switchEnd <= switchStart) {
  console.error('Could not locate tool dispatch switch in packages/kamiyo-mcp/src/index.ts');
  process.exit(1);
}

const switchBlock = source.slice(switchStart, switchEnd);
const dispatchCases = [...switchBlock.matchAll(/\bcase\s+'([^']+)'/g)].map((match) => match[1]);

const listedSet = new Set(listedTools);
const dispatchSet = new Set(dispatchCases);

const dispatchAliases = new Set(['check_x402_api_price']);

const missingDispatch = [...listedSet].filter((name) => !dispatchSet.has(name)).sort();
const undocumentedDispatch = [...dispatchSet]
  .filter((name) => !listedSet.has(name) && !dispatchAliases.has(name))
  .sort();

if (missingDispatch.length > 0 || undocumentedDispatch.length > 0) {
  console.error('MCP tool parity check failed.');
  if (missingDispatch.length > 0) {
    console.error('Listed tools missing dispatch handlers:');
    for (const name of missingDispatch) {
      console.error(`- ${name}`);
    }
  }
  if (undocumentedDispatch.length > 0) {
    console.error('Dispatch handlers missing listTools definitions:');
    for (const name of undocumentedDispatch) {
      console.error(`- ${name}`);
    }
  }
  process.exit(1);
}

console.log(`MCP tool parity passed (${listedSet.size} listed tools, ${dispatchSet.size} dispatch handlers including aliases).`);
