/*!
 * HRer 통합 CTA 컴포넌트 — 블로그·서비스 페이지 하단에 챗봇·자문 연결 유도
 *
 * 페이지에 meta 태그 추가하면 해당 taxonomy_id 기반 맞춤 CTA가 자동 삽입됨:
 *   <meta name="hrer:taxonomy" content="해고">
 *   <meta name="hrer:sub" content="해고.수습해고"> (옵션)
 *
 * 또는 data attribute:
 *   <div data-hrer-cta data-taxonomy="해고"></div>
 *
 * 또는 window.HRER_CTA = {taxonomy:'해고'} 세팅 후 로드
 */
(function(){
  'use strict';

  // 대분류별 카피
  const COPY = {
    '해고': {
      title: '해고 결정, 신중해야 합니다',
      lead: '수습해고·징계해고·경영상 해고 모두 절차와 기록이 분쟁의 9할을 결정합니다. 지금 상황을 한 번 정리해 드릴까요?',
      service: 'consult',
    },
    '징계': {
      title: '징계 수위·절차 판단이 필요한가요?',
      lead: '같은 사실관계여도 징계양정 적정성은 기록·절차·전례에 따라 갈립니다. 부당징계 리스크부터 짚어보세요.',
      service: 'consult',
    },
    '사건': {
      title: '부당해고·부당징계 구제신청 대응',
      lead: '구제신청 기한은 3개월, 답변서·준비서면·심문회의 각 단계마다 전략이 다릅니다. 단계별 대응을 논의해 드릴게요.',
      service: 'unfair-dismissal',
    },
    '괴롭힘': {
      title: '직장 내 괴롭힘, 조사의 공정성이 관건',
      lead: '신고 접수부터 보호조치·조사·징계까지, 공정성이 무너지면 회사가 2차 분쟁에 휘말립니다. 외부 조사가 필요한 상황인지 확인해 드려요.',
      service: 'investigation',
    },
    '성희롱': {
      title: '성희롱 신고, 법정 의무부터 체크',
      lead: '성희롱은 괴롭힘과 법적 근거가 다르고 노동부 보고 의무가 따로 있습니다. 초기 대응부터 정확히 잡으셔야 해요.',
      service: 'investigation',
    },
    '취업규칙': {
      title: '취업규칙 정비, 신규·개정 모두 가능',
      lead: '상시 10명 이상 신고 의무, 불이익 변경 시 과반수 동의. 규정 한 줄이 수개월 분쟁으로 번집니다. 체계적으로 정비해 드려요.',
      service: 'employment-rules',
    },
    '인사평가': {
      title: '평가 제도, 표준점수로 공정하게',
      lead: '평가자 성향 편차·성과 예측도까지 반영한 설계. 3명부터도 도입 가능합니다.',
      service: 'hr-evaluation',
    },
    '임금수당': {
      title: '임금 산정, 한 번 틀리면 체불',
      lead: '통상임금·평균임금·주휴수당·연장수당·포괄임금제. 수당 계산이 복잡하면 체불 리스크가 동반됩니다. 정확히 짚어드려요.',
      service: 'consult',
    },
    '근로시간': {
      title: '주52시간·유연근무·재택, 제대로 설계하기',
      lead: '업종·규모에 따라 쓸 수 있는 제도가 다릅니다. 과태료·형사처벌 리스크 없이 설계하시려면 점검이 필요해요.',
      service: 'consult',
    },
    '연차휴가': {
      title: '연차 발생·사용촉진·미사용수당',
      lead: '연차 1일 처리가 달라도 1년 누적이면 금액이 큽니다. 사용촉진 절차도 정확히 지켜야 효력이 발생해요.',
      service: 'consult',
    },
    '퇴직': {
      title: '퇴직금 산정·지급, 실수하면 지연이자',
      lead: '평균임금·계속근로·상여 포함 여부까지. 퇴직금 한 건 잘못 계산하면 지연이자·형사리스크가 뒤따릅니다.',
      service: 'consult',
    },
    '근로계약': {
      title: '근로계약서, 단 한 줄 문구가 분쟁을 좌우',
      lead: '기간제·단시간·파견·위임 구분부터 정확히. 근로계약서 점검으로 분쟁 예방이 가능합니다.',
      service: 'consult',
    },
    '노사관계': {
      title: '노조·노사협의회·단체교섭 대응',
      lead: '30인 이상은 노사협의회 의무. 노조 설립·단체교섭 요청에도 절차·문서가 중요합니다.',
      service: 'consult',
    },
    '산업안전': {
      title: '중대재해·산업안전, 사전 체계가 핵심',
      lead: '중대재해처벌법 이후 안전보건관리체계 구축이 의무. 사고 전 점검이 사후 대응보다 10배 저렴합니다.',
      service: 'consult',
    },
    '모성보호': {
      title: '출산·육아·가족돌봄 휴가 운영',
      lead: '출산전후휴가·육아휴직·배우자 출산휴가·가족돌봄. 회사 부담과 법정 의무의 경계를 정확히 안내해 드려요.',
      service: 'consult',
    },
    '외국인': {
      title: '외국인 근로자 고용, 체류자격부터 4대보험까지',
      lead: 'E-9·E-7·H-2 등 자격별 조건이 다릅니다. 잘못된 고용은 과태료 외에 체류에도 영향이 갑니다.',
      service: 'consult',
    },
    '비밀유지': {
      title: '경업금지·비밀유지 약정, 효력이 문제',
      lead: '과도한 제한은 무효가 됩니다. 업무 범위·기간·대가를 정확히 설계해야 효력이 인정됩니다.',
      service: 'consult',
    },
    '개인정보': {
      title: 'HR 개인정보, 최소수집·고지가 원칙',
      lead: '직원 CCTV·모니터링도 고지와 동의 절차가 필요합니다. 채용·퇴사 단계별 처리 기준을 확인하세요.',
      service: 'consult',
    },
    '채용': {
      title: '채용절차법, 공고·선발·통지 전 과정',
      lead: '채용절차법 위반은 과태료 500만원. 공고 문구부터 불합격 통지까지 체계적으로 점검해 드려요.',
      service: 'consult',
    },
    '인사이동': {
      title: '전보·배치전환·파견, 정당성 판단',
      lead: '근로조건 불이익 변경이 되면 부당전보로 다툴 수 있습니다. 사전 검토가 필수예요.',
      service: 'consult',
    },
    '감독': {
      title: '근로감독·진정·시정지시 대응',
      lead: '수시감독·정기감독 모두 대응 방향이 다릅니다. 시정지시 기한 내 대응이 핵심입니다.',
      service: 'consult',
    },
    '기타': {
      title: '인사노무 이슈, 혼자 고민하지 마세요',
      lead: '회사에서 마주하는 인사노무 이슈를 차근차근 정리해 드립니다.',
      service: 'consult',
    },
  };

  // 서비스별 의뢰 링크
  const SERVICE_URL = {
    'consult': '/order',
    'unfair-dismissal': '/order_unfair-dismissal',
    'investigation': '/order_investigation',
    'hr-evaluation': '/order_hr_evaluation',
    'employment-rules': '/order_employment_rules',
  };

  function getTaxonomy(){
    // 1. window.HRER_CTA
    if (window.HRER_CTA && window.HRER_CTA.taxonomy) return window.HRER_CTA;
    // 2. meta 태그
    const m = document.querySelector('meta[name="hrer:taxonomy"]');
    if (m) return {taxonomy: m.content, sub: document.querySelector('meta[name="hrer:sub"]')?.content || null};
    // 3. data attribute
    const el = document.querySelector('[data-hrer-cta]');
    if (el) return {taxonomy: el.dataset.taxonomy || '기타', sub: el.dataset.sub || null, mountEl: el};
    return null;
  }

  const CSS = `
  .hrer-cta{max-width:760px;margin:48px auto;padding:0;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif}
  .hrer-cta-card{background:linear-gradient(135deg,#0F2744 0%,#1A3A5C 100%);border-radius:16px;padding:36px 36px 32px;color:#fff;position:relative;overflow:hidden}
  .hrer-cta-card::before{content:'';position:absolute;top:-40px;right:-40px;width:180px;height:180px;background:radial-gradient(circle,rgba(0,184,147,0.35) 0%,transparent 70%);pointer-events:none}
  .hrer-cta-tag{display:inline-block;font-size:11px;font-weight:800;color:#00B893;background:rgba(0,184,147,0.15);padding:5px 11px;border-radius:12px;letter-spacing:0.5px;margin-bottom:14px}
  .hrer-cta-title{font-size:22px;font-weight:900;line-height:1.4;margin:0 0 12px;letter-spacing:-0.5px}
  .hrer-cta-lead{font-size:14.5px;line-height:1.8;color:rgba(255,255,255,0.88);margin:0 0 22px;font-weight:500}
  .hrer-cta-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .hrer-cta-btn{font-family:inherit;font-size:14px;font-weight:700;padding:13px 20px;border-radius:10px;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:8px;text-decoration:none;transition:transform 0.12s ease,box-shadow 0.12s ease}
  .hrer-cta-btn:hover{transform:translateY(-1px)}
  .hrer-cta-btn-primary{background:#00B893;color:#fff;box-shadow:0 3px 12px rgba(0,184,147,0.4)}
  .hrer-cta-btn-primary:hover{background:#00A984;box-shadow:0 5px 16px rgba(0,184,147,0.5)}
  .hrer-cta-btn-ghost{background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.25)}
  .hrer-cta-btn-ghost:hover{background:rgba(255,255,255,0.18)}
  .hrer-cta-meta{font-size:12px;color:rgba(255,255,255,0.55);line-height:1.6;margin:0}
  .hrer-cta-meta strong{color:rgba(255,255,255,0.85)}
  @media(max-width:600px){
    .hrer-cta{margin:32px 16px}
    .hrer-cta-card{padding:28px 22px}
    .hrer-cta-title{font-size:19px}
    .hrer-cta-btn{padding:12px 16px;font-size:13px}
  }
  `;

  function openChatbot(){
    // chatbot.js의 openBot 전역에 노출돼 있지 않을 수 있으니 플로팅 버튼 클릭
    const btn = document.querySelector('#hrbot-fab, .hrbot-fab, [data-hrbot-open]');
    if (btn){ btn.click(); return; }
    // fallback: 커스텀 이벤트
    document.dispatchEvent(new CustomEvent('hrbot:open'));
  }

  function render(){
    const ctx = getTaxonomy();
    if (!ctx) return;
    const copy = COPY[ctx.taxonomy] || COPY['기타'];
    const serviceHref = SERVICE_URL[copy.service] || '/order';

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const host = document.createElement('div');
    host.className = 'hrer-cta';
    host.innerHTML = `
      <div class="hrer-cta-card">
        <div class="hrer-cta-tag">💬 HRer 노무 자문</div>
        <h3 class="hrer-cta-title">${escapeHTML(copy.title)}</h3>
        <p class="hrer-cta-lead">${escapeHTML(copy.lead)}</p>
        <div class="hrer-cta-actions">
          <button type="button" class="hrer-cta-btn hrer-cta-btn-primary" id="hrer-cta-chat">💬 챗봇에서 상황 정리하기</button>
          <a class="hrer-cta-btn hrer-cta-btn-ghost" href="${serviceHref}?from=cta&taxonomy=${encodeURIComponent(ctx.taxonomy)}">📨 바로 의뢰 접수</a>
        </div>
        <p class="hrer-cta-meta">공인노무사 <strong>윤지민</strong> 직접 검토 · 영업일 <strong>24시간</strong> 이내 답변 · 건별 결제 (월 자문료 계약 없음)</p>
      </div>
    `;

    if (ctx.mountEl){
      ctx.mountEl.replaceWith(host);
    } else {
      // 본문 하단에 붙이기 (article·main·body 순)
      const target = document.querySelector('article, main, .post-content, .content') || document.body;
      target.appendChild(host);
    }

    host.querySelector('#hrer-cta-chat').addEventListener('click', openChatbot);
  }

  function escapeHTML(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
