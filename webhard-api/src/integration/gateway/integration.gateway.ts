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
    try {
      // 쿠키 또는 API Key로 인증
      const cookie = client.handshake.headers.cookie;
      const apiKey = client.handshake.auth?.apiKey as string;

      this.logger.debug(
        `Connection attempt: ${client.id}, hasCookie=${!!cookie}, hasApiKey=${!!apiKey}`
      );

      let authenticated = false;

      if (cookie) {
        const browserUser = verifyBrowserGatewaySession(this.authService, cookie, [
          'admin',
          'company',
        ]);
        if (browserUser) {
          authenticated = true;
          (client as GatewaySocket).userData = browserUser;
          this.logger.debug(`${browserUser.userType} session authenticated: ${client.id}`);
        }

        if (!authenticated) {
          const workerUser = verifyWorkerGatewaySession(this.authService, cookie);
          if (workerUser) {
            authenticated = true;
            (client as GatewaySocket).userData = workerUser;
            this.logger.debug(`Worker session authenticated: ${client.id}`);
          }
        }
      }

      if (!authenticated && apiKey) {
        const keyInfo = await this.apiKeyService.validateKey(apiKey);
        if (keyInfo) {
          authenticated = true;
          (client as GatewaySocket).userData = {
            userType: 'integration',
            userId: keyInfo.id,
            companyId: null,
            programType: keyInfo.programType,
            permissions: keyInfo.permissions,
          };
        }
      }

      if (!authenticated) {
        this.logger.warn(
          `Unauthenticated connection attempt: ${client.id}, available cookies: ${cookie ? cookie.replace(/=([^;]{10})[^;]*/g, '=$1...') : 'none'}`
        );
        client.disconnect();
        return;
      }

      this.logger.debug(`Client connected: ${client.id}`);
    } catch (err) {
      this.logger.error(`Connection error: ${err}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    const user = (client as GatewaySocket).userData;
    if (!user || !this.canJoinRoom(user, room)) {
      this.logger.warn(`Client ${client.id} denied room join: ${room}`);
      return { event: 'join:denied', room };
    }

    client.join(room);
    this.logger.debug(`Client ${client.id} joined room: ${room}`);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    client.leave(room);
    this.logger.debug(`Client ${client.id} left room: ${room}`);
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
