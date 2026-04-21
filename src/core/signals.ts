/**
 * Signal + abort plumbing. The loop subscribes at start; tool executions
 * can poll `shouldAbort()` for cooperative cancellation. SIGINT/SIGTERM
 * set the abort flag; a second SIGINT within 3s exits immediately.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
let aborting = false;
let abortReason = '';
let lastSigint = 0;

const onSigint = () => {
  if (aborting && Date.now() - lastSigint < 3000) {
    process.stderr.write('\n[forge] second ^C within 3s — exiting now\n');
    process.exit(130);
  }
  aborting = true;
  abortReason = 'SIGINT';
  lastSigint = Date.now();
  process.stderr.write(
    '\n[forge] ^C received — draining current step; press again to force-exit\n',
  );
};

const onSigterm = () => {
  aborting = true;
  abortReason = 'SIGTERM';
};

let installed = false;
export const installSignalHandlers = (): void => {
  if (installed) return;
  installed = true;
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
};

export const shouldAbort = (): boolean => aborting;
export const getAbortReason = (): string => abortReason;
export const resetAbort = (): void => {
  aborting = false;
  abortReason = '';
};
