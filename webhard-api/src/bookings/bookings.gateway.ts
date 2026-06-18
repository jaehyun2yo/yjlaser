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

  private readonly logger = new Logger('BookingsGateway');

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
}
