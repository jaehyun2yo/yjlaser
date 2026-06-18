// .env.local 파일 생성 스크립트
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function setupEnv() {
  const password = 'test_admin123';
  console.log('Generating password hash for:', password);

  const hash = await bcrypt.hash(password, 12);
  console.log('Generated hash:', hash);
  console.log('Hash length:', hash.length);

  // base64 인코딩하여 저장
  const encodedHash = Buffer.from(hash).toString('base64');
  console.log('Encoded hash (base64):', encodedHash);

  const envContent = `TEST_ADMIN_USERNAME=test_admin
TEST_ADMIN_PASSWORD_HASH_B64=${encodedHash}
`;

  const envPath = path.join(process.cwd(), '.env.local');
  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log('\n✅ .env.local file created successfully!');
  console.log('File path:', envPath);
  console.log('\nFile content:');
  console.log(envContent);
}

setupEnv().catch(console.error);
