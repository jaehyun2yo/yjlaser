-- company_feedback 테이블에 category_other 컬럼 추가 및 category에 'other' 옵션 추가
ALTER TABLE company_feedback
ADD COLUMN IF NOT EXISTS category_other TEXT;

-- category CHECK 제약 조건에 'other' 추가
-- 기존 제약 조건 삭제 후 재생성
ALTER TABLE company_feedback
DROP CONSTRAINT IF EXISTS company_feedback_category_check;

ALTER TABLE company_feedback
ADD CONSTRAINT company_feedback_category_check
CHECK (category IN ('notice', 'portfolio', 'contact', 'process', 'other'));


ALTER TABLE company_feedback
ADD COLUMN IF NOT EXISTS category_other TEXT;

-- category CHECK 제약 조건에 'other' 추가
-- 기존 제약 조건 삭제 후 재생성
ALTER TABLE company_feedback
DROP CONSTRAINT IF EXISTS company_feedback_category_check;

ALTER TABLE company_feedback
ADD CONSTRAINT company_feedback_category_check
CHECK (category IN ('notice', 'portfolio', 'contact', 'process', 'other'));
