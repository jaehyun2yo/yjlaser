import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FolderStatusMappingItemDto } from './dto/webhard-config.dto';

/** DB에 저장되는 간소화된 매핑 (사용자가 설정하는 값: 폴더명 + 작업상태) */
export interface FolderStatusMappingStored {
  folderName: string;
  processStage: string;
}

/** 런타임에 사용되는 풀 매핑 (자동 파생 포함) */
export interface FolderStatusMapping {
  folderName: string;
  inquiryType: string;
  status: string;
  processStage: string;
}

@Injectable()
export class WebhardConfigService {
  private readonly logger = new Logger(WebhardConfigService.name);

  private static readonly STATUS_MAPPING_KEY = 'webhard_folder_status_mapping';
  private static readonly EXCLUDED_FOLDERS_KEY = 'webhard_excluded_folders';
  private static readonly CACHE_TTL_MS = 60_000;

  /** 기존 하드코딩 기본값 (DB 미설정 시 폴백) */
  private static readonly DEFAULT_MAPPINGS: FolderStatusMappingStored[] = [
    { folderName: '목형의뢰', processStage: 'drawing_confirmed' },
    { folderName: '칼선의뢰', processStage: 'drawing' },
  ];

  private static readonly DEFAULT_EXCLUDED_FOLDERS: string[] = [
    '올리기전용',
    '내리기전용',
    '목형의뢰',
    '칼선의뢰',
    '완료',
  ];

  private static readonly AUTO_CONTACT_EXCLUDED_KEY = 'webhard_auto_contact_excluded_folders';
  private static readonly DEFAULT_AUTO_CONTACT_EXCLUDED: string[] = ['ㄱ 내리기전용'];

  /** 폴더명 → inquiryType (기존 호환용, 새 폴더는 폴더명 자체 사용) */
  private static readonly KNOWN_INQUIRY_TYPES: Record<string, string> = {
    칼선의뢰: 'cutting_request',
    목형의뢰: 'mold_request',
  };

  /** 작업상태(processStage) → 문의상태(contact status) 자동 매핑 */
  private static readonly PROCESS_STAGE_TO_STATUS: Record<string, string> = {
    drawing: 'drawing',
    sample: 'confirmed',
    drawing_confirmed: 'confirmed',
    laser: 'cutting',
    cutting: 'finishing',
    creasing: 'finishing',
    delivery: 'delivered',
  };

  // In-memory cache
  private mappingsCache: { data: FolderStatusMappingStored[]; expiry: number } | null = null;
  private excludedCache: { data: string[]; expiry: number } | null = null;
  private autoContactExcludedCache: { data: string[]; expiry: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // --- Auto-derivation helpers ---

  /** 폴더명 → inquiryType 자동 파생 */
  private deriveInquiryType(folderName: string): string {
    return WebhardConfigService.KNOWN_INQUIRY_TYPES[folderName] ?? folderName;
  }

  /** 작업상태(processStage) → 문의상태(status) 자동 파생 */
  private deriveStatus(processStage: string): string {
    return WebhardConfigService.PROCESS_STAGE_TO_STATUS[processStage] ?? 'received';
  }

  /** 저장된 간소 매핑 → 런타임 풀 매핑 변환 */
  private toFullMapping(stored: FolderStatusMappingStored): FolderStatusMapping {
    return {
      folderName: stored.folderName,
      inquiryType: this.deriveInquiryType(stored.folderName),
      status: this.deriveStatus(stored.processStage),
      processStage: stored.processStage,
    };
  }

  // --- Folder Status Mapping (stored) ---

  /** JSON 값을 FolderStatusMappingStored[] 타입으로 검증 */
  private validateMappings(value: unknown): FolderStatusMappingStored[] {
    if (!Array.isArray(value)) {
      this.logger.warn('Invalid mappings format: expected array');
      return WebhardConfigService.DEFAULT_MAPPINGS;
    }
    return value.filter(
      (item): item is FolderStatusMappingStored =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.folderName === 'string' &&
        typeof item.processStage === 'string'
    );
  }

  /** JSON 값을 string[] 타입으로 검증 */
  private validateStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      this.logger.warn('Invalid string array format: expected array');
      return WebhardConfigService.DEFAULT_EXCLUDED_FOLDERS;
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  /** 저장된 간소 매핑 조회 (UI용: folderName + processStage) — 없으면 기본값을 DB에 시딩 */
  async getStoredMappings(): Promise<FolderStatusMappingStored[]> {
    if (this.mappingsCache && Date.now() < this.mappingsCache.expiry) {
      return this.mappingsCache.data;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: WebhardConfigService.STATUS_MAPPING_KEY },
    });

    let data: FolderStatusMappingStored[];
    if (setting) {
      data = this.validateMappings(setting.value);
    } else {
      data = WebhardConfigService.DEFAULT_MAPPINGS;
      await this.prisma.systemSetting
        .create({
          data: {
            key: WebhardConfigService.STATUS_MAPPING_KEY,
            value: JSON.parse(JSON.stringify(data)),
          },
        })
        .catch(() => {
          /* 동시 생성 시 무시 */
        });
      this.logger.log('Default folder status mappings seeded to DB');
    }

    this.mappingsCache = { data, expiry: Date.now() + WebhardConfigService.CACHE_TTL_MS };
    return data;
  }

  /** 런타임 풀 매핑 조회 (AutoContactService용) */
  async getFolderStatusMapping(): Promise<FolderStatusMapping[]> {
    const stored = await this.getStoredMappings();
    return stored.map((s) => this.toFullMapping(s));
  }

  async updateFolderStatusMapping(
    mappings: FolderStatusMappingItemDto[]
  ): Promise<{ success: boolean }> {
    const stored: FolderStatusMappingStored[] = mappings.map((m) => ({
      folderName: m.folderName,
      processStage: m.processStage,
    }));
    const jsonValue = JSON.parse(JSON.stringify(stored));
    await this.prisma.systemSetting.upsert({
      where: { key: WebhardConfigService.STATUS_MAPPING_KEY },
      update: { value: jsonValue },
      create: { key: WebhardConfigService.STATUS_MAPPING_KEY, value: jsonValue },
    });

    this.mappingsCache = null;
    this.logger.log(`Folder status mapping updated: ${mappings.length} entries`);
    return { success: true };
  }

  // --- Excluded Folders ---

  /** 제외폴더 조회 — 없으면 기본값을 DB에 시딩 */
  async getExcludedFolders(): Promise<string[]> {
    if (this.excludedCache && Date.now() < this.excludedCache.expiry) {
      return this.excludedCache.data;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: WebhardConfigService.EXCLUDED_FOLDERS_KEY },
    });

    let data: string[];
    if (setting) {
      data = this.validateStringArray(setting.value);
    } else {
      data = WebhardConfigService.DEFAULT_EXCLUDED_FOLDERS;
      await this.prisma.systemSetting
        .create({
          data: {
            key: WebhardConfigService.EXCLUDED_FOLDERS_KEY,
            value: JSON.parse(JSON.stringify(data)),
          },
        })
        .catch(() => {
          /* 동시 생성 시 무시 */
        });
      this.logger.log('Default excluded folders seeded to DB');
    }

    this.excludedCache = { data, expiry: Date.now() + WebhardConfigService.CACHE_TTL_MS };
    return data;
  }

  async updateExcludedFolders(folders: string[]): Promise<{ success: boolean }> {
    const jsonValue = JSON.parse(JSON.stringify(folders));
    await this.prisma.systemSetting.upsert({
      where: { key: WebhardConfigService.EXCLUDED_FOLDERS_KEY },
      update: { value: jsonValue },
      create: { key: WebhardConfigService.EXCLUDED_FOLDERS_KEY, value: jsonValue },
    });

    this.excludedCache = null;
    this.logger.log(`Excluded folders updated: ${folders.length} entries`);
    return { success: true };
  }

  // --- Auto Contact Excluded Folders ---

  /** 문의 자동생성 제외 폴더 조회 — 없으면 기본값을 DB에 시딩 */
  async getAutoContactExcludedFolders(): Promise<string[]> {
    if (this.autoContactExcludedCache && Date.now() < this.autoContactExcludedCache.expiry) {
      return this.autoContactExcludedCache.data;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: WebhardConfigService.AUTO_CONTACT_EXCLUDED_KEY },
    });

    let data: string[];
    if (setting) {
      data = this.validateStringArray(setting.value);
    } else {
      data = WebhardConfigService.DEFAULT_AUTO_CONTACT_EXCLUDED;
      await this.prisma.systemSetting
        .create({
          data: {
            key: WebhardConfigService.AUTO_CONTACT_EXCLUDED_KEY,
            value: JSON.parse(JSON.stringify(data)),
          },
        })
        .catch(() => {
          /* 동시 생성 시 무시 */
        });
      this.logger.log('Default auto contact excluded folders seeded to DB');
    }

    this.autoContactExcludedCache = {
      data,
      expiry: Date.now() + WebhardConfigService.CACHE_TTL_MS,
    };
    return data;
  }

  async updateAutoContactExcludedFolders(folders: string[]): Promise<{ success: boolean }> {
    const jsonValue = JSON.parse(JSON.stringify(folders));
    await this.prisma.systemSetting.upsert({
      where: { key: WebhardConfigService.AUTO_CONTACT_EXCLUDED_KEY },
      update: { value: jsonValue },
      create: { key: WebhardConfigService.AUTO_CONTACT_EXCLUDED_KEY, value: jsonValue },
    });

    this.autoContactExcludedCache = null;
    this.logger.log(`Auto contact excluded folders updated: ${folders.length} entries`);
    return { success: true };
  }

  async isAutoContactExcluded(folderPath: string): Promise<boolean> {
    const excluded = await this.getAutoContactExcludedFolders();
    const segments = folderPath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    return segments.some((seg) => excluded.includes(seg));
  }

  // --- Lookup helpers (used by AutoContactService) ---

  /**
   * 폴더 경로에서 inquiryType을 찾는다 (config 기반)
   * 경로를 `/`로 분리하여 각 세그먼트가 정확히 매칭되는지 확인
   */
  async classifyByFolderPath(folderPathOrName: string): Promise<string | null> {
    const mappings = await this.getFolderStatusMapping();
    const segments = folderPathOrName
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const mapping of mappings) {
      if (segments.some((seg) => seg === mapping.folderName)) {
        return mapping.inquiryType;
      }
    }
    return null;
  }

  /**
   * inquiryType에 대한 status/processStage를 반환 (config 기반)
   */
  async getStatusForInquiryType(
    inquiryType: string | null
  ): Promise<{ status: string; processStage: string | null }> {
    if (!inquiryType) {
      return { status: 'received', processStage: null };
    }

    const mappings = await this.getFolderStatusMapping();
    const match = mappings.find((m) => m.inquiryType === inquiryType);
    if (match) {
      return { status: match.status, processStage: match.processStage };
    }

    return { status: 'received', processStage: null };
  }
}
