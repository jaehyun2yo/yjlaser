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
 * Activity Logs 실시간 이벤트 Gateway
 * - activity:created 이벤트 브로드캐스트
 * - /activity namespace 사용
 */
@WebSocketGateway({
  namespace: '/activity',
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class ActivityLogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ActivityLogsGateway.name);
  private readonly logFeature = 'activity_logs_gateway';

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    const correlationId = generateGatewayCorrelationId(this.logFeature);
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;
      this.logGatewayEvent({
        level: 'debug',
        event: 'activity_logs_gateway_connection_started',
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
        const user = verifyBrowserGatewaySession(this.authService, cookie, ['admin']);
        if (user) {
          authenticated = true;
          const room = 'admin';
          await client.join(room);
          this.logRoomJoined(client, room, user.userType, correlationId);
        }
      }

      if (!authenticated) {
        this.logGatewayEvent({
          level: 'warn',
          event: 'activity_logs_gateway_connection_rejected',
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
        event: 'activity_logs_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      });
    } catch (err) {
      this.logGatewayEvent({
        level: 'error',
        event: 'activity_logs_gateway_connection_error',
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
      event: 'activity_logs_gateway_disconnected',
      action: 'disconnect',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
    });
  }

  /**
   * 활동 로그 생성 이벤트 브로드캐스트 (admin 룸만)
   */
  emitActivityCreated(activityLog: Record<string, unknown>) {
    this.server.to('admin').emit('activity:created', activityLog);
  }

  private logRoomJoined(
    client: Socket,
    room: string,
    userType: string,
    correlationId: string
  ): void {
    this.logGatewayEvent({
      level: 'debug',
      event: 'activity_logs_gateway_room_joined',
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
      component: ActivityLogsGateway.name,
      feature: this.logFeature,
    });
  }
}
