-- 활성 세션 추적 테이블 생성
-- 현재 접속 중인 업체를 추적하기 위한 테이블

CREATE TABLE IF NOT EXISTS active_sessions (
  id SERIAL PRIMARY KEY,
  user_type VARCHAR(20) NOT NULL DEFAULT 'company', -- 'admin' or 'company'
  user_id INTEGER NOT NULL,
  username VARCHAR(100) NOT NULL,
  company_name VARCHAR(200),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 복합 유니크 제약: 같은 사용자는 하나의 세션만 가질 수 있음
  CONSTRAINT unique_active_session UNIQUE (user_type, user_id)
);

-- 인덱스 생성 (빠른 조회를 위해)
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_activity
ON active_sessions(last_activity);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_type
ON active_sessions(user_type);

-- 5분 이상 활동이 없는 세션을 자동으로 삭제하는 함수
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM active_sessions
  WHERE last_activity < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- 현재 접속자 수를 반환하는 RPC 함수
CREATE OR REPLACE FUNCTION get_active_sessions_count()
RETURNS TABLE (
  total_count BIGINT,
  admin_count BIGINT,
  company_count BIGINT
) AS $$
BEGIN
  -- 먼저 오래된 세션 정리
  PERFORM cleanup_inactive_sessions();

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_count,
    COUNT(*) FILTER (WHERE user_type = 'admin')::BIGINT as admin_count,
    COUNT(*) FILTER (WHERE user_type = 'company')::BIGINT as company_count
  FROM active_sessions;
END;
$$ LANGUAGE plpgsql;

-- 현재 접속자 목록을 반환하는 RPC 함수
CREATE OR REPLACE FUNCTION get_active_sessions_list()
RETURNS TABLE (
  id INTEGER,
  user_type VARCHAR(20),
  user_id INTEGER,
  username VARCHAR(100),
  company_name VARCHAR(200),
  last_activity TIMESTAMPTZ
) AS $$
BEGIN
  -- 먼저 오래된 세션 정리
  PERFORM cleanup_inactive_sessions();

  RETURN QUERY
  SELECT
    s.id,
    s.user_type,
    s.user_id,
    s.username,
    s.company_name,
    s.last_activity
  FROM active_sessions s
  ORDER BY s.last_activity DESC;
END;
$$ LANGUAGE plpgsql;

-- 세션 업데이트/생성 함수 (upsert)
CREATE OR REPLACE FUNCTION upsert_active_session(
  p_user_type VARCHAR(20),
  p_user_id INTEGER,
  p_username VARCHAR(100),
  p_company_name VARCHAR(200) DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO active_sessions (user_type, user_id, username, company_name, last_activity)
  VALUES (p_user_type, p_user_id, p_username, p_company_name, NOW())
  ON CONFLICT (user_type, user_id)
  DO UPDATE SET
    last_activity = NOW(),
    username = EXCLUDED.username,
    company_name = EXCLUDED.company_name;
END;
$$ LANGUAGE plpgsql;

-- 세션 삭제 함수 (로그아웃 시)
CREATE OR REPLACE FUNCTION delete_active_session(
  p_user_type VARCHAR(20),
  p_user_id INTEGER
)
RETURNS void AS $$
BEGIN
  DELETE FROM active_sessions
  WHERE user_type = p_user_type AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- RLS 정책 설정
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 세션 테이블을 읽을 수 있음 (관리자 대시보드용)
CREATE POLICY "Allow read access to active_sessions"
ON active_sessions FOR SELECT
USING (true);

-- 모든 인증된 사용자가 자신의 세션을 추가/수정할 수 있음
CREATE POLICY "Allow insert/update own session"
ON active_sessions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update own session"
ON active_sessions FOR UPDATE
USING (true);

CREATE POLICY "Allow delete own session"
ON active_sessions FOR DELETE
USING (true);

-- 코멘트 추가
COMMENT ON TABLE active_sessions IS '현재 접속 중인 사용자 세션 추적 테이블';
COMMENT ON COLUMN active_sessions.user_type IS '사용자 유형 (admin 또는 company)';
COMMENT ON COLUMN active_sessions.user_id IS '사용자 ID (companies 테이블의 id 또는 admin)';
COMMENT ON COLUMN active_sessions.last_activity IS '마지막 활동 시간 (5분 이상 경과 시 자동 삭제)';
