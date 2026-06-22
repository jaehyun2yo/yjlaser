import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import {
  verifyBrowserGatewaySession,
  verifySignedSocketToken,
  verifyWorkerGatewaySession,
} from '../auth/gateway-auth.util';
import {
  generateGatewayCorrelationId,
  logWebSocketGatewayEvent,
  type ScopedWebSocketGatewayLogEventInput,
} from '../common/logging/gateway-log-event';
import { formatLogEvent, hashIdentifier } from '../common/logging/log-event';

/**
 * Contacts 실시간 이벤트 Gateway
 * - contact:created, contact:updated, contact:deleted 이벤트 브로드캐스트
 * - /contacts namespace 사용
 * - admin 룸 전용 (contacts는 관리자만 접근)
 */
@WebSocketGateway({
  namespace: '/contacts',
  cors: {
    origin: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(
      ','
    ),
    credentials: true,
  },
})
export class ContactsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ContactsGateway.name);
  private readonly logFeature = 'contacts_gateway';

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    const correlationId = generateGatewayCorrelationId(this.logFeature);
    try {
      const cookie = client.handshake.headers.cookie;
      const hasSocketToken = !!client.handshake.auth?.token;
      let authenticated = false;
      this.logGatewayEvent({
        level: 'debug',
        event: 'contacts_gateway_connection_started',
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
        const adminUser = verifyBrowserGatewaySession(this.authService, cookie, ['admin']);
        if (adminUser) {
          authenticated = true;
          const room = 'admin';
          await client.join(room);
          this.logRoomJoined(client, room, adminUser.userType, 'browser_session', correlationId);
        }

        if (!authenticated) {
          const workerUser = verifyWorkerGatewaySession(this.authService, cookie);
          if (workerUser) {
            authenticated = true;
            const room = 'worker';
            await client.join(room);
            this.logRoomJoined(client, room, workerUser.userType, 'worker_session', correlationId);
          }
        }
      }

      // Socket.IO auth 토큰 검증 (cross-origin 연결용)
      if (!authenticated && client.handshake.auth?.token) {
        const tokenUser = verifySignedSocketToken(client.handshake.auth.token, ['admin', 'worker']);
        if (tokenUser?.userType === 'admin') {
          authenticated = true;
          const room = 'admin';
          await client.join(room);
          this.logRoomJoined(client, room, tokenUser.userType, 'socket_token', correlationId);
        } else if (tokenUser?.userType === 'worker') {
          authenticated = true;
          const room = 'worker';
          await client.join(room);
          this.logRoomJoined(client, room, tokenUser.userType, 'socket_token', correlationId);
        }
      }

      if (!authenticated) {
        this.logGatewayEvent({
          level: 'warn',
          event: 'contacts_gateway_connection_rejected',
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
        event: 'contacts_gateway_connected',
        action: 'connect',
        status: 'success',
        channel: 'audit',
        correlationId,
        client,
      });
    } catch (err) {
      this.logGatewayEvent({
        level: 'error',
        event: 'contacts_gateway_connection_error',
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
      event: 'contacts_gateway_disconnected',
      action: 'disconnect',
      status: 'success',
      channel: 'audit',
      correlationId: generateGatewayCorrelationId(this.logFeature),
      client,
    });
  }

  /**
   * admin + worker 룸에 안전하게 이벤트를 발행한다.
   * createApplicationContext 로 부팅된 스크립트 경로에서는 `server` 가 null 이므로 no-op.
   */
  private safeEmit(event: string, payload: unknown, rooms: string[] = ['admin', 'worker']) {
    if (!this.server) return;
    try {
      const target = rooms.reduce<ReturnType<Server['to']> | Server>(
        (acc, room) => acc.to(room),
        this.server
      );
      target.emit(event, payload);
    } catch (err) {
      this.logger.warn(
        formatLogEvent({
          level: 'warn',
          project: 'company_site',
          component: ContactsGateway.name,
          feature: this.logFeature,
          event: 'contacts_gateway_emit_failed',
          action: 'emit',
          status: 'failure',
          channel: 'error',
          correlation_id: generateGatewayCorrelationId(this.logFeature),
          target_id_hash: hashIdentifier(event),
          error_type: err instanceof Error ? err.name : typeof err,
          metadata: {
            event_name: event,
            room_count: rooms.length,
          },
        })
      );
    }
  }

  /**
   * 문의 생성 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitContactCreated(contact: Record<string, unknown>) {
    this.safeEmit('contact:created', contact);
  }

  /**
   * 문의 업데이트 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitContactUpdated(contact: Record<string, unknown>) {
    this.safeEmit('contact:updated', contact);
  }

  /**
   * 문의 삭제 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitContactDeleted(contactId: string | number) {
    this.safeEmit('contact:deleted', { id: contactId });
  }

  /**
   * 문의 상태 변경 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitContactStatusChanged(contact: Record<string, unknown>) {
    this.safeEmit('contact:status_changed', contact);
  }

  /**
   * 문의 공정단계 변경 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitContactProcessStageChanged(contact: Record<string, unknown>) {
    this.safeEmit('contact:process_stage_changed', contact);
  }

  /**
   * 일괄 업데이트 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitBatchUpdated(payload: { contactIds: string[]; changes: Record<string, unknown> }) {
    this.safeEmit('contacts:batch_updated', payload);
  }

  /**
   * 도면 수정 등록 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitDrawingRevisionAdded(payload: Record<string, unknown>) {
    this.safeEmit('contact:drawing_revision_added', payload);
  }

  /**
   * 문의 분할 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitContactSplit(payload: Record<string, unknown>) {
    this.safeEmit('contact:split', payload);
  }

  /**
   * 그룹 일괄 단계 이동 이벤트 브로드캐스트 (admin + worker 룸)
   */
  emitGroupStageAdvanced(payload: Record<string, unknown>) {
    this.safeEmit('contact:group-stage-advanced', payload);
  }

  /**
   * 문의 폴더 이름 변경 이벤트 (admin + worker 룸).
   * 거래처(company)에는 전달하지 않는다 — 내부 운영 폴더 구조 노출 방지.
   */
  emitFolderRenamed(payload: {
    contactId: string;
    folderId: string;
    oldName: string;
    newName: string;
  }) {
    this.safeEmit('folder:renamed', payload);
  }

  /**
   * WebhardFile 이동 이벤트 (admin + worker 룸).
   * 거래처(company)에는 전달하지 않는다 — 내부 운영 폴더 구조 노출 방지.
   */
  emitFileMoved(payload: {
    contactId: string;
    fileId: string;
    oldFolderId: string | null;
    newFolderId: string;
  }) {
    this.safeEmit('file:moved', payload);
  }

  private logRoomJoined(
    client: Socket,
    room: string,
    userType: string,
    authMethod: 'browser_session' | 'worker_session' | 'socket_token',
    correlationId: string
  ): void {
    this.logGatewayEvent({
      level: 'debug',
      event: 'contacts_gateway_room_joined',
      action: 'join_room',
      status: 'success',
      channel: 'audit',
      correlationId,
      client,
      targetRoom: room,
      metadata: {
        auth_method: authMethod,
        user_type: userType,
      },
    });
  }

  private logGatewayEvent(input: ScopedWebSocketGatewayLogEventInput): void {
    logWebSocketGatewayEvent(this.logger, {
      ...input,
      component: ContactsGateway.name,
      feature: this.logFeature,
    });
  }
}
