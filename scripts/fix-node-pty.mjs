// npm drops the executable bit on node-pty's prebuilt spawn-helper, which makes
// every terminal fail with "posix_spawnp failed" on macOS. Restore it.
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const prebuilds = path.join('node_modules', 'node-pty', 'prebuilds');
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, dir, 'spawn-helper');
    if (existsSync(helper)) {
      chmodSync(helper, 0o755);
      console.log(`node-pty: made ${helper} executable`);
    }
  }
}
