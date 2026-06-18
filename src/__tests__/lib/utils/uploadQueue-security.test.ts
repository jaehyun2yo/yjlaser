import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('uploadQueue direct upload memory contract', () => {
  it('streams browser File objects directly to R2 without materializing full buffers', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/utils/uploadQueue.ts'), 'utf8');

    expect(source).toContain('body: file');
    expect(source).toContain('file.slice');
    expect(source).not.toMatch(/\.arrayBuffer\s*\(/);
    expect(source).not.toContain('Buffer.from');
  });

  it('keeps batch upload bookkeeping linear for large folders', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/utils/uploadQueue.ts'), 'utf8');

    expect(source).not.toMatch(/files\.find\s*\(/);
    expect(source).toContain('filesByName');
  });

  it('passes the batch abort signal to every upload API request', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/utils/uploadQueue.ts'), 'utf8');

    expect(source).toMatch(/fetch\('\/api\/webhard\/upload\/batch'[\s\S]*?signal: batchSignal/);
    expect(source).toMatch(
      /fetch\('\/api\/webhard\/upload\/batch-complete'[\s\S]*?signal: batchSignal/
    );
  });

  it('does not route Google Drive resumable uploads through R2 multipart', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/utils/uploadQueue.ts'), 'utf8');

    expect(source).toContain(
      "storageProvider !== 'google_drive' && file.size >= MULTIPART_THRESHOLD"
    );
  });

  it('forwards signed Google Drive upload proof to batch-complete', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/utils/uploadQueue.ts'), 'utf8');

    expect(source).toContain('uploadProof');
    expect(source).toContain('driveUploadProof: f.driveUploadProof');
  });
});
