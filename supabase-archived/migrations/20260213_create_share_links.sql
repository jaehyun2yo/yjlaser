-- 웹하드 공유 링크 기능
-- 임시 공유 링크로 인증 없이 파일 접근 가능

-- ============================================================================
-- 1. share_links 테이블 생성
-- ============================================================================
CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) UNIQUE NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    max_downloads INTEGER DEFAULT NULL,
    download_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. 인덱스 생성
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_company ON share_links(company_id);
CREATE INDEX IF NOT EXISTS idx_share_links_active ON share_links(is_active);
CREATE INDEX IF NOT EXISTS idx_share_links_expires ON share_links(expires_at);

-- ============================================================================
-- 3. 트리거: updated_at 자동 갱신
-- ============================================================================
CREATE OR REPLACE FUNCTION update_share_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_share_links_updated_at ON share_links;
CREATE TRIGGER trigger_share_links_updated_at
    BEFORE UPDATE ON share_links
    FOR EACH ROW
    EXECUTE FUNCTION update_share_links_updated_at();

-- ============================================================================
-- 4. RPC 함수: 공유 링크 검증 및 다운로드 카운트 증가
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_and_increment_share_link(
    p_token VARCHAR(64)
)
RETURNS TABLE (
    is_valid BOOLEAN,
    file_path TEXT,
    file_name TEXT,
    error_message TEXT
) AS $$
DECLARE
    v_link RECORD;
BEGIN
    -- 공유 링크 조회
    SELECT * INTO v_link FROM share_links WHERE token = p_token;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, '유효하지 않은 공유 링크입니다.'::TEXT;
        RETURN;
    END IF;

    -- 활성화 여부 확인
    IF NOT v_link.is_active THEN
        RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, '비활성화된 공유 링크입니다.'::TEXT;
        RETURN;
    END IF;

    -- 만료 시간 확인
    IF v_link.expires_at < NOW() THEN
        RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, '만료된 공유 링크입니다.'::TEXT;
        RETURN;
    END IF;

    -- 최대 다운로드 횟수 확인 (NULL이면 무제한)
    IF v_link.max_downloads IS NOT NULL AND v_link.download_count >= v_link.max_downloads THEN
        RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, '다운로드 횟수를 초과했습니다.'::TEXT;
        RETURN;
    END IF;

    -- 다운로드 카운트 증가
    UPDATE share_links SET download_count = download_count + 1 WHERE token = p_token;

    -- 성공 응답
    RETURN QUERY SELECT true, v_link.file_path, v_link.file_name, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. RPC 함수: 만료된 공유 링크 정리
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_share_links()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM share_links WHERE expires_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. 코멘트
-- ============================================================================
COMMENT ON TABLE share_links IS '웹하드 파일 공유 링크 테이블';
COMMENT ON FUNCTION validate_and_increment_share_link IS '공유 링크 검증 및 다운로드 카운트 증가';
COMMENT ON FUNCTION cleanup_expired_share_links IS '만료된 공유 링크 정리 (7일 이상 지난 항목)';
