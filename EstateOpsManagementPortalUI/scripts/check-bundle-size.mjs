// Bundle budget: fails CI if the initial (entry) chunk grows past the agreed gzip size.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGET_KB = 200;
const dir = path.resolve('dist/assets');
const entries = fs.readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f));
if (entries.length === 0) {
  console.error('No entry chunk found in dist/assets. Run `npm run build` first.');
  process.exit(1);
}
let failed = false;
for (const file of entries) {
  const kb = zlib.gzipSync(fs.readFileSync(path.join(dir, file))).length / 1024;
  const ok = kb <= BUDGET_KB;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${kb.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
