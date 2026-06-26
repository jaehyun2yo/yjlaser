import 'reflect-metadata';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { GoogleDriveStorageProvider } from '../google-drive-storage.provider';

function makeProvider(): GoogleDriveStorageProvider {
  const provider = new GoogleDriveStorageProvider({
    get: jest.fn(),
  } as never);
  const auth = {
    getClient: jest.fn().mockResolvedValue({
      getRequestHeaders: jest.fn().mockResolvedValue(new Headers({ Authorization: 'Bearer test' })),
    }),
  };
  const state = provider as unknown as {
    auth: typeof auth;
    drive: Record<string, never>;
    sharedDriveId: string;
  };
  state.auth = auth;
  state.drive = {};
  state.sharedDriveId = 'shared-drive';
  return provider;
}

function makeBatchResponse(boundary: string): string {
  return [
    `--${boundary}`,
    'Content-Type: application/http',
    'Content-ID: <response-item-0>',
    '',
    'HTTP/1.1 200 OK',
    'Content-Type: application/json; charset=UTF-8',
    '',
    '{"id":"drive-a"}',
    `--${boundary}`,
    'Content-Type: application/http',
    'Content-ID: <response-item-1>',
    '',
    'HTTP/1.1 404 Not Found',
    'Content-Type: application/json; charset=UTF-8',
    '',
    '{"error":{"message":"missing file"}}',
    `--${boundary}--`,
  ].join('\r\n');
}

describe('GoogleDriveStorageProvider batch file operations', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('moves multiple files through one Drive batch request and returns per-file status', async () => {
    const provider = makeProvider();
    const responseBoundary = 'response_batch';
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(makeBatchResponse(responseBoundary), {
        status: 200,
        headers: { 'Content-Type': `multipart/mixed; boundary=${responseBoundary}` },
      })
    );
    global.fetch = fetchMock;

    const result = await provider.moveFiles([
      {
        storageFileId: 'drive-a',
        fromParentStorageFolderId: 'source-a',
        toParentStorageFolderId: 'target',
      },
      {
        storageFileId: 'drive-b',
        fromParentStorageFolderId: 'source-b',
        toParentStorageFolderId: 'target',
      },
    ]);

    expect(result).toEqual([
      { storageFileId: 'drive-a', success: true, status: 200 },
      { storageFileId: 'drive-b', success: false, status: 404, error: 'missing file' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(request.body);
    expect(body).toContain('PATCH /drive/v3/files/drive-a?');
    expect(body).toContain('PATCH /drive/v3/files/drive-b?');
    expect(body).toContain('removeParents=source-a');
    expect(request.headers).toMatchObject({
      authorization: 'Bearer test',
    });
  });

  it('uses the Google Drive provider identity', () => {
    expect(makeProvider().provider).toBe(StorageProvider.GOOGLE_DRIVE);
  });

  it('blocks permanent delete without explicit approval', async () => {
    const provider = makeProvider();
    const deleteMock = jest.fn();
    const state = provider as unknown as {
      drive: { files: { delete: jest.Mock } };
    };
    state.drive = {
      files: {
        delete: deleteMock,
      },
    };

    await expect(provider.deleteFile({ storageFileId: 'drive-file-1' })).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('blocks permanent delete when the Drive item is not already trashed', async () => {
    const provider = makeProvider();
    const getMock = jest.fn().mockResolvedValue({ data: { id: 'drive-file-1', trashed: false } });
    const deleteMock = jest.fn();
    const state = provider as unknown as {
      drive: { files: { get: jest.Mock; delete: jest.Mock } };
    };
    state.drive = {
      files: {
        get: getMock,
        delete: deleteMock,
      },
    };

    await expect(
      provider.deleteFile({ storageFileId: 'drive-file-1', permanentDeleteApproved: true })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(getMock).toHaveBeenCalledWith({
      fileId: 'drive-file-1',
      fields: 'id,trashed',
      supportsAllDrives: true,
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('permanently deletes only an approved trashed Drive item', async () => {
    const provider = makeProvider();
    const getMock = jest.fn().mockResolvedValue({ data: { id: 'drive-file-1', trashed: true } });
    const deleteMock = jest.fn().mockResolvedValue({ data: {} });
    const state = provider as unknown as {
      drive: { files: { get: jest.Mock; delete: jest.Mock } };
    };
    state.drive = {
      files: {
        get: getMock,
        delete: deleteMock,
      },
    };

    await expect(
      provider.deleteFile({ storageFileId: 'drive-file-1', permanentDeleteApproved: true })
    ).resolves.toBeUndefined();

    expect(deleteMock).toHaveBeenCalledWith({
      fileId: 'drive-file-1',
      supportsAllDrives: true,
    });
    expect(getMock).toHaveBeenCalledWith({
      fileId: 'drive-file-1',
      fields: 'id,trashed',
      supportsAllDrives: true,
    });
  });

  it('maps Drive auth boundary failures to a retryable service-unavailable error', async () => {
    const provider = makeProvider();
    const state = provider as unknown as {
      drive: { files: { generateIds: jest.Mock } };
    };
    state.drive = {
      files: {
        generateIds: jest.fn().mockRejectedValue(new Error('Unexpected Gaxios Error')),
      },
    };

    await expect(provider.generateIds(1)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
