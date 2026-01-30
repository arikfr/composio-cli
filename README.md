# composio-cli

CLI for listing Composio toolkits/tools and executing tools using `@composio/core`.

## Requirements

- Node.js 18+
- A Composio API key

## Install

Local usage:

```bash
npm install
node src/cli.js --help
```

Global-style usage in this repo:

```bash
npm link
composio-cli --help
```

## Authentication

Set your API key via environment variable or flag:

```bash
export COMPOSIO_API_KEY=your_key
```

Or pass `--api-key` on each command.

## Commands

### List toolkits

```bash
composio-cli toolkits
composio-cli toolkits --category developer-tools --sort-by usage
composio-cli toolkits --slug github
```

### Get tool input schema (possible arguments)

```bash
composio-cli schema --tool GITHUB_GET_REPOS
composio-cli schema --tool GITHUB_GET_REPOS --full
```

### List connected accounts

```bash
composio-cli connections --user user_123
composio-cli connections --user user_123 --toolkits twitter,gmail --statuses ACTIVE
composio-cli connections --user user_123 --full
```

You can filter by status with `--statuses` (comma-separated): `ACTIVE`, `INITIATED`, `INACTIVE`, `FAILED`, `EXPIRED`, `INITIALIZING`.

### Get auth URL (only if not authenticated)

```bash
composio-cli auth-url --user user_123 --toolkit github
```

- If the user already has an ACTIVE connection, the command returns `authenticated: true` and the existing connection IDs.
- Otherwise it returns `authenticated: false` with a `redirectUrl` to complete the connection.
- Add `--force` to always create a new connection request.
- Add `--auth-config-id` to scope both the check and request.

### List tools

```bash
# By toolkit
composio-cli tools --user user_123 --toolkits github,slack --limit 10

# By specific tool slugs
composio-cli tools --user user_123 --tools GITHUB_GET_REPOS,SLACK_SEND_MESSAGE

# Search (standalone)
composio-cli tools --user user_123 --search "issue"

# Tags (optionally with toolkit)
composio-cli tools --user user_123 --tags important

# All tools enum
composio-cli tools --user user_123 --all
```

Notes:

- `--search` cannot be combined with other filters.
- `--tools` cannot be combined with other filters.
- `--scopes` requires exactly one toolkit in `--toolkits`.

### Execute tool

```bash
composio-cli execute \
  --user user_123 \
  --tool GITHUB_GET_REPOS \
  --args '{"owner":"composio"}'
```

You can also pass args via a file:

```bash
composio-cli execute --user user_123 --tool GITHUB_GET_REPOS --args-file ./args.json
```

## Toolkit versions

If you want to pin toolkit versions at SDK init:

```bash
composio-cli --toolkit-versions '{"github":"20250909_00"}' toolkits
```

When executing tools manually, you can also pass `--version` or use `--skip-version-check` if you understand the risk of running `latest`.

## Output

All commands emit JSON. Use `--raw` for compact output suitable for piping.
