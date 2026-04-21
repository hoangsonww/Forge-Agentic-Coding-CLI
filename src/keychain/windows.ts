/**
 * Windows Credential Manager integration via `cmdkey` + PowerShell. Only
 * active when process.platform === 'win32'. Follows the same
 * service/account key layout as the macOS/Linux paths.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { spawnSync } from 'child_process';

const PREFIX = 'ForgeCLI:';

export const isWindowsKeychainAvailable = (): boolean => {
  if (process.platform !== 'win32') return false;
  const r = spawnSync('cmdkey', ['/list'], { encoding: 'utf8' });
  return r.status === 0;
};

export const winSet = (service: string, account: string, value: string): boolean => {
  const target = `${PREFIX}${service}`;
  // `cmdkey /add` requires /pass:<plaintext> which isn't ideal. Prefer
  // PowerShell + Windows.Security.Credentials when available.
  const ps = `
    $null = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try { $existing = $vault.Retrieve('${target}', '${account}'); $vault.Remove($existing) } catch {}
    $cred = New-Object Windows.Security.Credentials.PasswordCredential('${target}', '${account}', '${value.replace(/'/g, "''")}')
    $vault.Add($cred)
  `;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return r.status === 0;
};

export const winGet = (service: string, account: string): string | null => {
  const target = `${PREFIX}${service}`;
  const ps = `
    $null = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try {
      $cred = $vault.Retrieve('${target}', '${account}')
      $cred.RetrievePassword()
      Write-Output $cred.Password
    } catch { exit 1 }
  `;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const value = r.stdout.trim();
  return value || null;
};

export const winDelete = (service: string, account: string): boolean => {
  const target = `${PREFIX}${service}`;
  const ps = `
    $null = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
    $vault = New-Object Windows.Security.Credentials.PasswordVault
    try {
      $cred = $vault.Retrieve('${target}', '${account}')
      $vault.Remove($cred)
    } catch { exit 1 }
  `;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return r.status === 0;
};
