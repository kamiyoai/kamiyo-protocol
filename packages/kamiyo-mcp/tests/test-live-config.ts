#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { cdpEnvStatus } from '../src/tools/cdp.js';
import { paranetEnvStatus } from '../src/tools/paranet.js';

dotenv.config();

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function printBool(label: string, value: boolean): void {
  console.log(`${label}: ${value ? 'yes' : 'no'}`);
}

function main(): void {
  const cdp = cdpEnvStatus();
  const paranet = paranetEnvStatus();

  printSection('CDP');
  printBool('Ready', cdp.ok);
  console.log(`CDP_API_KEY_ID source: ${cdp.resolvedFrom.CDP_API_KEY_ID ?? 'missing'}`);
  console.log(`CDP_API_KEY_SECRET source: ${cdp.resolvedFrom.CDP_API_KEY_SECRET ?? 'missing'}`);
  console.log(`CDP_WALLET_SECRET source: ${cdp.resolvedFrom.CDP_WALLET_SECRET ?? 'missing'}`);
  if (cdp.missing.length > 0) {
    console.log('Missing:');
    for (const item of cdp.missing) {
      console.log(`- ${item}`);
    }
  }

  printSection('Paranet');
  printBool('Read-only ready', paranet.ready.readOnly);
  printBool('Publish ready', paranet.ready.publish);
  printBool('Attest ready', paranet.ready.attest);
  printBool('Trust ready', paranet.ready.trust);
  console.log(`Endpoint source: ${paranet.config.endpoint.source ?? 'missing'}`);
  console.log(`Blockchain source: ${paranet.config.blockchain.source ?? 'default(base:8453)'}`);
  console.log(`Port source: ${paranet.config.dkgPort.source ?? 'default(8900)'}`);
  console.log(`Private key source: ${paranet.config.privateKey.source ?? 'missing'}`);
  console.log(`Paranet UAL source: ${paranet.config.paranetUAL.source ?? 'missing'}`);
  console.log(`Operator global ID source: ${paranet.config.operatorGlobalId.source ?? 'missing'}`);
  console.log(`Attestor global ID source: ${paranet.config.attestorGlobalId.source ?? 'missing'}`);

  const failures: string[] = [];
  if (!cdp.ok) failures.push('CDP is not ready for live calls');
  if (!paranet.ready.readOnly) failures.push('Paranet read path is not ready');
  if (!paranet.ready.publish) failures.push('Paranet publish path is not ready');
  if (!paranet.ready.attest) failures.push('Paranet attestation path is not ready');
  if (!paranet.ready.trust) failures.push('Paranet trust path is not ready');

  if (paranet.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of paranet.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log('\nLive preflight failed:');
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nLive preflight passed');
}

main();
