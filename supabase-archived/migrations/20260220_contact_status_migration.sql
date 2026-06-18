-- contacts 상태값을 새 통합 상태 체계로 변환
-- 기존: new, read, in_progress, revision_in_progress, completed, on_hold, deleting
-- 새로: received, drawing, confirmed, production, cutting, finishing, delivered, on_hold

-- Step 0: 기존 CHECK 제약조건 제거 (기존 상태값만 허용하는 제약조건)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_check;

-- read 상태 → received + is_read=true
UPDATE contacts SET is_read = TRUE WHERE status = 'read';

-- 상태 매핑
UPDATE contacts SET status = 'received' WHERE status IN ('new', 'read');
UPDATE contacts SET status = 'drawing' WHERE status IN ('in_progress', 'revision_in_progress');
UPDATE contacts SET status = 'delivered' WHERE status = 'completed';
-- deleting 상태 → on_hold로 변환
UPDATE contacts SET status = 'on_hold' WHERE status = 'deleting';

-- 나머지 매핑되지 않은 상태값 → received로 변환 (안전망)
UPDATE contacts SET status = 'received'
  WHERE status NOT IN ('received', 'drawing', 'confirmed', 'production', 'cutting', 'finishing', 'delivered', 'on_hold');

-- process_stage가 있는 경우 더 정확한 매핑
UPDATE contacts SET status = 'confirmed' WHERE process_stage = 'confirmed' AND status = 'drawing';
UPDATE contacts SET status = 'production' WHERE process_stage IN ('file_classified', 'nesting') AND status = 'drawing';
UPDATE contacts SET status = 'cutting' WHERE process_stage = 'cutting' AND status = 'drawing';
UPDATE contacts SET status = 'finishing' WHERE process_stage = 'post_processing' AND status = 'drawing';

-- Step 마지막: 새 CHECK 제약조건 추가 (새 통합 상태값만 허용)
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('received', 'drawing', 'confirmed', 'production', 'cutting', 'finishing', 'delivered', 'on_hold', 'deleting'));

-- 기존 inquiry_number가 있는 경우 IN- 접두사 추가 (선택적, 기존 데이터 호환)
-- 새로 생성되는 것만 IN-MMDD-N 포맷 사용
