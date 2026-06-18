-- 청구서/세금계산서 시스템 스키마
-- 월별 청구서 관리를 위한 테이블 생성

-- ============================================================================
-- 1. billing_invoices: 월별 청구서 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- 청구 기간
    billing_year INTEGER NOT NULL,
    billing_month INTEGER NOT NULL CHECK (billing_month BETWEEN 1 AND 12),

    -- 금액 정보
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- 상태 관리
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'paid', 'overdue', 'cancelled')),

    -- PDF 및 파일
    pdf_url TEXT,
    invoice_number VARCHAR(50),

    -- 결제 정보
    due_date DATE,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),

    -- 메모
    notes TEXT,

    -- 타임스탬프
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,

    -- 유니크 제약: 회사당 월별 청구서는 하나만
    CONSTRAINT unique_company_monthly_invoice UNIQUE (company_id, billing_year, billing_month)
);

-- billing_invoices 인덱스
CREATE INDEX idx_billing_invoices_company ON billing_invoices(company_id);
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX idx_billing_invoices_period ON billing_invoices(billing_year, billing_month);
CREATE INDEX idx_billing_invoices_due_date ON billing_invoices(due_date) WHERE status IN ('pending', 'sent');

-- ============================================================================
-- 2. billing_items: 청구 항목 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,

    -- 연결된 예약 (선택사항)
    booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,

    -- 항목 정보
    description TEXT NOT NULL,
    item_type VARCHAR(50) NOT NULL DEFAULT 'service',

    -- 금액 정보
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(15, 2) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,

    -- 서비스 날짜 (예약 기반일 경우)
    service_date DATE,

    -- 메모
    notes TEXT,

    -- 타임스탬프
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- billing_items 인덱스
CREATE INDEX idx_billing_items_invoice ON billing_items(invoice_id);
CREATE INDEX idx_billing_items_booking ON billing_items(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_billing_items_service_date ON billing_items(service_date);

-- ============================================================================
-- 3. billing_settings: 청구 설정 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id BIGINT UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- 세금계산서 정보
    business_number VARCHAR(20),
    business_name VARCHAR(100),
    representative_name VARCHAR(50),
    business_address TEXT,
    business_type VARCHAR(100),
    business_category VARCHAR(100),

    -- 결제 정보
    default_payment_terms INTEGER DEFAULT 30, -- 결제 기한 (일)
    auto_send_invoice BOOLEAN DEFAULT false,

    -- 이메일 설정
    billing_email VARCHAR(255),
    send_reminder BOOLEAN DEFAULT true,
    reminder_days_before INTEGER DEFAULT 7,

    -- 타임스탬프
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. 트리거: updated_at 자동 갱신
-- ============================================================================
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_billing_invoices_updated_at
    BEFORE UPDATE ON billing_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER trigger_billing_settings_updated_at
    BEFORE UPDATE ON billing_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_billing_updated_at();

-- ============================================================================
-- 5. RPC 함수: 월별 청구서 생성
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_monthly_invoice(
    p_company_id BIGINT,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_invoice_id UUID;
    v_total DECIMAL(15, 2) := 0;
    v_tax DECIMAL(15, 2) := 0;
    v_booking RECORD;
    v_invoice_number VARCHAR(50);
BEGIN
    -- 이미 존재하는 청구서 확인
    SELECT id INTO v_invoice_id
    FROM billing_invoices
    WHERE company_id = p_company_id
      AND billing_year = p_year
      AND billing_month = p_month;

    IF v_invoice_id IS NOT NULL THEN
        RAISE EXCEPTION 'Invoice already exists for this period';
    END IF;

    -- 청구서 번호 생성 (YYYYMM-COMPANYID-SEQ)
    SELECT CONCAT(
        p_year::TEXT,
        LPAD(p_month::TEXT, 2, '0'),
        '-',
        LPAD(p_company_id::TEXT, 4, '0'),
        '-',
        LPAD((COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+$')::INTEGER), 0) + 1)::TEXT, 4, '0')
    )
    INTO v_invoice_number
    FROM billing_invoices
    WHERE billing_year = p_year AND billing_month = p_month;

    -- 청구서 생성
    INSERT INTO billing_invoices (
        company_id,
        billing_year,
        billing_month,
        invoice_number,
        status,
        due_date
    )
    VALUES (
        p_company_id,
        p_year,
        p_month,
        v_invoice_number,
        'pending',
        (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month' + INTERVAL '30 days')::DATE
    )
    RETURNING id INTO v_invoice_id;

    -- 해당 월의 예약을 청구 항목으로 추가
    FOR v_booking IN
        SELECT b.id, b.visit_date, b.visit_time_slot, b.status
        FROM bookings b
        WHERE b.company_id = p_company_id
          AND EXTRACT(YEAR FROM b.visit_date) = p_year
          AND EXTRACT(MONTH FROM b.visit_date) = p_month
          AND b.status IN ('confirmed', 'completed')
    LOOP
        -- 기본 서비스 금액 (예시: 50,000원)
        INSERT INTO billing_items (
            invoice_id,
            booking_id,
            description,
            item_type,
            quantity,
            unit_price,
            amount,
            service_date
        )
        VALUES (
            v_invoice_id,
            v_booking.id,
            '방문 서비스 - ' || TO_CHAR(v_booking.visit_date, 'YYYY-MM-DD') || ' ' || COALESCE(v_booking.visit_time_slot, ''),
            'service',
            1,
            50000, -- 기본 금액 (실제로는 설정에서 가져와야 함)
            50000,
            v_booking.visit_date
        );

        v_total := v_total + 50000;
    END LOOP;

    -- 부가세 계산 (10%)
    v_tax := ROUND(v_total * 0.1, 0);

    -- 청구서 금액 업데이트
    UPDATE billing_invoices
    SET total_amount = v_total,
        tax_amount = v_tax,
        grand_total = v_total + v_tax
    WHERE id = v_invoice_id;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. RPC 함수: 청구서 상태 업데이트
-- ============================================================================
CREATE OR REPLACE FUNCTION update_invoice_status(
    p_invoice_id UUID,
    p_status VARCHAR(20),
    p_payment_method VARCHAR(50) DEFAULT NULL,
    p_payment_reference VARCHAR(100) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE billing_invoices
    SET status = p_status,
        paid_at = CASE WHEN p_status = 'paid' THEN NOW() ELSE paid_at END,
        payment_method = COALESCE(p_payment_method, payment_method),
        payment_reference = COALESCE(p_payment_reference, payment_reference),
        sent_at = CASE WHEN p_status = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END
    WHERE id = p_invoice_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RPC 함수: 미납 청구서 조회
-- ============================================================================
CREATE OR REPLACE FUNCTION get_overdue_invoices()
RETURNS TABLE (
    invoice_id UUID,
    company_id BIGINT,
    company_name VARCHAR(255),
    billing_period VARCHAR(7),
    grand_total DECIMAL(15, 2),
    due_date DATE,
    days_overdue INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        bi.id,
        bi.company_id,
        c.company_name,
        CONCAT(bi.billing_year::TEXT, '-', LPAD(bi.billing_month::TEXT, 2, '0'))::VARCHAR(7),
        bi.grand_total,
        bi.due_date,
        (CURRENT_DATE - bi.due_date)::INTEGER
    FROM billing_invoices bi
    JOIN companies c ON c.id = bi.company_id
    WHERE bi.status IN ('pending', 'sent')
      AND bi.due_date < CURRENT_DATE
    ORDER BY bi.due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. 코멘트
-- ============================================================================
COMMENT ON TABLE billing_invoices IS '월별 청구서 테이블';
COMMENT ON TABLE billing_items IS '청구서 항목 테이블';
COMMENT ON TABLE billing_settings IS '회사별 청구 설정 테이블';
COMMENT ON FUNCTION generate_monthly_invoice IS '월별 청구서 자동 생성 함수';
COMMENT ON FUNCTION update_invoice_status IS '청구서 상태 업데이트 함수';
COMMENT ON FUNCTION get_overdue_invoices IS '미납 청구서 조회 함수';
