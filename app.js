import { TYPES, PLACES, DAYS, CANDIDATES, MEMBERS, EXPENSES, JPY_TO_KRW } from "./seed-data.js?v=place-detail";
import { firebaseConfig, TRIP_ID } from "./firebase-config.js";
import { MAPTILER_KEY, MAP_LANG } from "./maptiler-config.js";

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
let selectedPlaceId = null;
let placeDetailLoading = false;
let placeDetailCache = {};
try { placeDetailCache = JSON.parse(localStorage.getItem("place_detail_cache") || "{}"); } catch {}

const sheet = document.getElementById("sheet");
const sheetToggle = document.getElementById("sheetToggle");
const placeDetail = document.getElementById("placeDetail");
let sheetExpanded = false;

function isMobileLayout() {
  return window.matchMedia("(max-width: 819px)").matches;
}

function setSheetExpanded(expanded) {
  sheetExpanded = !isMobileLayout() || expanded;
  sheet.classList.toggle("sheet-expanded", sheetExpanded);
  sheet.classList.toggle("sheet-collapsed", !sheetExpanded);
  document.body.classList.toggle("sheet-expanded", sheetExpanded);
  document.body.classList.toggle("sheet-collapsed", !sheetExpanded);
  sheetToggle.setAttribute("aria-expanded", String(sheetExpanded));
  sheetToggle.setAttribute("aria-label", sheetExpanded ? "일정 패널 접기" : "일정 패널 펼치기");
  setTimeout(() => map.resize(), 260);
}

sheetToggle.addEventListener("click", () => setSheetExpanded(!sheetExpanded));
window.addEventListener("resize", () => setSheetExpanded(sheetExpanded));
setSheetExpanded(false);

// ───────────────────────── 지도 (MapLibre) ─────────────────────────
// 무료 OSM 래스터 스타일 (MapTiler 키 없을 때 폴백)
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const useMaptiler = !!MAPTILER_KEY;
const map = new maplibregl.Map({
  container: "map",
  style: useMaptiler
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
    : OSM_STYLE,
  center: [141.6, 43.2],
  zoom: 6.5,
  attributionControl: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }));

let markers = [];            // 현재 표시중인 마커
let pendingLatLng = null;    // 후보 등록용 길게-누른 좌표
let pendingMarker = null;
let mapReady = false;
const CLUSTER_MAX_ZOOM = 8.2;
const CLUSTER_RADIUS_PX = 48;

map.on("load", () => {
  if (useMaptiler) applyMapLanguage();   // 라벨 로마자/한국어로
  map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "routes", type: "line", source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#38bdf8", "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.85 },
  });
  mapReady = true;
  renderMap();
});
map.on("zoomend", () => renderMap({ fit: false }));

// MapTiler 벡터 라벨을 원하는 언어로 치환
function applyMapLanguage() {
  const field = MAP_LANG === "latin"
    ? ["coalesce", ["get", "name:latin"], ["get", "name:nonlatin"], ["get", "name"]]
    : ["coalesce", ["get", `name:${MAP_LANG}`], ["get", "name:latin"], ["get", "name"]];
  (map.getStyle().layers || []).forEach((l) => {
    if (l.type === "symbol" && l.layout && l.layout["text-field"]) {
      try { map.setLayoutProperty(l.id, "text-field", field); } catch (e) {}
    }
  });
}

// 지도 길게 누르기 → 후보 위치 지정
map.on("contextmenu", (e) => setPending(e.lngLat));
let pressTimer;
map.on("touchstart", (e) => { pressTimer = setTimeout(() => setPending(e.lngLat), 550); });
["touchend", "touchmove", "movestart"].forEach((ev) => map.on(ev, () => clearTimeout(pressTimer)));

function setPending(lngLat) {
  pendingLatLng = { lat: lngLat.lat, lng: lngLat.lng };
  if (pendingMarker) pendingMarker.remove();
  pendingMarker = new maplibregl.Marker({ color: "#5b4b6e" })
    .setLngLat([lngLat.lng, lngLat.lat])
    .setPopup(new maplibregl.Popup().setText("여기로 후보 등록"))
    .addTo(map);
  pendingMarker.togglePopup();
  setSheetExpanded(true);
  document.querySelector('[data-tab="candidates"]').click();
  document.getElementById("candName").focus();
}

// 픽셀 핀 DOM 엘리먼트
function pinEl(type, number) {
  const t = TYPES[type] || TYPES.sight;
  const el = document.createElement("div");
  el.className = "pin";
  el.style.background = t.color;
  el.innerHTML = `${t.emoji}${number ? `<div class="num-badge">${number}</div>` : ""}`;
  return el;
}

function clusterEl(count) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pin cluster-pin";
  el.textContent = count;
  el.setAttribute("aria-label", `${count}개 장소 모음`);
  return el;
}

function addMarker(lat, lng, type, number, html) {
  const m = new maplibregl.Marker({ element: pinEl(type, number), anchor: "center" }).setLngLat([lng, lat]);
  if (html) m.setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(html));
  m.addTo(map);
  markers.push(m);
}

function addClusterMarker(cluster) {
  const el = clusterEl(cluster.points.length);
  el.onclick = (e) => {
    e.stopPropagation();
    map.easeTo({
      center: [cluster.lng, cluster.lat],
      zoom: Math.min(map.getZoom() + 1.8, 11),
      duration: 280,
    });
  };
  const html = `<b>${cluster.points.length}개 장소</b><br><small>확대하면 개별 핀이 보여요</small>`;
  const m = new maplibregl.Marker({ element: el, anchor: "center" })
    .setLngLat([cluster.lng, cluster.lat])
    .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(html));
  m.addTo(map);
  markers.push(m);
}

function clusterMapPoints(points) {
  const clusters = [];
  const radius = map.getZoom() < CLUSTER_MAX_ZOOM ? CLUSTER_RADIUS_PX : 8;

  points.forEach((point) => {
    const screen = map.project([point.lng, point.lat]);
    let cluster = null;
    for (const c of clusters) {
      const dx = screen.x - c.x;
      const dy = screen.y - c.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        cluster = c;
        break;
      }
    }

    if (!cluster) {
      clusters.push({ ...point, x: screen.x, y: screen.y, points: [point] });
      return;
    }

    cluster.points.push(point);
    const count = cluster.points.length;
    cluster.lat = cluster.points.reduce((sum, p) => sum + p.lat, 0) / count;
    cluster.lng = cluster.points.reduce((sum, p) => sum + p.lng, 0) / count;
    const nextScreen = map.project([cluster.lng, cluster.lat]);
    cluster.x = nextScreen.x;
    cluster.y = nextScreen.y;
  });

  return clusters.flatMap((c) => c.points.length > 1 ? [c] : c.points);
}

function isUsableMapUrl(url) {
  return /^https?:\/\/.+\..+/.test(url || "") && !/^https:\/\/maps\.app\.goo\.gl\/?$/.test(url);
}

function googleMapsSearchUrl(item, options = {}) {
  if (isUsableMapUrl(item.mapUrl)) return item.mapUrl;
  if (options.preferCoordinates && item.lat && item.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.lat},${item.lng}`)}`;
  }
  const queryText = [item.nameJa, item.name].filter(Boolean).join(" ").trim();
  const query = queryText || (item.lat && item.lng ? `${item.lat},${item.lng}` : "");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function renderMap({ fit = true } = {}) {
  if (!mapReady) return;
  markers.forEach((m) => m.remove());
  markers = [];

  const daysToShow = activeDay ? state.days.filter((d) => d.id === activeDay) : state.days;
  const routeFeatures = [];
  const mapPoints = [];

  daysToShow.forEach((day) => {
    const pts = [];
    day.stops.forEach((sid, i) => {
      const p = state.places[sid];
      if (!p || hiddenTypes.has(p.type)) return;
      pts.push([p.lng, p.lat]);
      mapPoints.push({ lat: p.lat, lng: p.lng, type: p.type, number: activeDay ? i + 1 : null, html: popupHtml(p) });
    });
    if (day.lodging && day.lodging.lat && !hiddenTypes.has("lodging")) {
      mapPoints.push({
        lat: day.lodging.lat, lng: day.lodging.lng, type: "lodging", number: null,
        html: `<b>🏨 ${day.lodging.name}</b><br>${day.lodging.nameJa || ""}`,
      });
    }
    if (activeDay && pts.length > 1) {
      routeFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts } });
    }
  });

  if (!activeDay) {
    state.candidates.forEach((c) => {
      if (!c.lat || hiddenTypes.has(c.type)) return;
      mapPoints.push({
        lat: c.lat, lng: c.lng, type: c.type, number: null,
        html: `<b>📌 ${c.name}</b><br>${c.note || ""}<br><small>👍 ${c.votes.length}</small>`,
      });
    });
  }

  const src = map.getSource("routes");
  if (src) src.setData({ type: "FeatureCollection", features: routeFeatures });

  if (fit && mapPoints.length) {
    const b = new maplibregl.LngLatBounds();
    mapPoints.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 50, maxZoom: 12, animate: false });
  }

  clusterMapPoints(mapPoints).forEach((point) => {
    if (point.points) addClusterMarker(point);
    else addMarker(point.lat, point.lng, point.type, point.number, point.html);
  });
}

function popupHtml(p) {
  return `<b>${TYPES[p.type].emoji} ${p.name}</b><br>${p.nameJa || ""}` +
    (p.note ? `<br><small>${p.note}</small>` : "") +
    `<br><a href="${googleMapsSearchUrl(p)}" target="_blank">구글맵 열기 ↗</a>`;
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
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[ch]));

function detailSources(place) {
  if (place.wikiTitle) {
    if (typeof place.wikiTitle === "string") return [{ lang: "ko", title: place.wikiTitle }, { lang: "ja", title: place.wikiTitle }];
    return Object.entries(place.wikiTitle).map(([lang, title]) => ({ lang, title })).filter((x) => x.title);
  }
  return [
    { lang: "ko", title: place.name },
    { lang: "ja", title: place.nameJa },
    { lang: "en", title: place.name },
  ].filter((x) => x.title);
}

function normalizePhoto(photo) {
  if (!photo || !photo.url) return null;
  return {
    url: photo.url,
    alt: photo.alt || "",
    credit: photo.credit || "",
    sourceUrl: photo.sourceUrl || "",
  };
}

function saveDetailCache() {
  try { localStorage.setItem("place_detail_cache", JSON.stringify(placeDetailCache)); } catch {}
}

function mergeSeedPlaceDetails() {
  Object.entries(PLACES).forEach(([id, seedPlace]) => {
    if (!state.places[id]) return;
    if (seedPlace.description) state.places[id].description = seedPlace.description;
    ["photos", "wikiTitle", "detailSourceLabel", "detailSourceUrl"].forEach((key) => {
      if (seedPlace[key] !== undefined) state.places[id][key] = structuredClone(seedPlace[key]);
    });
  });
}

async function fetchWikiSummary(lang, title) {
  const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&origin=*&srlimit=1`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error("wiki search failed");
  const search = await searchRes.json();
  const resolvedTitle = search.query?.search?.[0]?.title;
  if (!resolvedTitle) throw new Error("wiki page not found");

  const encoded = encodeURIComponent(resolvedTitle.replaceAll(" ", "_"));
  const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(summaryUrl);
  if (!res.ok) throw new Error("summary not found");
  const summary = await res.json();
  const photos = [];

  try {
    const mediaRes = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent((summary.title || title).replaceAll(" ", "_"))}`);
    if (mediaRes.ok) {
      const media = await mediaRes.json();
      (media.items || []).forEach((item) => {
        const src = item.thumbnail?.url || item.original?.source || item.srcset?.at(-1)?.src;
        if (!src || !/^https?:/.test(src)) return;
        if (photos.some((p) => p.url === src)) return;
        photos.push(normalizePhoto({
          url: src,
          alt: item.caption?.text || summary.title || title,
          credit: item.artist?.text || item.credit || "Wikimedia",
          sourceUrl: item.file_page || item.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.title || "")}` : summary.content_urls?.desktop?.page,
        }));
      });
    }
  } catch {}

  if (summary.thumbnail?.source && !photos.some((p) => p.url === summary.thumbnail.source)) {
    photos.unshift(normalizePhoto({
      url: summary.thumbnail.source,
      alt: summary.title || title,
      credit: "Wikipedia",
      sourceUrl: summary.content_urls?.desktop?.page || "",
    }));
  }

  return {
    description: summary.extract || "",
    photos: photos.filter(Boolean).slice(0, 3),
    sourceLabel: `${lang}.wikipedia.org`,
    sourceUrl: summary.content_urls?.desktop?.page || summaryUrl,
  };
}

async function getPlaceDetail(placeId) {
  const place = state.places[placeId];
  if (!place) return null;
  const manualPhotos = (place.photos || []).map(normalizePhoto).filter(Boolean).slice(0, 3);
  const manual = {
    description: place.description || "",
    photos: manualPhotos,
    sourceLabel: place.detailSourceLabel || "",
    sourceUrl: place.detailSourceUrl || "",
  };

  const cached = placeDetailCache[placeId] || {};
  let detail = {
    description: manual.description || cached.description || "",
    photos: manual.photos.length ? manual.photos : (cached.photos || []).slice(0, 3),
    sourceLabel: manual.sourceLabel || cached.sourceLabel || "",
    sourceUrl: manual.sourceUrl || cached.sourceUrl || "",
  };
  if (detail.description && detail.photos.length) return detail;

  for (const source of detailSources(place)) {
    try {
      const wiki = await fetchWikiSummary(source.lang, source.title);
      detail = {
        description: detail.description || wiki.description,
        photos: detail.photos.length ? detail.photos : wiki.photos,
        sourceLabel: detail.sourceLabel || wiki.sourceLabel,
        sourceUrl: detail.sourceUrl || wiki.sourceUrl,
      };
      placeDetailCache[placeId] = detail;
      saveDetailCache();
      return detail;
    } catch {}
  }

  placeDetailCache[placeId] = detail;
  saveDetailCache();
  return detail;
}

function renderPlaceDetailSheet(detail = null) {
  const place = selectedPlaceId ? state.places[selectedPlaceId] : null;
  if (!place) {
    placeDetail.className = "place-detail";
    placeDetail.setAttribute("aria-hidden", "true");
    placeDetail.innerHTML = "";
    return;
  }

  const t = TYPES[place.type] || TYPES.sight;
  const photos = detail?.photos || [];
  const description = detail?.description || "";
  const source = detail?.sourceUrl
    ? `<a href="${escapeHtml(detail.sourceUrl)}" target="_blank">${escapeHtml(detail.sourceLabel || "출처")}</a>`
    : "";

  placeDetail.className = "place-detail open";
  placeDetail.setAttribute("aria-hidden", "false");
  placeDetail.innerHTML = `
    <div class="place-detail-backdrop" data-close-detail></div>
    <section class="place-detail-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(place.name)} 상세 정보">
      <div class="place-detail-handle"></div>
      <div class="place-detail-head">
        <div class="place-detail-title">
          <span class="place-type" style="background:${t.color}">${t.emoji} ${escapeHtml(t.label)}</span>
          <h2>${escapeHtml(place.name)}</h2>
          <p>${escapeHtml(place.nameJa || "")}</p>
        </div>
        <button class="place-detail-close" type="button" data-close-detail aria-label="상세 닫기">×</button>
      </div>
      ${photos.length ? `
        <div class="place-photos">
          ${photos.map((photo) => `
            <figure>
              <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt || place.name)}" loading="lazy" />
              ${photo.credit || photo.sourceUrl ? `<figcaption>${photo.sourceUrl ? `<a href="${escapeHtml(photo.sourceUrl)}" target="_blank">${escapeHtml(photo.credit || "이미지 출처")}</a>` : escapeHtml(photo.credit)}</figcaption>` : ""}
            </figure>`).join("")}
        </div>` : `<div class="place-photo-empty">사진을 불러오는 중이에요</div>`}
      <div class="place-detail-body">
        ${description ? `<p>${escapeHtml(description)}</p>` : `<p class="detail-muted">설명을 준비 중이에요. 우선 메모와 지도 링크를 확인해 주세요.</p>`}
        ${place.note ? `<div class="place-note">${escapeHtml(place.note)}</div>` : ""}
      </div>
      <div class="place-detail-actions">
        <a href="${googleMapsSearchUrl(place)}" target="_blank">구글맵 열기 ↗</a>
        ${source}
      </div>
      ${placeDetailLoading ? `<div class="detail-loading">정보 불러오는 중…</div>` : ""}
    </section>`;

  placeDetail.querySelectorAll("[data-close-detail]").forEach((el) => {
    el.onclick = closePlaceDetail;
  });
}

async function openPlaceDetail(placeId) {
  selectedPlaceId = placeId;
  placeDetailLoading = true;
  setSheetExpanded(true);
  renderPlaceDetailSheet(placeDetailCache[placeId] || null);
  const detail = await getPlaceDetail(placeId);
  if (selectedPlaceId !== placeId) return;
  placeDetailLoading = false;
  renderPlaceDetailSheet(detail);
}

function closePlaceDetail() {
  selectedPlaceId = null;
  placeDetailLoading = false;
  renderPlaceDetailSheet();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selectedPlaceId) closePlaceDetail();
});

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
      const mapHref = isUsableMapUrl(lg.mapUrl) ? lg.mapUrl : googleMapsSearchUrl(lg, { preferCoordinates: true });
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
            <button class="st-body place-detail-trigger" type="button" data-detail="${sid}" aria-label="${p.name} 상세 보기">
              <div class="st-name">${p.name}</div>
              <div class="st-note">${p.nameJa || ""}${p.note ? " · " + p.note : ""}</div>
            </button>
            <div class="st-actions">
              <a class="icon-btn" href="${googleMapsSearchUrl(p)}" target="_blank">↗</a>
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

  // 장소 상세 열기
  el.querySelectorAll("[data-detail]").forEach((b) => {
    b.onclick = () => openPlaceDetail(b.dataset.detail);
  });

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
    const mapUrl = isUsableMapUrl(c.mapUrl) ? c.mapUrl : "";
    return `<div class="cand-card">
      <span class="cand-emo">${t.emoji}</span>
      <div class="cand-body">
        <div class="cand-name">${c.name}</div>
        ${c.note ? `<div class="cand-note">${c.note}</div>` : ""}
        <div class="cand-by">${c.addedBy || "익명"} 올림${c.lat ? " · 📍위치있음" : ""}${mapUrl ? " · 지도링크" : ""}</div>
      </div>
      ${mapUrl ? `<a class="cand-map" href="${mapUrl}" target="_blank">지도 ↗</a>` : ""}
      <button class="vote-btn ${voted ? "voted" : ""}" data-vote="${c.id}">👍 ${c.votes.length}</button>
      <button class="cand-del" data-del="${c.id}">🗑</button>
      <select class="add-day" name="add-day-${c.id}" data-add="${c.id}">
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
    mapUrl: isUsableMapUrl(c.mapUrl) ? c.mapUrl : "",
  };
  day.stops.push(pid);
  state.candidates = state.candidates.filter((x) => x.id !== c.id);
  commit(); renderAll();
  setSheetExpanded(true);
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
  const mapUrl = document.getElementById("candMapUrl").value.trim();
  if (mapUrl && !isUsableMapUrl(mapUrl)) {
    alert("구글 지도 링크를 확인해 주세요");
    return;
  }
  const c = {
    id: "c" + Date.now(),
    name: document.getElementById("candName").value.trim(),
    type: document.getElementById("candType").value,
    note: document.getElementById("candNote").value.trim(),
    lat: pendingLatLng ? pendingLatLng.lat : null,
    lng: pendingLatLng ? pendingLatLng.lng : null,
    mapUrl,
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
    setSheetExpanded(true);
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("tab-" + t.dataset.tab).classList.add("active");
    // 날짜 필터는 일정 탭에서만
    document.getElementById("dayFilter").style.display = t.dataset.tab === "plan" ? "flex" : "none";
    setTimeout(() => map.resize(), 100);
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
  mergeSeedPlaceDetails();
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
        mergeSeedPlaceDetails();
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
