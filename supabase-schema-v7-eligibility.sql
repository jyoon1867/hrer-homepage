-- =================================================================
-- HRer 스키마 v7: 첫 달 할인 재적용 차단
-- 실행: Supabase SQL Editor에 붙여넣고 Run (v6 적용된 상태에서 추가)
--
-- 목적:
--   같은 고객이 해지 후 재가입하여 첫 달 30% 할인을 반복 수혜하지 못하도록
--   서버측에서 자격(eligibility)을 검증.
--
-- 식별자 우선순위:
--   1) company_bizno (사업자등록번호, 10자리 숫자)  — 가장 강한 식별자
--   2) customer_email
--   3) toss_billing_key 메타데이터 (카드 BIN+last4) — 선택사항, 필요 시 별도 로직
--
-- 차단 기준:
--   과거 same-bizno 또는 same-email 로 가입하여
--   billing_cycle_count >= 1 인 구독 이력이 있으면 → 재적용 차단
--
-- 예외(윈백 옵션):
--   마지막 구독 종료(cancel_effective_at) 후 WINBACK_MONTHS 개월 지나면 다시 할인 가능.
--   기본 12개월. 0으로 두면 영구 차단.
-- =================================================================

-- -----------------------------------------------------------------
-- 1) 첫 달 할인 적용 이력 플래그 컬럼
--    (구독이 trialing→active 로 전환되거나 첫 invoice 성공 시점에 true 세팅)
-- -----------------------------------------------------------------
alter table subscriptions
  add column if not exists first_month_discount_used boolean not null default false,
  add column if not exists first_month_discount_used_at timestamptz;

-- 기존 데이터 마이그레이션:
--   이미 1회차 이상 결제 이력이 있는 구독은 할인 소진 처리
update subscriptions s
set
  first_month_discount_used = true,
  first_month_discount_used_at = coalesce(s.started_at, s.created_at)
where s.billing_cycle_count >= 1
  and s.first_month_discount_used = false;

-- -----------------------------------------------------------------
-- 2) bizno 정규화 헬퍼 (숫자만 10자리로 비교)
-- -----------------------------------------------------------------
create or replace function normalize_bizno(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null then null
    when length(regexp_replace(raw, '\D', '', 'g')) = 10
      then regexp_replace(raw, '\D', '', 'g')
    else null
  end;
$$;

-- -----------------------------------------------------------------
-- 3) 이메일 정규화 (소문자 + trim)
-- -----------------------------------------------------------------
create or replace function normalize_email(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null then null
    else lower(trim(raw))
  end;
$$;

-- -----------------------------------------------------------------
-- 4) 첫 달 할인 자격 검증 함수
--    returns: true  = 할인 적용 가능 (신규 고객 또는 윈백 대상)
--             false = 이미 할인 사용한 이력 있음 → 정가 적용
-- -----------------------------------------------------------------
create or replace function check_first_month_eligibility(
  p_email text,
  p_bizno text,
  p_winback_months int default 12          -- 0 이면 영구 차단
)
returns table (
  eligible boolean,
  reason text,
  last_used_at timestamptz,
  matched_by text                           -- 'bizno' | 'email' | null
)
language plpgsql
stable
as $$
declare
  v_email text := normalize_email(p_email);
  v_bizno text := normalize_bizno(p_bizno);
  v_row record;
  v_cutoff timestamptz;
begin
  -- 윈백 cutoff: 이 시각 이후에 할인 사용한 이력이면 차단
  v_cutoff := case
    when p_winback_months > 0 then now() - (p_winback_months || ' months')::interval
    else '-infinity'::timestamptz        -- 영구 차단
  end;

  -- 1순위: 사업자번호 매칭
  if v_bizno is not null then
    select s.first_month_discount_used_at
    into v_row
    from subscriptions s
    where normalize_bizno(s.company_bizno) = v_bizno
      and s.first_month_discount_used = true
      and s.first_month_discount_used_at > v_cutoff
    order by s.first_month_discount_used_at desc
    limit 1;

    if found then
      return query select
        false,
        format('동일 사업자번호(%s) 이력 있음', v_bizno),
        v_row.first_month_discount_used_at,
        'bizno'::text;
      return;
    end if;
  end if;

  -- 2순위: 이메일 매칭
  if v_email is not null then
    select s.first_month_discount_used_at
    into v_row
    from subscriptions s
    where normalize_email(s.customer_email) = v_email
      and s.first_month_discount_used = true
      and s.first_month_discount_used_at > v_cutoff
    order by s.first_month_discount_used_at desc
    limit 1;

    if found then
      return query select
        false,
        format('동일 이메일(%s) 이력 있음', v_email),
        v_row.first_month_discount_used_at,
        'email'::text;
      return;
    end if;
  end if;

  -- 모두 통과 → 할인 적용 가능
  return query select
    true,
    '신규 또는 윈백 대상'::text,
    null::timestamptz,
    null::text;
end;
$$;

-- -----------------------------------------------------------------
-- 5) 첫 결제 성공 시 플래그 자동 세팅 트리거
--    subscription_invoices 에 cycle_number=1, is_first_month=true, status='paid' 인
--    row 가 삽입/갱신되면 해당 subscription 의 플래그를 true 로 세팅.
-- -----------------------------------------------------------------
create or replace function mark_first_month_used()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and new.is_first_month = true and new.cycle_number = 1 then
    update subscriptions
    set
      first_month_discount_used = true,
      first_month_discount_used_at = coalesce(new.paid_at, now())
    where id = new.subscription_id
      and first_month_discount_used = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_first_month_used on subscription_invoices;
create trigger trg_mark_first_month_used
  after insert or update of status on subscription_invoices
  for each row
  execute function mark_first_month_used();

-- -----------------------------------------------------------------
-- 6) 인덱스 (조회 성능)
-- -----------------------------------------------------------------
create index if not exists idx_sub_bizno_used
  on subscriptions(company_bizno, first_month_discount_used_at desc)
  where first_month_discount_used = true;

create index if not exists idx_sub_email_used
  on subscriptions((normalize_email(customer_email)), first_month_discount_used_at desc)
  where first_month_discount_used = true;

-- -----------------------------------------------------------------
-- 7) 대시보드 뷰: 할인 소진 고객 명단
-- -----------------------------------------------------------------
create or replace view v_discount_used_customers as
select
  normalize_bizno(company_bizno) as bizno,
  normalize_email(customer_email) as email,
  max(first_month_discount_used_at) as last_used_at,
  count(*) as sub_count,
  bool_or(status in ('trialing','active','cancel_scheduled')) as has_active
from subscriptions
where first_month_discount_used = true
group by 1, 2
order by last_used_at desc;

-- =================================================================
-- 사용 예시 (서버 측 결제 시작 전 호출)
-- =================================================================
-- select * from check_first_month_eligibility(
--   'hr@acme.co.kr',
--   '123-45-67890',
--   12                 -- 12개월 윈백. 0이면 영구 차단
-- );
--
-- -> eligible=true  이면  first_month_price = 정가 * 0.7 (할인 적용)
-- -> eligible=false 이면  first_month_price = 정가        (할인 없이 시작)
-- =================================================================
