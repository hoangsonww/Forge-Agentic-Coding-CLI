import { Command } from 'commander';
import prompts from 'prompts';
import { bootstrap } from '../bootstrap';
import { tableOut, info, ok, err } from '../ui';
import { addConnection, listConnections, removeConnection } from '../../mcp/registry';
import { McpStdioClient } from '../../mcp/client';
import { McpHttpClient } from '../../mcp/http-transport';
import { authorize, ensureAccessToken, OAuthConfig, loadTokens } from '../../mcp/oauth';
import { setSecret, getSecret } from '../../keychain';

export const mcpCommand = new Command('mcp').description('MCP connection management.');

mcpCommand
  .command('list')
  .description('List MCP connections.')
  .action(() => {
    bootstrap();
    const conns = listConnections();
    if (!conns.length) {
      info('No MCP connections configured.');
      return;
    }
    process.stdout.write(
      tableOut(
        ['id', 'name', 'transport', 'auth', 'status'],
        conns.map((c) => [c.id, c.name, c.transport, c.auth, c.status]),
      ) + '\n',
    );
  });

mcpCommand
  .command('add')
  .description('Add an MCP connection (interactive).')
  .action(async () => {
    bootstrap();
    const resp = await prompts([
      { type: 'text', name: 'name', message: 'Name (e.g. github)' },
      {
        type: 'select',
        name: 'transport',
        message: 'Transport',
        choices: [
          { title: 'stdio (local command)', value: 'stdio' },
          { title: 'http stream', value: 'http_stream' },
        ],
      },
      {
        type: (prev: unknown) => (prev === 'stdio' ? 'text' : null),
        name: 'command',
        message: 'Command',
      },
      {
        type: (_prev: unknown, values: { transport?: string }) =>
          values.transport === 'stdio' ? 'text' : null,
        name: 'args',
        message: 'Args (space-separated, optional)',
      },
      {
        type: (_prev: unknown, values: { transport?: string }) =>
          values.transport === 'http_stream' ? 'text' : null,
        name: 'endpoint',
        message: 'Endpoint URL',
      },
      {
        type: 'select',
        name: 'auth',
        message: 'Auth',
        choices: [
          { title: 'none', value: 'none' },
          { title: 'api_key', value: 'api_key' },
          { title: 'oauth', value: 'oauth' },
          { title: 'basic', value: 'basic' },
        ],
      },
    ]);
    if (!resp.name) return;
    const id = resp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    addConnection({
      id,
      name: resp.name,
      transport: resp.transport,
      endpoint: resp.endpoint,
      command: resp.command,
      args: resp.args ? String(resp.args).split(/\s+/).filter(Boolean) : undefined,
      auth: resp.auth,
      status: 'disconnected',
    });
    ok(`Added MCP connection '${resp.name}' (${id}). Test with: forge mcp status ${id}`);
  });

mcpCommand
  .command('remove <id>')
  .description('Remove an MCP connection.')
  .action((id: string) => {
    bootstrap();
    removeConnection(id);
    ok(`Removed ${id}.`);
  });

mcpCommand
  .command('status <id>')
  .description('Probe an MCP connection.')
  .action(async (id: string) => {
    bootstrap();
    const conn = listConnections().find((c) => c.id === id);
    if (!conn) {
      err(`Unknown connection: ${id}`);
      return;
    }
    if (conn.transport === 'stdio') {
      const client = new McpStdioClient(conn.command ?? '', conn.args ?? []);
      try {
        await client.start();
        const tools = await client.listTools();
        ok(`Connected. ${tools.length} tool(s): ${tools.map((t) => t.name).join(', ')}`);
      } catch (e) {
        err(`Failed: ${String(e)}`);
      } finally {
        await client.stop();
      }
      return;
    }
    if (conn.transport === 'http_stream') {
      let headers: Record<string, string> = {};
      if (conn.auth === 'api_key') {
        const apiKey = getSecret('mcp-api-key', conn.id);
        if (!apiKey) {
          err(`No API key stored for ${conn.id}. Set one with 'forge mcp auth ${conn.id}'.`);
          return;
        }
        headers.authorization = `Bearer ${apiKey}`;
      } else if (conn.auth === 'oauth') {
        const tokens = loadTokens(conn.id);
        if (!tokens) {
          err(`Not authenticated. Run 'forge mcp auth ${conn.id}'.`);
          return;
        }
        headers.authorization = `Bearer ${tokens.accessToken}`;
      }
      const client = new McpHttpClient({ endpoint: conn.endpoint ?? '', headers });
      try {
        await client.start();
        const tools = await client.listTools();
        ok(`Connected. ${tools.length} tool(s): ${tools.map((t) => t.name).join(', ')}`);
      } catch (e) {
        err(`Failed: ${String(e)}`);
      }
      return;
    }
    info(`transport ${conn.transport} is not yet implemented.`);
  });

mcpCommand
  .command('auth <id>')
  .description('Authenticate an MCP connection (OAuth or API key).')
  .option('--client-id <id>', 'OAuth client id')
  .option('--client-secret <s>', 'OAuth client secret (public clients may omit)')
  .option('--auth-url <url>', 'OAuth authorization endpoint')
  .option('--token-url <url>', 'OAuth token endpoint')
  .option('--scopes <s>', 'space-separated OAuth scopes')
  .option('--redirect-port <n>', 'local callback port', '8787')
  .action(async (id: string, opts) => {
    bootstrap();
    const conn = listConnections().find((c) => c.id === id);
    if (!conn) {
      err(`Unknown connection: ${id}`);
      return;
    }
    if (conn.auth === 'api_key') {
      const resp = await prompts({ type: 'password', name: 'key', message: 'API key' });
      if (!resp.key) return;
      setSecret('mcp-api-key', id, resp.key);
      ok('Stored API key.');
      return;
    }
    if (conn.auth === 'oauth') {
      const cfg: OAuthConfig = {
        id,
        authorizationUrl: opts.authUrl ?? '',
        tokenUrl: opts.tokenUrl ?? '',
        clientId: opts.clientId ?? '',
        clientSecret: opts.clientSecret,
        scopes: opts.scopes ? String(opts.scopes).split(/\s+/).filter(Boolean) : undefined,
        redirectPort: Number(opts.redirectPort) || 8787,
      };
      if (!cfg.authorizationUrl || !cfg.tokenUrl || !cfg.clientId) {
        err('OAuth requires --auth-url, --token-url, --client-id.');
        return;
      }
      try {
        await authorize(cfg);
        ok('Authenticated and tokens stored.');
      } catch (e) {
        err(`OAuth failed: ${String(e)}`);
      }
      return;
    }
    info(`auth type ${conn.auth} doesn't need credentials.`);
  });

mcpCommand
  .command('refresh <id>')
  .description('Refresh OAuth tokens for an MCP connection.')
  .option('--client-id <id>')
  .option('--client-secret <s>')
  .option('--token-url <url>')
  .action(async (id: string, opts) => {
    bootstrap();
    const conn = listConnections().find((c) => c.id === id);
    if (!conn || conn.auth !== 'oauth') {
      err('Connection not found or not OAuth.');
      return;
    }
    try {
      await ensureAccessToken({
        id,
        authorizationUrl: '',
        tokenUrl: opts.tokenUrl ?? '',
        clientId: opts.clientId ?? '',
        clientSecret: opts.clientSecret,
      });
      ok('Tokens refreshed.');
    } catch (e) {
      err(`Refresh failed: ${String(e)}`);
    }
  });
