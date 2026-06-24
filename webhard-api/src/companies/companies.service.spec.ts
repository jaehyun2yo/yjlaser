import { CompaniesService } from './companies.service';
import { StorageProvider } from '@prisma/client';

const makeCompany = () => ({
  id: 7,
  companyName: '승인대기 업체',
  username: 'pending-company',
  passwordHash: 'hash',
  businessRegistrationNumber: '123-45-67890',
  representativeName: '대표',
  businessType: null,
  businessCategory: null,
  businessAddress: '서울',
  businessRegistrationFileUrl: null,
  businessRegistrationFileName: null,
  managerName: '담당자',
  managerPosition: '팀장',
  managerPhone: '010-0000-0000',
  managerEmail: 'manager@example.com',
  accountantName: null,
  accountantPhone: null,
  accountantEmail: null,
  accountantFax: null,
  quoteMethodEmail: true,
  quoteMethodFax: false,
  quoteMethodSms: false,
  status: 'pending',
  webhardAccess: true,
  laserOnly: false,
  isApproved: false,
  approvedAt: null,
  approvedBy: null,
  driveRootFolderId: null,
  driveProvisioningStatus: 'READY' as const,
  driveProvisioningError: null,
  driveProvisioningLastAttemptAt: null,
  driveProvisionedAt: null,
  deletedAt: null,
  deletedBy: null,
  deletedPreviousStatus: null,
  deletedPreviousWebhardAccess: null,
  createdAt: new Date('2026-05-15T00:00:00.000Z'),
  updatedAt: new Date('2026-05-15T00:00:00.000Z'),
});

function makePrismaMock(company: Record<string, unknown> = makeCompany()) {
  return {
    executeWithRetry: jest.fn((operation: () => Promise<unknown>) => operation()),
    $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    company: {
      findUnique: jest.fn().mockResolvedValue(company),
      create: jest.fn().mockResolvedValue(company),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...company, ...data })
      ),
    },
    webhardFolder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    webhardFile: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    },
  };
}

describe('CompaniesService business registration Drive upload', () => {
  it('업체 관리자 전용 폴더 생성 시 folderKind 길이 제한을 넘지 않는다', async () => {
    const company = makeCompany();
    const prisma = makePrismaMock(company);
    prisma.company.findUnique.mockResolvedValueOnce(company);
    prisma.webhardFolder.findFirst
      .mockResolvedValueOnce({
        id: 'admin-root-folder',
        driveFolderId: 'admin-root-drive-folder',
      })
      .mockResolvedValueOnce(null);
    prisma.webhardFolder.create.mockResolvedValueOnce({
      id: 'admin-company-folder',
      driveFolderId: 'admin-company-drive-folder',
    });
    prisma.webhardFile.create.mockResolvedValueOnce({ id: 'business-file' });

    const storageService = {
      createDriveFolder: jest.fn().mockResolvedValue({
        storageFolderId: 'admin-company-drive-folder',
      }),
      uploadDriveBuffer: jest.fn().mockResolvedValue({
        storageFileId: 'business-drive-file',
        mimeType: 'application/pdf',
        size: 218,
      }),
    };

    const service = new CompaniesService(prisma as never, undefined, storageService as never);

    await service.uploadBusinessRegistrationToDrive(company.id, {
      originalname: 'business-registration.pdf',
      mimetype: 'application/pdf',
      size: 218,
      buffer: Buffer.from('pdf'),
    });

    expect(prisma.webhardFolder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        folderKind: expect.stringMatching(/^.{1,20}$/),
      }),
      select: { id: true, driveFolderId: true },
    });
    expect(prisma.webhardFolder.create.mock.calls[0]?.[0].data.folderKind).toBe('admin_private_co');
    expect(prisma.webhardFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        folderId: 'admin-company-folder',
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: 'business-drive-file',
      }),
    });
  });
});

describe('CompaniesService notifications', () => {
  it('업체 등록 후 승인 대기 상태이면 관리자 알림에 승인 필요로 표시한다', async () => {
    const company = makeCompany();
    const prisma = {
      executeWithRetry: jest.fn((operation: () => Promise<unknown>) => operation()),
      company: {
        create: jest.fn().mockResolvedValue(company),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
      },
    };
    const service = new CompaniesService(prisma as never);

    await service.create({
      companyName: company.companyName,
      username: company.username,
      passwordHash: company.passwordHash,
      businessRegistrationNumber: company.businessRegistrationNumber,
      representativeName: company.representativeName,
      businessAddress: company.businessAddress,
      managerName: company.managerName,
      managerPosition: company.managerPosition,
      managerPhone: company.managerPhone,
      managerEmail: company.managerEmail,
      quoteMethodEmail: true,
      quoteMethodFax: false,
      quoteMethodSms: false,
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userType: 'admin',
        type: 'company_approval_pending',
        title: '업체 승인 필요',
        message: '승인대기 업체 업체가 가입 승인을 기다리고 있습니다.',
        metadata: expect.objectContaining({
          companyId: company.id,
          status: 'pending',
          link: `/admin/integration/companies/${company.id}`,
        }),
      }),
    });
  });
});

describe('CompaniesService company delete/restore', () => {
  it('업체 삭제 시 매칭 웹하드 루트 폴더와 하위 항목을 업체 삭제 마커로 휴지통 이동한다', async () => {
    const company = makeCompany();
    const prisma = makePrismaMock(company);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'root-folder',
          name: company.companyName,
          parentId: null,
          companyId: company.id,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'drive-root-folder',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'root-folder', parentId: null },
        { id: 'child-folder', parentId: 'root-folder' },
      ]);
    const storageService = {
      trashDriveFolder: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompaniesService(prisma as never, undefined, storageService as never);

    const result = await service.deleteCompany(company.id, '99');

    expect(storageService.trashDriveFolder).toHaveBeenCalledWith({
      storageFolderId: 'drive-root-folder',
    });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: company.id },
      data: expect.objectContaining({
        status: 'deleted',
        webhardAccess: false,
        deletedBy: '99',
        deletedPreviousStatus: 'pending',
        deletedPreviousWebhardAccess: true,
      }),
    });
    expect(prisma.webhardFolder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['root-folder', 'child-folder'] }, deletedAt: null },
      data: expect.objectContaining({
        deletedBy: `company:${company.id}`,
      }),
    });
    expect(prisma.webhardFile.updateMany).toHaveBeenCalledWith({
      where: { folderId: { in: ['root-folder', 'child-folder'] }, deletedAt: null },
      data: expect.objectContaining({
        deletedBy: `company:${company.id}`,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        alreadyDeleted: false,
        foldersDeleted: 2,
        filesDeleted: 3,
      })
    );
  });

  it('업체 삭제 시 매칭 루트 폴더의 Drive id가 없으면 repair 로그를 남기고 DB 삭제를 계속한다', async () => {
    const company = makeCompany();
    const prisma = makePrismaMock(company);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'drive-root-folder-row',
          name: company.companyName,
          parentId: null,
          companyId: company.id,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'drive-root-folder',
        },
        {
          id: 'missing-drive-root-folder-row',
          name: company.companyName,
          parentId: null,
          companyId: company.id,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'drive-root-folder-row', parentId: null },
        { id: 'missing-drive-root-folder-row', parentId: null },
      ]);
    const storageService = {
      trashDriveFolder: jest.fn().mockResolvedValue(undefined),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompaniesService(
      prisma as never,
      undefined,
      storageService as never,
      storageRepairService as never
    );

    const result = await service.deleteCompany(company.id, '99');

    expect(storageService.trashDriveFolder).toHaveBeenCalledTimes(1);
    expect(storageService.trashDriveFolder).toHaveBeenCalledWith({
      storageFolderId: 'drive-root-folder',
    });
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'trash',
        storageProvider: 'google_drive',
        webhardFolderId: 'missing-drive-root-folder-row',
        actualDriveState: expect.objectContaining({
          skipped: true,
          reason: 'missing_drive_folder_id',
        }),
      })
    );
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: company.id },
      data: expect.objectContaining({
        status: 'deleted',
        webhardAccess: false,
      }),
    });
    expect(prisma.webhardFolder.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['drive-root-folder-row', 'missing-drive-root-folder-row'] },
        deletedAt: null,
      },
      data: expect.objectContaining({
        deletedBy: `company:${company.id}`,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        alreadyDeleted: false,
        foldersDeleted: 2,
        filesDeleted: 3,
      })
    );
  });

  it('업체 삭제 시 Drive 폴더가 이미 없으면 repair 로그를 남기고 DB 삭제를 계속한다', async () => {
    const company = makeCompany();
    const prisma = makePrismaMock(company);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'root-folder',
          name: company.companyName,
          parentId: null,
          companyId: company.id,
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'missing-drive-folder',
        },
      ])
      .mockResolvedValueOnce([{ id: 'root-folder', parentId: null }]);
    const driveMissingError = Object.assign(new Error('File not found'), { code: 404 });
    const storageService = {
      trashDriveFolder: jest.fn().mockRejectedValue(driveMissingError),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompaniesService(
      prisma as never,
      undefined,
      storageService as never,
      storageRepairService as never
    );

    const result = await service.deleteCompany(company.id, '99');

    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'trash',
        storageProvider: 'google_drive',
        driveFolderId: 'missing-drive-folder',
        webhardFolderId: 'root-folder',
        actualDriveState: expect.objectContaining({
          skipped: true,
          reason: 'drive_folder_not_found',
          status: 404,
        }),
      })
    );
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: company.id },
      data: expect.objectContaining({
        status: 'deleted',
        webhardAccess: false,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        alreadyDeleted: false,
        foldersDeleted: 2,
        filesDeleted: 3,
      })
    );
  });

  it('업체 복구 시 30일 이내 업체 삭제 마커가 있는 웹하드 항목만 복구한다', async () => {
    const company = {
      ...makeCompany(),
      status: 'deleted',
      webhardAccess: false,
      deletedAt: new Date('2026-06-01T00:00:00.000Z'),
      deletedBy: '99',
      deletedPreviousStatus: 'active',
      deletedPreviousWebhardAccess: true,
    };
    const prisma = makePrismaMock(company);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'root-folder',
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'drive-root-folder',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'root-folder', parentId: null },
        { id: 'child-folder', parentId: 'root-folder' },
      ]);
    const storageService = {
      restoreDriveFolder: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompaniesService(prisma as never, undefined, storageService as never);

    const result = await service.restoreCompany(company.id);

    expect(storageService.restoreDriveFolder).toHaveBeenCalledWith({
      storageFolderId: 'drive-root-folder',
    });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: company.id },
      data: expect.objectContaining({
        status: 'active',
        webhardAccess: true,
        deletedAt: null,
        deletedBy: null,
        deletedPreviousStatus: null,
        deletedPreviousWebhardAccess: null,
      }),
    });
    expect(prisma.webhardFolder.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['root-folder', 'child-folder'] },
        deletedBy: `company:${company.id}`,
        deletedAt: { not: null },
      },
      data: expect.objectContaining({
        deletedAt: null,
        deletedBy: null,
      }),
    });
    expect(prisma.webhardFile.updateMany).toHaveBeenCalledWith({
      where: {
        folderId: { in: ['root-folder', 'child-folder'] },
        deletedBy: `company:${company.id}`,
        deletedAt: { not: null },
      },
      data: { deletedAt: null, deletedBy: null },
    });
    expect(result).toEqual(
      expect.objectContaining({
        alreadyRestored: false,
        foldersRestored: 2,
        filesRestored: 3,
      })
    );
  });

  it('업체 복구 시 매칭 루트 폴더의 Drive id가 없으면 repair 로그를 남기고 DB 복구를 계속한다', async () => {
    const company = {
      ...makeCompany(),
      status: 'deleted',
      webhardAccess: false,
      deletedAt: new Date('2026-06-01T00:00:00.000Z'),
      deletedBy: '99',
      deletedPreviousStatus: 'active',
      deletedPreviousWebhardAccess: true,
    };
    const prisma = makePrismaMock(company);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'missing-drive-root-folder-row',
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: null,
        },
      ])
      .mockResolvedValueOnce([{ id: 'missing-drive-root-folder-row', parentId: null }]);
    const storageService = {
      restoreDriveFolder: jest.fn().mockResolvedValue(undefined),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompaniesService(
      prisma as never,
      undefined,
      storageService as never,
      storageRepairService as never
    );

    const result = await service.restoreCompany(company.id);

    expect(storageService.restoreDriveFolder).not.toHaveBeenCalled();
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'restore',
        storageProvider: 'google_drive',
        webhardFolderId: 'missing-drive-root-folder-row',
        actualDriveState: expect.objectContaining({
          skipped: true,
          reason: 'missing_drive_folder_id',
        }),
      })
    );
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: company.id },
      data: expect.objectContaining({
        status: 'active',
        webhardAccess: true,
        deletedAt: null,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        alreadyRestored: false,
        foldersRestored: 2,
        filesRestored: 3,
      })
    );
  });

  it('업체 복구 시 Drive 폴더가 이미 없으면 repair 로그를 남기고 DB 복구를 계속한다', async () => {
    const company = {
      ...makeCompany(),
      status: 'deleted',
      webhardAccess: false,
      deletedAt: new Date('2026-06-01T00:00:00.000Z'),
      deletedBy: '99',
      deletedPreviousStatus: 'active',
      deletedPreviousWebhardAccess: true,
    };
    const prisma = makePrismaMock(company);
    prisma.webhardFolder.findMany
      .mockResolvedValueOnce([
        {
          id: 'root-folder',
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: 'missing-drive-folder',
        },
      ])
      .mockResolvedValueOnce([{ id: 'root-folder', parentId: null }]);
    const driveMissingError = Object.assign(new Error('Google Drive API error'), {
      code: 'ERR_GAXIOS',
      response: { status: 404 },
    });
    const storageService = {
      restoreDriveFolder: jest.fn().mockRejectedValue(driveMissingError),
    };
    const storageRepairService = {
      recordDriveDbMismatch: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompaniesService(
      prisma as never,
      undefined,
      storageService as never,
      storageRepairService as never
    );

    const result = await service.restoreCompany(company.id);

    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'restore',
        storageProvider: 'google_drive',
        driveFolderId: 'missing-drive-folder',
        webhardFolderId: 'root-folder',
        actualDriveState: expect.objectContaining({
          skipped: true,
          reason: 'drive_folder_not_found',
          status: 404,
        }),
      })
    );
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: company.id },
      data: expect.objectContaining({
        status: 'active',
        webhardAccess: true,
        deletedAt: null,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        alreadyRestored: false,
        foldersRestored: 2,
        filesRestored: 3,
      })
    );
  });
});
