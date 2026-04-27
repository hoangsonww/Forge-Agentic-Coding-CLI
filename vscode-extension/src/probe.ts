/**
 * Lightweight probes — do we have the binary, is the UI listening?
 * No deps; pure Node `http` and `child_process`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as http from 'http';
import { execFile } from 'child_process';

export function probeUi(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, path: '/api/status', method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export function probeBinary(binary: string, timeoutMs = 4000): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = execFile(binary, ['--version'], { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      resolve({ ok: true, version: stdout.toString().trim() });
    });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}
