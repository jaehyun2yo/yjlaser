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
 * Bookings 실시간 이벤트 Gateway
 * - booking:created, booking:updated, booking:deleted 이벤트 브로드캐스트
 * - /bookings namespace 사용
 */
@WebSocketGateway({
  namespace: '/bookings',
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class BookingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BookingsGateway.name);
  private readonly logFeature = 'bookings_gateway';

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    const correlationId = generateGatewayCorrelationId(this.logFeature);
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;
      this.logGatewayEvent({
        level: 'debug',
        event: 'bookings_gateway_connection_started',
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
          event: 'bookings_gateway_connection_rejected',
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
        event: 'bookings_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      });
    } catch (err) {
      this.logGatewayEvent({
        level: 'error',
        event: 'bookings_gateway_connection_error',
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
      event: 'bookings_gateway_disconnected',
      action: 'disconnect',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
    });
  }

  /**
   * 예약 생성 이벤트 — admin 룸 + 해당 company 룸으로 전송
   */
  emitBookingCreated(booking: Record<string, unknown>) {
    const companyId = booking.companyId as number | null | undefined;
    this.server.to('admin').emit('booking:created', booking);
    if (companyId != null) {
      this.server.to(`company:${companyId}`).emit('booking:created', booking);
    }
  }

  /**
   * 예약 업데이트 이벤트 — admin 룸 + 해당 company 룸으로 전송
   */
  emitBookingUpdated(booking: Record<string, unknown>) {
    const companyId = booking.companyId as number | null | undefined;
    this.server.to('admin').emit('booking:updated', booking);
    if (companyId != null) {
      this.server.to(`company:${companyId}`).emit('booking:updated', booking);
    }
  }

  /**
   * 예약 삭제 이벤트 — admin 룸 + 해당 company 룸으로 전송
   */
  emitBookingDeleted(bookingId: string | number, companyId?: number | null) {
    this.server.to('admin').emit('booking:deleted', { id: bookingId });
    if (companyId != null) {
      this.server.to(`company:${companyId}`).emit('booking:deleted', { id: bookingId });
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
      event: 'bookings_gateway_room_joined',
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
      component: BookingsGateway.name,
      feature: this.logFeature,
    });
  }
}
