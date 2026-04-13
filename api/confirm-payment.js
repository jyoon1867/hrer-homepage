export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { paymentKey, orderId, amount } = req.body;

  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Payment configuration error' });
  }

  try {
    // 토스페이먼츠 결제 승인 요청
    const confirmRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });

    const payment = await confirmRes.json();

    if (!confirmRes.ok) {
      return res.status(confirmRes.status).json({
        error: payment.message || 'Payment confirmation failed',
        code: payment.code,
      });
    }

    // 결제 승인 성공 → 이메일 알림 발송
    try {
      await sendNotification(payment, req.body);
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr);
      // 이메일 실패해도 결제는 성공 처리
    }

    return res.status(200).json({
      success: true,
      orderId: payment.orderId,
      orderName: payment.orderName,
      approvedAt: payment.approvedAt,
    });
  } catch (err) {
    console.error('Payment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendNotification(payment, orderData) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const { name, email, company, question, service } = orderData;

  // 1. 관리자 알림
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'HRer <noreply@hrer.kr>',
      to: ['contact@hrer.kr'],
      subject: `[HRer] 새 자문 의뢰 — ${service || payment.orderName}`,
      html: `
        <h2>새 자문 의뢰가 접수되었습니다</h2>
        <table style="border-collapse:collapse;width:100%;max-width:600px;">
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:120px;">주문번호</td><td style="padding:8px;border:1px solid #ddd;">${payment.orderId}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">서비스</td><td style="padding:8px;border:1px solid #ddd;">${service || payment.orderName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">결제금액</td><td style="padding:8px;border:1px solid #ddd;">${Number(payment.totalAmount).toLocaleString('ko-KR')}원</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">의뢰인</td><td style="padding:8px;border:1px solid #ddd;">${name || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">이메일</td><td style="padding:8px;border:1px solid #ddd;">${email || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">회사명</td><td style="padding:8px;border:1px solid #ddd;">${company || '미입력'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">승인시각</td><td style="padding:8px;border:1px solid #ddd;">${payment.approvedAt}</td></tr>
        </table>
        <h3 style="margin-top:24px;">질문 내용</h3>
        <div style="background:#f7f9fc;padding:16px;border-radius:8px;white-space:pre-wrap;line-height:1.7;">${question || '(내용 없음)'}</div>
      `,
    }),
  });

  // 2. 고객 접수 확인 메일
  if (email) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'HRer <noreply@hrer.kr>',
        to: [email],
        subject: `[HRer] 자문 의뢰가 접수되었습니다`,
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:'Noto Sans KR',sans-serif;">
            <div style="background:#0F2744;padding:32px;border-radius:12px 12px 0 0;text-align:center;">
              <span style="font-size:28px;font-weight:900;"><span style="color:#00B893;">HR</span><span style="color:#fff;">er</span></span>
            </div>
            <div style="padding:32px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
              <h2 style="color:#0F2744;margin-bottom:16px;">${name || '고객'}님, 자문 의뢰가 접수되었습니다.</h2>
              <p style="color:#5A6A80;line-height:1.8;margin-bottom:24px;">
                영업일 기준 24시간 이내에 입력하신 이메일(${email})로 서면 답변을 보내드리겠습니다.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <tr><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#8A9AB0;width:100px;">주문번호</td><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F2744;font-weight:600;">${payment.orderId}</td></tr>
                <tr><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#8A9AB0;">서비스</td><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F2744;font-weight:600;">${service || payment.orderName}</td></tr>
                <tr><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#8A9AB0;">결제금액</td><td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F2744;font-weight:600;">${Number(payment.totalAmount).toLocaleString('ko-KR')}원</td></tr>
              </table>
              <p style="color:#5A6A80;font-size:14px;line-height:1.7;">
                문의사항이 있으시면 contact@hrer.kr로 연락 주세요.
              </p>
            </div>
          </div>
        `,
      }),
    });
  }
}
