// 환경 변수 테스트 스크립트 (Next.js 스타일)
require('dotenv').config({ path: '.env.local' });

console.log('=== Environment Variables Test ===');
console.log('TEST_ADMIN_USERNAME:', process.env.TEST_ADMIN_USERNAME);
console.log(
  'TEST_ADMIN_PASSWORD_HASH:',
  process.env.TEST_ADMIN_PASSWORD_HASH
    ? process.env.TEST_ADMIN_PASSWORD_HASH.substring(0, 30) + '...'
    : 'NOT SET'
);
console.log('ADMIN_USERNAME:', process.env.ADMIN_USERNAME);
console.log('ADMIN_PASSWORD_HASH:', process.env.ADMIN_PASSWORD_HASH ? 'SET' : 'NOT SET');
