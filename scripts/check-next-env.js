// Next.js 환경 변수 로딩 시뮬레이션 (dotenv 사용)
// Next.js는 dotenv를 사용하여 .env.local을 로드합니다
require('dotenv').config({ path: '.env.local' });

console.log('=== Next.js Environment Variables Simulation ===');
console.log('TEST_ADMIN_USERNAME:', process.env.TEST_ADMIN_USERNAME || '❌ Not set');
const hash = process.env.TEST_ADMIN_PASSWORD_HASH;
console.log('TEST_ADMIN_PASSWORD_HASH:', hash ? `${hash.substring(0, 30)}...` : '❌ Not set');
console.log('Hash full length:', hash?.length);
console.log('Hash starts with:', hash?.substring(0, 7));
console.log('Expected length: 60');
console.log('Expected starts with: $2b$12');

if (hash && hash.length === 60 && hash.startsWith('$2b$12')) {
  console.log('\n✅ 해시가 올바르게 로드되었습니다!');
} else {
  console.log('\n❌ 해시가 잘못 로드되었습니다!');
  if (hash) {
    console.log('   실제 길이:', hash.length);
    console.log('   실제 시작:', hash.substring(0, 20));
  }
}
