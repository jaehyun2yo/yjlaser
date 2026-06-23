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
import {
  generateGatewayCorrelationId,
  logWebSocketGatewayEvent,
  type ScopedWebSocketGatewayLogEventInput,
} from '../common/logging/gateway-log-event';

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

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly logFeature = 'notifications_gateway';

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    const correlationId = generateGatewayCorrelationId(this.logFeature);
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;
      this.logGatewayEvent({
        level: 'debug',
        event: 'notifications_gateway_connection_started',
        action: 'connect',
        status: 'start',
        channel: 'audit',
        correlationId,
        client,
        metadata: {
          browser_present: !!cookie,
        },
      });

      if (cookie) {
        const user = verifyBrowserGatewaySession(this.authService, cookie, ['admin', 'company']);
        if (user?.userType === 'admin') {
          authenticated = true;
          const room = 'admin';
          await client.join(room);
          this.logRoomJoined(client, room, user.userType, correlationId);
        } else if (user?.userType === 'company' && user.companyId !== null) {
          authenticated = true;
          const room = `company:${user.companyId}`;
          await client.join(room);
          this.logRoomJoined(client, room, user.userType, correlationId);
        }
      }

      if (!authenticated) {
        this.logGatewayEvent({
          level: 'warn',
          event: 'notifications_gateway_connection_rejected',
          action: 'connect',
          status: 'failure',
          channel: 'security',
          correlationId,
          client,
          metadata: {
            reason: 'unauthenticated',
            browser_present: !!cookie,
          },
        });
        client.disconnect();
        return;
      }

      this.logGatewayEvent({
        level: 'debug',
        event: 'notifications_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      });
    } catch (err) {
      this.logGatewayEvent({
        level: 'error',
        event: 'notifications_gateway_connection_error',
        action: 'connect',
        status: 'failure',
        channel: 'error',
        correlationId,
        client,
        errorType: err instanceof Error ? err.name : typeof err,
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logGatewayEvent({
      level: 'debug',
      event: 'notifications_gateway_disconnected',
      action: 'disconnect',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
    });
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

  private logRoomJoined(
    client: Socket,
    room: string,
    userType: string,
    correlationId: string
  ): void {
    this.logGatewayEvent({
      level: 'debug',
      event: 'notifications_gateway_room_joined',
      action: 'join_room',
      status: 'success',
      channel: 'audit',
      correlationId,
      client,
      targetRoom: room,
      metadata: {
        user_type: userType,
      },
    });
  }

  private logGatewayEvent(input: ScopedWebSocketGatewayLogEventInput): void {
    logWebSocketGatewayEvent(this.logger, {
      ...input,
      component: NotificationsGateway.name,
      feature: this.logFeature,
    });
  }
}
