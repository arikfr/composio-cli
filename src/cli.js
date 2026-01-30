#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { Composio } from '@composio/core';

const program = new Command();

const parseCsv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseJson = (value, label) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON for ${label}: ${message}`);
  }
};

const readJsonFile = async (filePath, label) => {
  const contents = await readFile(filePath, 'utf8');
  return parseJson(contents, label);
};

const buildClient = (globalOptions) => {
  const apiKey = globalOptions.apiKey ?? process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing Composio API key. Provide --api-key or set COMPOSIO_API_KEY.'
    );
  }

  const config = { apiKey, disableVersionCheck: true };
  if (globalOptions.toolkitVersions) {
    config.toolkitVersions = parseJson(
      globalOptions.toolkitVersions,
      '--toolkit-versions'
    );
  }

  return new Composio(config);
};

const printOutput = (data, raw) => {
  if (raw) {
    process.stdout.write(
      typeof data === 'string' ? data : JSON.stringify(data)
    );
    if (!process.stdout.isTTY) {
      process.stdout.write('\n');
    }
    return;
  }

  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
};

const handleError = (error, hint) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (hint) {
    console.error(hint);
  }
  process.exitCode = 1;
};

program
  .name('composio-cli')
  .description('CLI for listing and invoking Composio toolkits/tools via @composio/core')
  .option('--api-key <key>', 'Composio API key (defaults to COMPOSIO_API_KEY)')
  .option(
    '--toolkit-versions <json>',
    'JSON map of toolkit versions for Composio client initialization'
  )
  .option('--raw', 'Output raw JSON without pretty formatting', false);

program
  .command('toolkits')
  .description('List available toolkits')
  .option('--slug <slug>', 'Fetch a single toolkit by slug')
  .option('--category <slug>', 'Filter by category slug')
  .option('--managed-by <value>', 'Filter by managedBy: all|composio|project')
  .option('--sort-by <value>', 'Sort by: usage|alphabetically')
  .option('--cursor <cursor>', 'Pagination cursor')
  .option('--limit <number>', 'Limit number of results', (value) => Number(value))
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const composio = buildClient(globalOptions);

      if (options.slug) {
        const result = await composio.toolkits.get(options.slug);
        printOutput(result, globalOptions.raw);
        return;
      }

      const query = {};
      if (options.category) query.category = options.category;
      if (options.managedBy) query.managedBy = options.managedBy;
      if (options.sortBy) query.sortBy = options.sortBy;
      if (options.cursor) query.cursor = options.cursor;
      if (Number.isFinite(options.limit)) query.limit = options.limit;

      const hasQuery = Object.keys(query).length > 0;
      const result = hasQuery
        ? await composio.toolkits.get(query)
        : await composio.toolkits.get();
      printOutput(result, globalOptions.raw);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('auth-url')
  .description('Get an auth redirect URL for a user/toolkit if not authenticated')
  .requiredOption('--user <id>', 'User id for authorization')
  .requiredOption('--toolkit <slug>', 'Toolkit slug to authorize')
  .option('--auth-config-id <id>', 'Auth config id to use (optional)')
  .option('--force', 'Always create a new connection request', false)
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const composio = buildClient(globalOptions);

      if (!options.force) {
        const listParams = {
          userIds: [options.user],
          toolkitSlugs: [options.toolkit],
          statuses: ['ACTIVE'],
          limit: 50,
        };
        if (options.authConfigId) {
          listParams.authConfigIds = [options.authConfigId];
        }

        const existing = await composio.connectedAccounts.list(listParams);

        if (existing.items && existing.items.length > 0) {
          const payload = {
            authenticated: true,
            connectedAccounts: existing.items.map((item) => ({
              id: item.id,
              status: item.status,
              toolkit: item.toolkit?.slug,
              authConfigId: item.authConfig?.id,
            })),
          };
          printOutput(payload, globalOptions.raw);
          return;
        }
      }

      const connectionRequest = await composio.toolkits.authorize(
        options.user,
        options.toolkit,
        options.authConfigId
      );

      const payload = {
        authenticated: false,
        redirectUrl: connectionRequest.redirectUrl ?? null,
        connectionRequestId: connectionRequest.id,
        status: connectionRequest.status ?? null,
      };
      printOutput(payload, globalOptions.raw);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('schema')
  .description('Get the input schema for a tool (possible arguments)')
  .requiredOption('--tool <slug>', 'Tool slug (e.g. GITHUB_GET_REPOS)')
  .option('--full', 'Return the full tool definition', false)
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const composio = buildClient(globalOptions);
      const tool = await composio.tools.getRawComposioToolBySlug(options.tool);

      if (options.full) {
        printOutput(tool, globalOptions.raw);
        return;
      }

      const payload = {
        slug: tool.slug,
        name: tool.name,
        description: tool.description,
        toolkit: tool.toolkit?.slug ?? null,
        inputParameters: tool.inputParameters ?? null,
        version: tool.version ?? null,
        availableVersions: tool.availableVersions ?? null,
      };
      printOutput(payload, globalOptions.raw);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('connections')
  .description('List connected accounts for a user')
  .requiredOption('--user <id>', 'User id to list connections for')
  .option('--toolkits <slugs>', 'Comma-separated toolkit slugs')
  .option('--statuses <statuses>', 'Comma-separated statuses (e.g. ACTIVE,INITIATED)')
  .option('--auth-config-ids <ids>', 'Comma-separated auth config ids')
  .option('--order-by <value>', 'Order by: created_at|updated_at')
  .option('--cursor <cursor>', 'Pagination cursor')
  .option('--limit <number>', 'Limit number of results', (value) => Number(value))
  .option('--full', 'Return the full connected accounts response', false)
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const composio = buildClient(globalOptions);

      const query = { userIds: [options.user] };
      if (options.toolkits) query.toolkitSlugs = parseCsv(options.toolkits);
      if (options.statuses) query.statuses = parseCsv(options.statuses);
      if (options.authConfigIds) {
        query.authConfigIds = parseCsv(options.authConfigIds);
      }
      if (options.orderBy) query.orderBy = options.orderBy;
      if (options.cursor) query.cursor = options.cursor;
      if (Number.isFinite(options.limit)) query.limit = options.limit;

      const result = await composio.connectedAccounts.list(query);
      if (options.full) {
        printOutput(result, globalOptions.raw);
        return;
      }

      const items = (result.items ?? []).map((item) => ({
        id: item.id,
        status: item.status,
        toolkit: item.toolkit?.slug ?? null,
      }));
      printOutput(items, globalOptions.raw);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('tools')
  .description('List tools for a user (filter by toolkit, tool slug, or search)')
  .requiredOption('--user <id>', 'User id for tool listing')
  .option('--toolkits <slugs>', 'Comma-separated toolkit slugs')
  .option('--tools <slugs>', 'Comma-separated tool slugs')
  .option('--search <query>', 'Search term (standalone)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--scopes <scopes>', 'Comma-separated scopes (requires exactly one toolkit)')
  .option('--auth-config-ids <ids>', 'Comma-separated auth config ids')
  .option('--limit <number>', 'Limit number of results', (value) => Number(value))
  .option('--important', 'Only important tools', false)
  .option('--all', 'List all tools enum (ignores filters)', false)
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const composio = buildClient(globalOptions);

      if (options.all) {
        const result = await composio.tools.getToolsEnum();
        printOutput(result, globalOptions.raw);
        return;
      }

      const toolkits = options.toolkits ? parseCsv(options.toolkits) : null;
      const tools = options.tools ? parseCsv(options.tools) : null;
      const tags = options.tags ? parseCsv(options.tags) : null;
      const scopes = options.scopes ? parseCsv(options.scopes) : null;
      const authConfigIds = options.authConfigIds
        ? parseCsv(options.authConfigIds)
        : null;

      const hasSearch = Boolean(options.search);
      if (
        !toolkits &&
        !tools &&
        !hasSearch &&
        !tags &&
        !authConfigIds
      ) {
        throw new Error(
          'Provide --toolkits, --tools, --search, --tags, or --auth-config-ids (or use --all).'
        );
      }

      if (hasSearch) {
        if (toolkits || tools || tags || scopes || authConfigIds) {
          throw new Error('--search cannot be combined with other filters.');
        }
        if (Number.isFinite(options.limit)) {
          throw new Error('--limit cannot be used with --search.');
        }
      }

      if (tools && (toolkits || tags || scopes || authConfigIds || hasSearch)) {
        throw new Error('--tools cannot be combined with other filters.');
      }

      if (scopes && (!toolkits || toolkits.length !== 1)) {
        throw new Error('--scopes requires exactly one toolkit in --toolkits.');
      }

      const filters = {};
      if (tools) filters.tools = tools;
      if (toolkits) filters.toolkits = toolkits;
      if (tags) filters.tags = tags;
      if (scopes) filters.scopes = scopes;
      if (authConfigIds) filters.authConfigIds = authConfigIds;
      if (hasSearch) filters.search = options.search;
      if (Number.isFinite(options.limit)) filters.limit = options.limit;
      if (options.important) filters.important = true;

      const result = await composio.tools.get(options.user, filters);
      printOutput(result, globalOptions.raw);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('execute')
  .description('Execute a tool for a user')
  .requiredOption('--user <id>', 'User id for tool execution')
  .requiredOption('--tool <slug>', 'Tool slug (e.g. GITHUB_GET_REPOS)')
  .option('--args <json>', 'JSON arguments for the tool')
  .option('--args-file <path>', 'Path to a JSON file with arguments')
  .option('--connected-account <id>', 'Connected account id')
  .option('--version <version>', 'Toolkit version (e.g. 20250909_00 or latest)')
  .option(
    '--skip-version-check',
    'Skip version validation when using latest (dangerous)',
    false
  )
  .option('--text <text>', 'Additional text input for the tool')
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const composio = buildClient(globalOptions);

      let args = undefined;
      if (options.args && options.argsFile) {
        throw new Error('Provide either --args or --args-file, not both.');
      }
      if (options.args) {
        args = parseJson(options.args, '--args');
      }
      if (options.argsFile) {
        args = await readJsonFile(options.argsFile, '--args-file');
      }

      const body = { userId: options.user };
      if (args !== undefined) body.arguments = args;
      if (options.connectedAccount) body.connectedAccountId = options.connectedAccount;
      if (options.version) body.version = options.version;
      if (options.skipVersionCheck) body.dangerouslySkipVersionCheck = true;
      if (options.text) body.text = options.text;

      const result = await composio.tools.execute(options.tool, body);
      printOutput(result, globalOptions.raw);
    } catch (error) {
      handleError(
        error,
        'Tip: use `composio-cli schema --tool <slug>` to view required arguments.'
      );
    }
  });

program.parseAsync(process.argv).catch(handleError);
