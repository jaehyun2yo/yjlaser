import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CompanyAccessGuard } from './company-access.guard';
import { SessionUser } from '../auth.service';
import { FilesController } from '../../files/files.controller';
import { FoldersController } from '../../folders/folders.controller';
import { AdminGuard } from './admin.guard';

const ALLOW_INTEGRATION_PRINCIPAL_KEY = 'allowIntegrationPrincipal';

function createContext(
  request: Record<string, unknown>,
  handler: () => void = () => undefined
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => CompanyAccessGuard,
  } as unknown as ExecutionContext;
}

describe('CompanyAccessGuard', () => {
  it('rejects integration principals before company-scoped webhard controllers', () => {
    const guard = new CompanyAccessGuard();
    const integrationUser: SessionUser = {
      userType: 'integration',
      userId: 'api:sync',
      companyId: null,
      programType: 'sync',
      permissions: ['folders:read'],
    };

    expect(() =>
      guard.canActivate(
        createContext({
          user: integrationUser,
          query: {},
          body: {},
          params: {},
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('allows company users without a query companyId so the service layer can apply scoped filters', () => {
    const guard = new CompanyAccessGuard();
    const companyUser: SessionUser = {
      userType: 'company',
      userId: 7,
      companyId: 7,
    };

    expect(
      guard.canActivate(
        createContext({
          user: companyUser,
          query: {},
          body: {},
          params: {},
        })
      )
    ).toBe(true);
  });

  it('allows integration principals only when the route explicitly marks an integration endpoint', () => {
    const guard = new CompanyAccessGuard();
    const integrationUser: SessionUser = {
      userType: 'integration',
      userId: 'api:lgu-sync',
      companyId: null,
      programType: 'lgu-sync',
      permissions: [],
    };
    const handler = () => undefined;
    Reflect.defineMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, true, handler);

    expect(
      guard.canActivate(
        createContext(
          {
            user: integrationUser,
            query: {},
            body: {},
            params: {},
          },
          handler
        )
      )
    ).toBe(true);
  });

  it('marks external sync upload endpoints as explicit integration endpoints', () => {
    const filesPrototype = FilesController.prototype;
    const allowedMethods = [
      filesPrototype.markDownloaded,
      filesPrototype.getPresignedUrl,
      filesPrototype.getBatchPresignedUrls,
      filesPrototype.confirmUpload,
      filesPrototype.batchConfirmUpload,
    ];

    for (const method of allowedMethods) {
      expect(Reflect.getMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, method)).toBe(true);
    }
    expect(Reflect.getMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, filesPrototype.getFiles)).toBe(
      undefined
    );
  });

  it('marks folder initialization but not generic folder listing as an integration endpoint', () => {
    const foldersPrototype = FoldersController.prototype;

    expect(
      Reflect.getMetadata(
        ALLOW_INTEGRATION_PRINCIPAL_KEY,
        foldersPrototype.initializeCompanyFolders
      )
    ).toBe(true);
    expect(Reflect.getMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, foldersPrototype.getFolders)).toBe(
      undefined
    );
  });

  it('keeps global folder template endpoints admin-only', () => {
    const foldersPrototype = FoldersController.prototype;

    expect(Reflect.getMetadata(GUARDS_METADATA, foldersPrototype.getFolderTemplate)).toContain(
      AdminGuard
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, foldersPrototype.updateFolderTemplate)).toContain(
      AdminGuard
    );
  });
});
