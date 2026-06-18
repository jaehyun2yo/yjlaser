// 번째: 비밀번호 해시 생성 스크립트
const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = process.argv[2] || 'test_admin123';
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('Password:', password);
  console.log('Hash:', hash);
}

generateHash().catch(console.error);
