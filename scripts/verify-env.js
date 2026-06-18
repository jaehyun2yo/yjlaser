// 환경 변수 확인 스크립트 (Node.js에서 직접 .env 파일 읽기)
require('dotenv').config({ path: '.env.local' });

console.log('=== Environment Variables Check ===');
console.log('TEST_ADMIN_USERNAME:', process.env.TEST_ADMIN_USERNAME || '❌ Not set');
console.log(
  'TEST_ADMIN_PASSWORD_HASH:',
  process.env.TEST_ADMIN_PASSWORD_HASH
    ? process.env.TEST_ADMIN_PASSWORD_HASH.substring(0, 40) + '...'
    : '❌ Not set'
);
console.log('ADMIN_USERNAME:', process.env.ADMIN_USERNAME || 'Not set');
console.log(
  'ADMIN_PASSWORD_HASH:',
  process.env.ADMIN_PASSWORD_HASH
    ? process.env.ADMIN_PASSWORD_HASH.substring(0, 40) + '...'
    : 'Not set'
);
