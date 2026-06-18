-- company_feedback 테이블에 category 컬럼 추가
ALTER TABLE company_feedback
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'notice'
CHECK (category IN ('notice', 'portfolio', 'contact', 'process'));

-- 기본값 제거 (이미 데이터가 있으면 기본값이 필요하지만, 새로 추가되는 컬럼에는 기본값이 필요)
-- 기존 데이터가 있다면 기본값을 유지하고, 없다면 제거
DO $$
BEGIN
  -- 기존 데이터가 있는지 확인
  IF EXISTS (SELECT 1 FROM company_feedback LIMIT 1) THEN
    -- 기존 데이터가 있으면 기본값 유지
    ALTER TABLE company_feedback
    ALTER COLUMN category SET DEFAULT 'notice';
  ELSE
    -- 기존 데이터가 없으면 기본값 제거
    ALTER TABLE company_feedback
    ALTER COLUMN category DROP DEFAULT;
  END IF;
END $$;


ALTER TABLE company_feedback
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'notice'
CHECK (category IN ('notice', 'portfolio', 'contact', 'process'));

-- 기본값 제거 (이미 데이터가 있으면 기본값이 필요하지만, 새로 추가되는 컬럼에는 기본값이 필요)
-- 기존 데이터가 있다면 기본값을 유지하고, 없다면 제거
DO $$
BEGIN
  -- 기존 데이터가 있는지 확인
  IF EXISTS (SELECT 1 FROM company_feedback LIMIT 1) THEN
    -- 기존 데이터가 있으면 기본값 유지
    ALTER TABLE company_feedback
    ALTER COLUMN category SET DEFAULT 'notice';
  ELSE
    -- 기존 데이터가 없으면 기본값 제거
    ALTER TABLE company_feedback
    ALTER COLUMN category DROP DEFAULT;
  END IF;
END $$;
