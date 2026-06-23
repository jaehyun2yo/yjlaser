/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

const productionFiles = [
  'src/lib/utils/logger.ts',
  'src/components/DownloadButton.tsx',
  'src/lib/auth/session.ts',
  'src/lib/auth/api-key.ts',
  'src/lib/auth/adminGuard.ts',
  'src/lib/api/nestjs/core.client.ts',
  'src/app/actions/contacts.ts',
  'src/app/(admin)/admin/_components/DashboardSessions.tsx',
  'src/lib/activity-logger.ts',
  'src/app/actions/webhard-folder-upload.ts',
  'webhard-api/src/storage/google-drive-storage.provider.ts',
  'webhard-api/src/sessions/sessions.service.ts',
];

const riskPatterns = [
  {
    name: 'console.log',
    pattern: /console\.log/i,
  },
  {
    name: 'sensitive logger line',
    pattern:
      /logger\.(debug|info|warn|warning|error)\([^\r\n]*(password|token|api[_-]?key|secret|session|cookie|authorization|presigned|service_role|private_key)/i,
  },
  {
    name: 'raw path logger line',
    pattern: /logger\.(debug|info|warn|warning|error)\([^\r\n]*(filePath|folderPath|path)/i,
  },
];

function readProjectFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

describe('logging risk contract', () => {
  it.each(productionFiles)('%s has no scanner-risk logger lines', (relativePath) => {
    const source = readProjectFile(relativePath);

    for (const { name, pattern } of riskPatterns) {
      expect(source).not.toMatch(pattern);
      if (pattern.test(source)) {
        throw new Error(`${relativePath} still contains ${name}`);
      }
    }
  });

  it('central info logs use console.info and redact sensitive fields', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    jest.resetModules();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const { logger } = jest.requireActual(
        '@/lib/utils/logger'
      ) as typeof import('@/lib/utils/logger');
      logger.createLogger('CONTRACT').info('event', {
        apiKey: 'raw-api-key',
        nested: { password: 'raw-password' },
        message: 'fetch failed: https://example.test/download?token=raw-token&x=1',
        rawText: 'bearer abcdefghijklmnopqrstuvwxyz',
        rawJson: '{"access_token":"raw-json-token","ok":true}',
        count: 1,
      });

      expect(infoSpy).toHaveBeenCalledWith('[INFO] [CONTRACT] event', {
        apiKey: '[REDACTED]',
        nested: { password: '[REDACTED]' },
        message: 'fetch failed: https://example.test/download?token=[REDACTED]&x=1',
        rawText: 'bearer [REDACTED]',
        rawJson: '{"access_token":"[REDACTED]","ok":true}',
        count: 1,
      });
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      infoSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
