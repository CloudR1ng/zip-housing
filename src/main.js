import "./style.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  createIcons,
  PlugZap,
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  MapPin,
  Wallet,
  TrainFront,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  Info,
  LocateFixed,
  Route,
  ChartNoAxesCombined,
  Sparkles,
  Columns3,
  X,
  Settings2,
  ArrowUp,
  Bookmark,
  SearchX,
  Download,
} from "lucide";
import {
  regions,
  homes,
  defaults,
  normalizeConditions,
  search,
  score,
  comparison,
} from "./data.js";
import { runAgent, availableModels } from "./agent.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
const icons = {
  PlugZap,
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  MapPin,
  Wallet,
  TrainFront,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  Info,
  LocateFixed,
  Route,
  ChartNoAxesCombined,
  Sparkles,
  Columns3,
  X,
  Settings2,
  ArrowUp,
  Bookmark,
  SearchX,
  Download,
};

const $ = (s) => document.querySelector(s);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") =>
  `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const money = (n) => Number(n).toLocaleString("ko-KR");
const priorityNames = {
  balanced: "균형 있게",
  cost: "주거비 우선",
  transit: "이동시간 우선",
  life: "생활환경 우선",
};
let conditions = { ...defaults },
  selected = new Set(),
  focused = null,
  results = [],
  apiKey = "",
  model = "gemini-3.1-flash-lite",
  history = [],
  busy = false,
  controller = null;
let map,
  markers = L.layerGroup(),
  view = "explore",
  lastDialogFocus = null;
let saved = [];
try {
  saved = JSON.parse(localStorage.getItem("zip-saved") || "[]");
  if (!Array.isArray(saved)) saved = [];
} catch {}
const bookmarks = new Set(saved.filter((id) => homes.some((h) => h.id === id)));

$("#app").innerHTML = `
 <header class="topbar"><a href="#" class="brand" aria-label="닷집 홈">.ZIP<span>나의 생활에 맞는 집</span></a>
  <nav aria-label="주 메뉴"><button class="nav active" data-view="explore">생활권 탐색</button><button class="nav" data-view="compare">후보 비교 <span id="compare-count">0</span></button><button class="nav" data-view="saved">저장한 생활권</button></nav>
  <button class="key-button" id="connect">${icon("plug-zap")}<span id="connection-label">AI 연결</span></button>
 </header>
 <main>
 <section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-square"></span> A BETTER PLACE TO BEGIN</div><h1>집을 찾기 전에,<br>나의 <em>생활</em>을 먼저.</h1><p>예산부터 매일의 이동까지. 나에게 맞는 동네를 발견하세요.</p><button id="hero-agent" class="hero-link">AI와 함께 찾아보기 ${icon("arrow-up-right")}</button></div><div id="hero-visual" aria-hidden="true"><div class="visual-grid"></div><div class="coordinate-label">YOUR NEXT CHAPTER<br><b>STARTS HERE.</b></div><span class="coord">36.362° N &nbsp; 127.353° E</span></div><div class="hero-stat"><b>17</b><span>전국 시도</span><div></div><b>68</b><span>시연 생활권</span></div></section>
 <div class="subline"><span>${icon("scan-line")} 생활을 읽는 주거 탐색, .ZIP</span><span class="demo-badge">MVP · 합성 데이터 시연</span></div>
 <section id="explore-view">
  <div class="section-heading"><div><span class="section-number">01 / EXPLORE</span><h2>어디에서 시작할까요?</h2></div><button id="method" class="text-button">추천 기준 알아보기 ${icon("arrow-up-right")}</button></div>
  <form id="filters" class="filterbar"><label class="region-field">${icon("map-pin")}<span>살고 싶은 지역<select id="region" aria-label="살고 싶은 지역">${regions.map((r) => `<option ${r.name === conditions.region ? "selected" : ""}>${r.name}</option>`).join("")}</select></span></label><button type="button" id="budget-filter" class="filter-chip">${icon("wallet")}<span id="budget-summary"></span>${icon("chevron-down")}</button><button type="button" id="commute-filter" class="filter-chip">${icon("train-front")}<span id="commute-summary"></span>${icon("chevron-down")}</button><button type="button" id="all-filters" class="filter-chip">${icon("sliders-horizontal")} 상세 조건</button><button class="primary search-button" type="submit">생활권 찾기 ${icon("arrow-right")}</button></form>
  <div class="workspace"><div class="map-wrap"><div class="map-top"><span id="map-title"></span><span class="map-badge">${icon("layers")} 생활권 지도</span></div><div id="map" aria-label="시연 생활권 위치 지도"></div><div class="map-note">${icon("info")} 위치는 생활권 중심 예시이며 실제 매물 위치가 아닙니다.</div><button class="map-reset" id="map-reset" aria-label="지도 전체 보기">${icon("locate-fixed")}</button></div><section class="results-panel" aria-label="추천 생활권"><div class="results-header"><div><span class="section-number">YOUR MATCHES</span><h3>나에게 맞는 생활권 <span id="result-count"></span></h3></div><select id="sort" aria-label="정렬 기준"><option value="fit">적합도순</option><option value="cost">낮은 주거비순</option><option value="time">짧은 이동시간순</option></select></div><div id="results" class="result-list" aria-live="polite"></div><p class="result-footnote">월 지출 = 월세 + 관리비 · 모든 금액은 시연값</p></section></div>
  <div class="bottom-grid"><article class="insight-card"><div class="insight-icon">${icon("route")}</div><div><span>나의 하루를 기준으로</span><h3 id="destination-heading"></h3><p>이동시간은 고정 목적지 기준의 합성값입니다.</p></div></article><article class="insight-card"><div class="insight-icon">${icon("chart-no-axes-combined")}</div><div><span>설명할 수 있는 추천</span><h3>조건은 명확하게, 근거는 투명하게</h3><p>같은 데이터와 조건에서는 같은 점수를 계산합니다.</p></div><button id="score-guide" aria-label="점수 계산 기준">${icon("arrow-up-right")}</button></article><article class="insight-card agent-promo"><div><span>.ZIP AGENT</span><h3>조건이 바뀌어도, 함께.</h3><p>“월 지출을 50만 원으로 낮춰줘”</p></div><button id="open-agent" aria-label="AI 에이전트 열기">${icon("sparkles")}</button></article></div>
 </section>
 <section id="compare-view" class="alternate-view" hidden><div class="section-heading"><div><span class="section-number">02 / COMPARE</span><h2>내 선택을 나란히.</h2></div><button class="text-button" data-view="explore">생활권 더 찾기 ${icon("arrow-right")}</button></div><div id="compare-content"></div></section>
 <section id="saved-view" class="alternate-view" hidden><div class="section-heading"><div><span class="section-number">03 / COLLECTION</span><h2>마음에 남은 생활권.</h2></div><span>이 브라우저에 저장됩니다</span></div><div id="saved-content" class="saved-grid"></div></section>
 <footer><a href="#" class="brand">.ZIP</a><span>나의 다음 일상을 찾는 곳.</span><button id="about">서비스 안내</button><span class="footer-right">© 2026 .ZIP · 방과후 티타임 &nbsp; / &nbsp; GOVTECH MVP</span></footer>
 </main>
 <div id="compare-tray" hidden><span><b id="tray-count">0</b>개 생활권 선택</span><button id="clear-compare" class="text-button">선택 해제</button><button class="primary" data-view="compare">나란히 비교 ${icon("columns-3")}</button></div>
 <button id="agent-fab" aria-label="AI 주거 에이전트 열기">${icon("sparkles")}<span>.ZIP Agent</span></button>
 <aside id="agent-panel" class="agent-panel" hidden aria-label="AI 주거 에이전트"><div class="agent-header"><span class="agent-mark">${icon("sparkles")}</span><div><h2>.ZIP Agent</h2><p id="agent-mode">도구 실행 데모</p></div><button id="close-agent" class="icon-button" aria-label="AI 패널 닫기">${icon("x")}</button></div><div class="agent-notice">시연 데이터로 탐색합니다. AI 연결 시 대화와 조건이 Google로 전송됩니다.</div><div id="messages" class="messages" role="log" aria-live="polite"><div class="message assistant"><span class="message-label">.ZIP AGENT</span><p>어떤 하루를 보내고 싶으세요?<br>예산과 이동시간을 알려주시면 생활권을 찾고, 점수를 계산하고, 후보를 비교해 드려요.</p></div><div class="suggestions"><button data-prompt="월 지출 50만 원 이하로 찾아줘">월 지출 50만 원 이하로</button><button data-prompt="이동시간 20분 이내로 찾아줘">학교까지 20분 이내로</button><button data-prompt="상위 두 후보를 비교해줘">상위 두 후보 비교</button></div></div><div id="agent-progress" hidden role="status"></div><form id="chat-form"><label class="sr-only" for="chat-input">주거 조건 또는 질문</label><textarea id="chat-input" rows="2" maxlength="2000" placeholder="나의 주거 조건을 이야기해 주세요"></textarea><div class="composer-bottom"><button type="button" id="agent-settings" class="text-button">${icon("settings-2")} AI 연결 설정</button><button type="submit" class="send-button" id="send" aria-label="메시지 보내기">${icon("arrow-up")}</button><button type="button" id="stop" hidden class="text-button">중지</button></div></form><div class="agent-bottom">실제 계약 전 가격·매물·지원 자격을 별도로 확인하세요.</div></aside>
 <dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status" hidden></div>`;

function refreshIcons() {
  createIcons({ icons, attrs: { "stroke-width": 1.7 } });
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 3500);
}
function openDialog(html) {
  lastDialogFocus = document.activeElement;
  $("#dialog-content").innerHTML =
    `<button class="dialog-close icon-button" aria-label="닫기">${icon("x")}</button>${html}`;
  $("#dialog").showModal();
  $(".dialog-close").onclick = () => $("#dialog").close();
  refreshIcons();
}
$("#dialog").addEventListener("click", (e) => {
  if (e.target === $("#dialog")) {
    const r = $("#dialog").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("#dialog").close();
  }
});
$("#dialog").addEventListener("close", () => lastDialogFocus?.focus());

function homeCard(h, index = 0) {
  return `<article class="home-card ${focused === h.id ? "focused" : ""}" data-id="${h.id}"><div class="card-top"><span class="rank">${String(index + 1).padStart(2, "0")}</span><span class="neighborhood">${escape(h.area)}</span><button class="save icon-button ${bookmarks.has(h.id) ? "saved" : ""}" data-save="${h.id}" aria-label="${escape(h.area)} ${bookmarks.has(h.id) ? "저장 취소" : "저장"}" aria-pressed="${bookmarks.has(h.id)}">${icon("bookmark")}</button></div><button class="card-detail" data-detail="${h.id}"><h4>${h.title}</h4><div class="rent-line"><strong>${h.total}<small>만 원</small></strong><span>/ 월 지출</span><span class="fit"><b>${h.fit}</b> 적합도</span></div><div class="card-specs"><span>보증금 ${money(h.deposit)}</span><span>${icon("train-front")} ${h.transit}분</span><span>${h.size}㎡</span></div></button><div class="card-bottom"><span>${h.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</span><label class="compare-check"><input type="checkbox" data-compare="${h.id}" ${selected.has(h.id) ? "checked" : ""}> 비교</label></div></article>`;
}
function renderResults() {
  const sort = $("#sort").value;
  let list = [...results];
  if (sort === "cost") list.sort((a, b) => a.total - b.total);
  if (sort === "time") list.sort((a, b) => a.transit - b.transit);
  $("#result-count").textContent = list.length;
  $("#results").innerHTML = list.length
    ? list.map(homeCard).join("")
    : `<div class="empty-state">${icon("search-x")}<h3>조건에 맞는 생활권이 없어요</h3><p>예산·보증금·이동시간 또는 면적 조건을 조정해 보세요.</p><button id="reset-filters" class="primary">기본 조건으로 보기</button></div>`;
  refreshIcons();
  document.dispatchEvent(new CustomEvent("zip:results"));
}
function updateConditions(patch = {}, fly = true) {
  conditions = normalizeConditions(patch, conditions);
  results = search(conditions);
  focused = null;
  $("#region").value = conditions.region;
  $("#budget-summary").textContent = `월 ${conditions.budget}만 원 이하`;
  $("#commute-summary").textContent = `이동 ${conditions.commute}분 이내`;
  const r = regions.find((r) => r.name === conditions.region);
  $("#map-title").textContent =
    `${r.name} · ${priorityNames[conditions.priority]}`;
  $("#destination-heading").textContent = `${r.destination}까지의 이동`;
  renderResults();
  renderMarkers(fly);
  renderCompare();
  renderSaved();
  refreshIcons();
  document.dispatchEvent(
    new CustomEvent("zip:region", { detail: conditions.region }),
  );
}
function renderMarkers(fly = true) {
  markers.clearLayers();
  results.forEach((h) => {
    const m = L.marker([h.lat, h.lng], {
      icon: L.divIcon({
        className: "map-price",
        html: `<span>${h.total}<small>만 원</small></span>`,
        iconSize: [89, 36],
        iconAnchor: [44, 42],
      }),
      title: h.area,
      keyboard: true,
    }).addTo(markers);
    m.bindTooltip(`${h.area} · 적합도 ${h.fit}`, {
      direction: "top",
      offset: [0, -38],
    });
    m.on("click", () => {
      focused = h.id;
      renderResults();
      document
        .querySelector(`[data-id="${h.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
  if (fly) resetMap();
}
function resetMap() {
  const r = regions.find((r) => r.name === conditions.region);
  if (results.length > 1)
    map.fitBounds(L.latLngBounds(results.map((h) => [h.lat, h.lng])), {
      padding: [60, 65],
      maxZoom: 13,
      animate: false,
    });
  else
    map.setView(
      results.length ? [results[0].lat, results[0].lng] : [r.lat, r.lng],
      12,
      { animate: false },
    );
}
map = L.map("map", { zoomControl: false, scrollWheelZoom: false }).setView(
  [36.36, 127.35],
  13,
);
L.control.zoom({ position: "bottomright" }).addTo(map);
markers.addTo(map);
const tiles = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  },
).addTo(map);
let tileErrors = 0;
tiles.on("tileerror", () => {
  if (++tileErrors === 4) {
    $(".map-note").textContent =
      "지도 배경을 불러오지 못했습니다. 오른쪽 목록에서 생활권을 확인할 수 있습니다.";
  }
});

function setView(next) {
  view = next;
  for (const v of ["explore", "compare", "saved"])
    $(`#${v}-view`).hidden = v !== next;
  document
    .querySelectorAll(".nav")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === next));
  if (next === "explore")
    requestAnimationFrame(() => {
      map.invalidateSize();
      resetMap();
    });
  if (next === "compare") renderCompare();
  if (next === "saved") renderSaved();
  refreshIcons();
}
function updateSelection() {
  $("#compare-count").textContent = selected.size;
  $("#tray-count").textContent = selected.size;
  $("#compare-tray").hidden = !selected.size;
  renderResults();
  renderCompare();
  renderSaved();
  refreshIcons();
}
function renderCompare() {
  const rows = comparison([...selected], conditions);
  $("#compare-content").innerHTML = rows.length
    ? `<p class="view-description">최대 3개 생활권을 비교합니다. 현재 가중치: ${priorityNames[conditions.priority]} · 다른 지역의 이동시간은 각 지역의 시연 목적지 기준입니다.</p><div class="comparison-scroll"><table><caption class="sr-only">선택한 생활권 비교표</caption><thead><tr><th scope="col">비교 항목</th>${rows.map((h) => `<th scope="col"><span class="tag">${h.region}</span><h3>${h.area}</h3><button data-remove="${h.id}" class="text-button">비교에서 빼기 ×</button></th>`).join("")}</tr></thead><tbody>${[
        ["월 지출", (h) => `${h.total}만 원`],
        ["월세 / 관리비", (h) => `${h.rent} / ${h.fee}만 원`],
        ["보증금", (h) => `${money(h.deposit)}만 원`],
        ["면적", (h) => `${h.size}㎡`],
        ["시연 목적지", (h) => h.destination],
        ["이동시간", (h) => `${h.transit}분`],
        ["적합도 · 높을수록 유리", (h) => `${h.fit} / 100`],
        ["HII · 낮을수록 유리", (h) => `${h.hii} / 100`],
        ["생활시설 점수", (h) => `${h.soc} / 100`],
        ["데이터", (h) => `${h.source}<br>${h.asOf}`],
      ]
        .map(
          ([label, fn]) =>
            `<tr><th scope="row">${label}</th>${rows.map((h) => `<td>${fn(h)}</td>`).join("")}</tr>`,
        )
        .join(
          "",
        )}</tbody></table></div><button id="export-comparison" class="primary export-button">${icon("download")} 비교 결과 내려받기</button>`
    : `<div class="empty-state large">${icon("columns-3")}<h3>비교할 생활권을 골라 주세요</h3><p>생활권 카드의 ‘비교’를 선택하면 한눈에 살펴볼 수 있습니다.</p><button class="primary" data-view="explore">생활권 탐색하기</button></div>`;
}
function renderSaved() {
  const list = [...bookmarks]
    .map((id) => homes.find((h) => h.id === id))
    .filter(Boolean)
    .map((h) => score(h, conditions));
  $("#saved-content").innerHTML = list.length
    ? list.map(homeCard).join("")
    : `<div class="empty-state large">${icon("bookmark")}<h3>마음에 드는 생활권을 모아 보세요</h3><p>카드의 북마크 버튼을 누르면 이곳에 저장됩니다.</p><button class="primary" data-view="explore">생활권 둘러보기</button></div>`;
}
function conditionDialog() {
  openDialog(
    `<span class="section-number">MY CONDITIONS</span><h2>나의 생활 조건</h2><p class="muted">필수조건에 맞는 생활권을 먼저 찾습니다.</p><form id="condition-form" class="dialog-form"><label>월 지출 상한 <span>월세 + 관리비, 만 원</span><input name="budget" type="number" min="1" max="300" required value="${conditions.budget}"></label><label>보증금 상한 <span>만 원</span><input name="deposit" type="number" min="0" max="30000" required value="${conditions.deposit}"></label><label>최대 이동시간 <span>분 · 고정 시연 목적지 기준</span><input name="commute" type="number" min="1" max="180" required value="${conditions.commute}"></label><label>최소 면적 <span>㎡</span><input name="minSize" type="number" min="0" max="100" required value="${conditions.minSize}"></label><label class="full">더 중요하게 생각하는 것<select name="priority">${Object.entries(
      priorityNames,
    )
      .map(
        ([v, label]) =>
          `<option value="${v}" ${conditions.priority === v ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="dialog-note full">${icon("info")} 실제 길찾기는 연결되지 않았습니다. ${regions.find((r) => r.name === conditions.region).destination} 기준의 시연 이동시간을 사용합니다.</div><button class="primary full" type="submit">조건 적용하고 생활권 찾기 ${icon("arrow-right")}</button></form>`,
  );
  $("#condition-form").onsubmit = (e) => {
    e.preventDefault();
    updateConditions(Object.fromEntries(new FormData(e.target)));
    $("#dialog").close();
    toast(`${results.length}개 생활권으로 갱신했습니다.`);
  };
}
function detail(id) {
  const h = score(
    homes.find((h) => h.id === id),
    conditions,
  );
  openDialog(
    `<span class="section-number">${h.id} · 합성 시연 데이터</span><h2>${h.area}</h2><p>${h.title}</p><div class="detail-summary"><div><span>월 지출</span><strong>${h.total}<small>만 원</small></strong></div><div><span>적합도</span><strong>${h.fit}<small>/100</small></strong></div><div><span>HII</span><strong>${h.hii}<small>/100</small></strong></div></div><p class="muted">월세 ${h.rent} + 관리비 ${h.fee}만 원 · 보증금 ${money(h.deposit)}만 원 · ${h.size}㎡</p><h3>추천 점수의 근거</h3><p class="muted">부담·결핍 지표는 낮을수록 유리합니다.</p><div class="score-bars">${h.components.map((c) => `<div><span>${c.name}<small>반영 ${Math.round(c.weight * 100)}%</small></span><div class="bar-track"><span style="width:${c.value}%"></span></div><b>${c.value}</b></div>`).join("")}</div><div class="source-note"><b>${h.source}</b><p>기준일 ${h.asOf}. 실제 가격·범죄율·건축물 정보를 수집한 자료가 아닙니다. ${h.destination}까지 ${h.transit}분 역시 시연값입니다. HII는 MVP 설명용 산식이며 공인 지수가 아닙니다.</p></div><button class="primary" id="detail-compare">${selected.has(id) ? "비교에서 제외" : "비교에 추가"} ${icon("columns-3")}</button>`,
  );
  $("#detail-compare").onclick = () => {
    if (!selected.has(id) && selected.size >= 3) {
      toast("최대 3개까지 비교할 수 있습니다.");
      return;
    }
    selected.has(id) ? selected.delete(id) : selected.add(id);
    updateSelection();
    $("#dialog").close();
  };
}
function methodDialog() {
  openDialog(
    `<span class="section-number">TRANSPARENT BY DESIGN</span><h2>추천에는 이유가 있어야 하니까.</h2><p>예산·보증금·면적·이동시간을 모두 충족한 생활권을 찾고, 선택한 우선순위에 따라 비교합니다.</p><div class="source-note"><h3>HII 주거불안정지수 · MVP 산식</h3><p>HII = 주거비 부담 × 가중치 + 이동 부담 × 가중치 + 생활시설 결핍 × 가중치 + 건물 노후도 × 가중치 + 안전시설 접근 결핍 × 가중치 + 거주 불확실성 × 가중치</p><p>균형 기준 가중치는 순서대로 30%, 25%, 20%, 10%, 10%, 5%입니다. 주거비 부담은 월 지출/예산, 이동 부담은 이동시간/허용시간, 노후도는 연식/40년을 각각 0~100으로 제한합니다. 생활시설·안전시설 결핍은 100에서 시연 점수를 뺍니다. 거주 불확실성은 합성값입니다.</p><b>적합도 = 100 − HII</b></div><p>모든 후보 수치는 개발팀이 만든 합성 데이터입니다. 추천 점수는 실제 거주 안전이나 투자 가치를 보증하지 않으며, 공인 통계나 검증된 평가모형이 아닙니다.</p><p class="muted">전월세 실거래가·건축물·교통·생활SOC 공공데이터 연결은 후속 개발 범위입니다.</p>`,
  );
}
function aboutDialog() {
  openDialog(
    `<span class="section-number">ABOUT .ZIP</span><h2>나의 다음 일상을 찾는 곳.</h2><p>.ZIP은 청년과 대학생의 생활 조건을 바탕으로 주거 생활권을 탐색하는 GovTech MVP입니다. ‘고브텍 수정수정’ 기획서의 전국 탐색·후보 비교·AI Agent 흐름을 구현했습니다.</p><h3>이 MVP에서 가능한 것</h3><p>17개 시도 탐색, 합성 후보 필터링, 재현 가능한 점수 계산, 최대 3개 후보 비교, 브라우저 북마크, Gemini 도구 실행 상담.</p><h3>데이터와 개인정보</h3><p>실제 매물 조회, 길찾기, 정책 자격 심사, 계약 중개 기능은 포함되어 있지 않습니다. AI 연결 시 입력한 대화와 탐색 조건이 Google Gemini API로 직접 전달됩니다. 민감한 개인정보는 입력하지 마세요. API 키는 현재 페이지 메모리에만 보관되고 새로고침하면 사라집니다. 저장한 생활권 ID만 이 브라우저에 남습니다.</p><p class="muted">방과후 티타임 · 2026 GovTech 창업경진대회 MVP</p>`,
  );
}

function settingsDialog() {
  openDialog(
    `<span class="section-number">CONNECT YOUR AI</span><h2>나만의 주거 에이전트 연결</h2><p>Gemini API 키를 입력하면 AI가 생활권 검색·점수 확인·후보 비교 도구를 실행합니다.</p><form id="key-form"><label class="input-label">Gemini API 키<input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="새 API 키를 입력하세요" ${apiKey ? "" : "required"}></label><label class="input-label">모델<select id="model-select"><option value="${escape(model)}">${escape(model)}</option></select></label><button type="button" class="text-button" id="load-models">사용 가능한 모델 불러오기</button><p id="key-status" class="muted" role="status"></p><div class="source-note"><p>키는 이 페이지가 열려 있는 동안만 메모리에 보관합니다. 대화와 탐색 조건은 Google로 전송됩니다. 무료 제공 범위와 한도는 프로젝트·모델에 따라 달라집니다.</p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio에서 키 관리 ↗</a></div><label class="consent"><input type="checkbox" id="consent" required> 대화·조건을 Gemini로 전송하는 것에 동의합니다.</label><div class="dialog-actions"><button type="submit" class="primary">연결하고 시작</button><button type="button" id="disconnect" class="text-button">연결 해제 · 데모 사용</button></div></form>`,
  );
  $("#load-models").onclick = async () => {
    const key = $("#api-key").value.trim() || apiKey;
    if (!key) {
      $("#key-status").textContent = "먼저 API 키를 입력해 주세요.";
      return;
    }
    const button = $("#load-models");
    button.disabled = true;
    $("#key-status").textContent = "모델 목록을 확인하고 있습니다…";
    try {
      const models = await availableModels(key, AbortSignal.timeout(20000));
      if (!models.length) throw Error("사용 가능한 텍스트 모델이 없습니다.");
      models.sort(
        (a, b) =>
          Number(!a.id.includes("flash")) - Number(!b.id.includes("flash")),
      );
      $("#model-select").innerHTML = models
        .map(
          (m) =>
            `<option value="${escape(m.id)}" ${m.id === model ? "selected" : ""}>${escape(m.label)}</option>`,
        )
        .join("");
      $("#key-status").textContent =
        `${models.length}개 모델을 찾았습니다. 모델별 무료 제공 여부는 AI Studio에서 확인하세요.`;
    } catch (e) {
      $("#key-status").textContent =
        e.name === "TimeoutError"
          ? "연결 시간이 초과됐습니다. 다시 시도해 주세요."
          : e.message;
    } finally {
      button.disabled = false;
    }
  };
  $("#key-form").onsubmit = (e) => {
    e.preventDefault();
    if (busy) {
      toast("진행 중인 요청을 중지한 뒤 연결을 변경해 주세요.");
      return;
    }
    apiKey = $("#api-key").value.trim() || apiKey;
    model = $("#model-select").value;
    history = [];
    $("#connection-label").textContent = "AI 연결됨";
    $("#agent-mode").textContent = "Gemini · 도구 실행";
    $("#dialog").close();
    showAgent();
    toast("키를 메모리에 보관했습니다. 첫 질문에서 연결을 확인합니다.");
  };
  $("#disconnect").onclick = () => {
    controller?.abort();
    apiKey = "";
    history = [];
    $("#connection-label").textContent = "AI 연결";
    $("#agent-mode").textContent = "도구 실행 데모";
    $("#dialog").close();
    toast("키를 지웠습니다. 데모 모드로 전환했습니다.");
  };
}
function showAgent() {
  $("#agent-panel").hidden = false;
  $("#agent-fab").hidden = true;
  $("#chat-input").focus();
}
function addMessage(text, role = "assistant") {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.innerHTML = `<span class="message-label">${role === "user" ? "YOU" : apiKey ? " .ZIP AGENT" : " .ZIP DEMO"}</span><div class="message-body"></div>`;
  const body = el.querySelector(".message-body");
  if (role === "user") body.textContent = text;
  else
    body.innerHTML = DOMPurify.sanitize(marked.parse(text), {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "h3",
        "h4",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "code",
        "blockquote",
      ],
      ALLOWED_ATTR: [],
    });
  $("#messages").append(el);
  $("#messages").scrollTop = $("#messages").scrollHeight;
}
function addStep(text) {
  const el = document.createElement("div");
  el.className = "tool-step";
  el.textContent = "↳ " + text;
  $("#messages").append(el);
  $("#messages").scrollTop = $("#messages").scrollHeight;
}
function execute(name, args) {
  if (name === "search_candidates") {
    updateConditions(args);
    setView("explore");
    return {
      conditions,
      count: results.length,
      destination: regions.find((r) => r.name === conditions.region)
        .destination,
      dataType: "합성 시연 데이터",
      candidates: results,
    };
  }
  if (name === "compare_candidates") {
    if (!Array.isArray(args.ids))
      return { error: "후보 ID 목록이 필요합니다." };
    const valid = args.ids
      .filter((id) => homes.some((h) => h.id === id))
      .slice(0, 3);
    if (!valid.length) return { error: "유효한 후보 ID가 없습니다." };
    selected = new Set(valid);
    updateSelection();
    setView("compare");
    return {
      dataType: "합성 시연 데이터",
      comparison: comparison(valid, conditions),
    };
  }
  if (name === "explain_score") {
    const h = homes.find((h) => h.id === args.id);
    return h ? score(h, conditions) : { error: "해당 후보가 없습니다." };
  }
  return { error: "지원하지 않는 도구입니다." };
}
function runDemo(text) {
  const p = {};
  const r = regions.find((r) => text.includes(r.name));
  if (r) p.region = r.name;
  const amount = text.match(/(?:월\s*지출|예산|월세)\s*(\d+)\s*만/);
  if (amount) p.budget = Number(amount[1]);
  const commute = text.match(/(\d+)\s*분/);
  if (commute) p.commute = Number(commute[1]);
  const deposit = text.match(/보증금\s*(\d+)\s*만/);
  if (deposit) p.deposit = Number(deposit[1]);
  if (/교통\s*우선|이동시간\s*우선/.test(text)) p.priority = "transit";
  if (/주거비\s*우선/.test(text)) p.priority = "cost";
  if (/생활환경\s*우선/.test(text)) p.priority = "life";
  if (!Object.keys(p).length && !/비교|추천|찾|검색/.test(text))
    return "지금은 도구 실행 데모입니다. “월 지출 50만 원 이하로 찾아줘”, “이동시간 20분 이내로 찾아줘”, “상위 두 후보 비교”를 체험할 수 있어요. 자유로운 대화는 AI 연결 설정에서 Gemini 키를 연결해 주세요.";
  addStep("search_candidates · 조건 적용, 후보 검색, 점수 계산");
  const result = execute("search_candidates", p);
  if (/비교/.test(text) && result.count) {
    addStep("compare_candidates · 비교표 갱신");
    execute("compare_candidates", {
      ids: result.candidates.slice(0, 2).map((h) => h.id),
    });
    return `[도구 실행 데모] 상위 ${Math.min(2, result.count)}개 생활권을 비교표에 반영했습니다. 모든 금액·이동시간은 합성 시연 데이터입니다.`;
  }
  return result.count
    ? `[도구 실행 데모] ${conditions.region}에서 조건에 맞는 ${result.count}개 생활권을 찾았습니다.\n\n첫 후보: ${result.candidates[0].area}\n월 지출 ${result.candidates[0].total}만 원 · ${result.destination}까지 ${result.candidates[0].transit}분 · 적합도 ${result.candidates[0].fit}점\n\n지도와 목록을 갱신했습니다. 가격·이동시간은 합성 시연값입니다.`
    : "[도구 실행 데모] 조건을 모두 충족하는 생활권이 없습니다. 상세 조건에서 예산이나 이동시간을 조정해 보세요. 조건은 임의로 완화하지 않았습니다.";
}
async function send(text) {
  if (busy || !text.trim()) return;
  showAgent();
  addMessage(text, "user");
  $("#chat-input").value = "";
  busy = true;
  $("#send").disabled = true;
  $("#stop").hidden = false;
  $("#agent-progress").hidden = false;
  $("#agent-progress").textContent = "조건을 확인하고 있습니다…";
  controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    if (!apiKey) {
      addMessage(runDemo(text));
    } else {
      const response = await runAgent({
        key: apiKey,
        model,
        text,
        history,
        conditions,
        execute,
        onStep: (text) => {
          $("#agent-progress").textContent = text;
          addStep(text);
        },
        signal: controller.signal,
      });
      history = response.history;
      if (history.length > 40) history = [];
      addMessage(response.text);
    }
  } catch (e) {
    addMessage(
      e.name === "AbortError"
        ? "요청이 중지됐거나 제한 시간을 초과했습니다. 이미 실행된 조건 변경은 화면에 남아 있습니다."
        : e instanceof TypeError
          ? "네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요."
          : e.message,
    );
  } finally {
    clearTimeout(timer);
    busy = false;
    $("#send").disabled = false;
    $("#stop").hidden = true;
    $("#agent-progress").hidden = true;
  }
}

document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]");
  if (v) {
    setView(v.dataset.view);
    return;
  }
  const d = e.target.closest("[data-detail]");
  if (d) {
    detail(d.dataset.detail);
    return;
  }
  const b = e.target.closest("[data-save]");
  if (b) {
    const id = b.dataset.save;
    bookmarks.has(id) ? bookmarks.delete(id) : bookmarks.add(id);
    try {
      localStorage.setItem("zip-saved", JSON.stringify([...bookmarks]));
    } catch {
      toast("브라우저 저장 공간을 사용할 수 없습니다.");
    }
    renderResults();
    renderSaved();
    refreshIcons();
    return;
  }
  const remove = e.target.closest("[data-remove]");
  if (remove) {
    selected.delete(remove.dataset.remove);
    updateSelection();
    refreshIcons();
    return;
  }
  const prompt = e.target.closest("[data-prompt]");
  if (prompt) {
    send(prompt.dataset.prompt);
    return;
  }
  if (e.target.closest("#reset-filters")) {
    updateConditions({ ...defaults, region: conditions.region });
    return;
  }
  if (e.target.closest("#export-comparison")) {
    const rows = comparison([...selected], conditions);
    const content =
      "\uFEFF" +
      [
        ".ZIP 생활권 비교 — 합성 시연 데이터",
        `조건: ${JSON.stringify(conditions)}`,
        ...rows.map(
          (h) =>
            `${h.region} ${h.area} (${h.id})\n월 지출 ${h.total}만 원 / 보증금 ${h.deposit}만 원 / 면적 ${h.size}㎡\n${h.destination}까지 ${h.transit}분 / 적합도 ${h.fit} / HII ${h.hii}\n근거: ${h.source}, ${h.asOf}`,
        ),
      ].join("\n\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ZIP-생활권-비교.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-compare]")) {
    const id = e.target.dataset.compare;
    if (e.target.checked && selected.size >= 3) {
      e.target.checked = false;
      toast("최대 3개까지 비교할 수 있습니다.");
      return;
    }
    e.target.checked ? selected.add(id) : selected.delete(id);
    updateSelection();
    refreshIcons();
  }
});
$("#filters").onsubmit = (e) => {
  e.preventDefault();
  updateConditions({ region: $("#region").value });
  toast(`${results.length}개 시연 생활권을 찾았습니다.`);
};
$("#region").onchange = (e) => updateConditions({ region: e.target.value });
$("#sort").onchange = renderResults;
for (const id of ["all-filters", "budget-filter", "commute-filter"])
  $(`#${id}`).onclick = conditionDialog;
for (const id of ["connect", "agent-settings"])
  $(`#${id}`).onclick = settingsDialog;
for (const id of ["agent-fab", "open-agent", "hero-agent"])
  $(`#${id}`).onclick = showAgent;
$("#close-agent").onclick = () => {
  $("#agent-panel").hidden = true;
  $("#agent-fab").hidden = false;
  $("#agent-fab").focus();
};
$("#chat-form").onsubmit = (e) => {
  e.preventDefault();
  send($("#chat-input").value);
};
$("#chat-input").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(e.target.value);
  }
};
$("#stop").onclick = () => controller?.abort();
$("#map-reset").onclick = resetMap;
$("#clear-compare").onclick = () => {
  selected.clear();
  updateSelection();
  refreshIcons();
};
$("#method").onclick = methodDialog;
$("#score-guide").onclick = methodDialog;
$("#about").onclick = aboutDialog;
updateConditions();
refreshIcons();
import("./motion.js")
  .then(({ initMotion }) => initMotion(conditions.region))
  .catch(() => {
    /* Static hero remains available when enhanced graphics cannot load. */
  });
