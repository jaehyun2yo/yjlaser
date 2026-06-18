-- 불편사항 접수 테이블 생성
CREATE TABLE IF NOT EXISTS company_feedback (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_email TEXT,
  category TEXT CHECK (category IN ('notice', 'portfolio', 'contact', 'process', 'other')),
  category_other TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  admin_notes TEXT
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_company_feedback_company_id ON company_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_company_feedback_status ON company_feedback(status);
CREATE INDEX IF NOT EXISTS idx_company_feedback_created_at ON company_feedback(created_at DESC);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_company_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_company_feedback_updated_at
  BEFORE UPDATE ON company_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_company_feedback_updated_at();

-- RLS (Row Level Security) 정책 설정
-- 이 프로젝트는 cookie-based 세션을 사용하므로 서버 사이드에서만 접근
-- RLS는 비활성화하고 서버 사이드에서 인증 및 권한 검증 수행
ALTER TABLE company_feedback ENABLE ROW LEVEL SECURITY;

-- 서버 사이드에서만 접근하도록 정책 설정 (서비스 역할 사용)
-- 실제 인증 및 권한 검증은 서버 사이드 코드에서 수행
CREATE POLICY "Service role can manage all feedback"
  ON company_feedback
  FOR ALL
  USING (true)
  WITH CHECK (true);
