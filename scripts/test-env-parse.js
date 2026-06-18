// .env.local 파일 파싱 테스트
const fs = require('fs');
const path = require('path');

// .env.local 파일 읽기
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

console.log('=== Raw .env.local content ===');
console.log(envContent);
console.log('\n=== Parsed lines ===');
envContent.split('\n').forEach((line, i) => {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');
    console.log(`${i + 1}. ${key} = ${value}`);
    console.log(`   Length: ${value.length}`);
    console.log(`   Starts with條件: ${value.substring(0, 7)}`);
  }
});
