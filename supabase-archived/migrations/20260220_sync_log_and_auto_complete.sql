-- 현장 작업현황 추적 시스템: SyncLog 테이블 + Order scheduledAutoCompleteAt 추가

-- 1. Order 테이블에 scheduledAutoCompleteAt 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_auto_complete_at TIMESTAMPTZ;

-- 2. SyncLog 테이블 생성
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(500) NOT NULL,
  company_name VARCHAR(200),
  status VARCHAR(30) NOT NULL,
  contact_id INTEGER,
  order_id TEXT,
  error_message TEXT,
  md5_hash VARCHAR(64),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SyncLog 인덱스
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs (status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_md5_hash ON sync_logs (md5_hash);
