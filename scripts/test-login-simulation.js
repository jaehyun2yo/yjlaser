// 로그인 로직 시뮬레이션 테스트
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

async function simulateLogin() {
  const testUsername = 'test_admin';
  const testPassword = 'test_admin123';

  console.log('=== 로그인 시뮬레이션 테스트 ===\n');

  // 환경 변수 확인
  const testAdminUsername = process.env.TEST_ADMIN_USERNAME;
  const testAdminPasswordHash = process.env.TEST_ADMIN_PASSWORD_HASH;
  const adminUsername = process.env.ADMIN_USERNAME || 'test';
  const adminPasswordHash =
    process.env.ADMIN_PASSWORD_HASH ||
    '$2b$12$ynu9sCHlJmOe4FyRn4h1/Ov.5VD.OWUH.QM2a2ZfqNWmxaUywEQpq';

  console.log('1. 환경 변수 확인:');
  console.log('   TEST_ADMIN_USERNAME:', testAdminUsername || '❌ Not set');
  console.log(
    '   TEST_ADMIN_PASSWORD_HASH:',
    testAdminPasswordHash ? `✅ Set (${testAdminPasswordHash.length} chars)` : '❌ Not set'
  );
  console.log('   ADMIN_USERNAME (fallback):', adminUsername);
  console.log(
    '   ADMIN_PASSWORD_HASH (fallback):',
    adminPasswordHash ? `✅ Set (${adminPasswordHash.length} chars)` : '❌ Not set'
  );

  // 사용할 계정 정보 결정
  const currentUsername = testAdminUsername || adminUsername;
  const currentPasswordHash = testAdminPasswordHash || adminPasswordHash;

  console.log('\n2. 사용할 계정 정보:');
  console.log('   Username:', currentUsername);
  console.log('   Hash source:', testAdminUsername ? 'TEST_ADMIN' : 'ADMIN (fallback)');
  console.log('   Hash length:', currentPasswordHash?.length);
  console.log('   Hash prefix:', currentPasswordHash?.substring(0, 30) + '...');

  // 사용자명 검증
  console.log('\n3. 사용자명 검증:');
  const trimmedUsername = testUsername.trim();
  console.log('   입력:', trimmedUsername);
  console.log('   기대값:', currentUsername);
  const usernameMatch = trimmedUsername === currentUsername;
  console.log('   결과:', usernameMatch ? '✅ Match' : '❌ Mismatch');

  if (!usernameMatch) {
    console.log('\n❌ 사용자명 불일치로 로그인 실패');
    return false;
  }

  // 비밀번호 검증
  console.log('\n4. 비밀번호 검증:');
  if (!currentPasswordHash) {
    console.log('   ❌ 비밀번호 해시가 설정되지 않음');
    return false;
  }

  try {
    const isValidPassword = await bcrypt.compare(testPassword, currentPasswordHash);
    console.log('   입력 비밀번호:', testPassword);
    console.log('   해시:', currentPasswordHash.substring(0, 30) + '...');
    console.log('   결과:', isValidPassword ? '✅ Valid' : '❌ Invalid');

    if (isValidPassword) {
      console.log('\n✅ 로그인 성공!');
      return true;
    } else {
      console.log('\n❌ 비밀번호 검증 실패');
      console.log('\n디버깅 정보:');
      console.log('   - 입력 비밀번호:', testPassword);
      console.log('   - 해시:', currentPasswordHash);

      // 새로운 해시 생성하여 비교
      console.log('\n   새로운 해시 생성 중...');
      const newHash = await bcrypt.hash(testPassword, 12);
      console.log('   새 해시:', newHash);
      console.log(
        '   새 해시로 검증:',
        (await bcrypt.compare(testPassword, newHash)) ? '✅ Valid' : '❌ Invalid'
      );
      return false;
    }
  } catch (error) {
    console.log('   ❌ 오류:', error.message);
    return false;
  }
}

// dotenv 패키지가 없을 수 있으므로 try-catch
try {
  simulateLogin()
    .then((result) => {
      process.exit(result ? 0 : 1);
    })
    .catch((error) => {
      console.error('테스트 실행 오류:', error);
      process.exit(1);
    });
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('dotenv')) {
    console.log('dotenv 패키지가 없습니다. 직접 환경 변수를 확인하세요.');
    console.log('대신 .env.local 파일을 직접 읽어서 확인합니다...\n');

    const fs = require('fs');
    const path = require('path');

    try {
      const envPath = path.join(process.cwd(), '.env.local');
      const envContent = fs.readFileSync(envPath, 'utf8');
      console.log('.env.local 파일 내용:');
      console.log(envContent);

      // 간단한 파싱
      const lines = envContent.split('\n');
      const envVars = {};
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        }
      });

      console.log('\n파싱된 환경 변수:');
      console.log('  TEST_ADMIN_USERNAME:', envVars.TEST_ADMIN_USERNAME || 'Not found');
      console.log(
        '  TEST_ADMIN_PASSWORD_HASH:',
        envVars.TEST_ADMIN_PASSWORD_HASH
          ? `Found (${envVars.TEST_ADMIN_PASSWORD_HASH.length} chars)`
          : 'Not found'
      );

      // 환경 변수에 직접 설정
      process.env.TEST_ADMIN_USERNAME = envVars.TEST_ADMIN_USERNAME;
      process.env.TEST_ADMIN_PASSWORD_HASH = envVars.TEST_ADMIN_PASSWORD_HASH;

      // 다시 시뮬레이션 실행
      simulateLogin()
        .then((result) => {
          process.exit(result ? 0 : 1);
        })
        .catch((err) => {
          console.error('테스트 실행 오류:', err);
          process.exit(1);
        });
    } catch (fileError) {
      console.error('.env.local 파일을 읽을 수 없습니다:', fileError.message);
      process.exit(1);
    }
  } else {
    console.error('오류:', error);
    process.exit(1);
  }
}
