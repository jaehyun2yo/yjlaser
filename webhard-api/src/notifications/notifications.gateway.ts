import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { verifyBrowserGatewaySession } from '../auth/gateway-auth.util';

/**
 * Notifications 실시간 이벤트 Gateway
 * - notification:created, notification:updated 이벤트 브로드캐스트
 * - /notifications namespace 사용
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('NotificationsGateway');

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;

      if (cookie) {
        const user = verifyBrowserGatewaySession(this.authService, cookie, ['admin', 'company']);
        if (user?.userType === 'admin') {
          authenticated = true;
          await client.join('admin');
          this.logger.debug(`Client ${client.id} joined room: admin`);
        } else if (user?.userType === 'company' && user.companyId !== null) {
          authenticated = true;
          await client.join(`company:${user.companyId}`);
          this.logger.debug(`Client ${client.id} joined room: company:${user.companyId}`);
        }
      }

      if (!authenticated) {
        this.logger.warn(`Unauthenticated connection rejected: ${client.id}`);
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

  /**
   * 알림 생성 이벤트 — admin 또는 특정 company 룸으로 전송
   */
  emitNotificationCreated(notification: Record<string, unknown>) {
    const { userType, userId } = notification as { userType?: string; userId?: number };
    if (userType === 'admin') {
      this.server.to('admin').emit('notification:created', notification);
    } else if (userType === 'company' && userId != null) {
      this.server.to(`company:${userId}`).emit('notification:created', notification);
    } else {
      // Fallback: admin 룸으로만 전송
      this.server.to('admin').emit('notification:created', notification);
    }
  }

  /**
   * 알림 업데이트 이벤트 — admin 또는 특정 company 룸으로 전송
   */
  emitNotificationUpdated(notification: Record<string, unknown>) {
    const { userType, userId } = notification as { userType?: string; userId?: number };
    if (userType === 'admin') {
      this.server.to('admin').emit('notification:updated', notification);
    } else if (userType === 'company' && userId != null) {
      this.server.to(`company:${userId}`).emit('notification:updated', notification);
    } else {
      this.server.to('admin').emit('notification:updated', notification);
    }
  }

  /**
   * 전체 읽음 처리 이벤트 — 대상 룸으로 전송
   */
  emitAllNotificationsRead(userType: string, userId: number | null) {
    if (userType === 'admin') {
      this.server.to('admin').emit('notification:all_read', { userType, userId });
    } else if (userType === 'company' && userId !== null) {
      this.server.to(`company:${userId}`).emit('notification:all_read', { userType, userId });
    }
  }
}
