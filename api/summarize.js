/*!
 * HRer Chat Summarize API — Gemini 기반 대화 요약 + 서비스 추천
 * Edge Runtime, Tokyo(hnd1), 모델 폴백 3단계 (chat.js와 동일 전략)
 *
 * 주 타겟: 회사·HR 담당자·경영자 (근로자 개인 아님)
 *
 * 입력: {history: [{role, text}, ...]}
 * 출력: {summary, bullets, recommended, tier, title}
 */
export const config = {runtime: 'edge', regions: ['hnd1']};

const MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.0-flash'];

const SUMMARY_PROMPT = `당신은 HRer 서비스 의뢰폼에 자동으로 채워 넣을 정보를 생성하는 도우미입니다.

HRer의 주 타겟은 회사·사용자 입장의 고객입니다: <b>대표·HR 담당자·인사팀·경영자</b>. 근로자 개인도 의뢰할 수 있으나 기본값은 회사 입장입니다.

고객이 챗봇과 나눈 대화 기록이 주어지면, 다음 JSON 형식으로만 응답하세요. 다른 말 금지.

{
  "summary": "의뢰 목적을 3~5문장. 고객이 직접 쓴 것처럼 1인칭 예사말로. 회사 입장 기본.",
  "bullets": ["핵심 사실 1", "핵심 사실 2", "핵심 사실 3"],
  "recommended": "consult" | "unfair-dismissal" | "investigation" | "hr-evaluation" | "employment-rules",
  "tier": "simple" | "deep" | "written" | null,
  "title": "20자 내외 제목"
}

# 추천 기준
- consult(노무자문): 법·규정 해석 질문, 절차 문의, 단발 이슈
- unfair-dismissal: 해고·징계·인사명령 후 구제신청 대응
- investigation: 직장 내 괴롭힘·성희롱 신고 접수 후 사내·외부 조사
- hr-evaluation: 평가 제도·보상 설계 필요
- employment-rules: 취업규칙 제정·개정

# tier 기준 (consult일 때만)
- simple: 단일 쟁점, 빠른 확인 (수당 계산 가능 여부 등)
- deep: 복수 쟁점, 판단 필요 (징계 수위, 리스크 평가 등)
- written: 공식 의견서, 대외 제출 (근로감독·소송 자료 등)

# summary 작성 규칙
- 회사·HR 담당자 입장: 사업장 규모, 당사자 관계, 회사의 기존 대응, 회사가 고민하는 지점, 원하는 결과
- 근로자 개인 의뢰: 그 경우에만 피해 상황·요청 사항 중심
- 노무사가 읽자마자 맥락을 파악할 수 있게 구체적으로
- 날짜·빈도·증거·사내 대응 여부 등 사실 위주
- 예(회사 입장): "30인 규모 사업장에서 팀장 1명에 대한 직장 내 괴롭힘 신고가 최근 접수되어, 사내 조사의 공정성과 이후 징계 절차 리스크를 검토하고자 자문을 요청합니다. 가해자로 지목된 팀장과 신고인 모두 현재 정상 출근 중이며, 증거 자료(카톡·업무 기록) 일부를 확보한 상태입니다."
- 예(근로자 입장): "지난 3개월간 직속 상사로부터 반복적인 공개 질책과 업무 외 시간 연락이 있었고, 녹취·카톡 일부를 보관 중입니다. 직장 내 괴롭힘 해당 여부와 구제 절차를 확인하고 싶습니다."

# bullets 작성 규칙
- 3~5개. 날짜·빈도·관계·증거·사내 대응 등 구체적으로
- 예(회사): ["30인 규모 서비스업", "팀장→팀원 반복 질책 신고", "신고 접수 2주 경과", "사내 조사 미착수", "재발 방지+공정성 확보 필요"]
- 예(근로자): ["지속 기간 3개월, 주 2~3회", "직속 상사 당사자", "카톡 기록 보관 중", "회사 대응 절차 미진행", "구제신청 기한 확인 필요"]

# 법률 판단 절대 금지
- "괴롭힘에 해당합니다", "부당해고입니다" 같은 결론적 판단 금지
- 고객이 말하지 않은 정보를 지어내지 말 것
- 불확실하면 recommended: "consult", tier: "simple"

# 출력 예시 (회사 입장)
{
  "summary": "50인 규모 제조업 사업장에서 수습기간 3개월 중인 직원에 대해 업무 부적합을 사유로 해고를 검토 중입니다. 수습 해고 시에도 해고예고·서면통지가 필요한지, 부당해고 구제신청 리스크가 어느 정도인지 확인하고자 합니다.",
  "bullets": ["50인 규모 제조업", "수습 3개월 중 해고 검토", "해고 사유: 업무 부적합", "서면 평가 기록 일부 확보", "리스크·절차 확인 필요"],
  "recommended": "consult",
  "tier": "deep",
  "title": "수습 해고 절차·리스크 자문"
}
`;

async function callGemini(apiKey, model, prompt){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: {parts:[{text: SUMMARY_PROMPT}]},
    contents: [{role:'user', parts:[{text: prompt}]}],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 700,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      {category:'HARM_CATEGORY_HARASSMENT', threshold:'BLOCK_ONLY_HIGH'},
      {category:'HARM_CATEGORY_HATE_SPEECH', threshold:'BLOCK_ONLY_HIGH'},
      {category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_ONLY_HIGH'},
      {category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_ONLY_HIGH'},
    ],
  };
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 15000);
  try {
    const r = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok){
      const txt = await r.text();
      throw new Error(`Gemini ${r.status}: ${txt.slice(0,200)}`);
    }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  } catch(e){
    clearTimeout(timer);
    throw e;
  }
}

function fallback(history){
  const userMsgs = history.filter(m => m.role === 'user').map(m => (m.text||'').replace(/<[^>]+>/g,'')).filter(Boolean);
  const last = userMsgs[userMsgs.length-1] || '';
  return {
    summary: last.length > 10 ? `다음 사안에 대해 자문 요청드립니다: ${last.slice(0, 300)}` : 'HRer 챗봇을 통해 문의드립니다. 자세한 내용은 아래 대화 기록을 참고해 주세요.',
    bullets: userMsgs.slice(-3).map(x => x.slice(0,80)),
    recommended: 'consult',
    tier: 'simple',
    title: '챗봇 대화 문의',
  };
}

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
  try { body = await req.json(); } catch(e){ body = {}; }
  const {history = []} = body;
  if (!Array.isArray(history) || history.length === 0){
    return new Response(JSON.stringify({error:'empty_history'}), {status:400, headers});
  }

  const apiKey = globalThis.process?.env?.GEMINI_API_KEY;
  if (!apiKey){
    return new Response(JSON.stringify({...fallback(history), mode:'no_api_key'}), {status:200, headers});
  }

  // 대화 포맷
  const transcript = history.slice(-20).map(m => {
    const clean = (m.text||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    return `${m.role === 'user' ? '고객' : '봇'}: ${clean}`;
  }).join('\n');
  const prompt = `다음은 고객이 HRer 챗봇과 나눈 대화입니다. 이를 바탕으로 JSON을 생성하세요.\n\n---\n${transcript}\n---`;

  // 모델 폴백 루프
  let raw = null;
  let lastErr = null;
  for (const mdl of MODELS){
    try {
      raw = await callGemini(apiKey, mdl, prompt);
      if (raw) { lastErr = null; break; }
    } catch(e){
      lastErr = e;
      if (!/503|UNAVAILABLE|429|overload|abort/i.test(String(e.message||''))) break;
    }
  }
  if (!raw){
    return new Response(JSON.stringify({...fallback(history), mode:'gemini_error', err: String(lastErr?.message||lastErr||'').slice(0,200)}), {status:200, headers});
  }

  // JSON 파싱
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch(e){
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch(e2){}
    }
  }
  if (!parsed || !parsed.summary){
    return new Response(JSON.stringify({...fallback(history), mode:'parse_error', raw: raw.slice(0,200)}), {status:200, headers});
  }

  // 검증·정제
  const validRec = ['consult','unfair-dismissal','investigation','hr-evaluation','employment-rules'];
  if (!validRec.includes(parsed.recommended)) parsed.recommended = 'consult';
  const validTier = ['simple','deep','written'];
  if (parsed.recommended !== 'consult') parsed.tier = null;
  else if (!validTier.includes(parsed.tier)) parsed.tier = 'simple';

  return new Response(JSON.stringify({
    summary: String(parsed.summary||'').slice(0, 1000),
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0,5).map(x => String(x).slice(0,120)) : [],
    recommended: parsed.recommended,
    tier: parsed.tier,
    title: String(parsed.title||'챗봇 대화 문의').slice(0, 40),
    mode: 'ai',
  }), {status:200, headers});
}
