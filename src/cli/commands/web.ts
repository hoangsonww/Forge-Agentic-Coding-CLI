/**
 * Web-related commands (search/fetch).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { webSearch } from '../../web/search';
import { webFetch } from '../../web/fetch';
import { info, ok, err, tableOut } from '../ui';

export const webCommand = new Command('web').description('Web tools (search/fetch).');

webCommand
  .command('search <query...>')
  .description('Search the web (Tavily/Brave/DuckDuckGo).')
  .option('-n, --limit <n>', 'limit', '5')
  .action(async (q: string[], opts) => {
    bootstrap();
    const results = await webSearch({ query: q.join(' '), limit: Number(opts.limit) });
    if (!results.length) {
      err('No results.');
      return;
    }
    process.stdout.write(
      tableOut(
        ['title', 'url', 'snippet'],
        results.map((r) => [r.title.slice(0, 48), r.url, r.snippet.slice(0, 60)]),
      ) + '\n',
    );
  });

webCommand
  .command('fetch <url>')
  .description('Fetch a URL and print cleaned text.')
  .option('--max-chars <n>', 'truncate to N characters', '3000')
  .action(async (url: string, opts) => {
    bootstrap();
    try {
      const r = await webFetch({ url, maxChars: Number(opts.maxChars) });
      info(`status=${r.status} size=${r.bytesReceived}B title=${r.title ?? '(none)'}`);
      if (r.flaggedInjection) err('⚠ injection patterns detected (content was sanitized)');
      process.stdout.write('\n' + r.text + '\n');
      ok('done.');
    } catch (e) {
      err(`Fetch failed: ${String(e)}`);
      process.exitCode = 1;
    }
  });
