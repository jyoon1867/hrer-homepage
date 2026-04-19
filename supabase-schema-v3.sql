-- =================================================================
-- HRer 스키마 v3: orders 테이블에 taxonomy·결제·핸드오프 보강
-- 실행 방법: Supabase 대시보드 → SQL Editor → 붙여넣고 Run
-- 이미 v1·v2 실행한 상태에서 이것만 추가 실행
-- =================================================================

-- taxonomy 태그 (통합 주제 분류 — chatbot/blog/advisor_bot 공유)
alter table orders add column if not exists taxonomy_id text;
-- 결제 상세
alter table orders add column if not exists payment_key text;       -- Toss paymentKey
alter table orders add column if not exists approved_at timestamptz;
alter table orders add column if not exists payment_method text;     -- card/transfer 등
-- 의뢰 raw 입력(서비스별 다른 필드 전체 보존)
alter table orders add column if not exists raw_input jsonb;
-- 유입 추적 (마케팅)
alter table orders add column if not exists utm_source text;
alter table orders add column if not exists utm_medium text;
alter table orders add column if not exists utm_campaign text;
alter table orders add column if not exists referrer text;

-- 인덱스
create index if not exists idx_orders_taxonomy on orders(taxonomy_id);
create index if not exists idx_orders_utm_source on orders(utm_source);
