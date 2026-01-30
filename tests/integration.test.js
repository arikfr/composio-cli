import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Composio } from '@composio/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cliPath = resolve(rootDir, 'src', 'cli.js');

loadEnv({ path: resolve(rootDir, '.env') });

const apiKey = process.env.COMPOSIO_API_KEY;
const testUserId = process.env.TEST_USER_ID;

const runCli = async (args, { env } = {}) =>
  new Promise((resolvePromise) => {
    const child = spawn('node', [cliPath, ...args], {
      env: {
        ...process.env,
        COMPOSIO_API_KEY: apiKey,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      resolvePromise({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
      });
    });
  });

const parseJson = (text) => {
  if (!text) return null;
  return JSON.parse(text);
};

const requireEnv = () => {
  if (!apiKey || !testUserId) {
    throw new Error('Missing COMPOSIO_API_KEY or TEST_USER_ID in .env.');
  }
};

const findUnconfiguredToolkit = async () => {
  const composio = new Composio({ apiKey, disableVersionCheck: true });
  let cursor;

  for (let page = 0; page < 6; page += 1) {
    const response = await composio.toolkits.get({ limit: 50, cursor });
    const items = response.items || response;

    for (const toolkit of items) {
      if (toolkit.noAuth) continue;
      const managedSchemes = toolkit.composioManagedAuthSchemes || [];
      if (managedSchemes.length > 0) continue;

      const authConfigs = await composio.authConfigs.list({ toolkit: toolkit.slug });
      if (!authConfigs.items || authConfigs.items.length === 0) {
        return toolkit.slug;
      }
    }

    cursor = response.meta?.nextCursor || response.nextCursor || response.cursor || response.meta?.cursor;
    if (!cursor) break;
  }

  return null;
};

test('toolkits command returns results', async () => {
  requireEnv();
  const result = await runCli(['toolkits', '--limit', '3', '--raw']);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  assert.ok(data[0].slug);
});

test('schema command returns input parameters', async () => {
  requireEnv();
  const result = await runCli([
    'schema',
    '--tool',
    'TWITTER_USER_LOOKUP_ME',
    '--raw',
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.equal(data.slug, 'TWITTER_USER_LOOKUP_ME');
  assert.ok(data.inputParameters);
});

test('connections command lists active twitter account', async () => {
  requireEnv();
  const result = await runCli([
    'connections',
    '--user',
    testUserId,
    '--toolkits',
    'twitter',
    '--statuses',
    'ACTIVE',
    '--raw',
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  assert.equal(data[0].toolkit, 'twitter');
});

test('tools command lists toolkit tools', async () => {
  requireEnv();
  const result = await runCli([
    'tools',
    '--user',
    testUserId,
    '--toolkits',
    'twitter',
    '--limit',
    '5',
    '--raw',
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  assert.ok(data[0].function?.name);
});

test('auth-url returns authenticated for twitter', async () => {
  requireEnv();
  const result = await runCli([
    'auth-url',
    '--user',
    testUserId,
    '--toolkit',
    'twitter',
    '--raw',
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.equal(data.authenticated, true);
  assert.ok(Array.isArray(data.connectedAccounts));
  assert.ok(data.connectedAccounts.length > 0);
});

test('auth-url returns redirect when gmail is not connected', async () => {
  requireEnv();
  const result = await runCli([
    'auth-url',
    '--user',
    testUserId,
    '--toolkit',
    'gmail',
    '--raw',
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.equal(data.authenticated, false);
  assert.ok(typeof data.redirectUrl === 'string' && data.redirectUrl.length > 0);
});

test('auth-url errors for toolkit without auth config', async () => {
  requireEnv();
  const toolkit = (await findUnconfiguredToolkit()) ?? 'perplexityai';
  const result = await runCli([
    'auth-url',
    '--user',
    testUserId,
    '--toolkit',
    toolkit,
    '--raw',
  ]);

  assert.notEqual(result.exitCode, 0, 'Expected failure for unconfigured toolkit');
  assert.ok(
    result.stderr.includes('No auth configs') ||
      result.stderr.includes('No Default auth config') ||
      result.stderr.includes('Tool not found'),
    `Unexpected error: ${result.stderr}`
  );
});

test('execute works for twitter lookup', async () => {
  requireEnv();
  const result = await runCli([
    'execute',
    '--user',
    testUserId,
    '--tool',
    'TWITTER_USER_LOOKUP_ME',
    '--args',
    '{}',
    '--version',
    'latest',
    '--skip-version-check',
    '--raw',
  ]);

  assert.equal(result.exitCode, 0, result.stderr);
  const data = parseJson(result.stdout);
  assert.equal(data.successful, true);
  assert.equal(data.error, null);
  assert.ok(data.data?.data?.id);
});
