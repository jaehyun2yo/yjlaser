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
 * Feedback 실시간 이벤트 Gateway
 * - feedback:created, feedback:updated 이벤트 브로드캐스트
 * - /feedback namespace 사용
 */
@WebSocketGateway({
  namespace: '/feedback',
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class FeedbackGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(FeedbackGateway.name);
  private readonly logFeature = 'feedback_gateway';

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    const correlationId = generateGatewayCorrelationId(this.logFeature);
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;
      this.logGatewayEvent({
        level: 'debug',
        event: 'feedback_gateway_connection_started',
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
          event: 'feedback_gateway_connection_rejected',
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
        event: 'feedback_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      });
    } catch (err) {
      this.logGatewayEvent({
        level: 'error',
        event: 'feedback_gateway_connection_error',
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
      event: 'feedback_gateway_disconnected',
      action: 'disconnect',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
    });
  }

  /**
   * 불편사항 생성 이벤트 브로드캐스트 (admin 룸만)
   */
  emitFeedbackCreated(feedback: Record<string, unknown>) {
    this.server.to('admin').emit('feedback:created', feedback);
  }

  /**
   * 불편사항 업데이트 이벤트 브로드캐스트 (admin 룸만)
   */
  emitFeedbackUpdated(feedback: Record<string, unknown>) {
    this.server.to('admin').emit('feedback:updated', feedback);
  }

  private logRoomJoined(
    client: Socket,
    room: string,
    userType: string,
    correlationId: string
  ): void {
    this.logGatewayEvent({
      level: 'debug',
      event: 'feedback_gateway_room_joined',
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
      component: FeedbackGateway.name,
      feature: this.logFeature,
    });
  }
}
