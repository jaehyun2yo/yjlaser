import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DrawingRevisionService } from '../../contacts/drawing-revision.service';

interface DxfMatchUploadInput {
  fileName: string;
  fileUrl: string;
  actorName?: string;
}

export interface DxfMatchResult {
  matched: boolean;
  contactId?: string;
  workNumber?: string;
  revisionVersion?: number;
  error?: string;
}

@Injectable()
export class DxfMatchService {
  private readonly logger = new Logger(DxfMatchService.name);

  constructor(
    private prisma: PrismaService,
    private drawingRevisionService: DrawingRevisionService
  ) {}

  /**
   * DXF 파일명에서 workNumber 파싱
   * 패턴: YYMMDD-F-NNN (파일명 앞부분에서만 추출)
   */
  parseWorkNumber(fileName: string): string | null {
    const match = fileName.match(/^(\d{6}-F-\d{3})/);
    return match ? match[1] : null;
  }

  /**
   * DXF 파일 매칭 + DrawingRevision 등록
   *
   * 1. 파일명에서 workNumber 파싱
   * 2. Contact.workNumber로 매칭 (soft-deleted 제외)
   * 3. DrawingRevision 생성 (reason: laser_processing, source: integration, actorType: external)
   * 4. Contact.drawingFileUrl 업데이트
   */
  async matchAndUpload(dto: DxfMatchUploadInput): Promise<DxfMatchResult> {
    const workNumber = this.parseWorkNumber(dto.fileName);
    if (!workNumber) {
      return { matched: false, error: 'workNumber를 파싱할 수 없습니다' };
    }

    const contact = await this.prisma.contact.findFirst({
      where: {
        workNumber,
        deletedAt: null,
      },
      select: { id: true, processStage: true },
    });

    if (!contact) {
      return {
        matched: false,
        workNumber,
        error: '해당 workNumber의 문의를 찾을 수 없습니다',
      };
    }

    const { revision } = await this.drawingRevisionService.createRevision(
      contact.id,
      {
        reason: 'laser_processing',
        files: [{ url: dto.fileUrl, name: dto.fileName }],
        source: 'integration',
        processStage: contact.processStage ?? undefined,
      },
      {
        actorType: 'external',
        actorName: dto.actorName ?? '관리프로그램',
      }
    );

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: {
        drawingFileUrl: dto.fileUrl,
        drawingFileName: dto.fileName,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `DXF matched: workNumber=${workNumber}, contactId=${contact.id}, version=${revision.version}`
    );

    return {
      matched: true,
      contactId: contact.id,
      workNumber,
      revisionVersion: revision.version,
    };
  }
}
