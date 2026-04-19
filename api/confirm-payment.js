/*!
 * HRer 결제 승인 + Supabase 저장 + 이메일 알림
 * Edge Runtime, Tokyo(hnd1)
 *
 * 플로우:
 *   1. Toss /v1/payments/confirm 호출 (결제 승인)
 *   2. Supabase orders UPSERT (order_id 기준)
 *      - 챗봇 핸드오프 정보·taxonomy·utm 포함
 *      - pending 상태인 기존 레코드가 있으면 업데이트, 없으면 신규
 *   3. Resend 이메일 2통 (관리자 + 고객)
 *   4. 텔레그램 알림 (선택)
 */
import {dbSelect, dbUpsert, dbUpdate} from './_db.js';

export const config = {runtime: 'edge', regions: ['hnd1']};

export default async function handler(req){
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, {status:200, headers});
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'method_not_allowed'}), {status:405, headers});

  let body;
  try { body = await req.json(); } catch(e){ return new Response(JSON.stringify({error:'invalid_body'}), {status:400, headers}); }

  const {paymentKey, orderId, amount,
         name, email, phone, company, question,
         service, tier, taxonomyId,
         handoffSession, handoffSummary,
         utmSource, utmMedium, utmCampaign, referrer,
         rawInput} = body;

  if (!paymentKey || !orderId || !amount){
    return new Response(JSON.stringify({error:'missing_required'}), {status:400, headers});
  }

  const secretKey = globalThis.process?.env?.TOSS_SECRET_KEY;
  if (!secretKey){
    return new Response(JSON.stringify({error:'payment_config_error'}), {status:500, headers});
  }

  // 1) Toss 승인
  let payment;
  try {
    const confirmRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(secretKey + ':'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({paymentKey, orderId, amount: Number(amount)}),
    });
    payment = await confirmRes.json();
    if (!confirmRes.ok){
      return new Response(JSON.stringify({
        error: payment.message || 'payment_confirmation_failed',
        code: payment.code,
      }), {status: confirmRes.status, headers});
    }
  } catch(e){
    return new Response(JSON.stringify({error:'toss_exception', message: String(e.message||e).slice(0,200)}), {status:500, headers});
  }

  // 2) Supabase 저장 (orders)
  // 같은 order_id로 pending 레코드가 있으면 업데이트(paid), 없으면 insert
  try {
    // business_order_id를 커스텀 컬럼으로 추가할 수도 있지만, 여기서는 Toss orderId를 orders.id로 쓰지 않고 raw_input에 보관
    const orderRow = {
      service: service || 'consult',
      tier: tier || null,
      name: name || null,
      contact: email || null,
      company: company || null,
      question: question || null,
      amount: Number(amount),
      payment_status: 'paid',
      payment_key: paymentKey,
      payment_method: payment.method || null,
      approved_at: payment.approvedAt || new Date().toISOString(),
      taxonomy_id: taxonomyId || null,
      handoff_session: handoffSession || null,
      handoff_summary: handoffSummary || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      referrer: (referrer || '').slice(0, 300) || null,
      raw_input: rawInput || {toss_orderId: orderId, phone: phone || null},
    };

    // 먼저 같은 toss orderId로 기존 pending 레코드 탐색
    const existing = await dbSelect('orders',
      `raw_input->>toss_orderId=eq.${encodeURIComponent(orderId)}&limit=1`
    ).catch(() => null);

    if (existing && existing.length > 0){
      await dbUpdate('orders', {id: existing[0].id}, orderRow);
    } else {
      await dbUpsert('orders', orderRow);
    }
  } catch(dbErr){
    // DB 실패해도 결제는 성공 처리 (돈 받았으니까). 에러만 로그.
    console.error('db_save_fail', dbErr);
  }

  // 3) 이메일 알림
  try {
    await sendNotification(payment, {name, email, company, question, service, tier, taxonomyId, handoffSummary});
  } catch (emailErr){
    console.error('email_fail', emailErr);
  }

  // 4) 텔레그램 알림 (선택)
  try {
    const botToken = globalThis.process?.env?.TELEGRAM_BOT_TOKEN;
    const chatId = globalThis.process?.env?.TELEGRAM_CHAT_ID;
    if (botToken && chatId){
      const tgMsg = `💰 HRer 결제 완료\n서비스: ${service || payment.orderName}\n의뢰인: ${name || '-'} (${email || '-'})\n금액: ${Number(amount).toLocaleString('ko-KR')}원\n주문번호: ${orderId}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({chat_id: chatId, text: tgMsg}),
      });
    }
  } catch(tgErr){ console.error('telegram_fail', tgErr); }

  return new Response(JSON.stringify({
    success: true,
    orderId: payment.orderId,
    orderName: payment.orderName,
    approvedAt: payment.approvedAt,
    method: payment.method,
  }), {status:200, headers});
}

// ============================================================
async function sendNotification(payment, orderData){
  const resendKey = globalThis.process?.env?.RESEND_API_KEY;
  if (!resendKey) return;

  const {name, email, company, question, service, tier, handoffSummary} = orderData;

  const serviceLabel = prettyService(service, tier) || payment.orderName;
  const amount = Number(payment.totalAmount).toLocaleString('ko-KR');
  const chatContext = handoffSummary
    ? renderChatSummary(handoffSummary)
    : '';

  // 관리자 알림
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${resendKey}`, 'Content-Type':'application/json'},
    body: JSON.stringify({
      from: 'HRer <noreply@hrer.kr>',
      to: ['contact@hrer.kr'],
      subject: `[HRer] 새 의뢰 — ${serviceLabel} · ${name || '무명'}`,
      html: `
        <h2>새 의뢰가 접수되었습니다</h2>
        <table style="border-collapse:collapse;width:100%;max-width:640px;font-family:'Noto Sans KR',sans-serif;">
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:120px;">주문번호</td><td style="padding:8px;border:1px solid #ddd;">${payment.orderId}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">서비스</td><td style="padding:8px;border:1px solid #ddd;">${serviceLabel}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">결제금액</td><td style="padding:8px;border:1px solid #ddd;">${amount}원</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">의뢰인</td><td style="padding:8px;border:1px solid #ddd;">${esc(name) || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">이메일</td><td style="padding:8px;border:1px solid #ddd;">${esc(email) || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">회사명</td><td style="padding:8px;border:1px solid #ddd;">${esc(company) || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">승인시각</td><td style="padding:8px;border:1px solid #ddd;">${payment.approvedAt}</td></tr>
        </table>
        <h3 style="margin-top:24px;">질문 내용</h3>
        <div style="background:#F7F9FC;padding:16px;border-radius:8px;white-space:pre-wrap;line-height:1.7;">${esc(question) || '(내용 없음)'}</div>
        ${chatContext ? `<h3 style="margin-top:24px;">챗봇 사전 대화 요약</h3>${chatContext}` : ''}
        <p style="margin-top:28px;font-size:14px;color:#666;">→ 관리 대시보드: <a href="https://hrer-homepage.vercel.app/bot-admin">bot-admin</a></p>
      `,
    }),
  });

  // 고객 접수 확인
  if (email && /^[^@]+@[^@]+\.[^@]+$/.test(email)){
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${resendKey}`, 'Content-Type':'application/json'},
      body: JSON.stringify({
        from: 'HRer <noreply@hrer.kr>',
        to: [email],
        subject: '[HRer] 자문 의뢰가 접수되었습니다',
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:'Noto Sans KR',sans-serif;">
            <div style="background:#0F2744;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
              <span style="font-size:28px;font-weight:900;"><span style="color:#00B893;">HR</span><span style="color:#fff;">er</span></span>
            </div>
            <div style="padding:32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
              <h2 style="color:#0F2744;margin-bottom:16px;">${esc(name) || '고객'}님, 의뢰가 접수되었습니다.</h2>
              <p style="color:#5A6A80;line-height:1.8;margin-bottom:24px;">
                영업일 기준 24시간 이내에 입력하신 이메일(${esc(email)})로 답변을 드리겠습니다.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <tr><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#8A9AB0;width:100px;">주문번호</td><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F2744;font-weight:600;">${payment.orderId}</td></tr>
                <tr><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#8A9AB0;">서비스</td><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F2744;font-weight:600;">${esc(serviceLabel)}</td></tr>
                <tr><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#8A9AB0;">결제금액</td><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F2744;font-weight:600;">${amount}원</td></tr>
              </table>
              <p style="color:#5A6A80;font-size:14px;line-height:1.7;">문의사항이 있으시면 <a href="mailto:contact@hrer.kr" style="color:#00B893;">contact@hrer.kr</a>로 연락 주세요.</p>
            </div>
          </div>
        `,
      }),
    });
  }
}

function prettyService(service, tier){
  const map = {
    'consult':'노무 자문',
    'unfair-dismissal':'부당해고 구제',
    'investigation':'괴롭힘·성희롱 조사',
    'hr-evaluation':'인사평가 설계',
    'employment-rules':'취업규칙 검토',
  };
  const name = map[service] || service || '';
  const tierLabel = tier === 'simple' ? ' (간편)' : tier === 'deep' ? ' (심층)' : tier === 'written' ? ' (서면)' : '';
  return (name + tierLabel).trim();
}

function renderChatSummary(s){
  if (!s || typeof s !== 'object') return '';
  const bullets = Array.isArray(s.bullets) ? s.bullets : [];
  return `
    <div style="background:#EEF2FF;border-left:4px solid #4C6EF5;padding:12px 16px;border-radius:0 8px 8px 0;">
      ${s.title ? `<div style="font-weight:700;margin-bottom:6px;">${esc(s.title)}</div>` : ''}
      ${s.summary ? `<div style="font-size:14px;color:#333;margin-bottom:10px;line-height:1.7;">${esc(s.summary)}</div>` : ''}
      ${bullets.length ? '<ul style="margin:0;padding-left:20px;font-size:14px;color:#333;">' + bullets.map(b => `<li>${esc(b)}</li>`).join('') + '</ul>' : ''}
    </div>
  `;
}

function esc(s){
  return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
