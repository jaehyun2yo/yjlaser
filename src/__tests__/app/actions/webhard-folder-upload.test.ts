import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

function readProjectFile(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

describe('webhard folder upload memory boundary', () => {
  it('keeps folder upload file transfer on the browser direct-to-R2 path', () => {
    const modalSource = readProjectFile('src/app/webhard/components/FolderUploadModal.tsx');

    expect(modalSource).toContain("from '@/lib/utils/uploadQueue'");
    expect(modalSource).toContain('uploadFilesBatch');
    expect(modalSource).not.toContain('uploadFolderFileAction');
    expect(modalSource).not.toContain("formData.append('file'");
  });

  it('runs folder upload groups with bounded concurrency instead of serializing every folder', () => {
    const modalSource = readProjectFile('src/app/webhard/components/FolderUploadModal.tsx');

    expect(modalSource).toContain('runFolderUploadsWithConcurrency');
    expect(modalSource).not.toMatch(
      /for\s*\(const\s+\[folderId,\s*folderFiles\]\s+of\s+filesByFolderId\)\s*\{[\s\S]{0,800}?await uploadFilesBatch/
    );
  });

  it('does not allow the Server Action folder upload path to read file bytes into memory', () => {
    const actionSource = readProjectFile('src/app/actions/webhard-folder-upload.ts');

    expect(actionSource).not.toMatch(/\.arrayBuffer\s*\(/);
    expect(actionSource).not.toContain('Buffer.from');
    expect(actionSource).not.toContain('uploadBufferToR2');
  });
});
