/**
 * Initializes and registers all default tools.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { registerTool } from './registry';
import { readFileTool } from './read-file';
import { writeFileTool } from './write-file';
import { listDirTool } from './list-dir';
import { grepTool } from './grep';
import { globTool } from './glob';
import { runCommandTool } from './run-command';
import { applyPatchTool } from './apply-patch';
import { runTestsTool } from './run-tests';
import { askUserTool } from './ask-user';
import { gitStatusTool, gitDiffTool, gitBranchTool } from './git';
import { webSearchTool } from './web-search';
import { webFetchTool } from './web-fetch';
import { webBrowseTool } from './web-browse';
import { editFileTool } from './edit-file';
import { moveFileTool } from './move-file';
import { deleteFileTool } from './delete-file';

let initialized = false;

export const initTools = (): void => {
  if (initialized) return;
  registerTool(readFileTool);
  registerTool(writeFileTool);
  registerTool(listDirTool);
  registerTool(grepTool);
  registerTool(globTool);
  registerTool(runCommandTool);
  registerTool(applyPatchTool);
  registerTool(runTestsTool);
  registerTool(askUserTool);
  registerTool(gitStatusTool);
  registerTool(gitDiffTool);
  registerTool(gitBranchTool);
  registerTool(webSearchTool);
  registerTool(webFetchTool);
  registerTool(webBrowseTool);
  registerTool(editFileTool);
  registerTool(moveFileTool);
  registerTool(deleteFileTool);
  initialized = true;
};

export const DEFAULT_TOOL_NAMES = [
  'read_file',
  'write_file',
  'list_dir',
  'grep',
  'glob',
  'run_command',
  'apply_patch',
  'run_tests',
  'git_status',
  'git_diff',
  'git_branch',
  'ask_user',
  'web.search',
  'web.fetch',
  'web.browse',
  'edit_file',
  'move_file',
  'delete_file',
];
