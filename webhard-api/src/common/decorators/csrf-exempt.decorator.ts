import { SetMetadata } from '@nestjs/common';

/**
 * Marks a cookie-less route as deliberately exempt from the global CSRF
 * guard. Routes must still enforce their own credential-source boundary.
 */
export const CSRF_EXEMPT_METADATA_KEY = 'csrf-exempt';

export const CsrfExempt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CSRF_EXEMPT_METADATA_KEY, true);
