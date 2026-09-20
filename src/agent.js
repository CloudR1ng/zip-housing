import { regions } from './data.js';
export const toolDeclarations = [{
 name:'search_candidates',description:'사용자 조건을 갱신하고 시연 생활권을 필터링, 점수 계산하여 지도와 추천 목록을 갱신한다. 예산은 월세+관리비 합계(만원), 이동시간은 지역의 고정된 시연 목적지 기준이다.',
 parameters:{type:'OBJECT',properties:{region:{type:'STRING',enum:regions.map(r=>r.name)},budget:{type:'NUMBER',description:'월세+관리비 상한 만원'},deposit:{type:'NUMBER',description:'보증금 상한 만원'},commute:{type:'NUMBER',description:'고정 시연 목적지 이동시간 상한 분'},minSize:{type:'NUMBER',description:'최소 면적 제곱미터'},priority:{type:'STRING',enum:['balanced','cost','transit','life']}}}
},{name:'compare_candidates',description:'후보 ID 최대 3개를 비교표에 추가하고 계산 결과를 반환한다.',parameters:{type:'OBJECT',properties:{ids:{type:'ARRAY',items:{type:'STRING'}}},required:['ids']}},
 {name:'explain_score',description:'후보의 HII 점수, 가중치와 합성 데이터 근거를 반환한다.',parameters:{type:'OBJECT',properties:{id:{type:'STRING'}},required:['id']}}];

export function apiError(status){return ({400:'요청을 처리할 수 없습니다. 키와 모델 설정을 확인해 주세요.',401:'키 인증에 실패했습니다. 새 Gemini API 키를 입력해 주세요.',403:'이 키로 API를 이용할 수 없습니다. 키 권한과 프로젝트 설정을 확인해 주세요.',404:'선택한 모델을 사용할 수 없습니다. AI 연결 설정에서 모델 목록을 새로 불러오세요.',429:'무료 사용량 또는 요청 속도 한도에 도달했습니다. 잠시 후 다시 시도하거나 데모를 이용해 주세요.'})[status]||`AI 연결에 실패했습니다 (${status}). 잠시 후 다시 시도해 주세요.`;}
export async function availableModels(key,signal){
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':key},signal});
 if(!r.ok)throw Error(apiError(r.status));
 const data=await r.json();
 return (data.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&m.name.includes('gemini')&&!/image|tts|robot|embedding/.test(m.name)).map(m=>({id:m.name.replace('models/',''),label:m.displayName||m.name}));
}
export async function runAgent({key,model,text,history,conditions,execute,onStep,signal}) {
 const contents=[...history,{role:'user',parts:[{text}]}];
 const system=`너는 .ZIP 주거 탐색 에이전트다. 한국어로 간결하게 응답한다. 이 서비스는 전국 17개 시도의 합성 시연 데이터 68건을 사용하는 MVP다. 실제 매물, 거래가, 경로, 공인 지수가 아니다. 현재 조건=${JSON.stringify(conditions)}. 지역별 시연 목적지=${JSON.stringify(regions.map(r=>[r.name,r.destination]))}. 사용자 요청을 실행할 때 검색/비교/점수 도구를 반드시 사용하라. 조건 변경 요청은 search_candidates로 실제 반영한다. 만원 단위를 사용한다. 모호한 월세 예산은 관리비 포함 월 지출인지 확인한다. 목적지 변경과 실제 길찾기는 지원하지 않으며 고정된 지역 시연 목적지를 안내한다. HII는 낮을수록, 적합도=100-HII는 높을수록 유리하다. 도구 반환값 이외의 수치를 만들지 말고 근거 ID를 표시한다. 정책 자격, 계약 안전성, 실제 입주 가능 여부는 판단하지 않는다. 비교 요청은 검색 결과 ID로 compare_candidates를 호출한다. 검색 결과가 없으면 그 사실을 알리고 조건 완화는 사용자의 의사를 먼저 확인한다. 지원하지 않는 행동을 완료했다고 말하지 않는다. 사용자 개인정보를 요청하지 않는다. 조건은 외부 AI에 전달되므로 개인정보 보호를 절대적으로 보장한다고 주장하지 않는다.`;
 for(let step=0;step<6;step++){
  onStep(step===0?'조건 이해 및 실행 계획':'도구 결과 확인');
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,tools:[{functionDeclarations:toolDeclarations}],generationConfig:{temperature:.2,maxOutputTokens:2048}}),signal});
  if(!response.ok)throw Error(apiError(response.status));
  const data=await response.json();
  const content=data.candidates?.[0]?.content;
  if(!content?.parts?.length)throw Error('AI 응답이 비어 있습니다. 질문을 바꿔 다시 시도해 주세요.');
  contents.push({...content,role:'model'});
  const calls=content.parts.filter(p=>p.functionCall);
  if(!calls.length){
   const answer=content.parts.filter(p=>!p.thought&&p.text).map(p=>p.text).join('\n');
   if(!answer.trim())throw Error('AI가 답변을 완료하지 못했습니다. 다시 시도해 주세요.');
   // Keep whole user/model turns so tool pairs and thought signatures remain intact.
   return {text:answer,history:contents};
  }
  const results=[];
  for(const {functionCall:call} of calls){
   if(signal.aborted)throw new DOMException('Aborted','AbortError');
   onStep(({search_candidates:'생활권 검색 · 점수 재계산',compare_candidates:'후보 비교표 갱신',explain_score:'점수와 데이터 근거 확인'})[call.name]||'도구 확인');
   let result;
   try{result=execute(call.name,call.args||{});}catch{result={error:'도구 입력을 확인해 주세요.'};}
   results.push({functionResponse:{name:call.name,...(call.id?{id:call.id}:{}),response:{result}}});
  }
  contents.push({role:'user',parts:results});
 }
 throw Error('한 번의 요청에서 실행 가능한 단계를 초과했습니다. 요청을 나누어 주세요. 실행된 도구 결과는 화면에 남아 있습니다.');
}
