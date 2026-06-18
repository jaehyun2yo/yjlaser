// 비밀번호 검증 테스트 스크립트
const bcrypt = require('bcryptjs');

async function testPassword() {
  const password = 'test_admin123';
  const hash = '$2b$12$gxJn8.APPN8IbnopId/Oo.Uv2f6BvdnRD0CYjOpxmYVZ.FeSNScrO';

  console.log('Testing password verification...');
  console.log('Password:', password);
  console.log('Hash:', hash);

  const isValid = await bcrypt.compare(password, hash);
  console.log('Verification result:', isValid ? '✅ SUCCESS' : '❌ FAILED');

  if (isValid) {
    console.log('\n✅ 비밀번호 검증 성공!');
  } else {
    console.log('\n❌ 비밀번호 검증 실패!');
  }
}

testPassword().catch(console.error);
