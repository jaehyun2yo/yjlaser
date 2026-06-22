/**
 * ContactsGateway 테스트
 *
 * 주요 검증:
 * - server=null 시 emit* 메서드가 throw 없이 no-op (createApplicationContext 경로 보호)
 * - server 가 붙어있으면 admin + worker 룸으로 브로드캐스트
 */

import { ContactsGateway } from './contacts.gateway';
import { AuthService } from '../auth/auth.service';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';

function makeEmitter() {
  const emit = jest.fn();
  const inner = { to: jest.fn(), emit };
  inner.to.mockReturnValue(inner);
  return { emitter: inner as unknown as Server, emit };
}

function makeServer() {
  const { emitter, emit } = makeEmitter();
  const server = {
    to: jest.fn().mockReturnValue(emitter),
  } as unknown as Server;
  return { server, emit, toMock: server.to as jest.Mock };
}

describe('ContactsGateway', () => {
  let gateway: ContactsGateway;

  beforeEach(() => {
    gateway = new ContactsGateway({} as AuthService);
  });

  describe('connection auth', () => {
    it('유효한 erp-session은 worker verifier로 검증한 뒤 worker room에 join한다', async () => {
      const verifySession = jest.fn(() => null);
      const verifyWorkerSession = jest.fn(() => ({
        userType: 'worker',
        userId: 'worker-1',
        companyId: null,
        workerName: '작업자',
      }));
      gateway = new ContactsGateway({
        verifySession,
        verifyWorkerSession,
      } as unknown as AuthService);

      const join = jest.fn();
      const disconnect = jest.fn();
      const client = {
        id: 'socket-1',
        handshake: {
          headers: { cookie: 'erp-session=valid-worker-token' },
          auth: {},
        },
        join,
        disconnect,
      };

      await gateway.handleConnection(client as never);

      expect(verifySession).not.toHaveBeenCalledWith('valid-worker-token');
      expect(verifyWorkerSession).toHaveBeenCalledWith('valid-worker-token');
      expect(join).toHaveBeenCalledWith('worker');
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('URL-encoded erp-session 쿠키를 decode한 뒤 worker verifier로 검증한다', async () => {
      const verifySession = jest.fn(() => null);
      const verifyWorkerSession = jest.fn(() => ({
        userType: 'worker',
        userId: 'worker-1',
        companyId: null,
        workerName: '작업자',
      }));
      gateway = new ContactsGateway({
        verifySession,
        verifyWorkerSession,
      } as unknown as AuthService);

      const join = jest.fn();
      const disconnect = jest.fn();
      const client = {
        id: 'socket-1',
        handshake: {
          headers: { cookie: 'erp-session=token%3Apayload.signature' },
          auth: {},
        },
        join,
        disconnect,
      };

      await gateway.handleConnection(client as never);

      expect(verifyWorkerSession).toHaveBeenCalledWith('token:payload.signature');
      expect(join).toHaveBeenCalledWith('worker');
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('검증 실패 erp-session 쿠키만으로 worker room에 join하지 않는다', async () => {
      const verifySession = jest.fn(() => null);
      const verifyWorkerSession = jest.fn(() => null);
      gateway = new ContactsGateway({
        verifySession,
        verifyWorkerSession,
      } as unknown as AuthService);

      const join = jest.fn();
      const disconnect = jest.fn();
      const client = {
        id: 'socket-1',
        handshake: {
          headers: { cookie: 'erp-session=forged-token' },
          auth: {},
        },
        join,
        disconnect,
      };

      await gateway.handleConnection(client as never);

      expect(verifyWorkerSession).toHaveBeenCalledWith('forged-token');
      expect(join).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalled();
    });

    it('company-session은 contacts private rooms에 연결할 수 없다', async () => {
      const verifySession = jest.fn(() => ({
        userType: 'company',
        userId: 7,
        companyId: 7,
      }));
      gateway = new ContactsGateway({ verifySession } as unknown as AuthService);

      const join = jest.fn();
      const disconnect = jest.fn();
      const client = {
        id: 'socket-1',
        handshake: {
          headers: { cookie: 'company-session=company-token' },
          auth: {},
        },
        join,
        disconnect,
      };

      await gateway.handleConnection(client as never);

      expect(join).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalled();
    });
  });

  describe('server=null 안전성 (standalone 스크립트 경로)', () => {
    // createApplicationContext 로 부팅되면 @WebSocketServer() 주입이 일어나지 않아 server 가 null.
    // 이 경로에서 emit* 호출 시 null.to(...) 로 throw 하면 마이그레이션 스크립트가 중단된다.
    beforeEach(() => {
      (gateway as unknown as { server: Server | null }).server = null;
    });

    it('emitContactCreated 는 throw 없이 종료', () => {
      expect(() => gateway.emitContactCreated({ id: 1 })).not.toThrow();
    });

    it('emitContactUpdated 는 throw 없이 종료', () => {
      expect(() => gateway.emitContactUpdated({ id: 1 })).not.toThrow();
    });

    it('emitContactDeleted 는 throw 없이 종료', () => {
      expect(() => gateway.emitContactDeleted('c-1')).not.toThrow();
    });

    it('emitContactStatusChanged 는 throw 없이 종료', () => {
      expect(() => gateway.emitContactStatusChanged({ id: 1 })).not.toThrow();
    });

    it('emitContactProcessStageChanged 는 throw 없이 종료', () => {
      expect(() => gateway.emitContactProcessStageChanged({ id: 1 })).not.toThrow();
    });

    it('emitBatchUpdated 는 throw 없이 종료', () => {
      expect(() => gateway.emitBatchUpdated({ contactIds: ['a'], changes: {} })).not.toThrow();
    });

    it('emitDrawingRevisionAdded 는 throw 없이 종료', () => {
      expect(() => gateway.emitDrawingRevisionAdded({ revisionId: 'r1' })).not.toThrow();
    });

    it('emitContactSplit 는 throw 없이 종료', () => {
      expect(() => gateway.emitContactSplit({ parentId: 'p' })).not.toThrow();
    });

    it('emitGroupStageAdvanced 는 throw 없이 종료', () => {
      expect(() => gateway.emitGroupStageAdvanced({ groupId: 'g' })).not.toThrow();
    });

    it('emitFolderRenamed 는 throw 없이 종료 (마이그레이션 스크립트 핵심 경로)', () => {
      expect(() =>
        gateway.emitFolderRenamed({
          contactId: 'c1',
          folderId: 'f1',
          oldName: 'old',
          newName: 'new',
        })
      ).not.toThrow();
    });

    it('emitFileMoved 는 throw 없이 종료 (마이그레이션 스크립트 핵심 경로)', () => {
      expect(() =>
        gateway.emitFileMoved({
          contactId: 'c1',
          fileId: 'file1',
          oldFolderId: 'f1',
          newFolderId: 'f2',
        })
      ).not.toThrow();
    });
  });

  describe('server 주입된 정상 경로', () => {
    let emit: jest.Mock;
    let toMock: jest.Mock;

    beforeEach(() => {
      const s = makeServer();
      emit = s.emit;
      toMock = s.toMock;
      (gateway as unknown as { server: Server }).server = s.server;
    });

    it('emitFolderRenamed 는 admin + worker 룸에 folder:renamed 이벤트 발행', () => {
      const payload = {
        contactId: 'c1',
        folderId: 'f1',
        oldName: 'old',
        newName: 'new',
      };
      gateway.emitFolderRenamed(payload);

      expect(toMock).toHaveBeenCalledWith('admin');
      expect(emit).toHaveBeenCalledWith('folder:renamed', payload);
    });

    it('emitFileMoved 는 admin + worker 룸에 file:moved 이벤트 발행', () => {
      const payload = {
        contactId: 'c1',
        fileId: 'file1',
        oldFolderId: 'f1',
        newFolderId: 'f2',
      };
      gateway.emitFileMoved(payload);

      expect(toMock).toHaveBeenCalledWith('admin');
      expect(emit).toHaveBeenCalledWith('file:moved', payload);
    });

    it('emitContactCreated 는 contact:created 이벤트 발행', () => {
      const contact = { id: 42 };
      gateway.emitContactCreated(contact);

      expect(emit).toHaveBeenCalledWith('contact:created', contact);
    });

    it('emitContactProcessStageChanged 는 socket emit 실패 시에도 요청 경로로 throw 하지 않는다', () => {
      emit.mockImplementation(() => {
        throw new Error('socket adapter unavailable');
      });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      expect(() => gateway.emitContactProcessStageChanged({ id: 'contact-1' })).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Socket emit failed for contact:process_stage_changed')
      );

      warnSpy.mockRestore();
    });
  });
});
