-- =================================================================
-- HRer 스키마 v2: orders 테이블에 답변 저장용 컬럼 추가
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣고 Run
-- 이미 v1 스키마를 실행했다면 이것만 추가 실행하면 됩니다.
-- =================================================================

-- orders에 답변 관련 컬럼 추가
alter table orders add column if not exists response_body text;
alter table orders add column if not exists response_channel text;  -- 'hrer' | 'oneteam_manual'
alter table orders add column if not exists answered_at timestamptz;
alter table orders add column if not exists answered_by text;       -- 작성자 표시용
alter table orders add column if not exists ai_draft text;          -- 자문봇 A 초안 (법인 후 자동 생성)
alter table orders add column if not exists ai_draft_at timestamptz;

-- 답변 이력 인덱스
create index if not exists idx_orders_answered_at on orders(answered_at desc);
create index if not exists idx_orders_pending_answer on orders(created_at desc) where answered_at is null;
