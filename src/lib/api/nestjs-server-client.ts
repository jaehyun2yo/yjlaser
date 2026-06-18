/**
 * NestJS Server-Side API Client
 *
 * Compatibility barrel for existing imports from `@/lib/api/nestjs-server-client`.
 * Domain implementations live under `@/lib/api/nestjs/*`.
 */

export { nestjsFetch } from './nestjs/core.client';
export type { NestJSRequestOptions, NestJSResponse } from './nestjs/core.client';
export * from './nestjs/webhard.client';
export * from './nestjs/contacts.client';
export * from './nestjs/companies.client';
export * from './nestjs/operations.client';
