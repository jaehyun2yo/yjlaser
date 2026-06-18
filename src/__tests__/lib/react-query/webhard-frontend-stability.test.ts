import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();

function listFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(PROJECT_ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return listFiles(relativePath);
    }
    return [relativePath];
  });
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function findMatches(relativeDirs: string[], pattern: RegExp): string[] {
  return relativeDirs
    .flatMap((dir) => listFiles(dir))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/(\.test|\.spec)\.(ts|tsx)$/.test(file))
    .flatMap((file) => {
      const lines = readText(file).split(/\r?\n/);
      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => pattern.test(line))
        .map(({ index }) => `${file}:${index + 1}`);
    });
}

function findFileMatches(relativeDirs: string[], pattern: RegExp): string[] {
  return relativeDirs
    .flatMap((dir) => listFiles(dir))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/(\.test|\.spec)\.(ts|tsx)$/.test(file))
    .filter((file) => pattern.test(readText(file)));
}

describe('AUDIT-11/12/13 webhard frontend stability static gates', () => {
  it('production code does not use raw webhard React Query keys outside the key factory API', () => {
    const matches = findFileMatches(['src/app', 'src/lib'], /\[\s*['"]webhard['"]/m);

    expect(matches).toEqual([]);
  });

  it('uses only the active WebhardMain virtual list component in src/app/webhard/components', () => {
    const duplicateComponent = path.join(
      PROJECT_ROOT,
      'src/app/webhard/components/VirtualFileList.tsx'
    );

    expect(fs.existsSync(duplicateComponent)).toBe(false);
  });

  it('production recovery paths do not call window.location.reload()', () => {
    const matches = findMatches(
      ['src/app', 'src/components', 'src/lib'],
      /window\.location\.reload\(/
    );

    expect(matches).toEqual([]);
  });

  it('webhard company-info lookup failures are not swallowed by an empty catch block', () => {
    const matches = findMatches(
      ['src/app/webhard'],
      /\.catch\(\s*(?:\([^)]*\)|[^=()]+)?\s*=>\s*\{\s*\}\s*\)/
    );

    expect(matches).toEqual([]);
  });
});
