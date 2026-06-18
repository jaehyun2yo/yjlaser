-- 인앱 알림 시스템 스키마
-- 관리자/업체에 대한 실시간 알림 저장

-- ============================================================================
-- 1. notifications: 알림 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 수신자 정보
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'company')),
    user_id BIGINT, -- company_id (admin인 경우 NULL)

    -- 알림 내용
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'new_contact',        -- 새 문의 접수
        'booking_created',    -- 새 예약 생성
        'booking_updated',    -- 예약 변경
        'booking_cancelled',  -- 예약 취소
        'file_uploaded',      -- 파일 업로드
        'invoice_created',    -- 청구서 생성
        'invoice_paid',       -- 결제 완료
        'system'              -- 시스템 알림
    )),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- 관련 데이터 (JSON)
    metadata JSONB DEFAULT '{}',

    -- 상태
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,

    -- 타임스탬프
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 외래 키 제약 (company인 경우)
    CONSTRAINT fk_notifications_company
        FOREIGN KEY (user_id)
        REFERENCES companies(id)
        ON DELETE CASCADE
);

-- ============================================================================
-- 2. 인덱스
-- ============================================================================
-- 사용자별 알림 조회 (가장 빈번한 쿼리)
CREATE INDEX idx_notifications_user
    ON notifications(user_type, user_id, created_at DESC);

-- 읽지 않은 알림 조회
CREATE INDEX idx_notifications_unread
    ON notifications(user_type, user_id, is_read)
    WHERE is_read = false;

-- 타입별 조회
CREATE INDEX idx_notifications_type
    ON notifications(type);

-- 최근 알림 조회 (created_at 기반 일반 인덱스)
-- 참고: partial index에서 NOW()는 IMMUTABLE이 아니므로 사용 불가
CREATE INDEX idx_notifications_recent
    ON notifications(created_at DESC);

-- ============================================================================
-- 3. RPC 함수: 알림 목록 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_notifications(
    p_user_type VARCHAR(20),
    p_user_id BIGINT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_unread_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
    id UUID,
    type VARCHAR(50),
    title VARCHAR(255),
    message TEXT,
    metadata JSONB,
    is_read BOOLEAN,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.type,
        n.title,
        n.message,
        n.metadata,
        n.is_read,
        n.read_at,
        n.created_at
    FROM notifications n
    WHERE n.user_type = p_user_type
      AND (p_user_type = 'admin' OR n.user_id = p_user_id)
      AND (NOT p_unread_only OR n.is_read = false)
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. RPC 함수: 읽지 않은 알림 개수
-- ============================================================================
CREATE OR REPLACE FUNCTION get_unread_notification_count(
    p_user_type VARCHAR(20),
    p_user_id BIGINT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM notifications
    WHERE user_type = p_user_type
      AND (p_user_type = 'admin' OR user_id = p_user_id)
      AND is_read = false;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. RPC 함수: 알림 읽음 처리
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_notification_read(
    p_notification_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE notifications
    SET is_read = true,
        read_at = NOW()
    WHERE id = p_notification_id
      AND is_read = false;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. RPC 함수: 모든 알림 읽음 처리
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_all_notifications_read(
    p_user_type VARCHAR(20),
    p_user_id BIGINT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE notifications
    SET is_read = true,
        read_at = NOW()
    WHERE user_type = p_user_type
      AND (p_user_type = 'admin' OR user_id = p_user_id)
      AND is_read = false;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RPC 함수: 알림 생성 (트리거용)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_notification(
    p_user_type VARCHAR(20),
    p_user_id BIGINT,
    p_type VARCHAR(50),
    p_title VARCHAR(255),
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_type,
        user_id,
        type,
        title,
        message,
        metadata
    )
    VALUES (
        p_user_type,
        p_user_id,
        p_type,
        p_title,
        p_message,
        p_metadata
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. 오래된 알림 자동 삭제 (30일 이상)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND is_read = true;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. RLS 정책
-- ============================================================================
-- 참고: 이 프로젝트는 자체 세션 시스템을 사용하므로 Supabase Auth 기반 RLS 대신
-- API 레벨에서 인증/인가를 처리합니다. RLS는 서비스 역할 키로 우회됩니다.
-- 보안은 API 라우트의 getSessionUser()에서 처리됩니다.

-- RLS 비활성화 (API 레벨 인증 사용)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. 코멘트
-- ============================================================================
COMMENT ON TABLE notifications IS '인앱 알림 테이블';
COMMENT ON FUNCTION get_notifications IS '사용자별 알림 목록 조회';
COMMENT ON FUNCTION get_unread_notification_count IS '읽지 않은 알림 개수 조회';
COMMENT ON FUNCTION mark_notification_read IS '단일 알림 읽음 처리';
COMMENT ON FUNCTION mark_all_notifications_read IS '모든 알림 읽음 처리';
COMMENT ON FUNCTION create_notification IS '알림 생성 함수';
COMMENT ON FUNCTION cleanup_old_notifications IS '30일 이상 지난 읽은 알림 삭제';
