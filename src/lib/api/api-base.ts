/**
 * Central API URL configuration
 *
 * Client-side: uses /nestapi rewrite (same-origin, no CORS needed)
 * Server-side: direct connection to NestJS backend
 * Socket.IO: smart fallback using window.location.hostname
 */

// Client-side: /nestapi rewrite proxy (same-origin)
export const NESTJS_CLIENT_API_BASE = '/nestapi';

// Server-side: direct connection
export const NESTJS_SERVER_API_BASE = `${process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000'}/api/v1`;

// Socket.IO: direct URL (rewrite not possible for WebSocket)
export const NESTJS_SOCKET_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_WEBHARD_API_URL ||
      `${window.location.protocol}//${window.location.hostname}:4000`
    : process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
