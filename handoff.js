/*!
 * HRer Chatbot Handoff — 챗봇 대화를 의뢰폼에 자동 연결
 *
 * 작동:
 *  1. URL에 ?from=chatbot 파라미터가 있거나 localStorage에 핸드오프 데이터가 있으면
 *  2. 페이지 최상단에 요약 박스 렌더
 *  3. 질문/내용 textarea에 요지 자동 prefill
 *  4. 추천 티어 자동 선택 (/order의 경우)
 *  5. 제출 시 대화 이력을 mailto 이메일 본문 또는 hidden input에 포함
 *
 * 로드 위치: order*.html <body> 끝에 <script src="/handoff.js" defer></script>
 */
(function(){
  'use strict';
  const HANDOFF_KEY = 'hrer_bot_handoff';
  const MAX_AGE_MS = 30 * 60 * 1000; // 30분

  function loadHandoff(){
    try {
      const raw = localStorage.getItem(HANDOFF_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.at) return null;
      if (Date.now() - d.at > MAX_AGE_MS){
        localStorage.removeItem(HANDOFF_KEY);
        return null;
      }
      return d;
    } catch(e){ return null; }
  }
  function clearHandoff(){
    try { localStorage.removeItem(HANDOFF_KEY); } catch(e){}
  }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  const CSS = `
  .hh-card{position:relative;max-width:720px;margin:0 auto 24px;padding:22px 26px;background:linear-gradient(135deg,#F0FDF4 0%,#EEF2FF 100%);border:1.5px solid #00B893;border-radius:14px;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif}
  .hh-card .hh-badge{display:inline-block;font-size:11px;font-weight:800;color:#00B893;background:rgba(0,184,147,0.12);padding:4px 10px;border-radius:20px;letter-spacing:0.5px;margin-bottom:10px}
  .hh-card h4{font-size:16px;font-weight:900;margin:0 0 6px;color:#191919;letter-spacing:-0.3px}
  .hh-card .hh-sub{font-size:12.5px;color:#6B7280;margin-bottom:14px;line-height:1.6}
  .hh-card .hh-summary{background:rgba(255,255,255,0.7);border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.75;color:#1F2937;margin-bottom:10px;font-weight:500}
  .hh-card .hh-bullets{list-style:none;padding:0;margin:10px 0 0}
  .hh-card .hh-bullets li{font-size:13px;padding:3px 0 3px 18px;position:relative;color:#374151;line-height:1.6}
  .hh-card .hh-bullets li::before{content:'•';color:#00B893;position:absolute;left:6px;font-weight:900}
  .hh-card .hh-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .hh-card button{font-family:inherit;font-size:12.5px;font-weight:700;padding:7px 14px;border-radius:8px;cursor:pointer;border:1.5px solid transparent;transition:all 0.15s}
  .hh-card .hh-toggle{background:#fff;color:#00B893;border-color:#00B893}
  .hh-card .hh-toggle:hover{background:#F0FDF4}
  .hh-card .hh-remove{background:transparent;color:#9CA3AF;border-color:#E5E7EB}
  .hh-card .hh-remove:hover{color:#DC2626;border-color:#DC2626}
  .hh-transcript{margin-top:14px;padding:12px 14px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;max-height:300px;overflow-y:auto;display:none}
  .hh-transcript.open{display:block}
  .hh-transcript .hh-line{font-size:12.5px;line-height:1.6;margin-bottom:8px;color:#374151}
  .hh-transcript .hh-line .who{font-weight:700;margin-right:6px}
  .hh-transcript .hh-line .who.user{color:#4C6EF5}
  .hh-transcript .hh-line .who.bot{color:#00B893}
  `;

  function injectStyle(){
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildCard(data){
    const host = document.createElement('div');
    host.className = 'hh-card';
    host.innerHTML = `
      <div class="hh-badge">💬 챗봇 대화 연결됨</div>
      <h4>${esc(data.title || '상담봇 대화 문의')}</h4>
      <div class="hh-sub">챗봇과 나눈 대화를 바탕으로 아래 내용을 <em>자동으로 준비</em>했어요. 확인하고 필요하면 수정한 뒤 제출해 주세요.</div>
      <div class="hh-summary">${esc(data.summary || '').replace(/\n/g,'<br>')}</div>
      ${data.bullets && data.bullets.length ? `<ul class="hh-bullets">${data.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      <div class="hh-actions">
        <button type="button" class="hh-toggle">📄 전체 대화 기록 보기</button>
        <button type="button" class="hh-remove">✕ 연결 해제</button>
      </div>
      <div class="hh-transcript"></div>
    `;
    // 대화 렌더
    const tr = host.querySelector('.hh-transcript');
    (data.transcript||[]).forEach(m => {
      const line = document.createElement('div');
      line.className = 'hh-line';
      line.innerHTML = `<span class="who ${m.role==='user'?'user':'bot'}">${m.role==='user'?'나':'봇'}:</span>${esc(m.text)}`;
      tr.appendChild(line);
    });
    host.querySelector('.hh-toggle').addEventListener('click', () => {
      tr.classList.toggle('open');
      host.querySelector('.hh-toggle').textContent = tr.classList.contains('open') ? '📄 대화 기록 닫기' : '📄 전체 대화 기록 보기';
    });
    host.querySelector('.hh-remove').addEventListener('click', () => {
      if (!confirm('챗봇 대화 연결을 해제할까요? 폼에 자동 입력된 내용은 그대로 남습니다.')) return;
      clearHandoff();
      host.remove();
    });
    return host;
  }

  function findInsertionPoint(){
    // 우선순위: form 이전 → container 내부 → body 최상단
    const form = document.querySelector('form');
    if (form && form.parentNode){
      return {node: form, where: 'before'};
    }
    const container = document.querySelector('.form-container, .page-wrap, main, .container');
    if (container){
      return {node: container.firstElementChild || container, where: 'inside-top'};
    }
    return {node: document.body, where: 'inside-top'};
  }

  function prefillTextarea(data){
    // 질문·내용 textarea 자동 채움. 단, 사용자가 이미 입력한 내용은 덮어쓰지 않음.
    const selectors = [
      '#question', '#content', '#inquiry',
      'textarea[name=question]', 'textarea[name=content]', 'textarea[name=inquiry]', 'textarea[name=note]',
      'textarea'
    ];
    let target = null;
    for (const sel of selectors){
      const el = document.querySelector(sel);
      if (el){ target = el; break; }
    }
    if (!target) return false;
    if (target.value && target.value.trim().length > 10) return false; // 이미 뭔가 있으면 건드리지 않음
    let text = data.summary || '';
    if (data.bullets && data.bullets.length){
      text += '\n\n[핵심 포인트]\n' + data.bullets.map(b => '• ' + b).join('\n');
    }
    text += '\n\n— 이 문의는 HRer 상담봇 대화를 통해 정리되었어요. 전체 대화 기록은 위 박스의 "전체 대화 기록 보기"에서 확인하실 수 있어요.';
    target.value = text;
    // 글자 수 카운터 자동 갱신 트리거
    target.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  }

  function prefillTier(data){
    if (data.recommended !== 'consult' || !data.tier) return;
    // order.html(노무자문 폼)에서 티어 라디오 선택
    const map = {simple:'simple', deep:'deep', written:'written', 'Simple':'simple', 'Deep':'deep', 'Written':'written'};
    const tierSel = map[data.tier];
    if (!tierSel) return;
    const radios = document.querySelectorAll('input[type=radio][name=tier], input[type=radio][name=plan], input[type=radio][name=service]');
    radios.forEach(r => {
      const v = (r.value||'').toLowerCase();
      if (v === tierSel || v.includes(tierSel)){
        r.checked = true;
        r.dispatchEvent(new Event('change', {bubbles:true}));
        // option-card 부모 있으면 .selected 클래스 처리
        const card = r.closest('.option-card, .tier-card, .plan-card');
        if (card){
          document.querySelectorAll('.option-card.selected, .tier-card.selected, .plan-card.selected').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        }
      }
    });
  }

  function attachTranscriptToSubmit(data){
    // 폼 제출 시 대화 이력을 hidden input으로 포함 (백엔드가 이메일 발송할 때 사용)
    const form = document.querySelector('form');
    if (!form) return;
    if (form.querySelector('input[name=chatbot_transcript]')) return;
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'chatbot_transcript';
    hidden.value = JSON.stringify({
      title: data.title,
      summary: data.summary,
      bullets: data.bullets,
      recommended: data.recommended,
      tier: data.tier,
      transcript: data.transcript,
      handoff_at: data.at,
    });
    form.appendChild(hidden);

    // mailto 폼(현재 백엔드 없음)에도 대응: 제출 시 본문에 삽입
    form.addEventListener('submit', function(){
      const textarea = form.querySelector('textarea[name=question], textarea[name=content], textarea[name=note], textarea');
      if (!textarea) return;
      // 이미 삽입된 대화 마커 있으면 중복 금지
      if (/\[상담봇 대화 기록 시작\]/.test(textarea.value)) return;
      const lines = (data.transcript||[]).map(m => `${m.role==='user'?'나':'봇'}: ${(m.text||'').replace(/\s+/g,' ').trim()}`).join('\n');
      if (!lines) return;
      textarea.value += '\n\n---\n[상담봇 대화 기록 시작]\n' + lines + '\n[끝]';
    }, {capture:true});
  }

  function init(){
    const data = loadHandoff();
    const params = new URLSearchParams(location.search);
    const fromChatbot = params.get('from') === 'chatbot';
    // URL에 from=chatbot만 있고 데이터 없으면 조용히 종료
    if (!data) return;
    // from 파라미터 없이 핸드오프 데이터가 있어도 30분 내면 일단 사용 (같은 탭에서 진행 중일 수 있음)

    injectStyle();

    // 카드 삽입
    const ip = findInsertionPoint();
    const card = buildCard(data);
    if (ip.where === 'before'){
      ip.node.parentNode.insertBefore(card, ip.node);
    } else {
      ip.node.parentNode.insertBefore(card, ip.node);
    }

    // 폼 prefill
    setTimeout(() => {
      prefillTextarea(data);
      prefillTier(data);
      attachTranscriptToSubmit(data);
    }, 100);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
