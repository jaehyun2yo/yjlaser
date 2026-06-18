'use client';

/**
 * Socket.IO 클라이언트 매니저
 * NestJS Gateway 네임스페이스별 소켓 연결을 관리합니다.
 *
 * 인증 흐름:
 *   연결 시 → /api/socket-auth 에서 단기 토큰 발급 → auth 필드로 전달
 *   재연결 시에도 동일 (auth 함수가 매번 호출됨)
 */
import { io, Socket } from 'socket.io-client';
import { logger } from '@/lib/utils/logger';
import { NESTJS_SOCKET_URL } from '@/lib/api/api-base';

const log = logger.createLogger('SocketManager');

const WS_BASE_URL = NESTJS_SOCKET_URL;

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnect_failed';
type StatusCallback = (status: ConnectionStatus) => void;

interface SocketConnection {
  socket: Socket;
  refCount: number;
  status: ConnectionStatus;
  statusCallbacks: Set<StatusCallback>;
}

/**
 * 네임스페이스별 싱글톤 소켓 연결을 관리합니다.
 * 같은 네임스페이스에 대한 중복 연결을 방지합니다.
 */
class SocketManager {
  private connections = new Map<string, SocketConnection>();

  /**
   * 네임스페이스에 연결합니다. 이미 연결이 있으면 refCount를 증가시킵니다.
   */
  connect(namespace: string, onStatus?: StatusCallback): Socket {
    const existing = this.connections.get(namespace);
    if (existing) {
      existing.refCount++;
      if (onStatus) {
        existing.statusCallbacks.add(onStatus);
        onStatus(existing.status);
      }
      return existing.socket;
    }

    const url = namespace ? `${WS_BASE_URL}/${namespace}` : WS_BASE_URL;
    const socket = io(url, {
      withCredentials: true,
      // 매 연결/재연결 시 /api/socket-auth에서 토큰 발급
      auth: (cb) => {
        fetch('/api/socket-auth', { method: 'POST' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => cb(data?.token ? { token: data.token } : {}))
          .catch(() => cb({}));
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
    });

    const statusCallbacks = new Set<StatusCallback>();
    if (onStatus) statusCallbacks.add(onStatus);

    const connection: SocketConnection = {
      socket,
      refCount: 1,
      status: 'connecting',
      statusCallbacks,
    };

    const broadcastStatus = (s: ConnectionStatus) => {
      connection.status = s;
      for (const cb of connection.statusCallbacks) cb(s);
    };

    socket.on('connect', () => {
      log.info(`Connected to namespace: ${namespace || 'default'}`);
      broadcastStatus('connected');
    });

    socket.on('disconnect', () => {
      log.info(`Disconnected from namespace: ${namespace || 'default'}`);
      broadcastStatus('disconnected');
    });

    socket.on('connect_error', (error: Error) => {
      log.error(`Connection error for namespace: ${namespace || 'default'}`, error.message);
      broadcastStatus('error');
    });

    // 모든 재연결 시도 실패 — 폴링 폴백만 작동
    socket.io.on('reconnect_failed', () => {
      log.error(`All reconnection attempts failed for namespace: ${namespace || 'default'}`);
      broadcastStatus('reconnect_failed');
    });

    this.connections.set(namespace, connection);
    return socket;
  }

  /**
   * 네임스페이스 연결 해제. refCount가 0이면 실제로 연결을 끊습니다.
   */
  disconnect(namespace: string, onStatus?: StatusCallback): void {
    const connection = this.connections.get(namespace);
    if (!connection) return;

    if (onStatus) connection.statusCallbacks.delete(onStatus);

    connection.refCount--;
    if (connection.refCount <= 0) {
      connection.statusCallbacks.clear();
      connection.socket.disconnect();
      this.connections.delete(namespace);
      log.info(`Fully disconnected namespace: ${namespace || 'default'}`);
    }
  }

  /**
   * 특정 네임스페이스의 소켓 인스턴스를 가져옵니다.
   */
  getSocket(namespace: string): Socket | null {
    return this.connections.get(namespace)?.socket || null;
  }

  /**
   * 재연결 실패 후 사용자가 명시적으로 같은 네임스페이스 연결을 다시 시도할 수 있게 합니다.
   */
  reconnect(namespace: string): void {
    const connection = this.connections.get(namespace);
    if (!connection) return;

    connection.status = 'connecting';
    for (const cb of connection.statusCallbacks) cb('connecting');
    connection.socket.connect();
    log.info(`Reconnect requested for namespace: ${namespace || 'default'}`);
  }

  /**
   * 모든 연결을 해제합니다.
   */
  disconnectAll(): void {
    for (const [namespace, connection] of this.connections) {
      connection.socket.disconnect();
      log.info(`Disconnected namespace: ${namespace || 'default'}`);
    }
    this.connections.clear();
  }
}

// 싱글톤 인스턴스
export const socketManager = new SocketManager();

export type { ConnectionStatus, StatusCallback };
