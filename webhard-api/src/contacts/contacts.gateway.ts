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

  private readonly logger = new Logger('ContactsGateway');

  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie;
      let authenticated = false;

      if (cookie) {
        const adminUser = verifyBrowserGatewaySession(this.authService, cookie, ['admin']);
        if (adminUser) {
          authenticated = true;
          await client.join('admin');
          this.logger.debug(`Client ${client.id} joined room: admin`);
        }

        if (!authenticated) {
          const workerUser = verifyWorkerGatewaySession(this.authService, cookie);
          if (workerUser) {
            authenticated = true;
            await client.join('worker');
            this.logger.debug(`Client ${client.id} joined room: worker (erp-session)`);
          }
        }
      }

      // Socket.IO auth 토큰 검증 (cross-origin 연결용)
      if (!authenticated && client.handshake.auth?.token) {
        const tokenUser = verifySignedSocketToken(client.handshake.auth.token, ['admin', 'worker']);
        if (tokenUser?.userType === 'admin') {
          authenticated = true;
          await client.join('admin');
          this.logger.debug(`Client ${client.id} joined room: admin (token)`);
        } else if (tokenUser?.userType === 'worker') {
          authenticated = true;
          await client.join('worker');
          this.logger.debug(`Client ${client.id} joined room: worker (token)`);
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
        `Socket emit failed for ${event}: ${err instanceof Error ? err.message : String(err)}`
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
}
