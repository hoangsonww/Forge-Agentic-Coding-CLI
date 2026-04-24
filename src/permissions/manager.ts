/**
 * Permission manager — single source of truth for whether a tool invocation
 * proceeds. Default-deny; high-risk actions ALWAYS ask even with
 * --skip-permissions; trust calibration can auto-allow low-risk after N
 * confirmations.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import chalk from 'chalk';
import { chooseNumbered } from '../cli/choose';
import { PermissionRequest, PermissionDecision } from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { loadPermissionGrants, savePermissionGrant, PermissionRow } from '../persistence/index-db';
import { shouldAlwaysAsk } from './risk';
import { log } from '../logging/logger';
import { loadGlobalConfig } from '../config/loader';
import { currentHost } from '../core/interactive-host';

type SessionMemory = {
  // `tool` -> `scope` (once|session|...)
  grants: Map<string, string>;
  // `tool` -> count of successful auto-grants (used for trust calibration)
  approvals: Map<string, number>;
  denyCache: Set<string>;
};

const session: SessionMemory = {
  grants: new Map(),
  approvals: new Map(),
  denyCache: new Set(),
};

export interface PermissionFlags {
  skipRoutine?: boolean;
  allowFiles?: boolean;
  allowShell?: boolean;
  allowNetwork?: boolean;
  allowWeb?: boolean;
  allowMcp?: boolean;
  strict?: boolean;
  nonInteractive?: boolean;
}

const checkBlanketFlags = (
  req: PermissionRequest,
  flags: PermissionFlags,
): PermissionDecision | null => {
  if (flags.strict) return null; // fall through to normal prompt
  if (req.sideEffect === 'write' && flags.allowFiles) return 'allow_session';
  if (req.sideEffect === 'execute' && flags.allowShell) return 'allow_session';
  if (req.sideEffect === 'network') {
    if (req.tool.startsWith('web.') && flags.allowWeb) return 'allow_session';
    if (req.tool.startsWith('mcp.') && flags.allowMcp) return 'allow_session';
    if (flags.allowNetwork) return 'allow_session';
  }
  return null;
};

const tryCachedGrant = (req: PermissionRequest): PermissionDecision | null => {
  // Session cache
  const sessionKey = req.tool;
  const cached = session.grants.get(sessionKey);
  if (cached === 'session' || cached === 'project' || cached === 'global') {
    return 'allow_session';
  }

  // Persistent grants (project + global scopes)
  const grants: PermissionRow[] = loadPermissionGrants(req.tool, req.projectId);
  for (const g of grants) {
    if (g.scope === 'global' || g.scope === 'project') {
      return 'allow_session';
    }
  }
  return null;
};

const promptUser = async (req: PermissionRequest): Promise<PermissionDecision> => {
  const header = chalk.bold.yellow('🔐 Permission required');
  const risk = chalk.dim(`[${req.risk}/${req.sideEffect}]`);
  process.stdout.write(
    `\n${header} ${risk}\n  tool:   ${chalk.cyan(req.tool)}\n  action: ${req.action}\n${
      req.target ? `  target: ${req.target}\n` : ''
    }`,
  );

  // Color choices so digit hotkeys feel obvious (green = allow family,
  // red = deny). `allow_project` appears only for medium/low risk since
  // a persistent grant on a `high`/`critical` tool is too sharp an edge.
  const choices: Array<{
    title: string;
    value: PermissionDecision | 'allow_project';
    color?: 'green' | 'red' | 'yellow' | 'cyan';
    hint?: string;
  }> = [
    { title: 'Allow once', value: 'allow', color: 'green' },
    { title: 'Allow for this session', value: 'allow_session', color: 'green' },
  ];
  if (req.risk !== 'critical' && req.risk !== 'high') {
    choices.push({
      title: 'Allow for this project',
      value: 'allow_project',
      color: 'cyan',
      hint: '(remember)',
    });
  }
  choices.push({ title: 'Deny', value: 'deny', color: 'red' });

  const value = await chooseNumbered({ message: 'Decision', choices, initial: 0 });
  if (!value) return 'deny';
  if (value === 'allow_project') {
    savePermissionGrant({
      tool: req.tool,
      project_id: req.projectId,
      scope: 'project',
      granted_at: new Date().toISOString(),
      expires_at: null,
    });
    return 'allow_session';
  }
  return value as PermissionDecision;
};

export const requestPermission = async (
  req: PermissionRequest,
  flags: PermissionFlags = {},
): Promise<PermissionDecision> => {
  // Blocked critical risk: even strict approval mode should surface, but we
  // still prompt if interactive — operator must acknowledge.
  if (session.denyCache.has(req.tool)) {
    return 'deny';
  }

  // Delegate to the interactive host first (UI / custom frontends).
  const host = currentHost();
  if (host) {
    const decision = await host.requestPermission(req, flags);
    if (decision === 'allow' || decision === 'allow_session') {
      session.grants.set(req.tool, decision === 'allow' ? 'once' : 'session');
      session.approvals.set(req.tool, (session.approvals.get(req.tool) ?? 0) + 1);
    } else if (decision === 'deny') {
      session.denyCache.add(req.tool);
    }
    return decision;
  }

  const blanket = checkBlanketFlags(req, flags);
  if (blanket && !shouldAlwaysAsk({ risk: req.risk, sideEffect: req.sideEffect }, true)) {
    return blanket;
  }

  // Cached decision — an explicit "Allow for session/project/global" from
  // the user is a first-class authorization and MUST be honored on
  // subsequent calls. The old `!shouldAlwaysAsk` gate here was double-
  // counting: it treated every `execute`/`network` tool as "always ask"
  // even after the user had explicitly granted it, so users saw the same
  // prompt 3+ times and their grant never took effect. Only `critical`
  // risk should ignore the cache — those must re-confirm every call.
  const cached = tryCachedGrant(req);
  if (cached && req.risk !== 'critical') {
    return cached;
  }

  const cfg = loadGlobalConfig();
  const trustThreshold = cfg.permissions.trust.autoAllowAfter;
  const approvals = session.approvals.get(req.tool) ?? 0;
  if (
    !shouldAlwaysAsk({ risk: req.risk, sideEffect: req.sideEffect }, true) &&
    flags.skipRoutine &&
    approvals >= trustThreshold
  ) {
    log.debug('trust-calibration auto-allow', { tool: req.tool, approvals });
    return 'allow_session';
  }

  // At this point we need to prompt (or we're non-interactive).
  if (flags.nonInteractive) {
    if (req.risk === 'low' && flags.skipRoutine) return 'allow_session';
    log.warn('permission denied: non-interactive', { tool: req.tool, risk: req.risk });
    return 'deny';
  }

  const decision = await promptUser(req);
  if (decision === 'allow' || decision === 'allow_session') {
    session.grants.set(req.tool, decision === 'allow' ? 'once' : 'session');
    session.approvals.set(req.tool, approvals + 1);
  } else if (decision === 'deny') {
    session.denyCache.add(req.tool);
  }
  return decision;
};

export const assertAllowed = async (
  req: PermissionRequest,
  flags: PermissionFlags = {},
): Promise<void> => {
  const d = await requestPermission(req, flags);
  if (d === 'deny' || d === 'ask') {
    throw new ForgeRuntimeError({
      class: 'permission_denied',
      message: `Permission denied for ${req.tool} (${req.action}).`,
      retryable: false,
    });
  }
};

export const clearSession = (): void => {
  session.grants.clear();
  session.approvals.clear();
  session.denyCache.clear();
};
