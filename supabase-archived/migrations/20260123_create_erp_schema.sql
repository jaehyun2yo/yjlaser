-- ERP 시스템 스키마 - YJLaser 목형 제조
-- 작업 관리, 설비 관리, 현장 작업자 관리를 위한 테이블 생성

-- ============================================================================
-- 1. contacts 테이블 확장 (ERP 필드 추가)
-- ============================================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'normal';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS delivered_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_price DECIMAL(12,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- contacts ERP 인덱스
CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority);
CREATE INDEX IF NOT EXISTS idx_contacts_due_date ON contacts(due_date);
CREATE INDEX IF NOT EXISTS idx_contacts_sort_order ON contacts(sort_order);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);

-- ============================================================================
-- 2. machines 테이블 (설비 관리)
-- ============================================================================
CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- laser/osi_bending/knife_bending/sample
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- machines 인덱스
CREATE INDEX IF NOT EXISTS idx_machines_type ON machines(type);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);

-- 초기 설비 데이터 (PRD 1.4 현장 설비)
INSERT INTO machines (name, type, description) VALUES
    ('레이저가공기', 'laser', '메인 레이저 가공 설비'),
    ('오시 밴딩기', 'osi_bending', '오시 절곡 가공'),
    ('칼 밴딩기 1호', 'knife_bending', '칼 밴딩기 1호기'),
    ('칼 밴딩기 2호', 'knife_bending', '칼 밴딩기 2호기'),
    ('0.45 밴딩기', 'knife_bending', '0.45mm 규격 밴딩기'),
    ('샘플기', 'sample', '샘플 제작용 장비')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. tasks 테이블 (세부 작업 관리)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id BIGINT REFERENCES contacts(id) ON DELETE CASCADE,

    -- 작업 정보
    title VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50), -- drawing/sample/laser/cutting/inspection/delivery

    -- 상태 관리
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),

    -- 배정 및 설비
    machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    assigned_to VARCHAR(100),

    -- 시간 추적
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_duration INTEGER, -- 분 단위 예상 소요시간
    actual_duration INTEGER, -- 분 단위 실제 소요시간

    -- 순서 및 메모
    sort_order INTEGER DEFAULT 0,
    memo TEXT,

    -- 타임스탬프
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tasks 인덱스
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_machine_id ON tasks(machine_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- 복합 인덱스: 칸반보드 조회용
CREATE INDEX IF NOT EXISTS idx_tasks_kanban ON tasks(status, priority, sort_order);

-- ============================================================================
-- 4. erp_workers 테이블 (현장 작업자 PIN 로그인)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'field_worker' CHECK (role IN ('field_worker', 'supervisor', 'manager')),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- erp_workers 인덱스
CREATE INDEX IF NOT EXISTS idx_erp_workers_is_active ON erp_workers(is_active);
CREATE INDEX IF NOT EXISTS idx_erp_workers_role ON erp_workers(role);

-- ============================================================================
-- 5. 트리거: updated_at 자동 갱신
-- ============================================================================
CREATE OR REPLACE FUNCTION update_erp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- machines 트리거
DROP TRIGGER IF EXISTS trigger_machines_updated_at ON machines;
CREATE TRIGGER trigger_machines_updated_at
    BEFORE UPDATE ON machines
    FOR EACH ROW
    EXECUTE FUNCTION update_erp_updated_at();

-- tasks 트리거
DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON tasks;
CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_erp_updated_at();

-- erp_workers 트리거
DROP TRIGGER IF EXISTS trigger_erp_workers_updated_at ON erp_workers;
CREATE TRIGGER trigger_erp_workers_updated_at
    BEFORE UPDATE ON erp_workers
    FOR EACH ROW
    EXECUTE FUNCTION update_erp_updated_at();

-- ============================================================================
-- 6. RPC 함수: 칸반보드 데이터 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_kanban_tasks(
    p_status VARCHAR(20) DEFAULT NULL,
    p_priority VARCHAR(10) DEFAULT NULL,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
    task_id UUID,
    task_title VARCHAR(255),
    task_description TEXT,
    task_type VARCHAR(50),
    task_status VARCHAR(20),
    task_priority VARCHAR(10),
    sort_order INTEGER,
    assigned_to VARCHAR(100),
    machine_name VARCHAR(100),
    contact_id BIGINT,
    contact_product_name VARCHAR(500),
    contact_company_name VARCHAR(255),
    contact_due_date DATE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id AS task_id,
        t.title AS task_title,
        t.description AS task_description,
        t.task_type,
        t.status AS task_status,
        t.priority AS task_priority,
        t.sort_order,
        t.assigned_to,
        m.name AS machine_name,
        c.id AS contact_id,
        c.product_name AS contact_product_name,
        c.company_name AS contact_company_name,
        c.due_date AS contact_due_date,
        t.started_at,
        t.completed_at,
        t.created_at
    FROM tasks t
    LEFT JOIN machines m ON m.id = t.machine_id
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_priority IS NULL OR t.priority = p_priority)
      AND (p_date_from IS NULL OR t.created_at::DATE >= p_date_from)
      AND (p_date_to IS NULL OR t.created_at::DATE <= p_date_to)
    ORDER BY
        CASE t.priority
            WHEN 'urgent' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
        END,
        t.sort_order,
        t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RPC 함수: 작업 상태 변경 (시간 추적 포함)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_task_status(
    p_task_id UUID,
    p_status VARCHAR(20),
    p_worker_name VARCHAR(100) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_old_status VARCHAR(20);
    v_started_at TIMESTAMPTZ;
BEGIN
    -- 현재 상태 조회
    SELECT status, started_at INTO v_old_status, v_started_at
    FROM tasks WHERE id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 상태별 처리
    IF p_status = 'in_progress' AND v_old_status = 'pending' THEN
        -- 작업 시작: started_at 기록
        UPDATE tasks SET
            status = p_status,
            started_at = NOW(),
            assigned_to = COALESCE(p_worker_name, assigned_to)
        WHERE id = p_task_id;

    ELSIF p_status = 'completed' AND v_old_status = 'in_progress' THEN
        -- 작업 완료: completed_at 및 actual_duration 기록
        UPDATE tasks SET
            status = p_status,
            completed_at = NOW(),
            actual_duration = EXTRACT(EPOCH FROM (NOW() - v_started_at)) / 60
        WHERE id = p_task_id;

    ELSE
        -- 일반 상태 변경
        UPDATE tasks SET status = p_status
        WHERE id = p_task_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. RPC 함수: 오늘의 작업 목록 (모바일용)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_today_tasks(
    p_worker_name VARCHAR(100) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
    task_id UUID,
    task_title VARCHAR(255),
    task_type VARCHAR(50),
    task_status VARCHAR(20),
    task_priority VARCHAR(10),
    assigned_to VARCHAR(100),
    machine_name VARCHAR(100),
    contact_product_name VARCHAR(500),
    contact_company_name VARCHAR(255),
    contact_due_date DATE,
    started_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id AS task_id,
        t.title AS task_title,
        t.task_type,
        t.status AS task_status,
        t.priority AS task_priority,
        t.assigned_to,
        m.name AS machine_name,
        c.product_name AS contact_product_name,
        c.company_name AS contact_company_name,
        c.due_date AS contact_due_date,
        t.started_at
    FROM tasks t
    LEFT JOIN machines m ON m.id = t.machine_id
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.status != 'cancelled'
      AND (p_worker_name IS NULL OR t.assigned_to = p_worker_name)
      AND (p_status IS NULL OR t.status = p_status)
      AND (
          -- 오늘 생성된 작업 또는 진행중인 작업 또는 납기가 오늘인 작업
          t.created_at::DATE = CURRENT_DATE
          OR t.status = 'in_progress'
          OR c.due_date = CURRENT_DATE
      )
    ORDER BY
        CASE t.priority
            WHEN 'urgent' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
        END,
        t.sort_order,
        t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. RPC 함수: 작업 순서 일괄 변경 (드래그앤드롭)
-- ============================================================================
CREATE OR REPLACE FUNCTION reorder_tasks(
    p_task_orders JSON
)
RETURNS BOOLEAN AS $$
DECLARE
    v_task RECORD;
BEGIN
    FOR v_task IN SELECT * FROM json_to_recordset(p_task_orders) AS x(id UUID, sort_order INTEGER, status VARCHAR(20))
    LOOP
        UPDATE tasks SET
            sort_order = v_task.sort_order,
            status = COALESCE(v_task.status, status)
        WHERE id = v_task.id;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. RPC 함수: ERP 대시보드 통계
-- ============================================================================
CREATE OR REPLACE FUNCTION get_erp_dashboard_stats()
RETURNS TABLE (
    total_tasks BIGINT,
    pending_tasks BIGINT,
    in_progress_tasks BIGINT,
    completed_today BIGINT,
    urgent_tasks BIGINT,
    overdue_contacts BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_tasks,
        COUNT(*) FILTER (WHERE t.status = 'pending')::BIGINT AS pending_tasks,
        COUNT(*) FILTER (WHERE t.status = 'in_progress')::BIGINT AS in_progress_tasks,
        COUNT(*) FILTER (WHERE t.status = 'completed' AND t.completed_at::DATE = CURRENT_DATE)::BIGINT AS completed_today,
        COUNT(*) FILTER (WHERE t.priority = 'urgent' AND t.status != 'completed')::BIGINT AS urgent_tasks,
        (SELECT COUNT(*) FROM contacts WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'deleting'))::BIGINT AS overdue_contacts
    FROM tasks t
    WHERE t.status != 'cancelled';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. 코멘트
-- ============================================================================
COMMENT ON TABLE machines IS '설비/기계 관리 테이블';
COMMENT ON TABLE tasks IS 'ERP 세부 작업 관리 테이블';
COMMENT ON TABLE erp_workers IS '현장 작업자 PIN 로그인 테이블';
COMMENT ON FUNCTION get_kanban_tasks IS '칸반보드 작업 목록 조회';
COMMENT ON FUNCTION update_task_status IS '작업 상태 변경 (시간 추적 포함)';
COMMENT ON FUNCTION get_today_tasks IS '오늘의 작업 목록 (모바일용)';
COMMENT ON FUNCTION reorder_tasks IS '작업 순서 일괄 변경 (드래그앤드롭)';
COMMENT ON FUNCTION get_erp_dashboard_stats IS 'ERP 대시보드 통계';
