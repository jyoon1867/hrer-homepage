/**
 * HRer 챗봇 위젯
 * - 우하단 채팅 버블
 * - FAQ 자동응답
 * - 문의 연결
 *
 * 사용법: <script src="/chatbot.js"></script> 를 페이지 하단에 추가
 */
(function() {
  'use strict';

  // ─── FAQ 데이터 ───
  const FAQ = [
    {
      keywords: ['비용', '가격', '얼마', '요금', '수수료', '금액'],
      q: '비용이 어떻게 되나요?',
      a: '간편자문 143,000원, 심층자문 198,000원, 의견서 253,000원입니다 (VAT 포함). 건별 결제이며, 추가질의 1회 무료, 2회차부터 22,000원입니다.'
    },
    {
      keywords: ['시간', '기간', '소요', '언제', '며칠', '빠르'],
      q: '답변은 언제 받을 수 있나요?',
      a: '영업일 기준 24시간 이내에 서면 답변을 보내드립니다. 긴급 건은 별도 협의 가능합니다.'
    },
    {
      keywords: ['전화', '통화', '상담', '대면', '미팅', '방문'],
      q: '전화 상담은 되나요?',
      a: '모든 자문은 서면(이메일)으로만 진행합니다. 답변이 기록으로 남아 나중에 다시 확인하실 수 있고, 법적 근거로도 활용 가능합니다.'
    },
    {
      keywords: ['환불', '취소', '반환'],
      q: '환불이 가능한가요?',
      a: '결제 후 1시간 이내 전액 환불 가능합니다. 결제 1시간 후부터 착수가 시작되며, 착수 후에는 환불이 불가합니다.'
    },
    {
      keywords: ['한번', '한 번', '1회', '건별', '구독', '월정액', '계약'],
      q: '한 번만 이용해도 되나요?',
      a: '네, 건별 이용이 기본입니다. 계약이나 약정 없이, 필요할 때마다 이용하세요.'
    },
    {
      keywords: ['분야', '어떤', '종류', '범위', '뭐'],
      q: '어떤 분야를 자문받을 수 있나요?',
      a: '근로계약, 퇴직금, 연차, 임금, 해고, 징계, 직장 내 괴롭힘, 취업규칙 등 인사노무 전반에 대해 자문 가능합니다. 인사평가 설계, 부당해고 사건, 사건조사도 가능합니다.'
    },
    {
      keywords: ['인사평가', '평가', 'BOS', 'MBO', '역량'],
      q: '인사평가 서비스는 어떤 건가요?',
      a: '10~30인 사업장에 최적화된 인사평가 설계 서비스입니다. BOS 기반 평가표 설계, 통계 분석, 보상 연계까지 제공합니다.'
    },
    {
      keywords: ['괴롭힘', '성희롱', '조사', '신고'],
      q: '직장 내 괴롭힘/성희롱 조사는 어떻게 하나요?',
      a: '비대면 조사 원칙으로 효율적으로 진행하며, 조사보고서는 법적 요건에 맞게 빈틈없이 작성합니다. 항목별 투명한 비용으로 운영됩니다.'
    },
    {
      keywords: ['해고', '부당', '노동위', '구제'],
      q: '부당해고 사건도 도와주나요?',
      a: '네, 초기 상담부터 서면 작성, 심문회의 참석까지 단계별로 필요한 만큼만 의뢰하실 수 있습니다.'
    },
    {
      keywords: ['결제', '카드', '계좌', '토스', '카카오'],
      q: '결제 방법은 뭐가 있나요?',
      a: '카드, 계좌이체, 토스페이, 카카오페이 등으로 결제 가능합니다. 건별 간편결제이며, 결제 후 바로 접수됩니다.'
    },
  ];

  const QUICK_BUTTONS = [
    { label: '비용 안내', query: '비용' },
    { label: '답변 소요시간', query: '시간' },
    { label: '자문 분야', query: '분야' },
    { label: '자문 의뢰하기', link: '/order' },
  ];

  // ─── HTML 삽입 ───
  const widget = document.createElement('div');
  widget.id = 'hrer-chatbot';
  widget.innerHTML = `
    <div class="cb-bubble" id="cbBubble" title="무엇이든 물어보세요">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="cb-window" id="cbWindow">
      <div class="cb-header">
        <div class="cb-header-left">
          <span class="cb-logo"><span class="cb-hr">HR</span><span class="cb-er">er</span></span>
          <span class="cb-status">무엇이든 물어보세요</span>
        </div>
        <button class="cb-close" id="cbClose" aria-label="닫기">&times;</button>
      </div>
      <div class="cb-body" id="cbBody">
        <div class="cb-msg cb-bot">
          <div class="cb-msg-content">안녕하세요! HRer입니다.<br>궁금한 점을 물어보시거나, 아래 버튼을 눌러보세요.</div>
        </div>
        <div class="cb-quick" id="cbQuick"></div>
      </div>
      <div class="cb-input-wrap">
        <input type="text" class="cb-input" id="cbInput" placeholder="질문을 입력하세요..." maxlength="200">
        <button class="cb-send" id="cbSend" aria-label="전송">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // ─── CSS 삽입 ───
  const style = document.createElement('style');
  style.textContent = `
    #hrer-chatbot { --cb-mint: #00B893; --cb-navy: #0F2744; --cb-bg: #F7F9FC; --cb-border: #E2E8F0; --cb-gray: #5A6A80; --cb-gray2: #8A9AB0; }
    #hrer-chatbot * { font-family: 'Noto Sans KR', -apple-system, sans-serif !important; box-sizing: border-box; margin: 0; padding: 0; }

    .cb-bubble {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--cb-mint); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(0,184,147,0.35);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .cb-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,184,147,0.45); }
    .cb-bubble.hidden { display: none; }

    .cb-window {
      position: fixed; bottom: 92px; right: 24px; z-index: 9999;
      width: 420px; height: 75vh; max-height: 780px; min-height: 500px;
      border-radius: 16px;
      background: #fff; border: 1px solid var(--cb-border);
      box-shadow: 0 12px 48px rgba(15,39,68,0.15);
      display: none; flex-direction: column; overflow: hidden;
      resize: vertical;
    }
    .cb-window.open { display: flex; animation: cbSlideUp 0.25s ease; }
    @keyframes cbSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

    .cb-header {
      background: var(--cb-navy); padding: 18px 24px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .cb-header-left { display: flex; align-items: center; gap: 12px; }
    .cb-logo { font-size: 20px; font-weight: 900; }
    .cb-hr { color: var(--cb-mint); }
    .cb-er { color: #fff; }
    .cb-status { font-size: 13px; color: rgba(255,255,255,0.6); }
    .cb-close { background: none; border: none; color: rgba(255,255,255,0.5); font-size: 24px; cursor: pointer; padding: 0 4px; line-height: 1; }
    .cb-close:hover { color: #fff; }

    .cb-body { flex: 1; overflow-y: auto; padding: 28px 24px; background: var(--cb-bg); }
    .cb-body::-webkit-scrollbar { width: 4px; }
    .cb-body::-webkit-scrollbar-thumb { background: var(--cb-border); border-radius: 4px; }

    .cb-msg { margin-bottom: 20px; display: flex; }
    .cb-msg.cb-bot { justify-content: flex-start; }
    .cb-msg.cb-user { justify-content: flex-end; }
    .cb-msg-content {
      max-width: 82%; padding: 16px 20px; border-radius: 14px;
      font-size: 14.5px; line-height: 1.9; letter-spacing: 0px; word-spacing: 1px;
    }
    .cb-bot .cb-msg-content { background: #fff; color: var(--cb-navy); border: 1px solid var(--cb-border); border-bottom-left-radius: 4px; }
    .cb-user .cb-msg-content { background: var(--cb-navy); color: #fff; border-bottom-right-radius: 4px; }

    .cb-msg-content a { color: var(--cb-mint); font-weight: 600; text-decoration: none; }
    .cb-msg-content a:hover { text-decoration: underline; }

    .cb-quick { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .cb-quick-btn {
      padding: 9px 16px; border-radius: 20px; font-size: 13.5px; font-weight: 600;
      border: 1px solid var(--cb-border); background: #fff; color: var(--cb-navy);
      cursor: pointer; transition: all 0.15s; text-decoration: none; display: inline-block;
    }
    .cb-quick-btn:hover { border-color: var(--cb-mint); color: var(--cb-mint); background: #E6F7F3; }

    .cb-input-wrap {
      padding: 16px 20px; border-top: 1px solid var(--cb-border);
      display: flex; gap: 10px; background: #fff;
    }
    .cb-input {
      flex: 1; padding: 12px 16px; border: 1.5px solid var(--cb-border);
      border-radius: 8px; font-size: 14.5px; outline: none; color: var(--cb-navy);
      transition: border-color 0.15s;
    }
    .cb-input:focus { border-color: var(--cb-mint); }
    .cb-input::placeholder { color: var(--cb-gray2); }
    .cb-send {
      width: 44px; height: 44px; border-radius: 8px; border: none;
      background: var(--cb-mint); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .cb-send:hover { background: #00a07e; }

    .cb-typing { display: flex; gap: 4px; padding: 12px 16px; }
    .cb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cb-gray2); animation: cbDot 1.2s infinite; }
    .cb-dot:nth-child(2) { animation-delay: 0.2s; }
    .cb-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cbDot { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

    @media (max-width: 480px) {
      .cb-window { right: 0; bottom: 0; width: 100%; height: 100vh; max-height: 100vh; min-height: 100vh; border-radius: 0; resize: none; }
      .cb-bubble { bottom: 16px; right: 16px; }
    }
  `;
  document.head.appendChild(style);

  // ─── 로직 ───
  const bubble = document.getElementById('cbBubble');
  const win = document.getElementById('cbWindow');
  const closeBtn = document.getElementById('cbClose');
  const body = document.getElementById('cbBody');
  const input = document.getElementById('cbInput');
  const sendBtn = document.getElementById('cbSend');
  const quickWrap = document.getElementById('cbQuick');

  // 퀵 버튼 렌더
  QUICK_BUTTONS.forEach(btn => {
    if (btn.link) {
      const a = document.createElement('a');
      a.href = btn.link;
      a.className = 'cb-quick-btn';
      a.textContent = btn.label;
      quickWrap.appendChild(a);
    } else {
      const el = document.createElement('button');
      el.className = 'cb-quick-btn';
      el.textContent = btn.label;
      el.addEventListener('click', () => handleQuery(btn.query));
      quickWrap.appendChild(el);
    }
  });

  // 열기/닫기
  bubble.addEventListener('click', () => {
    win.classList.add('open');
    bubble.classList.add('hidden');
    input.focus();
  });
  closeBtn.addEventListener('click', () => {
    win.classList.remove('open');
    bubble.classList.remove('hidden');
  });

  // 전송
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg(text, 'user');
    handleQuery(text);
  }

  function addMsg(text, role) {
    const div = document.createElement('div');
    div.className = 'cb-msg cb-' + role;
    div.innerHTML = '<div class="cb-msg-content">' + text + '</div>';
    // 퀵 버튼 앞에 삽입
    body.insertBefore(div, quickWrap);
    body.scrollTop = body.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'cb-msg cb-bot';
    div.id = 'cbTyping';
    div.innerHTML = '<div class="cb-msg-content"><div class="cb-typing"><div class="cb-dot"></div><div class="cb-dot"></div><div class="cb-dot"></div></div></div>';
    body.insertBefore(div, quickWrap);
    body.scrollTop = body.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('cbTyping');
    if (el) el.remove();
  }

  function handleQuery(text) {
    // 퀵 버튼 숨기기
    quickWrap.style.display = 'none';

    showTyping();

    setTimeout(() => {
      removeTyping();

      const lower = text.toLowerCase();
      let matched = null;

      for (const faq of FAQ) {
        for (const kw of faq.keywords) {
          if (lower.includes(kw)) {
            matched = faq;
            break;
          }
        }
        if (matched) break;
      }

      if (matched) {
        addMsg(matched.a, 'bot');
      } else {
        addMsg(
          '해당 질문에 대해서는 직접 자문이 필요합니다.<br><br>' +
          '<a href="/order">자문 의뢰하기 &rarr;</a> 또는<br>' +
          '<a href="mailto:contact@hrer.kr">contact@hrer.kr</a>로 문의해 주세요.',
          'bot'
        );
      }

      // 퀵 버튼 다시 표시
      setTimeout(() => {
        quickWrap.style.display = 'flex';
        body.scrollTop = body.scrollHeight;
      }, 300);
    }, 600 + Math.random() * 400);
  }
})();
