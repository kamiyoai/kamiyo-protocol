#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(scriptDir, '..');
const indexPath = path.join(mcpRoot, 'src', 'index.ts');
const packageJsonPath = path.join(mcpRoot, 'package.json');
const coverageMapPath = path.join(mcpRoot, 'scripts', 'tool-test-coverage.json');

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

let coverageMap = {};
if (!fs.existsSync(coverageMapPath)) {
  console.error(`Missing coverage map: ${coverageMapPath}`);
  process.exit(1);
}
coverageMap = JSON.parse(fs.readFileSync(coverageMapPath, 'utf8'));

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const availableScripts = new Set(Object.keys(packageJson.scripts ?? {}));

const missingCoverage = [];
const invalidCoverage = [];
for (const toolName of [...listedSet].sort()) {
  const coverage = coverageMap[toolName];
  if (!Array.isArray(coverage) || coverage.length === 0) {
    missingCoverage.push(toolName);
    continue;
  }

  const unknownScripts = coverage.filter((scriptName) => !availableScripts.has(scriptName));
  if (unknownScripts.length > 0) {
    invalidCoverage.push({ toolName, unknownScripts });
  }
}

const staleCoverageEntries = Object.keys(coverageMap)
  .filter((toolName) => !listedSet.has(toolName))
  .sort();

if (
  missingDispatch.length > 0 ||
  undocumentedDispatch.length > 0 ||
  missingCoverage.length > 0 ||
  invalidCoverage.length > 0 ||
  staleCoverageEntries.length > 0
) {
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
  if (missingCoverage.length > 0) {
    console.error('Tools missing test coverage metadata:');
    for (const name of missingCoverage) {
      console.error(`- ${name}`);
    }
  }
  if (invalidCoverage.length > 0) {
    console.error('Tools mapped to unknown npm scripts:');
    for (const entry of invalidCoverage) {
      console.error(`- ${entry.toolName}: ${entry.unknownScripts.join(', ')}`);
    }
  }
  if (staleCoverageEntries.length > 0) {
    console.error('Coverage metadata contains unknown tools:');
    for (const name of staleCoverageEntries) {
      console.error(`- ${name}`);
    }
  }
  process.exit(1);
}

console.log(
  `MCP tool parity passed (${listedSet.size} listed tools, ${dispatchSet.size} dispatch handlers including aliases, full coverage metadata).`
);
