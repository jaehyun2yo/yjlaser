import type { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
  type BackendLogChannel,
  type BackendLogStatus,
} from './log-event';

export type WebSocketGatewayLogLevel = 'debug' | 'warn' | 'error';

export interface WebSocketGatewayLogEventInput {
  level: WebSocketGatewayLogLevel;
  component: string;
  feature: string;
  event: string;
  action: string;
  status: BackendLogStatus;
  channel: BackendLogChannel;
  correlationId: string;
  client: Socket;
  targetRoom?: string;
  targetIdHash?: string;
  errorType?: string;
  metadata?: Record<string, unknown>;
}

export type ScopedWebSocketGatewayLogEventInput = Omit<
  WebSocketGatewayLogEventInput,
  'component' | 'feature'
>;

export function generateGatewayCorrelationId(feature: string): string {
  return generateCorrelationId(feature);
}

export function logWebSocketGatewayEvent(
  logger: Pick<Logger, 'debug' | 'warn' | 'error'>,
  input: WebSocketGatewayLogEventInput
): void {
  const message = formatWebSocketGatewayLogEvent(input);

  if (input.level === 'debug') {
    logger.debug(message);
    return;
  }

  if (input.level === 'warn') {
    logger.warn(message);
    return;
  }

  logger.error(message);
}

export function formatWebSocketGatewayLogEvent(input: WebSocketGatewayLogEventInput): string {
  return formatLogEvent({
    level: input.level,
    project: 'company_site',
    component: input.component,
    feature: input.feature,
    event: input.event,
    action: input.action,
    status: input.status,
    channel: input.channel,
    correlation_id: input.correlationId,
    actor_type: 'socket',
    actor_id_hash: hashIdentifier(input.client.id),
    target_id_hash: input.targetIdHash ?? hashGatewayRoom(input.targetRoom),
    error_type: input.errorType,
    metadata: {
      ...input.metadata,
      ...(input.targetRoom ? { room_type: getGatewayRoomType(input.targetRoom) } : {}),
    },
  });
}

export function hashGatewayRoom(room: string | undefined): string | undefined {
  return room ? hashIdentifier(room) : undefined;
}

export function getGatewayRoomType(room: string): string {
  if (room.includes(':')) {
    return room.split(':', 1)[0] || 'unknown';
  }

  if (['admin', 'worker', 'programs'].includes(room)) {
    return room;
  }

  return 'other';
}
