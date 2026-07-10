import { TYPES, PLACES, DAYS, CANDIDATES, MEMBERS, EXPENSES, JPY_TO_KRW } from "./seed-data.js";
import { firebaseConfig, TRIP_ID } from "./firebase-config.js";

// ───────────────────────── 상태 ─────────────────────────
let state = {
  days: structuredClone(DAYS),
  places: structuredClone(PLACES),
  candidates: structuredClone(CANDIDATES),
  members: structuredClone(MEMBERS),
  expenses: structuredClone(EXPENSES),
  krwRate: JPY_TO_KRW,
};

let expFormDay = null; // 지출 입력폼이 열린 날짜 id

// 내 식별 (투표용) — 브라우저마다 1개, 이름은 처음에 한 번 물음
let me = localStorage.getItem("trip_uid");
if (!me) { me = "u" + Math.random().toString(36).slice(2, 8); localStorage.setItem("trip_uid", me); }
let myName = localStorage.getItem("trip_name") || "";

let activeDay = null;        // 선택된 날짜 id (null = 전체)
const hiddenTypes = new Set(); // 숨긴 핀 종류

// ───────────────────────── 지도 ─────────────────────────
const map = L.map("map", { zoomControl: false }).setView([43.2, 141.6], 8);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
  maxZoom: 18,
}).addTo(map);

let markerLayer = L.layerGroup().addTo(map);
let routeLayer = L.layerGroup().addTo(map);
let pendingLatLng = null;    // 후보 등록용 길게-누른 좌표
let pendingMarker = null;

// 지도 길게 누르기 → 후보 위치 지정
map.on("contextmenu", (e) => setPending(e.latlng));
let pressTimer;
map.on("mousedown touchstart", (e) => {
  pressTimer = setTimeout(() => setPending(e.latlng), 550);
});
map.on("mouseup touchend mousemove dragstart", () => clearTimeout(pressTimer));

function setPending(latlng) {
  pendingLatLng = latlng;
  if (pendingMarker) pendingMarker.remove();
  pendingMarker = L.marker(latlng, { opacity: 0.7 }).addTo(map).bindPopup("여기로 후보 등록").openPopup();
  document.querySelector('[data-tab="candidates"]').click();
  document.getElementById("candName").focus();
}

function pinIcon(type, number) {
  const t = TYPES[type] || TYPES.sight;
  const badge = number ? `<div class="num-badge">${number}</div>` : "";
  return L.divIcon({
    className: "",
    html: `<div class="pin" style="background:${t.color}">${t.emoji}${badge}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function renderMap() {
  markerLayer.clearLayers();
  routeLayer.clearLayers();

  const daysToShow = activeDay ? state.days.filter((d) => d.id === activeDay) : state.days;

  // 일정 장소 마커 + 동선
  daysToShow.forEach((day) => {
    const pts = [];
    day.stops.forEach((sid, i) => {
      const p = state.places[sid];
      if (!p) return;
      if (hiddenTypes.has(p.type)) return;
      pts.push([p.lat, p.lng]);
      const num = activeDay ? i + 1 : null;
      L.marker([p.lat, p.lng], { icon: pinIcon(p.type, num) })
        .addTo(markerLayer)
        .bindPopup(popupHtml(p));
    });
    // 숙소 마커
    if (day.lodging && day.lodging.lat && !hiddenTypes.has("lodging")) {
      L.marker([day.lodging.lat, day.lodging.lng], { icon: pinIcon("lodging") })
        .addTo(markerLayer)
        .bindPopup(`<b>🏨 ${day.lodging.name}</b><br>${day.lodging.nameJa || ""}`);
    }
    // 동선 (선택된 날짜일 때만 선 그리기)
    if (activeDay && pts.length > 1) {
      L.polyline(pts, { color: "#38bdf8", weight: 3, opacity: 0.8, dashArray: "6 6" }).addTo(routeLayer);
    }
  });

  // 후보 마커
  if (!activeDay) {
    state.candidates.forEach((c) => {
      if (!c.lat || hiddenTypes.has(c.type)) return;
      L.marker([c.lat, c.lng], { icon: pinIcon(c.type), opacity: 0.85 })
        .addTo(markerLayer)
        .bindPopup(`<b>📌 ${c.name}</b><br>${c.note || ""}<br><small>👍 ${c.votes.length}</small>`);
    });
  }

  // 화면 맞춤
  const all = [];
  markerLayer.eachLayer((l) => l.getLatLng && all.push(l.getLatLng()));
  if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.2), { maxZoom: 12, animate: false });
}

function popupHtml(p) {
  return `<b>${TYPES[p.type].emoji} ${p.name}</b><br>${p.nameJa || ""}` +
    (p.note ? `<br><small>${p.note}</small>` : "") +
    `<br><a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank">구글맵 열기 ↗</a>`;
}

// ───────────────────────── 범례 ─────────────────────────
function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = Object.entries(TYPES).map(([key, t]) =>
    `<div class="lg-item ${hiddenTypes.has(key) ? "off" : ""}" data-type="${key}">
       <span class="dot" style="background:${t.color}"></span>${t.emoji} ${t.label}
     </div>`
  ).join("");
  el.querySelectorAll(".lg-item").forEach((item) => {
    item.onclick = () => {
      const t = item.dataset.type;
      hiddenTypes.has(t) ? hiddenTypes.delete(t) : hiddenTypes.add(t);
      renderLegend(); renderMap();
    };
  });
}

// ───────────────────────── 날짜 필터 ─────────────────────────
function renderDayFilter() {
  const el = document.getElementById("dayFilter");
  const chips = [`<button class="day-chip ${!activeDay ? "active" : ""}" data-day="">전체</button>`]
    .concat(state.days.map((d) =>
      `<button class="day-chip ${activeDay === d.id ? "active" : ""}" data-day="${d.id}">${d.date} ${d.weekday}</button>`
    ));
  el.innerHTML = chips.join("");
  el.querySelectorAll(".day-chip").forEach((c) => {
    c.onclick = () => {
      activeDay = c.dataset.day || null;
      renderDayFilter(); renderMap(); renderPlan();
      if (activeDay) {
        const card = document.getElementById("card-" + activeDay);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
  });
}

// 두 지점 직선거리(km) — 하버사인
function haversine(a, b) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// 대략 운전 소요시간 (도로 우회 1.3배, 평균 55km/h)
function driveEst(a, b) {
  const km = Math.round(haversine(a, b) * 1.3);
  if (km < 1) return "바로 근처";
  const min = Math.round((km / 55) * 60);
  const h = Math.floor(min / 60), m = min % 60;
  const t = h ? `${h}시간 ${m}분` : `${m}분`;
  return `약 ${km}km · ${t} (직선 기준)`;
}

// ───────────────────────── 돈/정산 유틸 ─────────────────────────
const yen = (n) => "¥" + Math.round(n).toLocaleString();
const won = (n) => "≈₩" + Math.round(n * (state.krwRate || 9)).toLocaleString();
const memberName = (id) => (state.members.find((m) => m.id === id) || {}).name || "?";
const expParts = (e) => (e.participants && e.participants.length ? e.participants : state.members.map((m) => m.id));

// 사람별 순잔액(낸 돈 - 부담해야 할 몫). +면 받을 돈, -면 낼 돈
function balances() {
  const bal = {};
  state.members.forEach((m) => (bal[m.id] = 0));
  state.expenses.forEach((e) => {
    if (bal[e.payerId] === undefined) return;
    bal[e.payerId] += e.amount;
    const parts = expParts(e).filter((id) => bal[id] !== undefined);
    if (!parts.length) return;
    const share = e.amount / parts.length;
    parts.forEach((id) => (bal[id] -= share));
  });
  return bal;
}

// 최소 송금 정산안 (그리디)
function minTransfers(bal) {
  const cred = [], deb = [];
  Object.entries(bal).forEach(([id, v]) => {
    const r = Math.round(v);
    if (r > 0) cred.push({ id, v: r });
    else if (r < 0) deb.push({ id, v: -r });
  });
  cred.sort((a, b) => b.v - a.v);
  deb.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const pay = Math.min(deb[i].v, cred[j].v);
    out.push({ from: deb[i].id, to: cred[j].id, amount: pay });
    deb[i].v -= pay; cred[j].v -= pay;
    if (deb[i].v === 0) i++;
    if (cred[j].v === 0) j++;
  }
  return out;
}

// 날짜 카드용 지출 섹션
function expenseSection(day) {
  if (!state.members.length) {
    return `<div class="exp-wrap"><div class="exp-hint">💰 지출을 적으려면 <b>정산 탭</b>에서 멤버를 먼저 추가하세요</div></div>`;
  }
  const list = state.expenses.filter((e) => e.dayId === day.id);
  const items = list.map((e) => `
    <div class="exp-item">
      <span class="exp-amt">${yen(e.amount)}</span>
      <span class="exp-memo">${e.memo || "지출"}</span>
      <span class="exp-payer">${memberName(e.payerId)} 냄 · ${expParts(e).length}명</span>
      <button class="exp-del" data-delexp="${e.id}">✕</button>
    </div>`).join("");

  const dayTotal = list.reduce((s, e) => s + e.amount, 0);
  const totalRow = list.length ? `<div class="exp-total">합계 ${yen(dayTotal)} <span class="won">${won(dayTotal)}</span></div>` : "";

  let form = "";
  if (expFormDay === day.id) {
    const opts = state.members.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    const checks = state.members.map((m) =>
      `<label class="pt-check"><input type="checkbox" class="exp-pt" value="${m.id}" checked>${m.name}</label>`).join("");
    form = `
      <div class="exp-form" data-day="${day.id}">
        <div class="exp-form-row">
          <input type="number" class="exp-amount" placeholder="금액 (¥)" inputmode="numeric" />
          <input type="number" class="exp-amount-krw" placeholder="금액 (₩)" inputmode="numeric" />
        </div>
        <div class="exp-conv">¥·₩ 아무거나 입력하면 자동 환산돼요 (¥1=₩${state.krwRate})</div>
        <select class="exp-payer-sel">${opts}</select>
        <input type="text" class="exp-memo-in" placeholder="메모 (예: 저녁 스시)" />
        <div class="pt-label">나눠 낼 사람</div>
        <div class="pt-checks">${checks}</div>
        <div class="exp-form-btns">
          <button class="exp-save" data-day="${day.id}">저장</button>
          <button class="exp-cancel">취소</button>
        </div>
      </div>`;
  }

  return `<div class="exp-wrap">
    <div class="exp-head">💰 지출 ${totalRow}</div>
    ${items}
    ${form || `<button class="exp-add" data-day="${day.id}">＋ 지출 추가</button>`}
  </div>`;
}

// ───────────────────────── 일정 탭 ─────────────────────────
function renderPlan() {
  const el = document.getElementById("tab-plan");
  const days = activeDay ? state.days.filter((d) => d.id === activeDay) : state.days;
  el.innerHTML = days.map((day) => {
    let lodging = "";
    if (day.lodging) {
      const lg = day.lodging;
      const mapHref = lg.mapUrl || (lg.lat ? `https://www.google.com/maps/search/?api=1&query=${lg.lat},${lg.lng}` : "");
      lodging = `
      <div class="lodging">
        <span class="emo">🏨</span>
        <div class="lg-info">
          <div>${lg.name}</div>
          <div class="lg-meta">${lg.nameJa || ""}${lg.checkin ? " · 체크인 " + lg.checkin : ""}${lg.address ? " · " + lg.address : ""}</div>
        </div>
        <div class="lg-links">
          ${lg.bookingUrl ? `<a href="${lg.bookingUrl}" target="_blank">${lg.bookingLabel || "예약"} ↗</a>` : ""}
          ${mapHref ? `<a href="${mapHref}" target="_blank">지도 ↗</a>` : ""}
        </div>
      </div>`;
    }

    const stops = day.stops.length
      ? day.stops.map((sid, i) => {
          const p = state.places[sid];
          if (!p) return "";
          const t = TYPES[p.type];
          let leg = "";
          if (i > 0) {
            const prev = state.places[day.stops[i - 1]];
            if (prev) leg = `<li class="leg">🚗 ${driveEst(prev, p)}</li>`;
          }
          return leg + `<li class="stop" data-sid="${sid}">
            <span class="num" style="background:${t.color}">${t.emoji}</span>
            <div class="st-body">
              <div class="st-name">${p.name}</div>
              <div class="st-note">${p.nameJa || ""}${p.note ? " · " + p.note : ""}</div>
            </div>
            <div class="st-actions">
              <a class="icon-btn" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank">↗</a>
              <button class="icon-btn" data-remove="${day.id}:${sid}">✕</button>
            </div>
          </li>`;
        }).join("")
      : `<div class="empty-hint">이동/자유 일정 — 후보 탭에서 '일정에 넣기'로 추가하세요</div>`;

    return `<div class="day-card" id="card-${day.id}">
      <div class="day-head">
        <span class="day-date">${day.date}</span>
        <span class="day-week">${day.weekday}</span>
        <span class="day-title">${day.title}</span>
      </div>
      ${lodging}
      <ul class="stops" data-day="${day.id}">${stops}</ul>
      ${expenseSection(day)}
    </div>`;
  }).join("");

  // 삭제 버튼
  el.querySelectorAll("[data-remove]").forEach((b) => {
    b.onclick = () => {
      const [did, sid] = b.dataset.remove.split(":");
      const day = state.days.find((d) => d.id === did);
      day.stops = day.stops.filter((s) => s !== sid);
      commit(); renderAll();
    };
  });

  // 지출: 폼 열기/닫기
  el.querySelectorAll(".exp-add").forEach((b) => {
    b.onclick = () => { expFormDay = b.dataset.day; renderPlan(); };
  });
  el.querySelectorAll(".exp-cancel").forEach((b) => {
    b.onclick = () => { expFormDay = null; renderPlan(); };
  });
  // ¥ ↔ ₩ 자동 환산
  const openForm = el.querySelector(".exp-form");
  if (openForm) {
    const yenIn = openForm.querySelector(".exp-amount");
    const wonIn = openForm.querySelector(".exp-amount-krw");
    const rate = state.krwRate || 9;
    yenIn.oninput = () => { wonIn.value = yenIn.value ? Math.round(Number(yenIn.value) * rate) : ""; };
    wonIn.oninput = () => { yenIn.value = wonIn.value ? Math.round(Number(wonIn.value) / rate) : ""; };
  }
  // 지출: 저장
  el.querySelectorAll(".exp-save").forEach((b) => {
    b.onclick = () => {
      const form = b.closest(".exp-form");
      const amount = Number(form.querySelector(".exp-amount").value);
      if (!amount || amount <= 0) { alert("금액을 입력하세요"); return; }
      const participants = [...form.querySelectorAll(".exp-pt:checked")].map((c) => c.value);
      if (!participants.length) { alert("나눠 낼 사람을 1명 이상 선택하세요"); return; }
      state.expenses.push({
        id: "e" + Date.now(),
        dayId: b.dataset.day,
        payerId: form.querySelector(".exp-payer-sel").value,
        amount,
        memo: form.querySelector(".exp-memo-in").value.trim(),
        participants,
      });
      expFormDay = null;
      commit(); renderAll();
    };
  });
  // 지출: 삭제
  el.querySelectorAll("[data-delexp]").forEach((b) => {
    b.onclick = () => {
      state.expenses = state.expenses.filter((e) => e.id !== b.dataset.delexp);
      commit(); renderAll();
    };
  });

  // 드래그앤드롭 (날짜 간 이동 + 순서 변경)
  el.querySelectorAll(".stops").forEach((ul) => {
    new Sortable(ul, {
      group: "stops",
      draggable: ".stop",   // 이동시간(.leg) 줄은 드래그 대상에서 제외
      animation: 150,
      ghostClass: "sortable-ghost",
      delay: 120, delayOnTouchOnly: true,
      onEnd: () => {
        // 화면 DOM 순서를 상태에 반영
        state.days.forEach((d) => {
          const node = el.querySelector(`.stops[data-day="${d.id}"]`);
          if (node) d.stops = [...node.querySelectorAll(".stop")].map((li) => li.dataset.sid);
        });
        commit(); renderPlan(); renderMap();  // 이동시간 다시 계산
      },
    });
  });
}

// ───────────────────────── 후보 탭 ─────────────────────────
function renderCandidates() {
  const el = document.getElementById("candList");
  const sorted = [...state.candidates].sort((a, b) => b.votes.length - a.votes.length);
  el.innerHTML = sorted.length ? sorted.map((c) => {
    const t = TYPES[c.type];
    const voted = c.votes.includes(me);
    return `<div class="cand-card">
      <span class="cand-emo">${t.emoji}</span>
      <div class="cand-body">
        <div class="cand-name">${c.name}</div>
        ${c.note ? `<div class="cand-note">${c.note}</div>` : ""}
        <div class="cand-by">${c.addedBy || "익명"} 올림${c.lat ? " · 📍위치있음" : ""}</div>
      </div>
      <button class="vote-btn ${voted ? "voted" : ""}" data-vote="${c.id}">👍 ${c.votes.length}</button>
      <button class="cand-del" data-del="${c.id}">🗑</button>
      <select class="add-day" data-add="${c.id}">
        <option value="">📅 일정에 넣기…</option>
        ${state.days.map((d) => `<option value="${d.id}">${d.date} ${d.weekday} (${d.title})</option>`).join("")}
      </select>
    </div>`;
  }).join("") : `<div class="empty-hint">아직 후보가 없어요. 위에서 추가해보세요!</div>`;

  el.querySelectorAll("[data-vote]").forEach((b) => {
    b.onclick = () => {
      const c = state.candidates.find((x) => x.id === b.dataset.vote);
      c.votes.includes(me) ? c.votes = c.votes.filter((v) => v !== me) : c.votes.push(me);
      commit(); renderCandidates(); renderMap();
    };
  });
  el.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      if (!confirm("이 후보를 삭제할까요?")) return;
      state.candidates = state.candidates.filter((x) => x.id !== b.dataset.del);
      commit(); renderCandidates(); renderMap();
    };
  });
  el.querySelectorAll(".add-day").forEach((sel) => {
    sel.onchange = () => {
      if (!sel.value) return;
      const c = state.candidates.find((x) => x.id === sel.dataset.add);
      promoteCandidate(c, sel.value);
    };
  });
}

// 후보 → 특정 날짜 일정에 넣기 (좌표 없으면 그 날 숙소 근처로)
function promoteCandidate(c, dayId) {
  const day = state.days.find((d) => d.id === dayId);
  const ref = day.lodging || { lat: 43.06, lng: 141.35 };
  const pid = "p_" + c.id;
  state.places[pid] = {
    name: c.name, nameJa: c.nameJa || "", type: c.type,
    lat: c.lat || ref.lat, lng: c.lng || ref.lng, note: c.note || "",
  };
  day.stops.push(pid);
  state.candidates = state.candidates.filter((x) => x.id !== c.id);
  commit(); renderAll();
  document.querySelector('[data-tab="plan"]').click();
  const card = document.getElementById("card-" + dayId);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ───────────────────────── 정산 탭 ─────────────────────────
function renderSettle() {
  const el = document.getElementById("tab-settle");
  const total = state.expenses.reduce((s, e) => s + e.amount, 0);
  const bal = balances();

  // 멤버 칩
  const chips = state.members.length
    ? state.members.map((m) => `<span class="mem-chip">${m.name}<button data-delmem="${m.id}">✕</button></span>`).join("")
    : `<span class="exp-hint">멤버를 추가하면 지출을 기록할 수 있어요</span>`;

  // 사람별 낸 돈 / 차액
  const paidBy = {};
  state.members.forEach((m) => (paidBy[m.id] = 0));
  state.expenses.forEach((e) => { if (paidBy[e.payerId] !== undefined) paidBy[e.payerId] += e.amount; });
  const rows = state.members.map((m) => {
    const net = Math.round(bal[m.id] || 0);
    const cls = net > 0 ? "pos" : net < 0 ? "neg" : "";
    const label = net > 0 ? `+${yen(net)} 받을 돈` : net < 0 ? `${yen(net)} 낼 돈` : "정산 완료";
    return `<div class="settle-row">
      <span class="sr-name">${m.name}</span>
      <span class="sr-paid">낸 돈 ${yen(paidBy[m.id])}</span>
      <span class="sr-net ${cls}">${label}</span>
    </div>`;
  }).join("");

  // 정산안
  const transfers = minTransfers(bal);
  const transferHtml = transfers.length
    ? transfers.map((t) => `<div class="transfer">${memberName(t.from)} <b>→</b> ${memberName(t.to)} <span class="tr-amt">${yen(t.amount)}</span></div>`).join("")
    : `<div class="exp-hint">${state.expenses.length ? "정산 완료! 보낼 돈이 없어요 🎉" : "지출을 입력하면 정산안이 나와요"}</div>`;

  el.innerHTML = `
    <div class="settle-box rate-box">
      <div class="settle-title">💱 정산 환율</div>
      <div class="rate-row">¥1 = ₩<input id="rateInput" type="number" step="0.1" value="${state.krwRate}" /></div>
      <div class="rate-hint">이 환율 기준으로 모든 원화 환산·정산이 계산돼요</div>
    </div>

    <div class="settle-box">
      <div class="settle-title">👥 멤버</div>
      <div class="mem-chips">${chips}</div>
      <form id="memForm" class="mem-form">
        <input id="memName" placeholder="이름 추가" maxlength="12" />
        <button type="submit">＋</button>
      </form>
    </div>

    <div class="settle-box">
      <div class="settle-title">📊 요약</div>
      <div class="settle-total">총 지출 <b>${yen(total)}</b> <span class="won">${won(total)}</span></div>
      ${rows || `<div class="exp-hint">아직 지출이 없어요. 일정 탭 각 날짜에서 '지출 추가'</div>`}
    </div>

    <div class="settle-box">
      <div class="settle-title">💸 이렇게 보내면 끝!</div>
      ${transferHtml}
    </div>`;

  // 멤버 추가
  el.querySelector("#memForm").onsubmit = (e) => {
    e.preventDefault();
    const name = el.querySelector("#memName").value.trim();
    if (!name) return;
    state.members.push({ id: "m" + Date.now(), name });
    commit(); renderAll();
  };
  // 멤버 삭제
  el.querySelectorAll("[data-delmem]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.delmem;
      if (state.expenses.some((e) => e.payerId === id)) {
        if (!confirm("이 멤버가 낸 지출이 있어요. 그래도 삭제할까요? (지출은 남습니다)")) return;
      }
      state.members = state.members.filter((m) => m.id !== id);
      state.expenses.forEach((e) => { e.participants = (e.participants || []).filter((p) => p !== id); });
      commit(); renderAll();
    };
  });
  // 환율 변경
  el.querySelector("#rateInput").onchange = (e) => {
    state.krwRate = Number(e.target.value) || 9;
    commit(); renderSettle();
  };
}

document.getElementById("candForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!myName) {
    myName = prompt("이름을 알려주세요 (후보에 표시돼요)") || "익명";
    localStorage.setItem("trip_name", myName);
  }
  const c = {
    id: "c" + Date.now(),
    name: document.getElementById("candName").value.trim(),
    type: document.getElementById("candType").value,
    note: document.getElementById("candNote").value.trim(),
    lat: pendingLatLng ? pendingLatLng.lat : null,
    lng: pendingLatLng ? pendingLatLng.lng : null,
    addedBy: myName,
    votes: [],
  };
  state.candidates.push(c);
  e.target.reset();
  if (pendingMarker) { pendingMarker.remove(); pendingMarker = null; }
  pendingLatLng = null;
  commit(); renderCandidates(); renderMap();
});

// 탭 전환
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("tab-" + t.dataset.tab).classList.add("active");
    // 날짜 필터는 일정 탭에서만
    document.getElementById("dayFilter").style.display = t.dataset.tab === "plan" ? "flex" : "none";
    setTimeout(() => map.invalidateSize(), 100);
  };
});

// ───────────────────────── 렌더 총괄 ─────────────────────────
function renderAll() {
  renderLegend();
  renderDayFilter();
  renderPlan();
  renderCandidates();
  renderSettle();
  renderMap();
}

// ───────────────────────── 저장/동기화 ─────────────────────────
let saveRemote = null; // Firebase 저장 함수 (설정 시)
const status = document.getElementById("syncStatus");

function serializable() {
  return {
    days: state.days, places: state.places, candidates: state.candidates,
    members: state.members, expenses: state.expenses, krwRate: state.krwRate,
  };
}

let saveTimer;
function commit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem("trip_state", JSON.stringify(serializable()));
    if (saveRemote) saveRemote(serializable());
  }, 300);
}

async function boot() {
  // 1) 로컬 캐시 먼저 반영 (오프라인/즉시 표시)
  const cached = localStorage.getItem("trip_state");
  if (cached) {
    try { Object.assign(state, JSON.parse(cached)); } catch {}
  }
  renderAll();

  // 2) Firebase 설정이 있으면 실시간 동기화
  if (firebaseConfig) {
    try {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getFirestore, doc, onSnapshot, setDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const db = getFirestore(initializeApp(firebaseConfig));
      const ref = doc(db, "trips", TRIP_ID);

      saveRemote = (data) => {
        setDoc(ref, { ...data, _by: me, _at: Date.now() }, { merge: false })
          .then(() => flash("☁️ 저장됨"))
          .catch(() => flash("⚠️ 저장 실패"));
      };

      onSnapshot(ref, (snap) => {
        if (!snap.exists()) { saveRemote(serializable()); return; }
        const d = snap.data();
        if (d._by === me) return; // 내가 방금 쓴 건 무시
        state.days = d.days; state.places = d.places; state.candidates = d.candidates;
        if (d.members) state.members = d.members;
        if (d.expenses) state.expenses = d.expenses;
        if (d.krwRate) state.krwRate = d.krwRate;
        localStorage.setItem("trip_state", JSON.stringify(serializable()));
        renderAll();
        flash("🔄 업데이트됨");
      });
      status.textContent = "☁️ 실시간 공유 켜짐";
    } catch (err) {
      console.error(err);
      status.textContent = "⚠️ Firebase 연결 실패 (로컬 저장 사용)";
    }
  } else {
    status.textContent = "💾 이 기기에만 저장 (공유하려면 Firebase 설정)";
  }
  setTimeout(() => status.style.opacity = "0.5", 3000);
}

function flash(msg) {
  status.textContent = msg;
  status.style.opacity = "1";
  clearTimeout(flash._t);
  flash._t = setTimeout(() => status.style.opacity = "0.5", 2000);
}

boot();
