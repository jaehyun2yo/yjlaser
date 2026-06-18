/**
 * @jest-environment node
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const LITERAL_CLASS_INTERPOLATION = /className\s*=\s*"[^"\r\n]*\$\{/;

function getProductionSourceFiles(): string[] {
  const output = execFileSync('git', ['ls-files', 'src'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((relativePath) => SOURCE_EXTENSIONS.has(path.extname(relativePath)))
    .filter((relativePath) => !relativePath.includes('/__tests__/'))
    .filter((relativePath) => !relativePath.includes('\\__tests__\\'))
    .filter((relativePath) => !relativePath.endsWith('.test.ts'))
    .filter((relativePath) => !relativePath.endsWith('.test.tsx'))
    .filter((relativePath) => !relativePath.endsWith('.d.ts'));
}

describe('literal className interpolation static gate', () => {
  it('does not ship className strings that leave ${...} as literal Tailwind classes', () => {
    const violations = getProductionSourceFiles().flatMap((relativePath) => {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      return readFileSync(absolutePath, 'utf8')
        .split(/\r?\n/)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => LITERAL_CLASS_INTERPOLATION.test(line))
        .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}: ${line.trim()}`);
    });

    expect(violations.slice(0, 50)).toEqual([]);
  });
});
