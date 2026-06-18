/**
 * 환경 변수 설정 (Jest setupFiles용)
 * 다른 모듈이 로드되기 전에 실행됨
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env 파일 로드 (webhard-api 디렉토리 기준)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
