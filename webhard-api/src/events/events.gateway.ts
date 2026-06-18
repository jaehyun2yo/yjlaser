import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService, SessionUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  GatewaySocket,
  verifyBrowserGatewaySession,
  verifySignedSocketToken,
} from '../auth/gateway-auth.util';

export interface WebhardEvent {
  type:
    | 'file:created'
    | 'file:deleted'
    | 'file:moved'
    | 'file:renamed'
    | 'folder:created'
    | 'folder:deleted'
    | 'folder:moved'
    | 'folder:renamed'
    | 'folder:migrated'
    | 'batch:update';
  folderId: string | null;
  data?: Record<string, unknown>;
}

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('EventsGateway');

  // 배치 이벤트 큐 + 500ms 디바운스
  private pendingEvents = new Map<string, WebhardEvent[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL = 500;

  constructor(
    private authService: AuthService,
    private prisma: PrismaService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;

      if (cookie) {
        const user = verifyBrowserGatewaySession(this.authService, cookie, ['admin', 'company']);
        if (user) {
          authenticated = true;
          (client as GatewaySocket).userData = user;
        }
      }

      // Socket.IO auth 토큰 검증 (cross-origin 연결용 — company/worker 사용자)
      if (!authenticated && client.handshake.auth?.token) {
        const user = verifySignedSocketToken(client.handshake.auth.token, ['admin', 'company']);
        if (user) {
          authenticated = true;
          (client as GatewaySocket).userData = user;
        }
      }

      if (!authenticated) {
        this.logger.warn(`Unauthenticated WebSocket connection rejected: ${client.id}`);
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

  @SubscribeMessage('subscribe:folder')
  async handleSubscribeFolder(client: Socket, folderId: string) {
    const userData = (client as Socket & { userData?: SessionUser }).userData;

    // UUID 형식 검증 (클라이언트가 'root' 등 비UUID 값을 보낼 수 있음)
    const isValidUuid =
      folderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderId);

    // Verify folder access for non-root folders
    if (isValidUuid && userData && userData.userType !== 'admin') {
      const folder = await this.prisma.webhardFolder.findUnique({
        where: { id: folderId },
        select: { companyId: true },
      });

      if (folder && folder.companyId !== null && folder.companyId !== userData.companyId) {
        this.logger.warn(`Client ${client.id} denied subscription to folder ${folderId}`);
        client.emit('error', { message: 'Access denied to this folder' });
        return;
      }
    }

    const room = `folder:${folderId || 'root'}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage('unsubscribe:folder')
  handleUnsubscribeFolder(client: Socket, folderId: string) {
    const room = `folder:${folderId || 'root'}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left ${room}`);
  }

  /**
   * 폴더에 이벤트 브로드캐스트
   */
  emitToFolder(folderId: string | null, event: WebhardEvent) {
    const room = `folder:${folderId || 'root'}`;
    this.server.to(room).emit(event.type, event.data || {});
  }

  /**
   * 전체 브로드캐스트 (폴더 트리 변경 등)
   */
  emitGlobal(event: WebhardEvent) {
    this.server.emit(event.type, event.data || {});
  }

  /**
   * 배치 이벤트 발행 (디바운스)
   * 500ms 윈도우 내 같은 폴더의 이벤트를 합산하여 단일 broadcast
   */
  emitToFolderBatched(folderId: string | null, event: WebhardEvent) {
    const room = `folder:${folderId || 'root'}`;
    const pending = this.pendingEvents.get(room) || [];
    pending.push(event);
    this.pendingEvents.set(room, pending);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        for (const [pendingRoom, events] of this.pendingEvents) {
          this.server.to(pendingRoom).emit('batch:update', {
            created: events.filter((e) => e.type === 'file:created').length,
            deleted: events.filter((e) => e.type === 'file:deleted').length,
            moved: events.filter((e) => e.type === 'file:moved').length,
            total: events.length,
          });
        }
        this.pendingEvents.clear();
        this.flushTimer = null;
      }, this.BATCH_INTERVAL);
    }
  }
}
