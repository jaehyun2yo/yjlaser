/**
 * @jest-environment node
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_ROOTS = ['src', 'webhard-api/src', 'middleware.ts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

type AddedLine = {
  relativePath: string;
  line: string;
  lineNumber?: number;
};

function gitLines(args: string[]): string[] {
  const output = execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

function isProductionSource(relativePath: string): boolean {
  const normalizedPath = normalizePath(relativePath);
  const extension = path.extname(normalizedPath);

  return (
    SOURCE_EXTENSIONS.has(extension) &&
    !normalizedPath.includes('/__tests__/') &&
    !normalizedPath.includes('/tests/') &&
    !normalizedPath.endsWith('.test.ts') &&
    !normalizedPath.endsWith('.test.tsx') &&
    !normalizedPath.endsWith('.spec.ts') &&
    !normalizedPath.endsWith('.spec.tsx') &&
    !normalizedPath.endsWith('.d.ts')
  );
}

function formatViolation({ relativePath, line, lineNumber }: AddedLine): string {
  const location = lineNumber ? `${relativePath}:${lineNumber}` : relativePath;
  return `${location}: ${line.trim()}`;
}

function parseAddedLinesFromDiff(args: string[]): AddedLine[] {
  const diff = execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const addedLines: AddedLine[] = [];
  let currentPath = '';
  let currentLineNumber: number | undefined;

  for (const rawLine of diff.split(/\r?\n/)) {
    if (rawLine.startsWith('+++ b/')) {
      currentPath = normalizePath(rawLine.slice('+++ b/'.length));
      currentLineNumber = undefined;
      continue;
    }

    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLineNumber = Number(hunkMatch[1]);
      continue;
    }

    if (!currentPath || !isProductionSource(currentPath)) {
      continue;
    }

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      addedLines.push({
        relativePath: currentPath,
        line: rawLine.slice(1),
        lineNumber: currentLineNumber,
      });
      currentLineNumber = currentLineNumber === undefined ? undefined : currentLineNumber + 1;
      continue;
    }

    if (!rawLine.startsWith('-') && currentLineNumber !== undefined) {
      currentLineNumber += 1;
    }
  }

  return addedLines;
}

function getUntrackedProductionFiles(): string[] {
  return gitLines(['ls-files', '--others', '--exclude-standard', '--', ...SOURCE_ROOTS]).filter(
    (relativePath) => {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      return (
        existsSync(absolutePath) &&
        statSync(absolutePath).isFile() &&
        isProductionSource(relativePath)
      );
    }
  );
}

function getAddedProductionLines(): AddedLine[] {
  const unstaged = parseAddedLinesFromDiff(['diff', '--unified=0', '--', ...SOURCE_ROOTS]);
  const staged = parseAddedLinesFromDiff([
    'diff',
    '--cached',
    '--unified=0',
    '--',
    ...SOURCE_ROOTS,
  ]);
  const untracked = getUntrackedProductionFiles().flatMap((relativePath) => {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    return readFileSync(absolutePath, 'utf8')
      .split(/\r?\n/)
      .map((line, index) => ({
        relativePath: normalizePath(relativePath),
        line,
        lineNumber: index + 1,
      }));
  });

  return [...unstaged, ...staged, ...untracked];
}

const RELATIVE_STATIC_IMPORT =
  /^\s*(?:import(?:\s+type)?(?:\s+[^'"]+\s+from\s+|\s*)|export(?:\s+type)?\s+[^'"]+\s+from\s+)['"]\./;
const RELATIVE_DYNAMIC_IMPORT = /\bimport\(\s*['"]\./;
const RAW_QUERY_KEY = /\bqueryKey\s*:\s*\[/;
const RAW_QUERY_KEY_CALL =
  /\b(?:useQuery|useInfiniteQuery|prefetchQuery|invalidateQueries|setQueryData|getQueryData|removeQueries|refetchQueries)\s*\(\s*\[/;
const EXPLICIT_ANY =
  /(?::\s*any\b|\bas\s+any\b|<\s*any\s*>|\bArray\s*<\s*any\s*>|\bRecord\s*<\s*string\s*,\s*any\s*>|\bany\[\])/;

describe('changed production lines static gates', () => {
  const addedProductionLines = getAddedProductionLines();

  it('does not add relative imports to frontend src files', () => {
    const violations = addedProductionLines
      .filter(({ relativePath }) => normalizePath(relativePath).startsWith('src/'))
      .filter(({ line }) => RELATIVE_STATIC_IMPORT.test(line) || RELATIVE_DYNAMIC_IMPORT.test(line))
      .map(formatViolation);

    expect(violations).toEqual([]);
  });

  it('does not add raw React Query keys in production code', () => {
    const violations = addedProductionLines
      .filter(({ relativePath }) => normalizePath(relativePath).startsWith('src/'))
      .filter(({ line }) => RAW_QUERY_KEY.test(line) || RAW_QUERY_KEY_CALL.test(line))
      .map(formatViolation);

    expect(violations).toEqual([]);
  });

  it('does not add explicit any in production TypeScript', () => {
    const violations = addedProductionLines
      .filter(({ line }) => EXPLICIT_ANY.test(line))
      .map(formatViolation);

    expect(violations).toEqual([]);
  });
});
