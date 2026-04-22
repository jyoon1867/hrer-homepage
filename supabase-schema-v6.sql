-- =================================================================
-- HRer 스키마 v6: 월 구독 시스템 (Subscription)
-- 실행: Supabase SQL Editor에 붙여넣고 Run
-- v1~v5 적용된 상태에서 이것만 추가
--
-- 구독 모델:
--  - 규모별 월 정액 (20/30/40/70/100만원)
--  - 첫 달 30% 할인 (자동 적용)
--  - 약정 없음, 언제든 해지 (해지 시 현 주기 말까지 이용 가능)
--  - 토스페이먼츠 빌링키 방식 자동 결제
--  - 규모 판별: 사용자 자진 신고 (신뢰 기반, 사후 검증 없음)
-- =================================================================

-- -----------------------------------------------------------------
-- 1) subscriptions — 구독 마스터 테이블
-- -----------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),

  -- 고객 정보
  customer_email text not null,
  customer_name text not null,
  customer_phone text,
  company_name text not null,
  company_bizno text,                           -- 사업자번호 10자리 (숫자만)

  -- 규모·플랜
  employee_count int not null,                  -- 자진 신고한 상시 근로자 수
  tier_key text not null check (tier_key in ('m1','m2','m3','m4','m5')),
  tier_label text,                              -- 'm1' → '월 구독 · 30인 미만' (snapshot)
  monthly_price int not null,                   -- 정가 (200000/300000/400000/700000/1000000)
  first_month_price int not null,               -- 첫 달 할인가 (30% off)

  -- 토스페이먼츠 빌링
  toss_customer_key text unique not null,       -- 'HRer_SUB_' + uuid 단축본
  toss_billing_key text,                        -- 빌링키 (최초 발급 후 저장)

  -- 상태 머신
  --   pending_billing: 가입 폼 제출됐으나 빌링키 아직 미발급
  --   trialing:        첫 달 할인 기간 (현재 주기 = 첫 주기)
  --   active:          둘째 달 이후 정가 자동결제 중
  --   past_due:        결제 실패, 재시도 대기
  --   cancel_scheduled: 해지 예약 (현 주기 말까지는 이용 가능)
  --   cancelled:       주기 말 지나 종료
  status text not null default 'pending_billing'
    check (status in ('pending_billing','trialing','active','past_due','cancel_scheduled','cancelled')),

  -- 주기 관리
  started_at timestamptz,                       -- 첫 결제 성공 시각
  current_period_start timestamptz,             -- 현재 주기 시작 (inclusive)
  current_period_end timestamptz,               -- 현재 주기 종료 (exclusive), 다음 결제 예정일
  next_billing_at timestamptz,                  -- 다음 자동결제 예정 (보통 = current_period_end)
  billing_cycle_count int default 0,            -- 현재까지 결제된 주기 수 (1=첫달, 2=둘째달, ...)

  -- 해지
  cancelled_at timestamptz,                     -- 해지 요청 시각
  cancel_effective_at timestamptz,              -- 실제 종료 시각 (보통 current_period_end)
  cancel_reason text,

  -- 유입·기타
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  handoff_session text references chat_sessions(session_token),
  converted_from_order uuid,                    -- 단건→구독 전환인 경우 원 order id

  -- 감사
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sub_email on subscriptions(customer_email);
create index if not exists idx_sub_status on subscriptions(status);
create index if not exists idx_sub_next_billing on subscriptions(next_billing_at) where status in ('trialing','active','past_due');
create index if not exists idx_sub_created on subscriptions(created_at desc);

-- -----------------------------------------------------------------
-- 2) subscription_invoices — 월별 결제 내역
-- -----------------------------------------------------------------
create table if not exists subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,

  -- 과금 주기
  cycle_number int not null,                    -- 1 = 첫 달(할인), 2+ = 정가
  period_start timestamptz not null,
  period_end timestamptz not null,

  -- 금액
  amount int not null,                          -- 실제 청구액 (첫 달이면 할인가)
  is_first_month boolean default false,
  discount_amount int default 0,

  -- 결제 상태
  status text not null default 'pending'
    check (status in ('pending','paid','failed','cancelled','refunded')),
  toss_payment_key text,
  toss_order_id text,                           -- 'HRer-SUB-{sub_id}-{cycle}' 패턴
  paid_at timestamptz,
  failed_at timestamptz,
  failed_reason text,
  retry_count int default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (subscription_id, cycle_number)
);

create index if not exists idx_inv_sub on subscription_invoices(subscription_id, cycle_number);
create index if not exists idx_inv_status on subscription_invoices(status);
create index if not exists idx_inv_paid on subscription_invoices(paid_at desc);

-- -----------------------------------------------------------------
-- 3) subscription_events — 상태 변경 이력 (감사 로그)
-- -----------------------------------------------------------------
create table if not exists subscription_events (
  id bigserial primary key,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  event_type text not null,
  -- 예:
  --  'created','billing_key_issued','first_billed','renewed',
  --  'payment_failed','payment_retried','cancel_requested','cancel_revoked',
  --  'ended','plan_changed','customer_updated'
  old_status text,
  new_status text,
  metadata jsonb,                                -- 부가 정보 (에러 코드, 사유 등)
  actor text,                                    -- 'customer' | 'system' | 'admin'
  created_at timestamptz default now()
);

create index if not exists idx_evt_sub on subscription_events(subscription_id, created_at desc);
create index if not exists idx_evt_type on subscription_events(event_type, created_at desc);

-- -----------------------------------------------------------------
-- 4) subscription_access_tokens — 고객용 마이페이지 토큰 (로그인 불필요)
-- -----------------------------------------------------------------
-- 결제 성공 메일·월별 영수증 메일에 포함할 단일 링크용.
-- 예: https://hrer.kr/subscription?token=xxx
-- 로그인 없이 해당 토큰만으로 본인 구독 확인·해지 가능.
create table if not exists subscription_access_tokens (
  id bigserial primary key,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  token text unique not null,                   -- 랜덤 32+ 바이트 base64url
  purpose text default 'manage',                -- 'manage' | 'cancel'
  expires_at timestamptz,                       -- null = 무기한 (구독 상태 기준)
  used_at timestamptz,                          -- 일회성 토큰인 경우 사용 시각
  created_at timestamptz default now()
);

create index if not exists idx_tok_sub on subscription_access_tokens(subscription_id);
create index if not exists idx_tok_token on subscription_access_tokens(token);

-- -----------------------------------------------------------------
-- 5) subscription_nudges — 단건→구독 전환 넛지 추적
-- -----------------------------------------------------------------
-- 단건 결제 완료 이메일/페이지에서 구독 제안이 나갔을 때 기록.
-- 전환율 분석용 (단건 고객 중 N일 내 구독 전환 비율 측정).
create table if not exists subscription_nudges (
  id bigserial primary key,
  order_id uuid references orders(id) on delete set null,
  customer_email text,
  nudge_channel text,                            -- 'complete_page' | 'email_footer' | 'followup_email'
  nudge_offer text,                              -- 'first_month_30' | 'comparison' | 'reminder'
  converted_to_subscription uuid references subscriptions(id),
  converted_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_nudge_email on subscription_nudges(customer_email);
create index if not exists idx_nudge_created on subscription_nudges(created_at desc);
create index if not exists idx_nudge_converted on subscription_nudges(converted_to_subscription) where converted_to_subscription is not null;

-- -----------------------------------------------------------------
-- 6) updated_at 자동 갱신 트리거
-- -----------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sub_updated on subscriptions;
create trigger trg_sub_updated before update on subscriptions
  for each row execute function set_updated_at();

drop trigger if exists trg_inv_updated on subscription_invoices;
create trigger trg_inv_updated before update on subscription_invoices
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------
-- 7) RLS — 서비스 롤만 접근 (기본 deny)
-- -----------------------------------------------------------------
alter table subscriptions enable row level security;
alter table subscription_invoices enable row level security;
alter table subscription_events enable row level security;
alter table subscription_access_tokens enable row level security;
alter table subscription_nudges enable row level security;

-- 정책 생성하지 않음 → anon key로 접근 불가.
-- 서버(Vercel Edge API)가 SERVICE_ROLE_KEY로만 접근.

-- -----------------------------------------------------------------
-- 8) 대시보드용 뷰
-- -----------------------------------------------------------------

-- 현재 활성 구독자 현황 (규모별)
create or replace view v_active_subscriptions as
select
  tier_key,
  tier_label,
  count(*) as active_count,
  sum(monthly_price) as mrr,             -- Monthly Recurring Revenue
  avg(billing_cycle_count) as avg_cycles
from subscriptions
where status in ('trialing','active','past_due','cancel_scheduled')
group by 1, 2
order by tier_key;

-- 총 MRR (활성 구독만)
create or replace view v_mrr_snapshot as
select
  count(*) filter (where status = 'trialing') as trialing_count,
  count(*) filter (where status = 'active') as active_count,
  count(*) filter (where status = 'cancel_scheduled') as cancelling_count,
  count(*) filter (where status = 'past_due') as past_due_count,
  sum(monthly_price) filter (where status in ('trialing','active','cancel_scheduled')) as mrr_total,
  sum(case when status = 'trialing' then first_month_price else monthly_price end) filter (where status in ('trialing','active','cancel_scheduled')) as this_month_billed
from subscriptions;

-- 월별 구독 퍼널 (신규 가입·해지·유지)
create or replace view v_monthly_subscription_funnel as
select
  date_trunc('month', created_at)::date as month,
  count(*) as new_subscriptions,
  count(*) filter (where status in ('cancelled','cancel_scheduled')) as cancelled,
  count(*) filter (where status in ('trialing','active','past_due')) as still_active,
  round(100.0 * count(*) filter (where status in ('trialing','active','past_due'))
              / nullif(count(*), 0), 2) as retention_rate
from subscriptions
group by 1
order by 1 desc;

-- 단건 → 구독 전환율 (최근 60일)
create or replace view v_single_to_subscription_conversion as
select
  date_trunc('week', o.created_at)::date as week,
  count(distinct o.id) as single_orders,
  count(distinct s.converted_from_order) as converted_to_sub,
  round(100.0 * count(distinct s.converted_from_order) / nullif(count(distinct o.id), 0), 2) as conversion_rate
from orders o
left join subscriptions s on s.converted_from_order = o.id
where o.service = 'consult'
  and o.payment_status = 'paid'
  and o.created_at > now() - interval '60 days'
group by 1
order by 1 desc;

-- 해지 사유 집계
create or replace view v_cancel_reasons as
select
  coalesce(cancel_reason, '(미입력)') as reason,
  count(*) as count,
  avg(billing_cycle_count) as avg_cycles_before_cancel
from subscriptions
where cancelled_at is not null
group by 1
order by 2 desc;
