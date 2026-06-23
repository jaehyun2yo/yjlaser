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
import {
  generateGatewayCorrelationId,
  logWebSocketGatewayEvent,
  type ScopedWebSocketGatewayLogEventInput,
} from '../common/logging/gateway-log-event';

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

  private readonly logger = new Logger(EventsGateway.name);
  private readonly logFeature = 'events_gateway';

  // 배치 이벤트 큐 + 500ms 디바운스
  private pendingEvents = new Map<string, WebhardEvent[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL = 500;

  constructor(
    private authService: AuthService,
    private prisma: PrismaService
  ) {}

  async handleConnection(client: Socket) {
    const correlationId = generateGatewayCorrelationId(this.logFeature);
    try {
      const cookie = client.handshake.headers.cookie;
      const hasSocketToken = !!client.handshake.auth?.token;
      let authenticated = false;
      this.logGatewayEvent({
        level: 'debug',
        event: 'events_gateway_connection_started',
        action: 'connect',
        status: 'start',
        channel: 'audit',
        correlationId,
        client,
        metadata: {
          browser_present: !!cookie,
          socket_auth_present: hasSocketToken,
        },
      });

      if (cookie) {
        const user = verifyBrowserGatewaySession(this.authService, cookie, ['admin', 'company']);
        if (user) {
          authenticated = true;
          (client as GatewaySocket).userData = user;
          this.logConnectionAuthenticated(client, user, 'browser_session', correlationId);
        }
      }

      // Socket.IO auth 토큰 검증 (cross-origin 연결용 — company/worker 사용자)
      if (!authenticated && client.handshake.auth?.token) {
        const user = verifySignedSocketToken(client.handshake.auth.token, ['admin', 'company']);
        if (user) {
          authenticated = true;
          (client as GatewaySocket).userData = user;
          this.logConnectionAuthenticated(client, user, 'socket_token', correlationId);
        }
      }

      if (!authenticated) {
        this.logGatewayEvent({
          level: 'warn',
          event: 'events_gateway_connection_rejected',
          action: 'connect',
          status: 'failure',
          channel: 'security',
          correlationId,
          client,
          metadata: {
            reason: 'unauthenticated',
            browser_present: !!cookie,
            socket_auth_present: hasSocketToken,
          },
        });
        client.disconnect();
        return;
      }

      this.logGatewayEvent({
        level: 'debug',
        event: 'events_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      });
    } catch (err) {
      this.logGatewayEvent({
        level: 'error',
        event: 'events_gateway_connection_error',
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
      event: 'events_gateway_disconnected',
      action: 'disconnect',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
    });
  }

  @SubscribeMessage('subscribe:folder')
  async handleSubscribeFolder(client: Socket, folderId: string) {
    const userData = (client as Socket & { userData?: SessionUser }).userData;
    const room = `folder:${folderId || 'root'}`;

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
        this.logGatewayEvent({
          level: 'warn',
          event: 'events_gateway_folder_subscribe_denied',
          action: 'subscribe_folder',
          status: 'failure',
          channel: 'security',
          correlationId: generateGatewayCorrelationId(this.logFeature),
          client,
          targetRoom: room,
          metadata: {
            reason: 'company_mismatch',
            user_type: userData.userType,
          },
        });
        client.emit('error', { message: 'Access denied to this folder' });
        return;
      }
    }

    client.join(room);
    this.logGatewayEvent({
      level: 'debug',
      event: 'events_gateway_folder_subscribed',
      action: 'subscribe_folder',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
      targetRoom: room,
      metadata: {
        user_type: userData?.userType,
      },
    });
  }

  @SubscribeMessage('unsubscribe:folder')
  handleUnsubscribeFolder(client: Socket, folderId: string) {
    const room = `folder:${folderId || 'root'}`;
    client.leave(room);
    this.logGatewayEvent({
      level: 'debug',
      event: 'events_gateway_folder_unsubscribed',
      action: 'unsubscribe_folder',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
      targetRoom: room,
    });
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

  private logConnectionAuthenticated(
    client: Socket,
    user: SessionUser,
    authMethod: 'browser_session' | 'socket_token',
    correlationId: string
  ): void {
    this.logGatewayEvent({
      level: 'debug',
      event: 'events_gateway_connection_authenticated',
      action: 'authenticate',
      status: 'success',
      channel: 'audit',
      correlationId,
      client,
      metadata: {
        auth_method: authMethod,
        user_type: user.userType,
      },
    });
  }

  private logGatewayEvent(input: ScopedWebSocketGatewayLogEventInput): void {
    logWebSocketGatewayEvent(this.logger, {
      ...input,
      component: EventsGateway.name,
      feature: this.logFeature,
    });
  }
}
