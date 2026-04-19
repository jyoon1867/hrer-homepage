/*!
 * HRer 의뢰 답변 작성 API
 *
 * 기능:
 *  - 'hrer' 채널: Resend로 hrer.kr 명의 이메일 자동 발송 + Supabase 저장
 *  - 'oneteam_manual' 채널: 발송은 외부(메일플러그 수동), Supabase 저장만
 *
 * 인증: X-Admin-Token 헤더
 * Runtime: Edge (Tokyo)
 */
import {dbUpdate, dbSelect} from './_db.js';

export const config = {runtime:'edge', regions:['hnd1']};

export default async function handler(req){
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, {status:200, headers});
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'method_not_allowed'}), {status:405, headers});

  // 관리자 인증
  const token = req.headers.get('x-admin-token') || '';
  const expected = globalThis.process?.env?.ADMIN_TOKEN;
  if (!expected) return new Response(JSON.stringify({error:'admin_token_not_configured'}), {status:500, headers});
  if (token !== expected) return new Response(JSON.stringify({error:'unauthorized'}), {status:401, headers});

  let body;
  try { body = await req.json(); } catch(e){ return new Response(JSON.stringify({error:'invalid_body'}), {status:400, headers}); }

  const {orderId, responseBody, channel, answeredBy} = body;
  if (!orderId || !responseBody || !channel){
    return new Response(JSON.stringify({error:'missing_fields'}), {status:400, headers});
  }
  if (!['hrer', 'oneteam_manual'].includes(channel)){
    return new Response(JSON.stringify({error:'invalid_channel'}), {status:400, headers});
  }

  // 의뢰 조회
  const rows = await dbSelect('orders', `id=eq.${encodeURIComponent(orderId)}&limit=1`);
  if (!rows || !rows.length){
    return new Response(JSON.stringify({error:'order_not_found'}), {status:404, headers});
  }
  const order = rows[0];
  const customerEmail = order.contact || '';

  const now = new Date().toISOString();
  const patch = {
    response_body: responseBody,
    response_channel: channel,
    answered_at: now,
    answered_by: answeredBy || 'HRer',
  };

  // hrer 채널: Resend 자동 발송
  if (channel === 'hrer'){
    const resendKey = globalThis.process?.env?.RESEND_API_KEY;
    if (!resendKey){
      return new Response(JSON.stringify({error:'resend_not_configured'}), {status:500, headers});
    }
    if (!customerEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(customerEmail)){
      return new Response(JSON.stringify({error:'invalid_customer_email', email: customerEmail}), {status:400, headers});
    }

    const emailHtml = renderEmail({
      customerName: order.name || '고객',
      serviceName: prettyService(order.service, order.tier),
      body: responseBody,
    });

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'HRer <reply@hrer.kr>',
          to: [customerEmail],
          reply_to: 'contact@hrer.kr',
          subject: `[HRer] ${prettyService(order.service, order.tier)} 답변 드립니다`,
          html: emailHtml,
        }),
      });
      if (!r.ok){
        const errTxt = await r.text().catch(()=>'?');
        return new Response(JSON.stringify({error:'resend_fail', detail: errTxt.slice(0,300)}), {status:500, headers});
      }
    } catch(e){
      return new Response(JSON.stringify({error:'resend_exception', message: String(e.message||e).slice(0,200)}), {status:500, headers});
    }
  }

  // Supabase 저장 (hrer·oneteam_manual 공통)
  const updated = await dbUpdate('orders', {id: orderId}, patch);
  if (!updated){
    return new Response(JSON.stringify({error:'db_update_fail'}), {status:500, headers});
  }

  return new Response(JSON.stringify({
    ok: true,
    channel,
    answered_at: now,
    sent: channel === 'hrer',
  }), {status:200, headers});
}

function prettyService(service, tier){
  const map = {
    'consult': '노무 자문',
    'unfair-dismissal': '부당해고 구제',
    'investigation': '직장 내 괴롭힘·성희롱 조사',
    'hr-evaluation': '인사평가 설계',
    'employment-rules': '취업규칙 검토',
  };
  const name = map[service] || service || '자문';
  const tierLabel = tier === 'simple' ? ' (간단 자문)' : tier === 'deep' ? ' (심층 자문)' : tier === 'written' ? ' (서면 자문)' : '';
  return name + tierLabel;
}

function renderEmail({customerName, serviceName, body}){
  // 답변 본문의 줄바꿈을 <br>로 변환, HTML 태그는 그대로 허용
  // (이미 관리자가 작성한 본문이므로 sanitize는 입력단에서 한 것으로 신뢰)
  const escaped = body.replace(/\r\n/g, '\n');
  return `
<div style="max-width:680px;margin:0 auto;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#0F2744;">
  <div style="background:#0F2744;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="font-size:26px;font-weight:900;letter-spacing:-0.5px;"><span style="color:#00B893;">HR</span><span style="color:#fff;">er</span></span>
  </div>
  <div style="padding:32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;background:#fff;">
    <p style="margin:0 0 18px;font-size:15px;color:#5A6A80;">${customerName}님, 안녕하십니까.</p>
    <p style="margin:0 0 24px;font-size:15px;color:#5A6A80;">의뢰해 주신 <strong style="color:#0F2744;">${serviceName}</strong> 건에 대한 답변을 드립니다.</p>
    <div style="padding:24px;background:#F7F9FC;border-left:4px solid #00B893;border-radius:0 8px 8px 0;line-height:1.85;font-size:15px;white-space:pre-wrap;">${escaped}</div>
    <p style="margin:24px 0 0;font-size:14px;color:#8A9AB0;line-height:1.7;">
      추가 문의사항이 있으시면 본 메일로 회신해 주시거나 <a href="mailto:contact@hrer.kr" style="color:#00B893;">contact@hrer.kr</a>로 연락 주시기 바랍니다.
    </p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #E2E8F0;">
      <p style="margin:0;font-size:14px;color:#0F2744;font-weight:600;">HRer 담당 공인노무사 드림</p>
      <p style="margin:4px 0 0;font-size:12px;color:#8A9AB0;">hrer.kr · contact@hrer.kr</p>
    </div>
  </div>
</div>`.trim();
}
