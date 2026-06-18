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

  private readonly logger = new Logger('FeedbackGateway');

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;

      if (cookie) {
        const user = verifyBrowserGatewaySession(this.authService, cookie, ['admin']);
        if (user) {
          authenticated = true;
          await client.join('admin');
          this.logger.debug(`Client ${client.id} joined room: admin`);
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
}
