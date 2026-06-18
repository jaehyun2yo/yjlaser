// 비밀번호 검증 테스트 스크립트
const bcrypt = require('bcryptjs');

async function testVerify() {
  const password = 'test_admin123';
  const hash = '$2b$12$DYg6ZdUbAIi4c2NSyi05DeSChhf6rtsEJ9tkp76v1m06zA4Y6JMZy';

  console.log('Testing password verification...');
  console.log('Password:', password);
  console.log('Hash:', hash);

  const isValid = await bcrypt.compare(password, hash);
  console.log('Verification result:', isValid);

  // 새로운 해시 생성 및 검증 테스트
  const newHash = await bcrypt.hash(password, 12);
  console.log('\nNew hash generated:', newHash);
  const isValidNew = await bcrypt.compare(password, newHash);
  console.log('New hash verification:', isValidNew);
}

testVerify().catch(console.error);
