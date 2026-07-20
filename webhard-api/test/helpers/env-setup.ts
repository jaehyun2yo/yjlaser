/**
 * 환경 변수 설정 (Jest setupFiles용)
 * 다른 모듈이 로드되기 전에 실행됨
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env 파일 로드 (webhard-api 디렉토리 기준)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Device-auth is intentionally fail-closed at application startup. E2E runs
// therefore provide an explicit synthetic, non-production configuration here
// instead of relying on a NODE_ENV fallback or a developer's local secret.
process.env.DEVICE_AUTH_ENVIRONMENT = 'dev';
process.env.DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION = '1';
process.env.DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON = JSON.stringify({
  '1': 'synthetic-device-auth-e2e-pepper-0123456789',
});
process.env.DEVICE_AUTH_AUDIT_HMAC_SECRET = 'synthetic-device-auth-e2e-audit-hmac-0123456789';
process.env.DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS = String(15 * 60 * 1000);
process.env.DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS = String(30 * 24 * 60 * 60 * 1000);
process.env.DEVICE_AUTH_AUDIT_LOG_TTL_MS = String(30 * 24 * 60 * 60 * 1000);
process.env.DEVICE_AUTH_ROTATION_DEADLINE_SECONDS = '900';
process.env.DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS = '120';
process.env.DEVICE_AUTH_ROTATION_RUNTIME_ENABLED = 'false';
process.env.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL =
  'https://device-bootstrap-e2e.example.test';
process.env.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN = 'synthetic-device-bootstrap-e2e-token';
process.env.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET =
  'synthetic-device-bootstrap-e2e-rate-hmac-0123456789';
