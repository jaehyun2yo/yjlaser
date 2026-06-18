import { ZipService } from './zip.service';

describe('ZipService', () => {
  it('creates an archive with the runtime archiver import', async () => {
    const service = new ZipService({} as never);
    const archive = await service.createZipStream([]);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve());
      archive.on('error', reject);
      archive.resume();
    });

    expect(Buffer.concat(chunks).subarray(0, 2).toString('utf8')).toBe('PK');
  });
});
