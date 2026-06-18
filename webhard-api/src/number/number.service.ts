import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type NumberType = 'inquiry' | 'work';

@Injectable()
export class NumberService {
  private readonly logger = new Logger(NumberService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Atomic number generation using PostgreSQL UPSERT.
   *
   *   INSERT (date_key, type, 1) → first call returns 001
   *   ON CONFLICT → last_seq + 1 → returns NNN
   *   Concurrent calls each get a unique sequence number.
   *
   * Date is sourced from DB (CURRENT_DATE) to prevent
   * JS/DB midnight boundary mismatch.
   */
  async generateNumber(type: NumberType): Promise<string> {
    try {
      const result = await this.prisma.$queryRaw<[{ date_key: Date; last_seq: bigint }]>`
        INSERT INTO number_counters (date_key, type, last_seq)
        VALUES (CURRENT_DATE, ${type}, 1)
        ON CONFLICT (date_key, type)
        DO UPDATE SET last_seq = number_counters.last_seq + 1
        RETURNING date_key, last_seq
      `;

      const seq = Number(result[0].last_seq);
      const formattedDate = this.formatDateKey(result[0].date_key);
      const typePrefix = type === 'inquiry' ? 'O' : 'F';
      const number = `${formattedDate}-${typePrefix}-${String(seq).padStart(3, '0')}`;

      this.logger.log('번호 생성', { type, number, dateKey: formattedDate });
      return number;
    } catch (error) {
      this.logger.error('번호 생성 실패', {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `번호 생성에 실패했습니다 (type: ${type}). number_counters 테이블이 존재하는지 확인하세요.`
      );
    }
  }

  /**
   * Peek at the next expected number without consuming a sequence.
   * Read-only — does NOT increment the counter.
   * Warning: approximate value; concurrent generation may differ.
   */
  async peekNextNumber(type: NumberType): Promise<string> {
    try {
      const result = await this.prisma.$queryRaw<{ date_key: Date; last_seq: bigint }[]>`
        SELECT date_key, last_seq FROM number_counters
        WHERE date_key = CURRENT_DATE AND type = ${type}
      `;

      if (result.length > 0) {
        const nextSeq = Number(result[0].last_seq) + 1;
        const formattedDate = this.formatDateKey(result[0].date_key);
        const typePrefix = type === 'inquiry' ? 'O' : 'F';
        return `${formattedDate}-${typePrefix}-${String(nextSeq).padStart(3, '0')}`;
      }

      // No counter row yet today — next would be 001
      const now = new Date();
      const formattedDate = this.formatDateKey(now);
      const typePrefix = type === 'inquiry' ? 'O' : 'F';
      return `${formattedDate}-${typePrefix}-001`;
    } catch {
      return '예상 불가';
    }
  }

  private formatDateKey(date: Date): string {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }
}
