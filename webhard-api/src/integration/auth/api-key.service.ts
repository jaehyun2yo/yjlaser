import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  // 인메모리 캐시 (5분 TTL) — 대량 동기화 시 36,000 DB 조회 → 1회
  private keyCache = new Map<
    string,
    { data: { id: string; programType: string; permissions: string[] }; ts: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(private prisma: PrismaService) {}

  /**
   * API 키 생성 (평문 키 반환 - 최초 1회만 확인 가능)
   */
  async createApiKey(
    name: string,
    programType: string,
    permissions: string[] = []
  ): Promise<{ id: string; key: string }> {
    const rawKey = `yjl_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name,
        keyHash,
        programType,
        permissions,
      },
    });

    this.logger.log(`API key created: ${name} (${programType})`);
    return { id: apiKey.id, key: rawKey };
  }

  /**
   * API 키 검증 (인메모리 캐시 포함)
   */
  async validateKey(rawKey: string): Promise<{
    id: string;
    programType: string;
    permissions: string[];
  } | null> {
    if (!rawKey) return null;

    const keyHash = this.hashKey(rawKey);

    // 캐시 확인 (5분 TTL)
    const cached = this.keyCache.get(keyHash);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.data;
    }

    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) return null;

    const result = {
      id: apiKey.id,
      programType: apiKey.programType,
      permissions: apiKey.permissions,
    };

    // 캐시 저장
    this.keyCache.set(keyHash, { data: result, ts: Date.now() });

    // lastUsedAt 비동기 업데이트 (결과 무시)
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return result;
  }

  /**
   * API 키 목록 조회
   */
  async listApiKeys() {
    const keys = await this.prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        programType: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      program_type: k.programType,
      permissions: k.permissions,
      is_active: k.isActive,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      created_at: k.createdAt.toISOString(),
    }));
  }

  /**
   * API 키 삭제
   */
  async deleteApiKey(id: string): Promise<void> {
    await this.prisma.apiKey.delete({ where: { id } });
    this.logger.log(`API key deleted: ${id}`);
  }

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }
}
