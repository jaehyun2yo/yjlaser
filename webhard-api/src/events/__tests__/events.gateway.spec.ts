/**
 * EventsGateway 테스트
 * Phase 5: Supabase Realtime → Socket.IO 전환 검증
 *
 * 테스트 전략:
 * - Socket.IO Server/Socket을 mock하여 이벤트 발행/구독 패턴 검증
 * - 인증 핸들링 검증
 * - 배치 이벤트 디바운스 로직 검증
 * - 폴더 접근 권한 검증
 */

import { EventsGateway, WebhardEvent } from '../events.gateway';
import { AuthService, SessionUser } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Socket, Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { hashIdentifier } from '../../common/logging/log-event';

type LoggedBackendEvent = {
  schema_version: 1;
  event: string;
  level: string;
  project: string;
  component: string;
  feature: string;
  action: string;
  status: string;
  channel: string;
  actor_id_hash?: string;
  target_id_hash?: string;
  error_type?: string;
  metadata?: Record<string, unknown>;
};

// ============================================================
// Mock factories
// ============================================================

function makeAuthService(): jest.Mocked<Pick<AuthService, 'verifySession'>> {
  return {
    verifySession: jest.fn(),
  };
}

function makePrismaService(): {
  webhardFolder: { findUnique: jest.Mock };
} {
  return {
    webhardFolder: {
      findUnique: jest.fn(),
    },
  };
}

function makeSocket(overrides: Partial<Socket> = {}): Socket & { userData?: SessionUser } {
  const socket = {
    id: 'socket-1',
    handshake: {
      headers: { cookie: '' },
    },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  } as unknown as Socket & { userData?: SessionUser };
  return socket;
}

function makeServer(): jest.Mocked<Pick<Server, 'to' | 'emit'>> & { to: jest.Mock } {
  const mockEmit = jest.fn();
  return {
    to: jest.fn().mockReturnValue({ emit: mockEmit }),
    emit: jest.fn(),
  };
}

function makeAdminUser(): SessionUser {
  return {
    userType: 'admin',
    userId: 'admin-1',
    companyId: null,
  };
}

function makeCompanyUser(companyId = 123): SessionUser {
  return {
    userType: 'company',
    userId: `company-${companyId}`,
    companyId,
  };
}

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(
    spies.flatMap((spy) =>
      spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    )
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = spy.mock.calls
    .flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .find(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && value.event === eventName
    );

  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }

  return event;
}

// ============================================================
// Test Suite
// ============================================================

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let authService: jest.Mocked<Pick<AuthService, 'verifySession'>>;
  let prisma: ReturnType<typeof makePrismaService>;
  let server: ReturnType<typeof makeServer>;

  beforeEach(() => {
    authService = makeAuthService();
    prisma = makePrismaService();
    gateway = new EventsGateway(
      authService as unknown as AuthService,
      prisma as unknown as PrismaService
    );
    server = makeServer();
    gateway.server = server as unknown as Server;

    // 타이머 제어
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ─── Connection Handling ───────────────────────────────────

  describe('handleConnection', () => {
    it('유효한 admin-session 쿠키로 연결할 수 있어야 함', async () => {
      const user = makeAdminUser();
      authService.verifySession.mockReturnValue(user);

      const socket = makeSocket({
        handshake: {
          headers: { cookie: 'admin-session=valid-token' },
        } as Socket['handshake'],
      } as Partial<Socket>);

      await gateway.handleConnection(socket);

      expect(authService.verifySession).toHaveBeenCalledWith('valid-token');
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect((socket as Socket & { userData?: SessionUser }).userData).toEqual(user);
    });

    it('쿠키가 없으면 연결을 거부해야 함', async () => {
      const socket = makeSocket();

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('인증이 실패하면 연결을 거부해야 함', async () => {
      jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      authService.verifySession.mockReturnValue(null);

      const socket = makeSocket({
        handshake: {
          headers: { cookie: 'admin-session=invalid-token' },
        } as Socket['handshake'],
      } as Partial<Socket>);

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
      const event = findJsonLogEvent(warnSpy, 'events_gateway_connection_rejected');
      expect(event).toMatchObject({
        level: 'warn',
        project: 'company_site',
        component: 'EventsGateway',
        feature: 'events_gateway',
        action: 'connect',
        status: 'failure',
        channel: 'security',
        actor_id_hash: hashIdentifier('socket-1'),
        metadata: {
          reason: 'unauthenticated',
          browser_present: true,
          socket_auth_present: false,
        },
      });

      const serialized = serializeLoggerCalls(warnSpy);
      expect(serialized).not.toContain('invalid-token');
      expect(serialized).not.toContain('socket-1');
      expect(serialized).not.toContain('Unauthenticated WebSocket connection rejected');
    });

    it('예외 발생 시 연결을 거부해야 함', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      authService.verifySession.mockImplementation(() => {
        throw new Error('Auth error');
      });

      const socket = makeSocket({
        handshake: {
          headers: { cookie: 'admin-session=bad-token' },
        } as Socket['handshake'],
      } as Partial<Socket>);

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalled();
      const event = findJsonLogEvent(errorSpy, 'events_gateway_connection_error');
      expect(event).toMatchObject({
        level: 'error',
        project: 'company_site',
        component: 'EventsGateway',
        feature: 'events_gateway',
        action: 'connect',
        status: 'failure',
        channel: 'error',
        error_type: 'Error',
      });
      expect(serializeLoggerCalls(errorSpy)).not.toContain('Auth error');
      expect(serializeLoggerCalls(errorSpy)).not.toContain('bad-token');
    });
  });

  // ─── Subscribe/Unsubscribe Folder ──────────────────────────

  describe('handleSubscribeFolder', () => {
    it('관리자가 폴더를 구독할 수 있어야 함', async () => {
      const socket = makeSocket();
      (socket as Socket & { userData?: SessionUser }).userData = makeAdminUser();

      await gateway.handleSubscribeFolder(socket, 'folder-uuid-1');

      expect(socket.join).toHaveBeenCalledWith('folder:folder-uuid-1');
    });

    it('루트 폴더(빈 문자열)를 구독할 수 있어야 함', async () => {
      const socket = makeSocket();
      (socket as Socket & { userData?: SessionUser }).userData = makeAdminUser();

      await gateway.handleSubscribeFolder(socket, '');

      expect(socket.join).toHaveBeenCalledWith('folder:root');
    });

    it('회사 사용자가 자기 회사 폴더를 구독할 수 있어야 함', async () => {
      const socket = makeSocket();
      (socket as Socket & { userData?: SessionUser }).userData = makeCompanyUser(123);
      // folderId 는 실제 DB의 UUID 포맷이어야 권한 검증 경로가 실행됨 (gateway 가 UUID 검사 후 findUnique 호출).
      const folderUuid = '11111111-1111-1111-1111-111111111111';

      prisma.webhardFolder.findUnique.mockResolvedValue({ companyId: 123 });

      await gateway.handleSubscribeFolder(socket, folderUuid);

      expect(socket.join).toHaveBeenCalledWith(`folder:${folderUuid}`);
    });

    it('회사 사용자가 다른 회사 폴더 구독 시 에러를 반환해야 함', async () => {
      jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const socket = makeSocket();
      (socket as Socket & { userData?: SessionUser }).userData = makeCompanyUser(123);
      const folderUuid = '22222222-2222-2222-2222-222222222222';

      prisma.webhardFolder.findUnique.mockResolvedValue({ companyId: 456 });

      await gateway.handleSubscribeFolder(socket, folderUuid);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Access denied to this folder',
      });
      expect(socket.join).not.toHaveBeenCalled();

      const event = findJsonLogEvent(warnSpy, 'events_gateway_folder_subscribe_denied');
      expect(event).toMatchObject({
        level: 'warn',
        project: 'company_site',
        component: 'EventsGateway',
        feature: 'events_gateway',
        action: 'subscribe_folder',
        status: 'failure',
        channel: 'security',
        actor_id_hash: hashIdentifier('socket-1'),
        target_id_hash: hashIdentifier(`folder:${folderUuid}`),
        metadata: {
          reason: 'company_mismatch',
          room_type: 'folder',
        },
      });

      const serialized = serializeLoggerCalls(warnSpy);
      expect(serialized).not.toContain('socket-1');
      expect(serialized).not.toContain(folderUuid);
      expect(serialized).not.toContain(`folder:${folderUuid}`);
    });

    it('companyId가 null인 공유 폴더는 모든 사용자가 구독할 수 있어야 함', async () => {
      const socket = makeSocket();
      (socket as Socket & { userData?: SessionUser }).userData = makeCompanyUser(123);
      const folderUuid = '33333333-3333-3333-3333-333333333333';

      prisma.webhardFolder.findUnique.mockResolvedValue({ companyId: null });

      await gateway.handleSubscribeFolder(socket, folderUuid);

      expect(socket.join).toHaveBeenCalledWith(`folder:${folderUuid}`);
    });
  });

  describe('handleUnsubscribeFolder', () => {
    it('폴더 구독을 해제할 수 있어야 함', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const socket = makeSocket();

      gateway.handleUnsubscribeFolder(socket, 'folder-uuid-1');

      expect(socket.leave).toHaveBeenCalledWith('folder:folder-uuid-1');
      const event = findJsonLogEvent(debugSpy, 'events_gateway_folder_unsubscribed');
      expect(event).toMatchObject({
        level: 'debug',
        project: 'company_site',
        component: 'EventsGateway',
        feature: 'events_gateway',
        action: 'unsubscribe_folder',
        status: 'success',
        channel: 'audit',
        actor_id_hash: hashIdentifier('socket-1'),
        target_id_hash: hashIdentifier('folder:folder-uuid-1'),
        metadata: {
          room_type: 'folder',
        },
      });
      expect(serializeLoggerCalls(debugSpy)).not.toContain('folder:folder-uuid-1');
      expect(serializeLoggerCalls(debugSpy)).not.toContain('socket-1');
    });

    it('루트 폴더 구독을 해제할 수 있어야 함', () => {
      const socket = makeSocket();

      gateway.handleUnsubscribeFolder(socket, '');

      expect(socket.leave).toHaveBeenCalledWith('folder:root');
    });
  });

  // ─── Event Emission ────────────────────────────────────────

  describe('emitToFolder', () => {
    it('특정 폴더에 이벤트를 브로드캐스트해야 함', () => {
      const event: WebhardEvent = {
        type: 'file:created',
        folderId: 'folder-uuid-1',
        data: { fileId: 'file-1', name: 'new-file.dxf' },
      };

      gateway.emitToFolder('folder-uuid-1', event);

      expect(server.to).toHaveBeenCalledWith('folder:folder-uuid-1');
      const emitMock = server.to('folder:folder-uuid-1').emit as jest.Mock;
      expect(emitMock).toHaveBeenCalledWith('file:created', event.data);
    });

    it('루트 폴더에 이벤트를 브로드캐스트해야 함 (folderId=null)', () => {
      const event: WebhardEvent = {
        type: 'file:created',
        folderId: null,
        data: { fileId: 'file-1' },
      };

      gateway.emitToFolder(null, event);

      expect(server.to).toHaveBeenCalledWith('folder:root');
    });

    it('data가 없는 이벤트도 빈 객체로 발행해야 함', () => {
      const event: WebhardEvent = {
        type: 'file:deleted',
        folderId: 'folder-uuid-1',
      };

      gateway.emitToFolder('folder-uuid-1', event);

      const emitMock = server.to('folder:folder-uuid-1').emit as jest.Mock;
      expect(emitMock).toHaveBeenCalledWith('file:deleted', {});
    });
  });

  describe('emitGlobal', () => {
    it('전체 클라이언트에 이벤트를 브로드캐스트해야 함', () => {
      const event: WebhardEvent = {
        type: 'folder:created',
        folderId: null,
        data: { folderId: 'new-folder' },
      };

      gateway.emitGlobal(event);

      expect(server.emit).toHaveBeenCalledWith('folder:created', event.data);
    });
  });

  // ─── Batched Events (Debounce) ─────────────────────────────

  describe('emitToFolderBatched', () => {
    it('500ms 디바운스 후 배치 이벤트를 합산하여 발행해야 함', () => {
      const events: WebhardEvent[] = [
        { type: 'file:created', folderId: 'folder-1', data: { fileId: 'f1' } },
        { type: 'file:created', folderId: 'folder-1', data: { fileId: 'f2' } },
        { type: 'file:deleted', folderId: 'folder-1', data: { fileId: 'f3' } },
      ];

      events.forEach((e) => gateway.emitToFolderBatched('folder-1', e));

      // 아직 flush 전
      expect(server.to).not.toHaveBeenCalled();

      // 500ms 경과
      jest.advanceTimersByTime(500);

      expect(server.to).toHaveBeenCalledWith('folder:folder-1');
      const emitMock = server.to('folder:folder-1').emit as jest.Mock;
      expect(emitMock).toHaveBeenCalledWith('batch:update', {
        created: 2,
        deleted: 1,
        moved: 0,
        total: 3,
      });
    });

    it('서로 다른 폴더의 이벤트를 별도로 합산해야 함', () => {
      gateway.emitToFolderBatched('folder-1', {
        type: 'file:created',
        folderId: 'folder-1',
      });
      gateway.emitToFolderBatched('folder-2', {
        type: 'file:moved',
        folderId: 'folder-2',
      });

      jest.advanceTimersByTime(500);

      expect(server.to).toHaveBeenCalledWith('folder:folder-1');
      expect(server.to).toHaveBeenCalledWith('folder:folder-2');
    });

    it('500ms 윈도우 내 추가 이벤트도 같은 배치에 포함해야 함', () => {
      gateway.emitToFolderBatched('folder-1', {
        type: 'file:created',
        folderId: 'folder-1',
      });

      jest.advanceTimersByTime(200);

      gateway.emitToFolderBatched('folder-1', {
        type: 'file:created',
        folderId: 'folder-1',
      });

      // 첫 이벤트 기준 500ms 경과
      jest.advanceTimersByTime(300);

      const emitMock = server.to('folder:folder-1').emit as jest.Mock;
      expect(emitMock).toHaveBeenCalledWith(
        'batch:update',
        expect.objectContaining({
          created: 2,
          total: 2,
        })
      );
    });

    it('flush 후 새로운 이벤트는 새 배치로 시작해야 함', () => {
      gateway.emitToFolderBatched('folder-1', {
        type: 'file:created',
        folderId: 'folder-1',
      });

      jest.advanceTimersByTime(500);

      const callsAfterFirstFlush = server.to.mock.calls.length;

      // 첫 배치 완료 후 새 이벤트
      gateway.emitToFolderBatched('folder-1', {
        type: 'file:deleted',
        folderId: 'folder-1',
      });

      jest.advanceTimersByTime(500);

      // 두 번째 배치에서 추가 to() 호출이 있어야 함
      expect(server.to.mock.calls.length).toBeGreaterThan(callsAfterFirstFlush);
    });
  });

  // ─── Disconnect ────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('클라이언트 연결 해제를 처리해야 함 (에러 없이)', () => {
      const socket = makeSocket();

      // 에러 없이 실행만 확인
      expect(() => gateway.handleDisconnect(socket)).not.toThrow();
    });
  });
});
