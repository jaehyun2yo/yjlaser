import { Injectable } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { Readable } from 'stream';
import * as archiver from 'archiver';
import type { Archiver } from 'archiver';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ZipService {
  constructor(private readonly storageService: StorageService) {}

  /**
   * 여러 파일을 ZIP 스트림으로 생성
   * @param files 파일 정보 배열
   * @returns ZIP 스트림 (Readable)
   */
  async createZipStream(
    files: Array<{
      path: string;
      originalName: string;
      storageProvider: StorageProvider;
      driveFileId: string | null;
    }>
  ): Promise<Archiver> {
    const archive = archiver('zip', { zlib: { level: 5 } });

    for (const file of files) {
      const download = await this.storageService.downloadWebhardFile({
        storageProvider: file.storageProvider,
        driveFileId: file.driveFileId,
        path: file.path,
      });

      if ('stream' in download) {
        archive.append(download.stream, { name: file.originalName });
      } else {
        const response = await fetch(download.url);
        if (!response.ok || !response.body) {
          continue;
        }
        const nodeStream = Readable.fromWeb(response.body as never);
        archive.append(nodeStream, { name: file.originalName });
      }
    }

    archive.finalize();
    return archive;
  }
}
