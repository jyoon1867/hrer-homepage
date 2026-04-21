/*!
 * HRer 무료 접수 API — 견적형 서비스 (부당해고·조사·인사평가·취업규칙)
 * Edge Runtime, Tokyo(hnd1)
 *
 * 결제 없이 접수만 받고, 견적 확정 후 별도 결제 프로세스로 이어짐.
 * orders 테이블에 payment_status='pending'으로 기록 + 이메일 알림.
 */
import {dbInsert} from './_db.js';

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

  const {
    service, name, email, phone, company, question,
    taxonomyId, rawInput,
    handoffSession, handoffSummary,
    utmSource, utmMedium, utmCampaign, referrer,
  } = body;

  // 검증
  if (!service || !name || !email || !question){
    return new Response(JSON.stringify({error:'missing_required'}), {status:400, headers});
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    return new Response(JSON.stringify({error:'invalid_email'}), {status:400, headers});
  }
  if (question.length < 10){
    return new Response(JSON.stringify({error:'question_too_short'}), {status:400, headers});
  }
  const validServices = ['consult','unfair-dismissal','investigation','hr-evaluation','employment-rules'];
  if (!validServices.includes(service)){
    return new Response(JSON.stringify({error:'invalid_service'}), {status:400, headers});
  }

  // Supabase 저장
  const inserted = await dbInsert('orders', {
    service,
    name: name.slice(0, 50),
    contact: email.slice(0, 100),
    company: (company || '').slice(0, 100),
    question: question.slice(0, 5000),
    amount: null,
    payment_status: 'pending',
    taxonomy_id: taxonomyId || null,
    handoff_session: handoffSession || null,
    handoff_summary: handoffSummary || null,
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    referrer: (referrer || '').slice(0, 300) || null,
    raw_input: {phone: phone || null, ...rawInput},
  }).catch(err => { console.error('inquiry_db_fail', err); return null; });

  // 이메일 알림
  try {
    await sendNotification({service, name, email, phone, company, question, handoffSummary});
  } catch(e){ console.error('inquiry_email_fail', e); }

  // 텔레그램 알림 (선택)
  try {
    const botToken = globalThis.process?.env?.TELEGRAM_BOT_TOKEN;
    const chatId = globalThis.process?.env?.TELEGRAM_CHAT_ID;
    if (botToken && chatId){
      const tgMsg = `📋 HRer 새 접수 (견적 대기)\n서비스: ${service}\n의뢰인: ${name} (${email})${company ? '\n회사: ' + company : ''}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({chat_id: chatId, text: tgMsg}),
      });
    }
  } catch(e){}

  return new Response(JSON.stringify({
    ok: true,
    orderId: inserted?.id || null,
    message: '접수가 완료되었습니다. 영업일 24시간 이내에 담당 노무사가 연락드립니다.',
  }), {status:200, headers});
}

async function sendNotification({service, name, email, phone, company, question, handoffSummary}){
  const resendKey = globalThis.process?.env?.RESEND_API_KEY;
  if (!resendKey) return;

  const serviceLabel = {
    'consult':'노무 자문',
    'unfair-dismissal':'부당해고 구제',
    'investigation':'괴롭힘·성희롱 조사',
    'hr-evaluation':'인사평가 설계',
    'employment-rules':'취업규칙 검토',
  }[service] || service;

  const chatBlock = handoffSummary
    ? `
      <h3 style="margin-top:24px;">챗봇 사전 대화 요약</h3>
      <div style="background:#EEF2FF;border-left:4px solid #4C6EF5;padding:12px 16px;border-radius:0 8px 8px 0;">
        ${handoffSummary.title ? `<div style="font-weight:700;margin-bottom:6px;">${esc(handoffSummary.title)}</div>` : ''}
        ${handoffSummary.summary ? `<div style="font-size:14px;line-height:1.7;color:#333;">${esc(handoffSummary.summary)}</div>` : ''}
        ${(Array.isArray(handoffSummary.bullets) && handoffSummary.bullets.length) ? '<ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#333;">' + handoffSummary.bullets.map(b => `<li>${esc(b)}</li>`).join('') + '</ul>' : ''}
      </div>`
    : '';

  // 관리자 알림
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${resendKey}`, 'Content-Type':'application/json'},
    body: JSON.stringify({
      from: 'HRer <noreply@hrer.kr>',
      to: [globalThis.process?.env?.ADMIN_EMAIL || 'contact@hrer.kr'],
      reply_to: email || undefined,
      subject: `[HRer] 새 접수(견적 대기) — ${serviceLabel} · ${name}`,
      html: `
        <h2>새 접수 (견적 대기)</h2>
        <table style="border-collapse:collapse;width:100%;max-width:640px;font-family:'Noto Sans KR',sans-serif;">
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:120px;">서비스</td><td style="padding:8px;border:1px solid #ddd;">${esc(serviceLabel)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">의뢰인</td><td style="padding:8px;border:1px solid #ddd;">${esc(name)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">이메일</td><td style="padding:8px;border:1px solid #ddd;">${esc(email)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">연락처</td><td style="padding:8px;border:1px solid #ddd;">${esc(phone) || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">회사</td><td style="padding:8px;border:1px solid #ddd;">${esc(company) || '-'}</td></tr>
        </table>
        <h3 style="margin-top:24px;">문의 내용</h3>
        <div style="background:#F7F9FC;padding:16px;border-radius:8px;white-space:pre-wrap;line-height:1.7;">${esc(question)}</div>
        ${chatBlock}
        <p style="margin-top:28px;font-size:14px;color:#666;">→ 관리 대시보드: <a href="https://hrer.kr/bot-admin">bot-admin</a></p>
      `,
    }),
  });

  // 고객 접수 확인
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${resendKey}`, 'Content-Type':'application/json'},
    body: JSON.stringify({
      from: 'HRer <noreply@hrer.kr>',
      to: [email],
      subject: '[HRer] 접수가 완료되었습니다',
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Noto Sans KR',sans-serif;">
          <div style="background:#0F2744;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
            <span style="font-size:28px;font-weight:900;"><span style="color:#00B893;">HR</span><span style="color:#fff;">er</span></span>
          </div>
          <div style="padding:32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="color:#0F2744;margin-bottom:16px;">${esc(name)}님, 접수가 완료되었습니다.</h2>
            <p style="color:#5A6A80;line-height:1.8;margin-bottom:16px;">의뢰하신 <strong>${esc(serviceLabel)}</strong> 건에 대하여 영업일 24시간 이내에 담당 노무사가 연락드리겠습니다.</p>
            <p style="color:#5A6A80;line-height:1.8;margin-bottom:24px;">접수 단계에서는 비용이 청구되지 않으며, 사안 검토 후 견적과 함께 진행 여부를 안내드립니다.</p>
            <p style="color:#8A9AB0;font-size:14px;line-height:1.7;">문의사항이 있으시면 <a href="mailto:contact@hrer.kr" style="color:#00B893;">contact@hrer.kr</a>로 연락 주세요.</p>
          </div>
        </div>
      `,
    }),
  });
}

function esc(s){
  return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
