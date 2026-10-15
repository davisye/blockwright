import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { BlockwrightDriver } from '@izakyl/blockwright-client';
import { CORE, CLIENT, WORLD, MEDIA } from '@izakyl/blockwright-minecraft';
import '@izakyl/blockwright-ui';
import '@izakyl/blockwright-test';
import '@izakyl/blockwright-mcp';
import '@izakyl/blockwright-cinema';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const require = createRequire(import.meta.url);
for (const module of [CORE, CLIENT, WORLD, MEDIA]) assert(Object.keys(module.spec().sources).length > 0);
assert.equal(typeof BlockwrightDriver.prototype.launchForge, 'function');
assert.match(CORE.spec('forge').sources['blockwright/minecraft/core/GameJson.java'], /ForgeCapabilities.ITEM_HANDLER/);
assert.match(CLIENT.spec('forge').sources['blockwright/minecraft/client/InputWitness.java'], /net\.minecraftforge\.client\.event/);
assert.match(WORLD.spec('forge').sources['blockwright/minecraft/world/TickMeter.java'], /MinecraftForge.EVENT_BUS/);
const binary = join(dirname(require.resolve('@izakyl/blockwright-client')), 'blockwright');
assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /blockwright \d+\.\d+\.\d+/);
const driver = new BlockwrightDriver();
try { assert.deepEqual(await driver.request('ping'), { pong: true }); } finally { await driver.close(); }
const command = join(process.cwd(), 'node_modules/.bin/blockwright-mcp');
assert.match(execFileSync(command, ['--help'], { encoding: 'utf8' }), /Usage: blockwright-mcp/);
const transport = new StdioClientTransport({ command, args: ['--engine', 'forge'] });
const client = new Client({ name: 'package-smoke', version: '1.0.0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert(tools.some(tool => tool.name === 'blockwright_launch'));
} finally { await client.close(); }
console.log('Installed package imports, Java sources, driver ping, CLI and MCP handshake passed.');
