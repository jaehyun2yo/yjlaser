import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LaserOnlyMappingDto } from './dto/laser-only-mapping.dto';

const CONTACT_UPDATE_BATCH_SIZE = 50;

@Injectable()
export class LaserOnlyMappingService {
  constructor(private prisma: PrismaService) {}

  /** 전체 매핑 조회 (company 정보 포함) */
  async getMappings(): Promise<LaserOnlyMappingDto[]> {
    const mappings = await this.prisma.executeWithRetry(
      () =>
        this.prisma.laserOnlyMapping.findMany({
          include: { company: { select: { companyName: true } } },
          orderBy: { createdAt: 'desc' },
        }),
      { operationName: 'laserOnlyMapping.getMappings' }
    );

    return mappings.map((m) => this.toDto(m));
  }

  /** 매핑 추가. companyId가 있으면 Company.laserOnly=true 동기화 */
  async addMapping(folderName: string, companyId?: number): Promise<LaserOnlyMappingDto> {
    const existing = await this.prisma.executeWithRetry(
      () => this.prisma.laserOnlyMapping.findUnique({ where: { folderName } }),
      { operationName: 'laserOnlyMapping.checkDuplicate' }
    );

    if (existing) {
      throw new BadRequestException(`이미 등록된 폴더명입니다: ${folderName}`);
    }

    const mapping = await this.prisma.executeWithRetry(
      () =>
        this.prisma.laserOnlyMapping.create({
          data: { folderName, companyId: companyId ?? null },
          include: { company: { select: { companyName: true } } },
        }),
      { operationName: 'laserOnlyMapping.addMapping' }
    );

    if (companyId) {
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.company.update({
            where: { id: companyId },
            data: { laserOnly: true, updatedAt: new Date() },
          }),
        { operationName: 'laserOnlyMapping.syncCompanyLaserOnly' }
      );
    }

    return this.toDto(mapping);
  }

  /** 매핑 삭제. 연결된 Company가 있으면 Company.laserOnly=false 동기화 */
  async removeMapping(id: number): Promise<void> {
    const mapping = await this.prisma.executeWithRetry(
      () => this.prisma.laserOnlyMapping.findUnique({ where: { id } }),
      { operationName: 'laserOnlyMapping.findForRemove' }
    );

    if (!mapping) {
      throw new NotFoundException(`매핑을 찾을 수 없습니다: id=${id}`);
    }

    await this.prisma.executeWithRetry(
      () => this.prisma.laserOnlyMapping.delete({ where: { id } }),
      { operationName: 'laserOnlyMapping.removeMapping' }
    );

    if (mapping.companyId) {
      // 같은 Company를 참조하는 다른 활성 매핑이 있는지 확인
      const otherMappingCount = await this.prisma.executeWithRetry(
        () =>
          this.prisma.laserOnlyMapping.count({
            where: {
              companyId: mapping.companyId,
              isActive: true,
            },
          }),
        { operationName: 'laserOnlyMapping.countOtherMappings' }
      );

      if (otherMappingCount === 0) {
        await this.prisma.executeWithRetry(
          () =>
            this.prisma.company.update({
              where: { id: mapping.companyId! },
              data: { laserOnly: false, updatedAt: new Date() },
            }),
          { operationName: 'laserOnlyMapping.unsyncCompanyLaserOnly' }
        );
      }
    }
  }

  /** 미연결 매핑에 업체 연결. Company.laserOnly=true 동기화 */
  async linkCompany(mappingId: number, companyId: number): Promise<LaserOnlyMappingDto> {
    const mapping = await this.prisma.executeWithRetry(
      () => this.prisma.laserOnlyMapping.findUnique({ where: { id: mappingId } }),
      { operationName: 'laserOnlyMapping.findForLink' }
    );

    if (!mapping) {
      throw new NotFoundException(`매핑을 찾을 수 없습니다: id=${mappingId}`);
    }

    const company = await this.prisma.executeWithRetry(
      () => this.prisma.company.findUnique({ where: { id: companyId } }),
      { operationName: 'laserOnlyMapping.findCompany' }
    );

    if (!company) {
      throw new NotFoundException(`업체를 찾을 수 없습니다: id=${companyId}`);
    }

    const updated = await this.prisma.executeWithRetry(
      () =>
        this.prisma.laserOnlyMapping.update({
          where: { id: mappingId },
          data: { companyId, updatedAt: new Date() },
          include: { company: { select: { companyName: true } } },
        }),
      { operationName: 'laserOnlyMapping.linkCompany' }
    );

    await this.prisma.executeWithRetry(
      () =>
        this.prisma.company.update({
          where: { id: companyId },
          data: { laserOnly: true, updatedAt: new Date() },
        }),
      { operationName: 'laserOnlyMapping.syncCompanyLaserOnlyOnLink' }
    );

    const dto = this.toDto(updated);

    // Contact companyName 동기화: folderName과 companyName이 다를 때만 수행
    if (mapping.folderName !== company.companyName) {
      const contacts = await this.prisma.executeWithRetry(
        () =>
          this.prisma.contact.findMany({
            where: {
              companyName: mapping.folderName,
              status: { not: 'deleting' },
            },
            select: { id: true },
          }),
        { operationName: 'laserOnlyMapping.findContactsForSync' }
      );

      if (contacts.length > 0) {
        for (let i = 0; i < contacts.length; i += CONTACT_UPDATE_BATCH_SIZE) {
          const batchIds = contacts
            .slice(i, i + CONTACT_UPDATE_BATCH_SIZE)
            .map((c: { id: string }) => c.id);

          await this.prisma.executeWithRetry(
            () =>
              this.prisma.contact.updateMany({
                where: { id: { in: batchIds } },
                data: { companyName: company.companyName, updatedAt: new Date() },
              }),
            { operationName: 'laserOnlyMapping.updateContactCompanyName' }
          );

          await this.prisma.executeWithRetry(
            () =>
              this.prisma.contactStatusHistory.createMany({
                data: batchIds.map((contactId: string) => ({
                  contactId,
                  changeType: 'company_linked',
                  fromStatus: null,
                  toStatus: null,
                  actorType: 'system',
                  source: 'admin',
                  companyName: company.companyName,
                  note: `업체 연결로 인한 업체명 변경: ${mapping.folderName} → ${company.companyName}`,
                })),
              }),
            { operationName: 'laserOnlyMapping.recordContactHistory' }
          );
        }
        dto.updated_contact_count = contacts.length;
      } else {
        dto.updated_contact_count = 0;
      }
    }

    return dto;
  }

  /** 폴더명이 레이저 전용 매핑에 존재하는지 확인 */
  async isLaserOnlyFolder(folderName: string): Promise<boolean> {
    const count = await this.prisma.executeWithRetry(
      () =>
        this.prisma.laserOnlyMapping.count({
          where: { folderName, isActive: true },
        }),
      { operationName: 'laserOnlyMapping.isLaserOnlyFolder' }
    );

    return count > 0;
  }

  private toDto(mapping: {
    id: number;
    folderName: string;
    companyId: number | null;
    isActive: boolean;
    createdAt: Date;
    company?: { companyName: string } | null;
  }): LaserOnlyMappingDto {
    return {
      id: mapping.id,
      folder_name: mapping.folderName,
      company_id: mapping.companyId,
      company_name: mapping.company?.companyName ?? null,
      is_active: mapping.isActive,
      created_at: mapping.createdAt.toISOString(),
    };
  }
}
