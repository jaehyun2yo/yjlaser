import { StorageProvider } from '@prisma/client';
import { Readable } from 'stream';

export interface CreateFolderInput {
  name: string;
  parentStorageFolderId: string | null;
  storageFolderId?: string;
}

export interface RenameFolderInput {
  storageFolderId: string;
  name: string;
}

export interface MoveFolderInput {
  storageFolderId: string;
  parentStorageFolderId: string | null;
}

export interface DeleteFolderInput {
  storageFolderId: string;
}

export interface CreateUploadSessionInput {
  fileName: string;
  mimeType: string;
  size: number;
  parentStorageFolderId: string;
  storageFileId?: string;
}

export interface UploadSessionResult {
  provider: StorageProvider;
  storageFileId: string;
  uploadUrl: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface ConfirmUploadedFileInput {
  storageFileId: string;
  expectedParentStorageFolderId: string;
}

export interface StorageFileMetadata {
  provider: StorageProvider;
  storageFileId: string;
  name: string;
  mimeType: string;
  size: number;
  parentStorageFolderIds: string[];
}

export interface UploadBufferInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentStorageFolderId: string;
  storageFileId?: string;
}

export type UploadBufferResult = StorageFileMetadata;

export interface DownloadFileInput {
  storageFileId: string;
}

export interface DownloadFileResult {
  stream: Readable;
  mimeType: string;
  size: number;
}

export interface RenameFileInput {
  storageFileId: string;
  name: string;
}

export interface MoveFileInput {
  storageFileId: string;
  toParentStorageFolderId: string;
  fromParentStorageFolderId?: string | null;
}

export type BatchMoveFileInput = MoveFileInput;

export interface TrashFileInput {
  storageFileId: string;
}

export type BatchTrashFileInput = TrashFileInput;

export interface BatchStorageFileOperationResult {
  storageFileId: string;
  success: boolean;
  status?: number;
  error?: string;
}

export interface RestoreFileInput {
  storageFileId: string;
}

export interface DeleteFileInput {
  storageFileId: string;
  /**
   * Hard delete must be set only after the caller has verified user approval
   * and that the logical record is already in trash.
   */
  permanentDeleteApproved?: boolean;
}

export interface StorageProviderClient {
  readonly provider: StorageProvider;
  generateIds(count: number): Promise<string[]>;
  createFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }>;
  renameFolder(input: RenameFolderInput): Promise<void>;
  moveFolder(input: MoveFolderInput): Promise<void>;
  deleteFolder(input: DeleteFolderInput): Promise<void>;
  createUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult>;
  confirmUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata>;
  uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult>;
  downloadFile(input: DownloadFileInput): Promise<DownloadFileResult>;
  renameFile(input: RenameFileInput): Promise<void>;
  moveFile(input: MoveFileInput): Promise<void>;
  moveFiles(inputs: BatchMoveFileInput[]): Promise<BatchStorageFileOperationResult[]>;
  trashFile(input: TrashFileInput): Promise<void>;
  trashFiles(inputs: BatchTrashFileInput[]): Promise<BatchStorageFileOperationResult[]>;
  restoreFile(input: RestoreFileInput): Promise<void>;
  deleteFile(input: DeleteFileInput): Promise<void>;
}
