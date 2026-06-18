import { StorageProvider } from '@prisma/client';

const DRIVE_REFERENCE_PREFIX = 'storage://google_drive/';
const R2_REFERENCE_PREFIX = 'storage://r2/';

export interface ParsedStorageReference {
  provider: StorageProvider;
  idOrKey: string;
}

export function toDriveReference(driveFileId: string): string {
  return `${DRIVE_REFERENCE_PREFIX}${encodeURIComponent(driveFileId)}`;
}

export function toR2Reference(key: string): string {
  return `${R2_REFERENCE_PREFIX}${encodeURIComponent(key)}`;
}

export function parseStorageReference(value: string): ParsedStorageReference {
  if (value.startsWith(DRIVE_REFERENCE_PREFIX)) {
    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      idOrKey: decodeURIComponent(value.slice(DRIVE_REFERENCE_PREFIX.length)),
    };
  }

  if (value.startsWith(R2_REFERENCE_PREFIX)) {
    return {
      provider: StorageProvider.R2,
      idOrKey: decodeURIComponent(value.slice(R2_REFERENCE_PREFIX.length)),
    };
  }

  return {
    provider: StorageProvider.R2,
    idOrKey: value,
  };
}
