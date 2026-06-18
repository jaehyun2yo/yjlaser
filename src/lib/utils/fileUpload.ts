// 파일 업로드 유틸리티

import { uploadBufferToR2 } from '@/lib/r2/upload';

export interface FileUploadResult {
  url?: string;
  filename?: string;
  buffer?: Buffer;
}

/**
 * 단일 파일을 R2에 업로드
 */
export async function uploadFileToR2(
  file: File,
  folder:
    | 'attachments'
    | 'drawings'
    | 'reference-photos'
    | 'revision-requests'
    | 'companies'
    | 'webhard',
  index?: number
): Promise<FileUploadResult> {
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 10);
    const filename =
      index !== undefined
        ? `${timestamp}-${randomId}-${index}-${file.name}`
        : `${timestamp}-${randomId}-${file.name}`;

    let objectKey: string;
    if (folder === 'companies') {
      objectKey = `companies/${filename}`;
    } else if (folder === 'webhard') {
      objectKey = `webhard/${filename}`;
    } else {
      objectKey = `contacts/${folder}/${filename}`;
    }
    const { url } = await uploadBufferToR2(
      buffer,
      file.type || (folder === 'reference-photos' ? 'image/jpeg' : 'application/octet-stream'),
      objectKey
    );

    return { url, filename: file.name, buffer };
  } catch {
    return { filename: file.name };
  }
}

/**
 * 여러 파일을 병렬로 업로드
 */
export async function uploadFilesInParallel(
  files: File[],
  folder: 'attachments' | 'drawings' | 'reference-photos'
): Promise<FileUploadResult[]> {
  const uploadPromises = files
    .filter((file) => file && file.size > 0)
    .map((file, index) => uploadFileToR2(file, folder, index));

  return Promise.all(uploadPromises);
}
