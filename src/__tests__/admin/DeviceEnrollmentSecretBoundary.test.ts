import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'src', 'app', '(admin)', 'admin', 'integration', 'devices');

describe('Device enrollment code secret boundary', () => {
  it('keeps enrollment code handling outside browser storage, query caches, logs, and toasts', () => {
    const apiSource = readFileSync(join(sourceRoot, '_lib', 'device-enrollment-api.ts'), 'utf8');
    const panelSource = readFileSync(
      join(sourceRoot, '_components', 'DeviceEnrollmentPanel.tsx'),
      'utf8'
    );
    const managementPanelSource = readFileSync(
      join(sourceRoot, '_components', 'DeviceManagementPanel.tsx'),
      'utf8'
    );
    const source = `${apiSource}\n${panelSource}\n${managementPanelSource}`;

    expect(source).not.toMatch(
      /localStorage|sessionStorage|queryClient|useMutation|logger|console\./
    );
    expect(source).not.toMatch(/useSearchParams|URLSearchParams|window\.location/);
    expect(source).not.toMatch(/toast\(/i);
    expect(managementPanelSource).not.toMatch(/computeroff/i);
    expect(managementPanelSource).not.toMatch(
      /refreshCredential|accessToken|credentialHash|actorHash|enrollmentCode/i
    );
    expect(apiSource).toContain('assertOnlyAllowedKeys');
    expect(apiSource).not.toMatch(/return\s+\{\s*\.\.\./);
  });
});
