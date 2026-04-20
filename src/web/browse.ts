/**
 * Agentic browser via Playwright (optional peer dep). Deliberately a thin
 * high-level abstraction: `open`, `click`, `type`, `extract`, `screenshot`.
 * We avoid exposing the raw Page API so the LLM can't accidentally execute
 * arbitrary page JS.
 *
 * Playwright is loaded lazily so users who don't need browsing don't pay for
 * it. If it's not installed, every browse call returns a helpful error.
 */
import { ForgeRuntimeError } from '../types/errors';
import { log } from '../logging/logger';
import { htmlToText, truncateText } from './sanitize';
import { redactString } from '../security/redact';

// Typed as any since playwright is an optional peer dep.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrowserContext = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

let cachedPlaywright: any = null;
const loadPlaywright = async (): Promise<any> => {
  if (cachedPlaywright) return cachedPlaywright;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedPlaywright = require('playwright');
    return cachedPlaywright;
  } catch {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message:
        'Playwright is not installed. Run `npm install -g playwright && npx playwright install chromium` to enable browsing.',
      retryable: false,
    });
  }
};

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export const openSession = async (
  opts: { headless?: boolean; timeoutMs?: number } = {},
): Promise<BrowserSession> => {
  const playwright = await loadPlaywright();
  const browser: Browser = await playwright.chromium.launch({ headless: opts.headless ?? true });
  const context: BrowserContext = await browser.newContext({
    javaScriptEnabled: true,
    bypassCSP: false,
    userAgent: 'Forge/0.1 (+https://github.com/hoangsonww/Forge-Agentic-Coding-CLI)',
  });
  const page: Page = await context.newPage();
  page.setDefaultTimeout(opts.timeoutMs ?? 20_000);
  return {
    browser,
    context,
    page,
    close: async () => {
      try {
        await context.close();
      } catch {
        /* ignore */
      }
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    },
  };
};

export interface BrowseStep {
  op: 'goto' | 'click' | 'type' | 'extract' | 'waitFor' | 'press';
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  timeoutMs?: number;
  maxChars?: number;
}

export interface BrowseOutput {
  logs: string[];
  text: string;
  title: string | null;
  url: string;
  flaggedInjection: boolean;
}

export const runBrowseSteps = async (
  steps: BrowseStep[],
  opts: { headless?: boolean; timeoutMs?: number } = {},
): Promise<BrowseOutput> => {
  const session = await openSession(opts);
  const logs: string[] = [];
  try {
    for (const step of steps) {
      switch (step.op) {
        case 'goto': {
          if (!step.url)
            throw new ForgeRuntimeError({
              class: 'user_input',
              message: 'goto requires url',
              retryable: false,
            });
          await session.page.goto(step.url, {
            timeout: step.timeoutMs ?? 20_000,
            waitUntil: 'domcontentloaded',
          });
          logs.push(`goto ${step.url}`);
          break;
        }
        case 'click': {
          if (!step.selector)
            throw new ForgeRuntimeError({
              class: 'user_input',
              message: 'click requires selector',
              retryable: false,
            });
          await session.page.click(step.selector, { timeout: step.timeoutMs ?? 10_000 });
          logs.push(`click ${step.selector}`);
          break;
        }
        case 'type': {
          if (!step.selector || step.text == null)
            throw new ForgeRuntimeError({
              class: 'user_input',
              message: 'type requires selector+text',
              retryable: false,
            });
          await session.page.fill(step.selector, step.text, { timeout: step.timeoutMs ?? 10_000 });
          logs.push(`type ${step.selector} (${step.text.length} chars)`);
          break;
        }
        case 'press': {
          if (!step.key)
            throw new ForgeRuntimeError({
              class: 'user_input',
              message: 'press requires key',
              retryable: false,
            });
          await session.page.keyboard.press(step.key);
          logs.push(`press ${step.key}`);
          break;
        }
        case 'waitFor': {
          if (!step.selector)
            throw new ForgeRuntimeError({
              class: 'user_input',
              message: 'waitFor requires selector',
              retryable: false,
            });
          await session.page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 10_000 });
          logs.push(`waitFor ${step.selector}`);
          break;
        }
        case 'extract': {
          const content = (await session.page.content()) as string;
          const txt = htmlToText(content);
          const title = await session.page.title();
          const url = session.page.url();
          return {
            logs,
            text: redactString(truncateText(txt.text, step.maxChars ?? 10_000)),
            title: title || txt.title,
            url,
            flaggedInjection: txt.flaggedInjection,
          };
        }
      }
    }
    const content = (await session.page.content()) as string;
    const txt = htmlToText(content);
    const title = await session.page.title();
    return {
      logs,
      text: redactString(truncateText(txt.text, 10_000)),
      title: title || txt.title,
      url: session.page.url(),
      flaggedInjection: txt.flaggedInjection,
    };
  } catch (err) {
    log.warn('browser step failed', { err: String(err) });
    throw err instanceof ForgeRuntimeError
      ? err
      : new ForgeRuntimeError({ class: 'tool_error', message: String(err), retryable: true });
  } finally {
    await session.close();
  }
};
