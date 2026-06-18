import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShareLink } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';

type ShareLinkTargetFile = {
  id: string;
  name: string;
  path: string;
  companyId: number | null;
};

@Injectable()
export class ShareLinksService {
  private readonly logger = new Logger(ShareLinksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 공유 링크 검증 및 다운로드 카운트 증가
   * (기존 RPC: validate_and_increment_share_link)
   */
  async validateAndIncrement(token: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const webhardFileModel = (
        tx as Prisma.TransactionClient & {
          webhardFile?: Prisma.TransactionClient['webhardFile'];
        }
      ).webhardFile;
      const link = await tx.shareLink.findUnique({ where: { token } });

      if (!link) {
        return { is_valid: false, error_message: '존재하지 않는 공유 링크입니다.' };
      }

      if (!link.isActive) {
        return { is_valid: false, error_message: '비활성화된 공유 링크입니다.' };
      }

      if (new Date() > link.expiresAt) {
        return { is_valid: false, error_message: '만료된 공유 링크입니다.' };
      }

      const updateWhere: Prisma.ShareLinkWhereInput = { id: link.id };
      if (link.maxDownloads) {
        updateWhere.downloadCount = { lt: link.maxDownloads };
      }

      const updateResult = await tx.shareLink.updateMany({
        where: updateWhere,
        data: {
          downloadCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (updateResult.count !== 1) {
        return { is_valid: false, error_message: '최대 다운로드 횟수를 초과했습니다.' };
      }
      const file = !webhardFileModel
        ? null
        : link.webhardFileId
          ? await webhardFileModel.findFirst({
              where: { id: link.webhardFileId, deletedAt: null },
              select: { id: true, storageProvider: true, driveFileId: true },
            })
          : await webhardFileModel.findFirst({
              where: { path: link.filePath, deletedAt: null },
              select: { id: true, storageProvider: true, driveFileId: true },
            });

      return {
        is_valid: true,
        file_path: link.filePath,
        webhard_file_id: file?.id ?? link.webhardFileId ?? null,
        drive_file_id: file?.driveFileId ?? null,
        storage_provider: file?.storageProvider ?? null,
        file_name: link.fileName,
        error_message: null,
      };
    });
  }

  /**
   * 공유 링크 목록 조회
   */
  async findAll(companyId?: number) {
    const where = companyId ? { companyId } : {};
    const links = await this.prisma.shareLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return links.map((l: ShareLink) => ({
      id: l.id,
      token: l.token,
      file_path: l.filePath,
      webhard_file_id: l.webhardFileId,
      file_name: l.fileName,
      company_id: l.companyId,
      created_by: l.createdBy,
      expires_at: l.expiresAt.toISOString(),
      max_downloads: l.maxDownloads,
      download_count: l.downloadCount,
      is_active: l.isActive,
      created_at: l.createdAt?.toISOString() || null,
      updated_at: l.updatedAt?.toISOString() || null,
    }));
  }

  /**
   * 공유 링크 생성
   */
  async create(
    data: {
      token: string;
      filePath: string;
      webhardFileId?: string;
      fileName: string;
      companyId?: number;
      createdBy: number;
      expiresAt: string;
      maxDownloads?: number;
    },
    user?: SessionUser
  ) {
    const webhardFileModel = (
      this.prisma as PrismaService & {
        webhardFile?: PrismaService['webhardFile'];
      }
    ).webhardFile;
    const file = await this.resolveTargetFile(data, webhardFileModel);
    if (data.webhardFileId && !file) {
      throw new NotFoundException('공유 대상 파일을 찾을 수 없습니다.');
    }

    if (user?.userType === 'company') {
      if (!file || file.companyId !== user.companyId) {
        throw new ForbiddenException('해당 파일에 대한 공유 권한이 없습니다.');
      }
    }

    if (
      file &&
      user?.userType !== 'company' &&
      data.companyId !== undefined &&
      file.companyId !== null &&
      file.companyId !== data.companyId
    ) {
      throw new BadRequestException('공유 링크 업체 범위가 파일 소유 업체와 일치하지 않습니다.');
    }

    const effectiveCompanyId =
      user?.userType === 'company' ? user.companyId : (data.companyId ?? file?.companyId ?? null);
    const link = await this.prisma.shareLink.create({
      data: {
        token: data.token,
        filePath: file?.path ?? data.filePath,
        webhardFileId: file?.id ?? null,
        fileName: file?.name ?? data.fileName,
        companyId: effectiveCompanyId,
        createdBy: data.createdBy,
        expiresAt: new Date(data.expiresAt),
        maxDownloads: data.maxDownloads || null,
        isActive: true,
        downloadCount: 0,
      },
    });

    return {
      id: link.id,
      token: link.token,
    };
  }

  private async resolveTargetFile(
    data: {
      filePath: string;
      webhardFileId?: string;
      companyId?: number;
    },
    webhardFileModel?: PrismaService['webhardFile']
  ): Promise<ShareLinkTargetFile | null> {
    if (!webhardFileModel) {
      return null;
    }

    const select = { id: true, name: true, path: true, companyId: true } as const;
    if (data.webhardFileId) {
      return webhardFileModel.findFirst({
        where: { id: data.webhardFileId, deletedAt: null },
        select,
      });
    }

    if (!data.filePath) {
      return null;
    }

    return webhardFileModel.findFirst({
      where: {
        path: data.filePath,
        deletedAt: null,
        ...(data.companyId ? { companyId: data.companyId } : {}),
      },
      select,
    });
  }
}
