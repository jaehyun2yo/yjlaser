-- 포트폴리오 참고 제품 정보 컬럼 추가
-- contacts 테이블에 참고한 포트폴리오 URL과 제품 정보 저장

-- 포트폴리오 참고 URL 컬럼 추가
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS portfolio_reference_url TEXT;

-- 포트폴리오 참고 제품 정보 (JSON) 컬럼 추가
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS portfolio_reference_info JSONB;

-- 인덱스 추가 (포트폴리오 참고 제품이 있는 문의 조회 시 성능 향상)
CREATE INDEX IF NOT EXISTS idx_contacts_portfolio_reference_url ON contacts(portfolio_reference_url) WHERE portfolio_reference_url IS NOT NULL;

-- 코멘트 추가
COMMENT ON COLUMN contacts.portfolio_reference_url IS '참고한 포트폴리오 페이지 URL';
COMMENT ON COLUMN contacts.portfolio_reference_info IS '참고한 포트폴리오 제품 정보 (JSON)';
