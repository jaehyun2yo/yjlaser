import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SCOPES = ['src/app/webhard', 'src/app/(admin)', 'src/lib/styles'];
const BANNED_STYLE_PATTERN = /dark:|#ED6C00|#d15f00|#ff8533/i;

function gitLines(args: string[]): string[] {
  const output = execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getChangedScopedFiles(): string[] {
  const tracked = gitLines(['diff', '--name-only', '--', ...SCOPES]);
  const untracked = gitLines(['ls-files', '--others', '--exclude-standard', '--', ...SCOPES]);
  return [...new Set([...tracked, ...untracked])].filter((relativePath) => {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    return existsSync(absolutePath) && statSync(absolutePath).isFile();
  });
}

describe('Design System: changed-file static gate', () => {
  it('blocks dark: and raw brand hex in changed admin/webhard/style files', () => {
    const violations = getChangedScopedFiles().flatMap((relativePath) => {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      const content = readFileSync(absolutePath, 'utf8');
      return content
        .split(/\r?\n/)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => BANNED_STYLE_PATTERN.test(line))
        .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}: ${line.trim()}`);
    });

    expect(violations).toEqual([]);
  });
});
