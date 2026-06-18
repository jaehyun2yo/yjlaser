-- posts 테이블에 조회수 컬럼 추가
ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- 기존 데이터에 대해 0으로 초기화
UPDATE posts SET view_count = 0 WHERE view_count IS NULL;
