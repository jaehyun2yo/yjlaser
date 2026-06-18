-- Contact/Order 통합: contacts 테이블에 Order 기능 필드 추가

-- 1. 출처 필드
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'website';
COMMENT ON COLUMN contacts.source IS 'website | webhard | phone';

-- 2. 넘버링
-- inquiry_number는 이미 존재 (YYMMDD-N → IN-MMDD-N 포맷으로 변경 예정)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS work_number TEXT;
COMMENT ON COLUMN contacts.work_number IS '목형작업번호: MMDD-N';

-- 3. 작업 추적 타임스탬프
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS production_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cutting_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cutting_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS finishing_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS finishing_completed_at TIMESTAMP WITH TIME ZONE;
-- delivered_at는 이미 delivered_date로 존재 (ERP 스키마)

-- 4. DXF/네스팅 관련
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS drawing_file_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dxf_classified_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dxf_total_price INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nesting_sheet_count INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nesting_utilization FLOAT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS webhard_folder_id TEXT;

-- 5. 읽음 표시 (기존 'read' 상태 대체)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- 6. 보류 복원용
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- 7. Order에서 가져올 추가 필드
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS order_type VARCHAR(30) DEFAULT 'standard';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS delivery_note TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS scheduled_auto_complete_at TIMESTAMP WITH TIME ZONE;

-- 8. 원본 파일명 (중복 체크용)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- 9. 인덱스
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_work_number ON contacts(work_number);
CREATE INDEX IF NOT EXISTS idx_contacts_original_filename ON contacts(original_filename);
CREATE INDEX IF NOT EXISTS idx_contacts_status_company ON contacts(status, company_name);
