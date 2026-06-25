async function main(): Promise<void> {
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  process.env.OPERATIONAL_E2E_STRICT_ENV_FILE_CHECK = 'true';
  process.env.NEXT_PUBLIC_WEBHARD_API_URL = 'https://webhard-api.example.invalid';

  const { default: config } = await import('../next.config');
  const headers = await config.headers?.();
  const securityHeaders =
    headers
      ?.flatMap((entry) => entry.headers)
      .filter((header) => header.key.toLowerCase() === 'content-security-policy') ?? [];
  const csp = securityHeaders.at(-1)?.value ?? '';

  const disallowed = [
    "'unsafe-eval'",
    'https://unpkg.com',
    'http://*.daumcdn.net',
    'http://*.kakao.com',
    'http://localhost',
    'ws://localhost',
  ].filter((token) => csp.includes(token));

  if (disallowed.length > 0) {
    throw new Error(
      `production CSP contains development-only directives: ${disallowed.join(', ')}`
    );
  }

  if (!csp.includes('upgrade-insecure-requests')) {
    throw new Error('production CSP must include upgrade-insecure-requests');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
