import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService, SessionUser } from '../../auth/auth.service';
import { ApiKeyService } from '../auth/api-key.service';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
} from '../../common/logging/log-event';
import {
  GatewaySocket,
  verifyBrowserGatewaySession,
  verifyWorkerGatewaySession,
} from '../../auth/gateway-auth.util';

@WebSocketGateway({
  namespace: '/integration',
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class IntegrationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(IntegrationGateway.name);

  constructor(
    private authService: AuthService,
    private apiKeyService: ApiKeyService
  ) {}

  async handleConnection(client: Socket) {
    const correlationId = this.getCorrelationId();
    try {
      // 쿠키 또는 API Key로 인증
      const cookie = client.handshake.headers.cookie;
      const apiKey = client.handshake.auth?.apiKey as string;

      this.logConnectionStarted(client, !!cookie, !!apiKey, correlationId);

      let authenticated = false;

      if (cookie) {
        const browserUser = verifyBrowserGatewaySession(this.authService, cookie, [
          'admin',
          'company',
        ]);
        if (browserUser) {
          authenticated = true;
          (client as GatewaySocket).userData = browserUser;
          this.logConnectionAuthenticated(client, browserUser, 'browser_session', correlationId);
        }

        if (!authenticated) {
          const workerUser = verifyWorkerGatewaySession(this.authService, cookie);
          if (workerUser) {
            authenticated = true;
            (client as GatewaySocket).userData = workerUser;
            this.logConnectionAuthenticated(client, workerUser, 'worker_session', correlationId);
          }
        }
      }

      if (!authenticated && apiKey) {
        const keyInfo = await this.apiKeyService.validateKey(apiKey);
        if (keyInfo) {
          authenticated = true;
          const integrationUser: SessionUser = {
            userType: 'integration',
            userId: keyInfo.id,
            companyId: null,
            programType: keyInfo.programType,
            permissions: keyInfo.permissions,
          };
          (client as GatewaySocket).userData = integrationUser;
          this.logConnectionAuthenticated(client, integrationUser, 'api_key', correlationId);
        }
      }

      if (!authenticated) {
        this.logConnectionRejected(client, !!cookie, !!apiKey, correlationId);
        client.disconnect();
        return;
      }

      this.logClientConnected(client, correlationId);
    } catch (err) {
      this.logConnectionError(client, err, correlationId);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(
      this.formatGatewayEvent({
        level: 'debug',
        event: 'integration_gateway_disconnected',
        action: 'disconnect',
        status: 'success',
        channel: 'audit',
        correlationId: this.getCorrelationId(),
        client,
      })
    );
  }

  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    const user = (client as GatewaySocket).userData;
    if (!user || !this.canJoinRoom(user, room)) {
      this.logRoomJoinDenied(client, user, room);
      return { event: 'join:denied', room };
    }

    client.join(room);
    this.logRoomJoined(client, user, room);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    client.leave(room);
    this.logRoomLeft(client, room);
    return { event: 'left', room };
  }

  private canJoinRoom(user: SessionUser, room: string): boolean {
    if (user.userType === 'admin') {
      return true;
    }

    if (user.userType === 'company') {
      return user.companyId !== null && room === `company:${user.companyId}`;
    }

    if (user.userType === 'worker') {
      return room === 'worker';
    }

    if (user.userType === 'integration') {
      return room === 'programs' || room === `program:${user.programType}`;
    }

    return false;
  }

  private getCorrelationId(): string {
    return generateCorrelationId('integration-gateway');
  }

  private logConnectionStarted(
    client: Socket,
    hasCookie: boolean,
    hasApiKey: boolean,
    correlationId: string
  ): void {
    this.logger.debug(
      this.formatGatewayEvent({
        level: 'debug',
        event: 'integration_gateway_connection_started',
        action: 'connect',
        status: 'start',
        channel: 'audit',
        correlationId,
        client,
        metadata: {
          browser_present: hasCookie,
          integration_auth_present: hasApiKey,
        },
      })
    );
  }

  private logConnectionAuthenticated(
    client: Socket,
    user: SessionUser,
    authMethod: 'browser_session' | 'worker_session' | 'api_key',
    correlationId: string
  ): void {
    this.logger.debug(
      this.formatGatewayEvent({
        level: 'debug',
        event: 'integration_gateway_connection_authenticated',
        action: 'authenticate',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
        targetIdHash: hashIdentifier(user.userId),
        metadata: {
          auth_method: authMethod,
          user_type: user.userType,
          program_type: user.programType,
        },
      })
    );
  }

  private logConnectionRejected(
    client: Socket,
    hasCookie: boolean,
    hasApiKey: boolean,
    correlationId: string
  ): void {
    this.logger.warn(
      this.formatGatewayEvent({
        level: 'warn',
        event: 'integration_gateway_connection_rejected',
        action: 'connect',
        status: 'failure',
        channel: 'security',
        correlationId,
        client,
        metadata: {
          reason: 'unauthenticated',
          browser_present: hasCookie,
          integration_auth_present: hasApiKey,
        },
      })
    );
  }

  private logClientConnected(client: Socket, correlationId: string): void {
    this.logger.debug(
      this.formatGatewayEvent({
        level: 'debug',
        event: 'integration_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      })
    );
  }

  private logConnectionError(client: Socket, error: unknown, correlationId: string): void {
    this.logger.error(
      this.formatGatewayEvent({
        level: 'error',
        event: 'integration_gateway_connection_error',
        action: 'connect',
        status: 'failure',
        channel: 'error',
        correlationId,
        client,
        errorType: error instanceof Error ? error.name : typeof error,
      })
    );
  }

  private logRoomJoinDenied(client: Socket, user: SessionUser | undefined, room: string): void {
    this.logger.warn(
      this.formatGatewayEvent({
        level: 'warn',
        event: 'integration_gateway_room_join_denied',
        action: 'join_room',
        status: 'failure',
        channel: 'security',
        correlationId: this.getCorrelationId(),
        client,
        targetIdHash: hashIdentifier(room),
        metadata: {
          reason: user ? 'room_forbidden' : 'missing_user',
          user_type: user?.userType,
          room_type: this.getRoomType(room),
        },
      })
    );
  }

  private logRoomJoined(client: Socket, user: SessionUser, room: string): void {
    this.logger.debug(
      this.formatGatewayEvent({
        level: 'debug',
        event: 'integration_gateway_room_joined',
        action: 'join_room',
        status: 'success',
        channel: 'audit',
        correlationId: this.getCorrelationId(),
        client,
        targetIdHash: hashIdentifier(room),
        metadata: {
          user_type: user.userType,
          room_type: this.getRoomType(room),
        },
      })
    );
  }

  private logRoomLeft(client: Socket, room: string): void {
    this.logger.debug(
      this.formatGatewayEvent({
        level: 'debug',
        event: 'integration_gateway_room_left',
        action: 'leave_room',
        status: 'success',
        channel: 'audit',
        correlationId: this.getCorrelationId(),
        client,
        targetIdHash: hashIdentifier(room),
        metadata: {
          room_type: this.getRoomType(room),
        },
      })
    );
  }

  private formatGatewayEvent(input: {
    level: 'debug' | 'info' | 'warn' | 'error';
    event: string;
    action: string;
    status: 'start' | 'success' | 'failure';
    channel: 'audit' | 'security' | 'error';
    correlationId: string;
    client: Socket;
    targetIdHash?: string;
    errorType?: string;
    metadata?: Record<string, unknown>;
  }): string {
    return formatLogEvent({
      level: input.level,
      project: 'company_site',
      component: IntegrationGateway.name,
      feature: 'integration_gateway',
      event: input.event,
      action: input.action,
      status: input.status,
      channel: input.channel,
      correlation_id: input.correlationId,
      actor_type: 'socket',
      actor_id_hash: hashIdentifier(input.client.id),
      target_id_hash: input.targetIdHash,
      error_type: input.errorType,
      metadata: input.metadata,
    });
  }

  private getRoomType(room: string): string {
    if (room.includes(':')) {
      return room.split(':', 1)[0] || 'unknown';
    }

    if (['admin', 'worker', 'programs'].includes(room)) {
      return room;
    }

    return 'other';
  }

  // 주문 상태 변경 이벤트
  emitOrderStatusChanged(orderId: string, contactId: number | null, data: Record<string, unknown>) {
    this.server.to('admin').to(`order:${orderId}`).to('worker').emit('order:status_changed', data);
    if (contactId) {
      this.server.to(`company:${contactId}`).emit('order:status_changed', data);
    }
  }

  // 주문 이벤트 생성
  emitOrderEventCreated(orderId: string, data: Record<string, unknown>) {
    this.server.to('admin').to(`order:${orderId}`).emit('order:event_created', data);
  }

  // 프로그램 상태
  emitProgramStatus(data: Record<string, unknown>) {
    this.server.to('admin').to('programs').emit('program:status', data);
  }

  // 재고 부족 알림
  emitInventoryLowStock(data: Record<string, unknown>) {
    this.server.to('admin').emit('inventory:low_stock', data);
  }

  // 납품 상태 변경
  emitDeliveryStatusChanged(
    orderId: string,
    contactId: number | null,
    data: Record<string, unknown>
  ) {
    this.server.to('admin').emit('delivery:status_changed', data);
    if (contactId) {
      this.server.to(`company:${contactId}`).emit('delivery:status_changed', data);
    }
  }

  // 대시보드 새로고침
  emitDashboardRefresh() {
    this.server.to('admin').emit('dashboard:refresh', { timestamp: new Date().toISOString() });
  }
}
