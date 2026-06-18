import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhardConfigService } from '../../folders/webhard-config.service';
import { FoldersService } from '../../folders/folders.service';
import { NumberService } from '../../number/number.service';
import { ContactTimelineService } from '../../contacts/contact-timeline.service';
import { ContactFolderSyncService } from '../../contacts/contact-folder-sync.service';
import { DrawingRevisionService } from '../../contacts/drawing-revision.service';
import { ContactsGateway } from '../../contacts/contacts.gateway';
import { LaserOnlyMappingService } from '../../companies/laser-only-mapping.service';
import { AutoContactFromFileDto } from './dto/auto-contact.dto';
import { buildInquiryFileName } from '../../common/inquiry-filename.util';
import { normalizeCompanyName } from '../../folders/_lib/company-name-match.util';
import { SyncLogService, type CreatePipelineEventInput } from '../sync-log/sync-log.service';

export type InquiryType = 'cutting_request' | 'mold_request' | 'laser_cutting';

const CLASSIFY_FAILED_NOTIFICATION_DEDUPE_MS = 60 * 60 * 1000;

interface AutoContactResult {
  contactId: string;
  inquiryNumber: string | null;
  action: 'created' | 'updated' | 'skipped';
}

interface MatchedCompanyInfo {
  id: number;
  companyName: string;
  managerName: string | null;
  managerPhone: string | null;
  managerEmail: string | null;
  laserOnly: boolean;
}

@Injectable()
export class AutoContactService {
  private readonly logger = new Logger(AutoContactService.name);

  constructor(
    private prisma: PrismaService,
    private webhardConfigService: WebhardConfigService,
    private numberService: NumberService,
    private timelineService: ContactTimelineService,
    private drawingRevisionService: DrawingRevisionService,
    private laserOnlyMappingService: LaserOnlyMappingService,
    private foldersService: FoldersService,
    private contactFolderSync: ContactFolderSyncService,
    @Optional() private readonly syncLogService?: SyncLogService,
    @Optional() private readonly contactsGateway?: ContactsGateway
  ) {}

  private async recordPipelineEvent(input: CreatePipelineEventInput): Promise<void> {
    if (!this.syncLogService) return;

    try {
      await this.syncLogService.createPipelineEvent(input);
    } catch (err) {
      this.logger.warn(
        `auto-contact pipeline trace write failed: reason=${input.reasonCode}, filename=${input.filename}, error=${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * 파일 업로드 후 자동 문의 생성 진입점
   * confirmUpload / batchConfirmUpload 후 호출
   */
  async detectAndCreate(dto: AutoContactFromFileDto): Promise<AutoContactResult | null> {
    try {
      this.logger.log(
        `auto contact detect started: file=${dto.fileName}, folderId=${dto.folderId}, folderPath=${dto.folderPath}, company=${dto.companyName}, companyId=${dto.companyId ?? 'none'}`
      );

      // 문의 자동생성 제외 폴더 체크
      const isExcluded = await this.webhardConfigService.isAutoContactExcluded(dto.folderPath);
      if (isExcluded) {
        this.logger.log(
          `Auto contact skipped (excluded folder): company=${dto.companyName}, path=${dto.folderPath}`
        );
        await this.recordPipelineEvent({
          filename: dto.fileName,
          companyName: dto.companyName,
          stage: 'auto_contact',
          status: 'skipped',
          reasonCode: 'auto_contact_excluded_folder',
          folderId: dto.folderId,
          context: {
            folderPath: dto.folderPath,
          },
        });
        return null;
      }

      const inquiryType = await this.classifyByFolderPath(dto.folderPath);
      this.logger.log(
        `auto contact classified: file=${dto.fileName}, folderPath=${dto.folderPath}, inquiryType=${inquiryType ?? 'unclassified'}`
      );

      // 중복 체크 (company_name + original_filename)
      const existing = await this.findExistingContact(dto.companyName, dto.fileName);

      if (existing) {
        this.logger.log(
          `auto contact duplicate detected: contactId=${existing.id}, company=${dto.companyName}, file=${dto.fileName}`
        );
        return await this.updateExistingContact(existing.id, dto);
      }

      return await this.createNewContact(dto, inquiryType);
    } catch (error) {
      this.logger.error(`AutoContactService.detectAndCreate failed for ${dto.fileName}: ${error}`);
      return null;
    }
  }

  /**
   * 폴더 경로 또는 이름으로 inquiry_type 분류 (DB config 기반)
   */
  async classifyByFolderPath(folderPathOrName: string): Promise<string | null> {
    return this.webhardConfigService.classifyByFolderPath(folderPathOrName);
  }

  /**
   * inquiry_type → { status, process_stage } 매핑 (DB config 기반)
   */
  private async getStatusMapping(inquiryType: string | null): Promise<{
    status: string;
    processStage: string | null;
  }> {
    return this.webhardConfigService.getStatusForInquiryType(inquiryType);
  }

  /**
   * 동일 company_name + original_filename 기존 Contact 검색
   */
  private async findExistingContact(
    companyName: string,
    filename: string
  ): Promise<{ id: string } | null> {
    const result = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findFirst({
          where: {
            companyName,
            originalFilename: filename,
            NOT: { status: 'deleting' },
          },
          select: { id: true },
        }),
      { operationName: 'autoContact.findExistingContact' }
    );
    return result ?? null;
  }

  /**
   * 기존 Contact 업데이트 (파일 재업로드)
   */
  private async updateExistingContact(
    contactId: string,
    dto: AutoContactFromFileDto
  ): Promise<AutoContactResult> {
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.update({
          where: { id: contactId },
          data: {
            drawingFileUrl: dto.fileUrl,
            drawingFileName: dto.fileName,
            updatedAt: new Date(),
          },
        }),
      { operationName: 'autoContact.updateExistingContact' }
    );

    this.logger.log(`Contact updated (file re-upload): id=${contactId}, file=${dto.fileName}`);

    return {
      contactId,
      inquiryNumber: '',
      action: 'updated',
    };
  }

  /**
   * 업체명으로 companies 테이블에서 담당자 정보 + laserOnly 조회
   *
   * 4단계 매칭 (task 24):
   *   0) CompanyFolderAlias.status='approved' + folderName 일치 → 즉시 반환 (admin 승인된 매핑)
   *   1) Company.companyName insensitive equals + isApproved=true (task 23)
   *   2) Company.companyName insensitive equals (isApproved 무관 fallback, task 23 hotfix)
   *   3) normalizeCompanyName 정규화 매칭 후보 → 모두 CompanyFolderAlias status='pending'
   *      upsert (멱등 — 기존 status 보존). 본 단계는 매칭 결과 미적용, null 반환.
   *
   * 1차/2차는 task 23 hotfix 동작 보존. 0차/3차는 task 24 신규.
   * 3차 upsert 의 update 가 빈 객체인 이유: admin 이 reject 한 후보를 외부 동기화가
   * 다시 pending 으로 되돌려 운영자의 결정을 무효화하는 것을 방지하기 위함.
   */
  private async matchCompanyInfo(companyName: string): Promise<MatchedCompanyInfo | null> {
    const trimmed = companyName.trim();
    if (!trimmed) return null;

    const select = {
      id: true,
      companyName: true,
      managerName: true,
      managerPhone: true,
      managerEmail: true,
      laserOnly: true,
    } as const;

    return this.prisma.executeWithRetry(
      async () => {
        // === 0차: CompanyFolderAlias status='approved' ===
        const approvedAlias = await this.prisma.companyFolderAlias.findFirst({
          where: { folderName: trimmed, status: 'approved' },
          include: { company: { select } },
        });
        if (approvedAlias?.company) return approvedAlias.company;

        // === 1차: Company.companyName insensitive equals + isApproved=true ===
        const approved = await this.prisma.company.findFirst({
          where: {
            companyName: { equals: trimmed, mode: 'insensitive' },
            isApproved: true,
          },
          select,
        });
        if (approved) return approved;

        // === 2차: isApproved 무관 fallback (task 23 hotfix) ===
        const exactAny = await this.prisma.company.findFirst({
          where: {
            companyName: { equals: trimmed, mode: 'insensitive' },
          },
          select,
        });
        if (exactAny) return exactAny;

        // === 3차: 정규화 매칭 후보 자동 pending 등록 (task 24) ===
        const normalized = normalizeCompanyName(trimmed);
        if (normalized) {
          const allCompanies = await this.prisma.company.findMany({
            select: { id: true, companyName: true },
          });
          const matched = allCompanies.filter(
            (c) => normalizeCompanyName(c.companyName) === normalized
          );
          if (matched.length > 0) {
            await Promise.all(
              matched.map((c) =>
                this.prisma.companyFolderAlias.upsert({
                  where: {
                    folderName_companyId: { folderName: trimmed, companyId: c.id },
                  },
                  update: {},
                  create: { folderName: trimmed, companyId: c.id, status: 'pending' },
                })
              )
            );
          }
        }

        return null;
      },
      { operationName: 'autoContact.matchCompanyInfo' }
    );
  }

  /**
   * 폴더 기반 inquiryType의 processStage가 'sample'인지 판별
   */
  private async isSampleStage(inquiryType: string | null): Promise<boolean> {
    if (!inquiryType) return false;
    const { processStage } = await this.getStatusMapping(inquiryType);
    return processStage === 'sample';
  }

  /**
   * 신규 Contact 생성
   *
   * laserOnly 업체 분기:
   * - laserOnly=true + 비샘플 → inquiryType='laser_cutting', status='cutting', processStage='laser', workNumber 즉시 부여
   * - laserOnly=true + 샘플 폴더 → 기존 샘플 로직 유지 (status=confirmed, processStage=sample)
   * - laserOnly=false → 기존 로직 그대로
   */
  private async createNewContact(
    dto: AutoContactFromFileDto,
    inquiryType: string | null
  ): Promise<AutoContactResult> {
    // 1차: LaserOnlyMapping 테이블 체크
    const isMappedLaserOnly = await this.laserOnlyMappingService.isLaserOnlyFolder(dto.companyName);
    // 2차: Company.laserOnly 체크 (하위호환)
    const companyInfo = await this.matchCompanyInfo(dto.companyName);
    const isLaserOnly = isMappedLaserOnly || (companyInfo?.laserOnly ?? false);
    this.logger.log(
      `auto contact company resolved: sourceCompany=${dto.companyName}, resolvedCompany=${companyInfo?.companyName ?? dto.companyName.trim()}, resolvedCompanyId=${companyInfo?.id ?? dto.companyId ?? 'none'}, laserOnly=${isLaserOnly}, mappedLaserOnly=${isMappedLaserOnly}`
    );

    // laserOnly 업체 분기: 샘플 폴더가 아닌 경우 laser_cutting으로 오버라이드
    let finalInquiryType = inquiryType;
    let status: string;
    let processStage: string | null;

    if (isLaserOnly && !(await this.isSampleStage(inquiryType))) {
      // laserOnly 업체 + 비샘플 → laser_cutting 직행
      finalInquiryType = 'laser_cutting';
      status = 'cutting';
      processStage = 'laser';
    } else {
      // 기존 로직: 폴더 기반 매핑 또는 laserOnly+샘플 → 기존 샘플 로직
      ({ status, processStage } = await this.getStatusMapping(finalInquiryType));
    }

    // 번호 생성: 미분류(null)→없음, cutting_request→O-번호, 현장직행(mold_request/laser_cutting)→F-번호
    const isDirectToField =
      finalInquiryType === 'mold_request' || finalInquiryType === 'laser_cutting';
    const isOfficeType = finalInquiryType === 'cutting_request';
    const inquiryNumber = isOfficeType ? await this.numberService.generateNumber('inquiry') : null;
    const workNumber = isDirectToField ? await this.numberService.generateNumber('work') : null;

    const contactName = companyInfo?.managerName || '-';
    const contactPhone = companyInfo?.managerPhone || '-';
    const contactEmail = companyInfo?.managerEmail || '';

    // task 23 qa-contact-worker-v1: matchCompanyInfo 가 Company 를 찾으면 정규형 companyName 사용.
    // 매칭 실패 시 fallback 으로 폴더명 원본 (dto.companyName) 사용 — 기존 동작 보존.
    // 목적: 업체 대시보드 findByCompany 조회 시 자동생성 Contact 와 업체 정규 업체명이 일치하도록 보장.
    // hotfix: fallback 사용 시 양 끝 공백 제거하여 findByCompany insensitive equals 매칭이 어긋나지 않게.
    const resolvedCompanyName = companyInfo?.companyName ?? dto.companyName.trim();
    const dtoCompanyId = dto.companyId ? Number(dto.companyId) : null;
    const resolvedCompanyId =
      companyInfo?.id ??
      (dtoCompanyId !== null && Number.isFinite(dtoCompanyId) ? dtoCompanyId : null);

    const numberPrefix = inquiryNumber || workNumber;
    const title = numberPrefix
      ? `${numberPrefix} ${resolvedCompanyName} ${dto.fileName}`
      : `${resolvedCompanyName} ${dto.fileName}`;
    const now = new Date();

    // Contact INSERT + timeline(created) + initial drawing revision을 단일 트랜잭션에서 수행.
    // 하나라도 실패하면 전체 롤백 — Contact만 남고 타임라인이 비는 상태를 원천 차단.
    const contactId = await this.prisma.executeWithRetry(
      () =>
        this.prisma.$transaction(
          async (tx) => {
            const created = await tx.contact.create({
              data: {
                inquiryNumber,
                workNumber,
                inquiryTitle: title,
                companyId: resolvedCompanyId ?? undefined,
                companyName: resolvedCompanyName,
                contactType: 'company',
                name: contactName,
                position: '-',
                phone: contactPhone,
                email: contactEmail,
                referralSource: '웹하드 자동생성',
                drawingType: 'have',
                status,
                processStage,
                source: 'webhard',
                inquiryType: finalInquiryType,
                drawingFileUrl: dto.fileUrl,
                drawingFileName: dto.fileName,
                originalFilename: dto.fileName,
                drawingFileCount: 1,
                webhardFolderId: dto.folderId,
                ...(isDirectToField && { productionStartedAt: now }),
                createdAt: now,
                updatedAt: now,
              },
              select: { id: true },
            });

            if (!created.id) {
              throw new Error('Contact INSERT returned no id');
            }

            await this.timelineService.recordChange({
              contactId: created.id,
              changeType: 'created',
              toStatus: status,
              toStage: processStage,
              actorType: 'system',
              companyName: dto.companyName,
              companyId: resolvedCompanyId ?? undefined,
              source: 'webhard_auto',
              note: `웹하드 자동 생성 (${finalInquiryType || '미분류'})`,
              tx,
            });

            if (dto.fileUrl) {
              await this.drawingRevisionService.createInitialRevision(
                created.id,
                dto.fileUrl,
                dto.fileName,
                { tx }
              );
            }

            return created.id;
          },
          { timeout: 10000 }
        ),
      { operationName: 'autoContact.createNewContact' }
    );

    this.logger.log(
      `auto contact created: contactId=${contactId}, company=${resolvedCompanyName}, companyId=${resolvedCompanyId ?? 'none'}, inquiry=${inquiryNumber ?? 'none'}, work=${workNumber ?? 'none'}, status=${status}, processStage=${processStage ?? 'none'}, type=${finalInquiryType ?? 'unclassified'}${isLaserOnly ? ' (laserOnly)' : ''}, folderId=${dto.folderId}`
    );

    this.contactsGateway?.emitContactCreated({
      id: contactId,
      inquiry_number: inquiryNumber,
      work_number: workNumber,
      inquiry_title: title,
      company_id: resolvedCompanyId,
      company_name: resolvedCompanyName,
      status,
      process_stage: processStage,
      source: 'webhard',
      inquiry_type: finalInquiryType,
      drawing_file_name: dto.fileName,
      drawing_file_url: dto.fileUrl,
      original_filename: dto.fileName,
      webhard_folder_id: dto.folderId,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    // 미분류 문의 → 관리자 알림 생성 (트랜잭션 외부: 실패해도 문의 생성 자체는 유지)
    if (finalInquiryType === null) {
      await this.createUnclassifiedNotification(contactId, dto.companyName);
      // 운영 모니터링용: 폴더 경로에서 칼선/목형 세그먼트를 못 찾은 사실을 별도로 기록.
      // TODO: 같은 folderPath 1시간 내 중복 발행 방지(dedupe) — 별도 RFC.
      await this.createClassifyFailedNotification(dto.folderPath, dto.fileName, contactId);
    }

    // 파일명 프리픽스 추가 (fire-and-forget)
    if (numberPrefix && dto.folderId) {
      this.updateFileNamePrefix(dto.folderId, dto.fileName, {
        inquiryNumber,
        workNumber,
        processStage,
        inquiryType: finalInquiryType,
      }).catch((err) => {
        this.logger.warn(`Failed to update file name prefix: ${err}`);
      });
    }

    // 문의 폴더 확보 (task 23 단일 진입점 ContactFolderSyncService.onContactCreated 위임).
    // - finalInquiryType=null (외부동기화 미분류) → no-op. 폴더 생성은 분류 확정 시점까지 지연된다.
    //   기존 `ensureInquiryFolder` 직접 호출 시 미분류 상태에서도 빈 폴더가 생성되던 동작에서 변경됨.
    // - best-effort: LGU+ sync 대량 처리 중 개별 실패가 전체 동기화를 막지 않도록 try/catch.
    try {
      await this.contactFolderSync.onContactCreated({ contactId });
      this.logger.log(
        `auto contact folder sync completed: contactId=${contactId}, type=${finalInquiryType ?? 'unclassified'}, folderId=${dto.folderId}`
      );
    } catch (err) {
      this.logger.warn(
        `onContactCreated failed for contact ${contactId}: ${err instanceof Error ? err.message : err}`
      );
    }

    return { contactId, inquiryNumber, action: 'created' };
  }

  /**
   * 미분류 문의 수 조회 (관리자 알림 배지용)
   */
  async getUnclassifiedCount(): Promise<number> {
    return this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.count({
          where: {
            source: 'webhard',
            inquiryType: null,
            NOT: { status: 'deleting' },
          },
        }),
      { operationName: 'autoContact.getUnclassifiedCount' }
    );
  }

  /**
   * 미분류 → 유형 지정 (PATCH /api/contacts/{id}/inquiry-type 에서 호출 가능)
   */
  async classifyContact(contactId: string, inquiryType: string): Promise<void> {
    const { status, processStage } = await this.getStatusMapping(inquiryType);

    await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.update({
          where: { id: contactId },
          data: {
            inquiryType,
            status,
            processStage,
            updatedAt: new Date(),
          },
        }),
      { operationName: 'autoContact.classifyContact' }
    );

    this.logger.log(`Contact classified: id=${contactId}, type=${inquiryType}, status=${status}`);
  }

  /**
   * 미분류 문의 생성 시 관리자 알림 INSERT
   * 스펙: Title "미분류 문의 접수", Body "[{company_name}] 웹하드에서 미분류 파일이 접수되었습니다."
   */
  private async createUnclassifiedNotification(
    contactId: string,
    companyName: string
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: 'new_contact',
          title: '미분류 문의 접수',
          message: `[${companyName}] 웹하드에서 미분류 파일이 접수되었습니다. 유형을 지정해주세요.`,
          metadata: {
            contactId,
            companyName,
            source: 'webhard',
            link: `/admin/work-management?contactId=${contactId}`,
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create unclassified notification for contact ${contactId}: ${error}`
      );
    }
  }

  /**
   * classifyByFolderPath 가 null 을 반환해 inquiryType 이 미설정된 경우의 경보.
   * 원본 로직(Contact 는 받되 inquiryType=null 로 생성)은 유지하고, 운영자에게
   * 폴더 경로/파일명을 알려 분류 기준 보정 또는 수동 이동을 유도한다.
   */
  private async createClassifyFailedNotification(
    folderPath: string,
    fileName: string,
    contactId: string | null
  ): Promise<void> {
    try {
      const existingRecentNotification = await this.prisma.notification.findFirst({
        where: {
          userType: 'admin',
          type: 'webhard_classify_failed',
          createdAt: { gte: new Date(Date.now() - CLASSIFY_FAILED_NOTIFICATION_DEDUPE_MS) },
          metadata: {
            path: ['folderPath'],
            equals: folderPath,
          },
        },
        select: { id: true },
      });

      if (existingRecentNotification) {
        this.logger.debug(
          `Skipped duplicate webhard_classify_failed notification (folderPath=${folderPath})`
        );
        return;
      }

      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: 'webhard_classify_failed',
          title: '웹하드 파일 미분류',
          message: `폴더 경로 '${folderPath}' 에서 칼선의뢰/목형의뢰 세그먼트를 찾지 못해 inquiryType 미설정.`,
          metadata: {
            folderPath,
            fileName,
            contactId,
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create webhard_classify_failed notification (folderPath=${folderPath}): ${error}`
      );
    }
  }

  /**
   * WebhardFile.name 에 "[번호] 원본명" 포맷 적용 (buildInquiryFileName).
   * fire-and-forget: 실패해도 문의 생성에 영향 없음.
   * WebhardFile.originalName 은 변경하지 않음 (중복 체크용 보존).
   */
  private async updateFileNamePrefix(
    folderId: string,
    originalName: string,
    contactInfo: {
      inquiryNumber: string | null;
      workNumber: string | null;
      processStage: string | null;
      inquiryType: string | null;
    }
  ): Promise<void> {
    const webhardFile = await this.prisma.webhardFile.findFirst({
      where: {
        folderId,
        originalName,
        deletedAt: null,
      },
      select: { id: true, originalName: true },
    });

    if (!webhardFile) {
      this.logger.debug(
        `WebhardFile not found for prefix update: folderId=${folderId}, name=${originalName}`
      );
      return;
    }

    const fullName = buildInquiryFileName({
      contact: contactInfo,
      originalName: webhardFile.originalName,
    });

    await this.prisma.webhardFile.update({
      where: { id: webhardFile.id },
      data: { name: fullName },
    });

    this.logger.log(`WebhardFile name prefixed: ${fullName}`);
  }
}
