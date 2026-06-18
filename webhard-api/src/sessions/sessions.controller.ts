import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionsService } from './sessions.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { UpsertSessionDto } from './dto/upsert-session.dto';
import { DeleteSessionDto } from './dto/delete-session.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SessionUser } from '../auth/auth.service';

type ActiveSessionRequest = Request & { user: SessionUser; apiKeyInfo?: unknown };

@Controller('sessions')
@UseGuards(ApiKeyGuard)
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * POST /api/v1/sessions/upsert
   * 활성 세션 upsert (하트비트)
   */
  @Post('upsert')
  @HttpCode(HttpStatus.OK)
  async upsertSession(@Body() dto: UpsertSessionDto, @Req() request: ActiveSessionRequest) {
    this.assertSessionPrincipalCanManage(request, dto.userType, dto.userId);
    const success = await this.sessionsService.upsertSession(
      dto.userType,
      dto.userId,
      dto.username,
      dto.companyName || null
    );
    return { success };
  }

  /**
   * DELETE /api/v1/sessions
   * 활성 세션 삭제 (로그아웃)
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteSession(@Body() dto: DeleteSessionDto, @Req() request: ActiveSessionRequest) {
    this.assertSessionPrincipalCanManage(request, dto.userType, dto.userId);
    const success = await this.sessionsService.deleteSession(dto.userType, dto.userId);
    return { success };
  }

  /**
   * GET /api/v1/sessions/count
   * 활성 세션 수 조회
   */
  @Get('count')
  @UseGuards(AdminGuard)
  async getSessionsCount() {
    return this.sessionsService.getSessionsCount();
  }

  /**
   * GET /api/v1/sessions/list
   * 활성 세션 목록 조회
   */
  @Get('list')
  @UseGuards(AdminGuard)
  async getSessionsList() {
    return this.sessionsService.getSessionsList();
  }

  private assertSessionPrincipalCanManage(
    request: ActiveSessionRequest,
    userType: string,
    userId: number
  ): void {
    const user = request.user;

    if (!user || request.apiKeyInfo || user.userType === 'integration') {
      throw new ForbiddenException('Session principal required');
    }

    if (user.userType === 'admin') {
      if (userType !== 'admin') {
        throw new ForbiddenException('Admin session cannot manage company heartbeat');
      }
      return;
    }

    if (user.userType === 'company') {
      const sessionCompanyId = Number(user.userId);
      if (
        userType !== 'company' ||
        !Number.isFinite(sessionCompanyId) ||
        sessionCompanyId !== userId
      ) {
        throw new ForbiddenException('Company session can manage only its own heartbeat');
      }
      return;
    }

    throw new ForbiddenException('Unsupported session principal');
  }
}
