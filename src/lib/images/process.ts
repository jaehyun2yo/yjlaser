import { buildVariantKeys, uploadBufferToR2 } from '@/lib/r2/upload';

export type ImageVariants = {
  thumb: string;
  medium: string;
  original: string;
};

// sharp를 동적으로 import하여 에러 처리
async function getSharp() {
  try {
    const sharp = await import('sharp');
    return sharp.default;
  } catch (error) {
    throw new Error(
      `Failed to load sharp module. Please ensure sharp is installed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function createAndUploadVariants(file: File): Promise<ImageVariants> {
  const arrayBuffer = await file.arrayBuffer();
  const input = Buffer.from(arrayBuffer);

  const contentType = file.type || 'image/jpeg';
  const keys = buildVariantKeys(file.name);

  // sharp 모듈 동적 로드
  const sharp = await getSharp();

  // Generate thumb (width ~320)
  const thumbBuf = await sharp(input)
    .rotate()
    .resize({ width: 320, withoutEnlargement: true })
    .toFormat('webp', { quality: 60 })
    .toBuffer();
  // Generate medium (width ~800)
  const mediumBuf = await sharp(input)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .toFormat('webp', { quality: 70 })
    .toBuffer();

  // Upload
  const [thumb, medium, original] = await Promise.all([
    uploadBufferToR2(thumbBuf, 'image/webp', keys.thumb.replace(/\.[^.]+$/, '.webp')),
    uploadBufferToR2(mediumBuf, 'image/webp', keys.medium.replace(/\.[^.]+$/, '.webp')),
    uploadBufferToR2(input, contentType, keys.original),
  ]);

  return {
    thumb: thumb.url,
    medium: medium.url,
    original: original.url,
  };
}
