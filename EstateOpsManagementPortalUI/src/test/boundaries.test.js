// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/** Lints virtual files with the real project config to prove the architecture rules bite. */
// import/no-cycle needs real files on disk; it is exercised by `npm run lint` instead.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: { rules: { 'import/no-cycle': 'off' } },
});

async function violations(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.severity === 2).map((m) => m.message);
}

const CASES = [
  [
    'components cannot import data/',
    'src/features/inventory/components/Probe.jsx',
    "import { unitsRepository } from '../data/units.repository.js'; export default unitsRepository;",
    /data\/ is private/,
  ],
  [
    'hooks cannot import transports',
    'src/features/inventory/hooks/probe.js',
    "import { unitsRest } from '../data/transport/units.rest.js'; export default unitsRest;",
    /Hooks may import only/,
  ],
  [
    'hooks may import the repository',
    'src/features/inventory/hooks/probe.js',
    "import { unitsRepository } from '../data/units.repository.js'; export default unitsRepository;",
    null,
  ],
  [
    'pages cannot deep-import a feature',
    'src/pages/Probe.jsx',
    "import { x } from '@/features/inventory/hooks/useUnitsQuery.js'; export default x;",
    /through its index\.js/,
  ],
  [
    'only data/ may import shared/api',
    'src/shared/ui/Probe.jsx',
    "import { httpClient } from '@/shared/api/httpClient.js'; export default httpClient;",
    /Only features\/\*\/data/,
  ],
  [
    'app cannot import DTO mappers',
    'src/app/probe.js',
    "import { fromApi } from '@/shared/api/dtos/unit.mapper.js'; export default fromApi;",
    /Only features\/\*\/data/,
  ],
  [
    'import.meta.env is read only in config.js',
    'src/app/probe.js',
    'export default import.meta.env.VITE_X;',
    /shared\/config\/config\.js/,
  ],
  [
    'no ad-hoc role checks',
    'src/app/probe.js',
    "export default (user) => user.role === 'finance';",
    /No ad-hoc role checks/,
  ],
];

describe('architecture boundaries (ESLint)', () => {
  it.each(CASES)('%s', async (_name, filePath, code, expected) => {
    const messages = await violations(filePath, code);
    if (expected) expect(messages.join('\n')).toMatch(expected);
    else expect(messages).toEqual([]);
  });
});
