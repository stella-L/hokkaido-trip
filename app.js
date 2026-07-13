import { TYPES, PLACES, DAYS, CANDIDATES, MEMBERS, EXPENSES, JPY_TO_KRW, WISHLIST, WISH_ROUTE } from "./seed-data.js?v=shop-1";
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
  wishlist: structuredClone(WISHLIST),
  wishRoute: structuredClone(WISH_ROUTE),
};

let expFormDay = null; // 지출 입력폼이 열린 날짜 id

let activeTab = "plan";        // 지금 열린 탭 (지도 표시 내용이 달라짐)
let wishFormOpen = false;      // 사고싶은 것 입력폼 열림 여부
let wishFormPhotos = [];       // 입력 중인 사진 [{url, alt}]
let wishStoreLatLng = null;    // 입력 중인 매장 좌표 (지도 길게 눌러 지정)
let wishRouteScope = "mine";   // 동선 계산 대상: "mine" | "all"
let wishOrigin = null;         // 동선 계산에 쓴 출발 위치
let wishOriginIsReal = false;  // 실제 GPS 위치인지 (아니면 지도 중심 폴백)
const MAX_WISH_PHOTOS = 3;

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

function isEditableElement(el = document.activeElement) {
  if (!el) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
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
window.addEventListener("resize", () => {
  if (isEditableElement()) {
    setTimeout(() => map.resize(), 260);
    return;
  }
  setSheetExpanded(sheetExpanded);
});
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
let pendingTarget = "candidate"; // 길게 누른 좌표를 어디에 쓸지: "candidate" | "wish"
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
  const point = { lat: lngLat.lat, lng: lngLat.lng };
  const forWish = pendingTarget === "wish";

  if (pendingMarker) pendingMarker.remove();
  pendingMarker = new maplibregl.Marker({ color: "#5b4b6e" })
    .setLngLat([lngLat.lng, lngLat.lat])
    .setPopup(new maplibregl.Popup().setText(forWish ? "여기를 매장 위치로" : "여기로 후보 등록"))
    .addTo(map);
  pendingMarker.togglePopup();
  setSheetExpanded(true);

  if (forWish) {
    captureWishForm();
    wishStoreLatLng = point;
    pendingTarget = "candidate";
    document.querySelector('[data-tab="shop"]').click();
    renderShop();
    document.getElementById("wishStore")?.focus();
    return;
  }

  pendingLatLng = point;
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
    const bounds = new maplibregl.LngLatBounds();
    cluster.points.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, {
      padding: 72,
      maxZoom: Math.min(map.getZoom() + 2.2, 11),
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

function uniqueMapPoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = [
      point.type,
      Number(point.lat).toFixed(5),
      Number(point.lng).toFixed(5),
      point.html,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  });

  clusters.forEach((cluster) => {
    if (cluster.points.length < 2) return;
    const center = cluster.points.reduce((acc, point) => {
      const screen = map.project([point.lng, point.lat]);
      acc.x += screen.x;
      acc.y += screen.y;
      return acc;
    }, { x: 0, y: 0 });
    center.x /= cluster.points.length;
    center.y /= cluster.points.length;

    let representative = cluster.points[0];
    let bestDistance = Infinity;
    cluster.points.forEach((point) => {
      const screen = map.project([point.lng, point.lat]);
      const distance = Math.hypot(screen.x - center.x, screen.y - center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        representative = point;
      }
    });
    cluster.lat = representative.lat;
    cluster.lng = representative.lng;
    const screen = map.project([cluster.lng, cluster.lat]);
    cluster.x = screen.x;
    cluster.y = screen.y;
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

// 붙여넣은 구글맵 URL에서 좌표를 뽑아낼 수 있으면 뽑는다 (단축 링크는 못 뽑음)
function parseLatLngFromUrl(url) {
  if (!url) return null;
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                          // .../@43.05,141.35,17z
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,                      // ...!3d43.05!4d141.35
    /[?&](?:q|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // ?query=43.05,141.35
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

// 매장 하나를 구글맵 경로에 넣을 때 쓰는 표현 (좌표 우선, 없으면 이름)
function storeWaypoint(store) {
  if (store.lat && store.lng) return `${store.lat},${store.lng}`;
  return store.name || "";
}

// 여러 매장을 한 번에 도는 구글맵 길찾기 링크
function googleMapsRouteUrl(origin, groups) {
  const points = groups.map((g) => storeWaypoint(g.store)).filter(Boolean);
  if (!points.length) return "";
  const params = new URLSearchParams({ api: "1", travelmode: "driving" });
  params.set("destination", points[points.length - 1]);
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  const waypoints = points.slice(0, -1);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function renderMap({ fit = true } = {}) {
  if (!mapReady) return;
  markers.forEach((m) => m.remove());
  markers = [];

  // 쇼핑 탭에서는 지도가 매장 동선 전용으로 바뀐다
  if (activeTab === "shop") {
    renderShopMap({ fit });
    return;
  }

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

  const visiblePoints = uniqueMapPoints(mapPoints);

  if (fit && visiblePoints.length) {
    const b = new maplibregl.LngLatBounds();
    visiblePoints.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 50, maxZoom: 12, animate: false });
  }

  clusterMapPoints(visiblePoints).forEach((point) => {
    if (point.points) addClusterMarker(point);
    else addMarker(point.lat, point.lng, point.type, point.number, point.html);
  });
}

function popupHtml(p) {
  return `<b>${TYPES[p.type].emoji} ${p.name}</b><br>${p.nameJa || ""}` +
    (p.note ? `<br><small>${p.note}</small>` : "") +
    `<br><a href="${googleMapsSearchUrl(p)}" target="_blank">구글맵 열기 ↗</a>`;
}

// 쇼핑 탭 전용 지도: 매장 핀에 방문 순서 번호를 매기고 동선을 잇는다
function renderShopMap({ fit = true } = {}) {
  const ordered = orderedShopStores();
  const coords = [];

  ordered.forEach((group, i) => {
    const { store } = group;
    if (!store.lat || !store.lng) return;
    coords.push([store.lng, store.lat]);
    const names = group.items.map((it) => escapeHtml(it.name)).join(", ");
    addMarker(store.lat, store.lng, "shopping", i + 1,
      `<b>🛍️ ${escapeHtml(store.name)}</b><br><small>${names}</small>` +
      `<br><a href="${escapeHtml(googleMapsSearchUrl(store))}" target="_blank">구글맵 열기 ↗</a>`);
  });

  if (wishOrigin && wishOriginIsReal) {
    const here = new maplibregl.Marker({ color: "#ff9ec9" })
      .setLngLat([wishOrigin.lng, wishOrigin.lat])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML("<b>📍 현위치</b>"))
      .addTo(map);
    markers.push(here);
  }

  const src = map.getSource("routes");
  if (src) {
    src.setData({
      type: "FeatureCollection",
      features: coords.length > 1
        ? [{ type: "Feature", geometry: { type: "LineString", coordinates: coords } }]
        : [],
    });
  }

  if (fit && coords.length) {
    const b = new maplibregl.LngLatBounds();
    coords.forEach((c) => b.extend(c));
    if (wishOrigin && wishOriginIsReal) b.extend([wishOrigin.lng, wishOrigin.lat]);
    map.fitBounds(b, { padding: 60, maxZoom: 13, animate: false });
  }
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
  if (lbPhotos.length) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
    return;
  }
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
    b.onclick = () => { expFormDay = null; renderPlan(); flushDeferredRender(); };
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
      flushDeferredRender();
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

// ───────────────────────── 사진 업로드 (Firebase Storage) ─────────────────────────
const PHOTO_MAX_EDGE = 1200;
let storageModule = null;

async function getStorage() {
  if (!firebaseConfig) throw new Error("Firebase가 설정되지 않았어요");
  if (!storageModule) {
    storageModule = (async () => {
      const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getStorage: fbStorage, ref, uploadBytes, getDownloadURL } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      return { storage: fbStorage(app), ref, uploadBytes, getDownloadURL };
    })();
  }
  return storageModule;
}

// 폰 사진은 원본이 몇 MB씩 되므로, 올리기 전에 긴 변 1200px JPEG로 줄인다.
// (아이폰 HEIC도 여기서 JPEG로 바뀌므로 Storage에는 항상 JPEG만 올라간다)
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했어요"))),
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
      reject(new Error(heic
        ? "이 사진(HEIC)을 못 읽었어요. 사진 앱에서 다시 골라주세요"
        : "이미지를 읽을 수 없어요"));
    };
    img.src = objectUrl;
  });
}

async function uploadPhoto(file) {
  const blob = file instanceof Blob && file.type === "image/jpeg" ? file : await shrinkImage(file);
  const { storage, ref, uploadBytes, getDownloadURL } = await getStorage();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const fileRef = ref(storage, `wishlist/${TRIP_ID}/${name}`);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(fileRef);
}

// ───────────────────────── 사진 자르기 / 확대 (라이트박스) ─────────────────────────
const lightbox = document.getElementById("photoLightbox");
let lbPhotos = [];
let lbIndex = 0;

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
      reject(new Error(heic
        ? "이 사진(HEIC)을 못 읽었어요. 사진 앱에서 다시 골라주세요"
        : "이미지를 읽을 수 없어요"));
    };
    img.src = objectUrl;
  });
}

function openPhotoCropper(file) {
  return new Promise(async (resolve, reject) => {
    let loaded;
    try {
      loaded = await loadImageFile(file);
    } catch (err) {
      reject(err);
      return;
    }

    const { img, objectUrl } = loaded;
    lightbox.className = "lightbox open cropper";
    lightbox.setAttribute("aria-hidden", "false");
    lightbox.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <section class="cropper-panel" role="dialog" aria-modal="true" aria-label="사진 자르기">
        <div class="cropper-head">
          <strong>사진 위치 맞추기</strong>
          <button class="lightbox-btn cropper-close" type="button" data-crop-cancel aria-label="취소">×</button>
        </div>
        <div class="cropper-frame-wrap">
          <div class="cropper-frame" id="cropFrame">
            <img id="cropImage" src="${escapeHtml(objectUrl)}" alt="" draggable="false" />
          </div>
        </div>
        <div class="cropper-controls">
          <input id="cropZoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="사진 확대" />
          <div class="cropper-actions">
            <button class="exp-cancel" type="button" data-crop-cancel>취소</button>
            <button class="exp-save" type="button" id="cropUse">이대로 올리기</button>
          </div>
        </div>
      </section>`;

    const frame = lightbox.querySelector("#cropFrame");
    const preview = lightbox.querySelector("#cropImage");
    const zoomInput = lightbox.querySelector("#cropZoom");
    const cropSize = PHOTO_MAX_EDGE;
    let frameSize = 1;
    let baseScale = 1;
    let zoom = 1;
    let tx = 0, ty = 0;
    const pointers = new Map();
    let panFrom = null;
    let pinchStartDist = 0, pinchStartZoom = 1;

    const measure = () => {
      frameSize = frame.clientWidth || 1;
      baseScale = Math.max(frameSize / img.naturalWidth, frameSize / img.naturalHeight);
    };
    const clamp = () => {
      const drawW = img.naturalWidth * baseScale * zoom;
      const drawH = img.naturalHeight * baseScale * zoom;
      const maxX = Math.max(0, (drawW - frameSize) / 2);
      const maxY = Math.max(0, (drawH - frameSize) / 2);
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    };
    const apply = () => {
      measure();
      clamp();
      preview.style.width = `${img.naturalWidth * baseScale * zoom}px`;
      preview.style.height = `${img.naturalHeight * baseScale * zoom}px`;
      preview.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
      zoomInput.value = String(zoom);
    };
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      lightbox.className = "lightbox";
      lightbox.setAttribute("aria-hidden", "true");
      lightbox.innerHTML = "";
    };
    const cancel = () => {
      cleanup();
      resolve(null);
    };

    preview.onpointerdown = (e) => {
      preview.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStartDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchStartZoom = zoom;
        panFrom = null;
      } else {
        panFrom = { x: e.clientX - tx, y: e.clientY - ty };
      }
    };
    preview.onpointermove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchStartDist > 0) zoom = Math.max(1, Math.min(4, pinchStartZoom * (dist / pinchStartDist)));
      } else if (panFrom) {
        tx = e.clientX - panFrom.x;
        ty = e.clientY - panFrom.y;
      }
      apply();
    };
    const pointerEnd = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = 0;
      if (!pointers.size) panFrom = null;
    };
    preview.onpointerup = pointerEnd;
    preview.onpointercancel = pointerEnd;
    zoomInput.oninput = () => {
      zoom = Number(zoomInput.value);
      apply();
    };
    window.addEventListener("resize", apply, { once: true });
    lightbox.querySelectorAll("[data-crop-cancel]").forEach((b) => { b.onclick = cancel; });
    lightbox.querySelector("#cropUse").onclick = () => {
      try {
        measure();
        clamp();
        const canvas = document.createElement("canvas");
        canvas.width = cropSize;
        canvas.height = cropSize;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, cropSize, cropSize);

        const scale = baseScale * zoom;
        const sx = (img.naturalWidth / 2) - ((frameSize / 2 + tx) / scale);
        const sy = (img.naturalHeight / 2) - ((frameSize / 2 + ty) / scale);
        const sw = frameSize / scale;
        const sh = frameSize / scale;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cropSize, cropSize);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("사진 자르기에 실패했어요"));
            cleanup();
            return;
          }
          cleanup();
          resolve(blob);
        }, "image/jpeg", 0.86);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    requestAnimationFrame(apply);
  });
}

function openLightbox(photos, index = 0) {
  lbPhotos = (photos || []).map(normalizePhoto).filter(Boolean);
  if (!lbPhotos.length) return;
  lbIndex = Math.max(0, Math.min(index, lbPhotos.length - 1));
  renderLightbox();
}

function closeLightbox() {
  lbPhotos = [];
  lightbox.className = "lightbox";
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.innerHTML = "";
}

function stepLightbox(delta) {
  if (lbPhotos.length < 2) return;
  lbIndex = (lbIndex + delta + lbPhotos.length) % lbPhotos.length;
  renderLightbox();
}

function renderLightbox() {
  const photo = lbPhotos[lbIndex];
  const many = lbPhotos.length > 1;
  lightbox.className = "lightbox open";
  lightbox.setAttribute("aria-hidden", "false");
  lightbox.innerHTML = `
    <div class="lightbox-backdrop" data-close-lb></div>
    <div class="lightbox-tools">
      <button class="lightbox-btn" type="button" id="lbSave" aria-label="사진 저장">⬇</button>
      <button class="lightbox-btn" type="button" data-close-lb aria-label="사진 닫기">×</button>
    </div>
    <div class="lightbox-stage">
      <img class="lightbox-img" src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt || "사진")}" draggable="false" crossorigin="anonymous" />
    </div>
    ${many ? `
      <button class="lightbox-nav prev" type="button" data-lb-step="-1" aria-label="이전 사진">‹</button>
      <button class="lightbox-nav next" type="button" data-lb-step="1" aria-label="다음 사진">›</button>
      <div class="lightbox-count">${lbIndex + 1} / ${lbPhotos.length}</div>` : ""}
    <div class="lightbox-hint">두 손가락으로 확대 · 두 번 탭해도 확대돼요${many ? " · 좌우로 넘기기" : ""}</div>`;

  lightbox.querySelectorAll("[data-close-lb]").forEach((b) => { b.onclick = closeLightbox; });
  lightbox.querySelectorAll("[data-lb-step]").forEach((b) => {
    b.onclick = () => stepLightbox(Number(b.dataset.lbStep));
  });
  lightbox.querySelector("#lbSave").onclick = () => savePhoto(photo);
  bindLightboxZoom(lightbox.querySelector(".lightbox-img"));
}

// 사진을 내 기기에 저장. 아이폰 Safari는 <a download>를 무시하므로
// 공유 시트(Web Share)를 먼저 시도하고, 안 되면 다운로드로 떨어진다.
async function savePhoto(photo) {
  const filename = `${(photo.alt || "hokkaido").replace(/[^\w가-힣]+/g, "_")}-${Date.now()}.jpg`;
  try {
    const res = await fetch(photo.url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("💾 사진 저장됨");
  } catch (err) {
    if (err.name === "AbortError") return;   // 사용자가 공유 시트를 닫음
    console.error(err);
    // 마지막 수단: 새 탭에서 열어 길게 눌러 저장하도록
    window.open(photo.url, "_blank");
    flash("사진을 길게 눌러 저장해 주세요");
  }
}

// 핀치 줌 + 드래그 팬 + 더블탭 줌 + 좌우 스와이프
function bindLightboxZoom(img) {
  const MAX_SCALE = 4;
  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let pinchStartDist = 0, pinchStartScale = 1;
  let panFrom = null, downX = 0, downY = 0, lastTapAt = 0;

  const clamp = () => {
    if (scale <= 1) { scale = 1; tx = 0; ty = 0; return; }
    const maxX = (img.clientWidth * (scale - 1)) / 2;
    const maxY = (img.clientHeight * (scale - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  };
  const apply = () => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.classList.toggle("zoomed", scale > 1.01);
  };

  img.onpointerdown = (e) => {
    img.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStartScale = scale;
      panFrom = null;
    } else if (pointers.size === 1) {
      downX = e.clientX; downY = e.clientY;
      panFrom = { x: e.clientX - tx, y: e.clientY - ty };
    }
  };

  img.onpointermove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchStartDist > 0) {
        scale = Math.max(1, Math.min(MAX_SCALE, pinchStartScale * (dist / pinchStartDist)));
        clamp(); apply();
      }
      return;
    }

    if (scale > 1.01 && panFrom) {
      tx = e.clientX - panFrom.x;
      ty = e.clientY - panFrom.y;
      clamp(); apply();
    }
  };

  const onPointerEnd = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size > 0) return;

    // 확대 안 된 상태에서 옆으로 크게 밀면 사진 넘기기
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (scale <= 1.01 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      stepLightbox(dx < 0 ? 1 : -1);
      return;
    }
    panFrom = null;

    // 더블탭 줌
    const now = Date.now();
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (now - lastTapAt < 300) {
        scale = scale > 1.01 ? 1 : 2.5;
        tx = 0; ty = 0;
        clamp(); apply();
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
    }
  };
  img.onpointerup = onPointerEnd;
  img.onpointercancel = onPointerEnd;

  apply();
}

// ───────────────────────── 쇼핑 탭 ─────────────────────────
const storeKey = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, "");
const isMyWish = (item) => item.owner?.uid === me;
const wishCost = (item) => (item.paid ?? item.price ?? 0);

// 같은 이름의 매장끼리 묶는다 (들르는 곳은 한 번이니까)
function groupByStore(items) {
  const groups = new Map();
  items.forEach((item) => {
    const name = item.store?.name;
    if (!name) return;
    const key = storeKey(name);
    if (!groups.has(key)) groups.set(key, { key, store: item.store, items: [] });
    const group = groups.get(key);
    group.items.push(item);
    // 좌표를 가진 매장 정보를 대표로 채택
    if (!group.store.lat && item.store.lat) group.store = item.store;
  });
  return [...groups.values()];
}

// 동선 계산 대상 = 아직 안 산 물건이 남아있고 좌표가 있는 매장
function routeStoreGroups() {
  const scoped = (state.wishlist || []).filter(
    (item) => !item.bought && (wishRouteScope === "all" || isMyWish(item))
  );
  return groupByStore(scoped).filter((g) => g.store.lat && g.store.lng);
}

// 저장된 순서(state.wishRoute)를 적용하고, 순서에 없는 새 매장은 뒤에 붙인다
function orderedShopStores() {
  const byKey = new Map(routeStoreGroups().map((g) => [g.key, g]));
  const ordered = [];
  (state.wishRoute || []).forEach((key) => {
    if (byKey.has(key)) { ordered.push(byKey.get(key)); byKey.delete(key); }
  });
  byKey.forEach((g) => ordered.push(g));
  return ordered;
}

// 현 위치에서 가장 가까운 매장부터 차례로 (nearest-neighbor)
function computeShopRoute(origin, groups) {
  const remaining = [...groups];
  const order = [];
  let from = origin;
  while (remaining.length) {
    let bestIndex = 0;
    if (from) {
      let bestDistance = Infinity;
      remaining.forEach((g, i) => {
        const d = haversine(from, { lat: g.store.lat, lng: g.store.lng });
        if (d < bestDistance) { bestDistance = d; bestIndex = i; }
      });
    }
    const [picked] = remaining.splice(bestIndex, 1);
    order.push(picked.key);
    from = { lat: picked.store.lat, lng: picked.store.lng };
  }
  return order;
}

function locateMe() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

async function recalcShopRoute() {
  flash("📍 현위치 확인 중…");
  const located = await locateMe();
  wishOriginIsReal = !!located;
  wishOrigin = located || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  state.wishRoute = computeShopRoute(wishOrigin, routeStoreGroups());
  commit();
  renderShop();
  renderMap();
  flash(located ? "📍 현위치 기준으로 정렬됨" : "⚠️ 위치를 못 받아 지도 중심 기준으로 정렬");
}

function wishPhotoHtml(item) {
  const photo = (item.photos || []).map(normalizePhoto).filter(Boolean)[0];
  if (!photo) return `<div class="wish-photo wish-photo-empty">🛍️</div>`;
  return `<button class="wish-photo" type="button" data-zoom="${item.id}" aria-label="${escapeHtml(item.name)} 사진 크게 보기">
    <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt || item.name)}" loading="lazy" />
    ${(item.photos || []).length > 1 ? `<span class="wish-photo-count">${item.photos.length}</span>` : ""}
  </button>`;
}

function wishCardHtml(item) {
  const mine = isMyWish(item);
  const price = item.bought
    ? `<span class="wish-price bought">${yen(wishCost(item))} 씀</span>`
    : (item.price ? `<span class="wish-price">${yen(item.price)}</span>` : "");
  return `<div class="wish-card ${item.bought ? "wish-bought" : ""}">
    ${wishPhotoHtml(item)}
    <div class="wish-info">
      <div class="wish-name">${escapeHtml(item.name)}</div>
      ${item.note ? `<div class="wish-note">${escapeHtml(item.note)}</div>` : ""}
      <div class="wish-meta">
        ${price}
        <span class="wish-owner ${mine ? "mine" : ""}">${escapeHtml(item.owner?.name || "익명")}</span>
      </div>
    </div>
    <div class="wish-actions">
      ${item.link ? `<a class="icon-btn" href="${escapeHtml(item.link)}" target="_blank" aria-label="상품 링크 열기">🔗</a>` : ""}
      <button class="icon-btn" data-buy="${item.id}" aria-label="${item.bought ? "안 산 걸로 되돌리기" : "샀다고 표시"}">${item.bought ? "↩" : "✅"}</button>
      <button class="icon-btn" data-delwish="${item.id}" aria-label="삭제">🗑</button>
    </div>
  </div>`;
}

// 지도에서 위치를 찍고 오면 폼이 다시 그려지므로, 입력 중이던 내용을 붙잡아 둔다
const WISH_FIELDS = ["wishName", "wishPrice", "wishNote", "wishLink", "wishStore", "wishStoreUrl"];
let wishFormDraft = {};

function captureWishForm() {
  if (!wishFormOpen) return;
  WISH_FIELDS.forEach((id) => {
    const input = document.getElementById(id);
    if (input) wishFormDraft[id] = input.value;
  });
}

function wishFormHtml() {
  const photos = wishFormPhotos.map((p, i) => `
    <div class="wish-thumb">
      <img src="${escapeHtml(p.url)}" alt="" />
      <button type="button" data-rmphoto="${i}" aria-label="사진 빼기">×</button>
    </div>`).join("");
  const slotsLeft = MAX_WISH_PHOTOS - wishFormPhotos.length;
  const draft = (id) => escapeHtml(wishFormDraft[id] || "");

  return `<form id="wishForm" class="cand-form wish-form">
    <input id="wishName" placeholder="뭘 사고 싶어요? (예: 로이스 생초콜릿)" value="${draft("wishName")}" required />
    <div class="cand-form-row">
      <input id="wishPrice" type="number" inputmode="numeric" placeholder="예상 가격 (¥)" value="${draft("wishPrice")}" />
      <input id="wishNote" placeholder="메모 (선택)" value="${draft("wishNote")}" />
    </div>
    <input id="wishLink" type="url" placeholder="상품 링크 (선택)" value="${draft("wishLink")}" />

    <div class="wish-store-fields">
      <input id="wishStore" placeholder="어디서 살까요? (비우면 '미정')" value="${draft("wishStore")}" />
      <input id="wishStoreUrl" type="url" placeholder="매장 구글 지도 링크 (선택)" value="${draft("wishStoreUrl")}" />
      <div class="wish-store-loc">
        <button type="button" id="wishPickLoc">📍 지도에서 매장 위치 찍기</button>
        <span class="wish-loc-state">${wishStoreLatLng ? `위치 지정됨 (${wishStoreLatLng.lat.toFixed(4)}, ${wishStoreLatLng.lng.toFixed(4)})` : "위치 없으면 동선 계산에서 빠져요"}</span>
      </div>
    </div>

    <div class="wish-photo-field">
      <div id="wishPhotos" class="wish-thumbs">${photos}</div>
      <label class="wish-upload" ${slotsLeft > 0 ? "" : 'style="display:none"'}>
        <span id="wishUploadLabel">📷 사진 추가 (${slotsLeft}장 더)</span>
        <input id="wishFile" type="file" accept="image/*" multiple hidden />
      </label>
      <div id="wishUploadState" class="wish-upload-state"></div>
    </div>

    <div class="exp-form-btns">
      <button type="submit" class="exp-save">저장</button>
      <button type="button" class="exp-cancel" id="wishCancel">취소</button>
    </div>
  </form>`;
}

function renderShop() {
  const el = document.getElementById("tab-shop");
  const items = state.wishlist || [];
  const mine = items.filter(isMyWish);
  const spent = mine.filter((i) => i.bought).reduce((s, i) => s + wishCost(i), 0);
  const planned = mine.filter((i) => !i.bought).reduce((s, i) => s + (i.price || 0), 0);

  const totalBox = `<div class="settle-box wish-total">
    <div class="settle-title">💸 내가 쓴 돈</div>
    <div class="settle-total">${yen(spent)} <span class="won">${won(spent)}</span></div>
    <div class="rate-hint">${planned ? `아직 안 산 것 ${yen(planned)} 예상` : "산 물건을 체크하면 여기 쌓여요"} · 여행 경비 정산과는 따로 계산돼요</div>
  </div>`;

  const addBox = wishFormOpen
    ? wishFormHtml()
    : `<button class="exp-add wish-add" type="button" id="wishOpen">＋ 사고싶은 것 추가</button>`;

  // 동선
  const ordered = orderedShopStores();
  let routeBox = "";
  if (ordered.length >= 2) {
    let from = wishOrigin;
    const rows = ordered.map((group, i) => {
      const here = { lat: group.store.lat, lng: group.store.lng };
      const leg = from ? `<span class="wish-leg">${driveEst(from, here)}</span>` : "";
      from = here;
      return `<li class="wish-route-item" data-key="${escapeHtml(group.key)}">
        <span class="wish-drag" aria-hidden="true">≡</span>
        <span class="wish-order">${i + 1}</span>
        <span class="wish-route-name">${escapeHtml(group.store.name)} <small>(${group.items.length})</small></span>
        ${leg}
      </li>`;
    }).join("");

    routeBox = `<div class="settle-box wish-route-box">
      <div class="settle-title">
        🗺️ 쇼핑 동선
        <span class="wish-scope">
          <button type="button" class="wish-scope-btn ${wishRouteScope === "mine" ? "active" : ""}" data-scope="mine">내 것</button>
          <button type="button" class="wish-scope-btn ${wishRouteScope === "all" ? "active" : ""}" data-scope="all">전체</button>
        </span>
      </div>
      <ul class="wish-route" id="wishRouteList">${rows}</ul>
      <div class="rate-hint">${wishOrigin
        ? (wishOriginIsReal ? "현위치에서 가까운 순서예요. 끌어서 순서를 바꿀 수 있어요." : "위치를 못 받아 지도 중심 기준이에요. 끌어서 바꿔도 돼요.")
        : "아래 버튼을 누르면 현위치에서 가까운 순서로 정렬해요."}</div>
      <div class="backup-actions">
        <button type="button" id="wishLocate">📍 현위치 기준 다시 계산</button>
        <a class="wish-gmaps" href="${escapeHtml(googleMapsRouteUrl(wishOrigin, ordered))}" target="_blank">구글맵으로 전체 코스 열기 ↗</a>
      </div>
    </div>`;
  }

  // 매장별 / 미정 / 산 것
  const active = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);
  const storeGroups = groupByStore(active);
  const noStore = active.filter((i) => !i.store?.name);

  const orderIndex = new Map(orderedShopStores().map((g, i) => [g.key, i]));
  storeGroups.sort((a, b) => (orderIndex.get(a.key) ?? 99) - (orderIndex.get(b.key) ?? 99));

  const storeSections = storeGroups.map((group) => {
    const mapHref = googleMapsSearchUrl(group.store, { preferCoordinates: true });
    return `<div class="wish-store-group">
      <div class="wish-store-head">
        <span class="wish-store-name">🛍️ ${escapeHtml(group.store.name)} <small>(${group.items.length})</small></span>
        ${mapHref ? `<a class="cand-map" href="${escapeHtml(mapHref)}" target="_blank">지도 ↗</a>` : ""}
      </div>
      <div class="wish-grid">${group.items.map(wishCardHtml).join("")}</div>
    </div>`;
  }).join("");

  const noStoreSection = noStore.length ? `<div class="wish-store-group">
    <div class="wish-store-head"><span class="wish-store-name">📦 어디서 살지 미정 <small>(${noStore.length})</small></span></div>
    <div class="wish-grid">${noStore.map(wishCardHtml).join("")}</div>
  </div>` : "";

  const boughtSection = bought.length ? `<div class="wish-store-group">
    <div class="wish-store-head"><span class="wish-store-name">✅ 산 것 <small>(${bought.length})</small></span></div>
    <div class="wish-grid">${bought.map(wishCardHtml).join("")}</div>
  </div>` : "";

  const empty = !items.length
    ? `<div class="empty-hint">아직 사고싶은 게 없어요. 사진과 함께 올려보세요!</div>`
    : "";

  el.innerHTML = totalBox + addBox + routeBox + storeSections + noStoreSection + boughtSection + empty;

  bindShopEvents(el);
}

function bindShopEvents(el) {
  el.querySelector("#wishOpen")?.addEventListener("click", () => {
    wishFormOpen = true;
    renderShop();
    document.getElementById("wishName")?.focus();
  });
  el.querySelector("#wishCancel")?.addEventListener("click", resetWishForm);

  // 사진 업로드
  el.querySelector("#wishFile")?.addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, MAX_WISH_PHOTOS - wishFormPhotos.length);
    e.target.value = "";
    if (!files.length) return;
    const stateEl = document.getElementById("wishUploadState");
    for (const file of files) {
      if (stateEl) stateEl.textContent = `✂️ ${file.name} 편집 중…`;
      try {
        const cropped = await openPhotoCropper(file);
        if (!cropped) {
          if (stateEl) stateEl.textContent = "";
          continue;
        }
        if (stateEl) stateEl.textContent = `📤 ${file.name} 올리는 중…`;
        const url = await uploadPhoto(cropped);
        wishFormPhotos.push({ url, alt: "" });
      } catch (err) {
        console.error(err);
        if (stateEl) stateEl.textContent = `⚠️ 업로드 실패: ${err.message}`;
        flash("⚠️ 사진 업로드 실패");
        return;
      }
    }
    if (stateEl) stateEl.textContent = "";
    renderWishFormPhotos();
  });

  el.querySelectorAll("[data-rmphoto]").forEach((b) => {
    b.onclick = () => {
      wishFormPhotos.splice(Number(b.dataset.rmphoto), 1);
      renderWishFormPhotos();
    };
  });

  // 지도에서 매장 위치 찍기
  el.querySelector("#wishPickLoc")?.addEventListener("click", () => {
    captureWishForm();
    pendingTarget = "wish";
    setSheetExpanded(false);
    flash("📍 지도를 길게 눌러 매장 위치를 찍어주세요");
  });

  // 저장
  el.querySelector("#wishForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWish();
  });

  // 샀다 / 안 샀다
  el.querySelectorAll("[data-buy]").forEach((b) => {
    b.onclick = () => toggleBought(b.dataset.buy);
  });

  // 삭제
  el.querySelectorAll("[data-delwish]").forEach((b) => {
    b.onclick = () => {
      const item = (state.wishlist || []).find((i) => i.id === b.dataset.delwish);
      if (!item || !confirm(`"${item.name}"을(를) 목록에서 뺄까요?`)) return;
      state.wishlist = state.wishlist.filter((i) => i.id !== item.id);
      commit(); renderShop(); renderMap();
    };
  });

  // 사진 확대
  el.querySelectorAll("[data-zoom]").forEach((b) => {
    b.onclick = () => {
      const item = (state.wishlist || []).find((i) => i.id === b.dataset.zoom);
      if (item) openLightbox(item.photos, 0);
    };
  });

  // 동선 대상 전환
  el.querySelectorAll("[data-scope]").forEach((b) => {
    b.onclick = () => {
      wishRouteScope = b.dataset.scope;
      renderShop(); renderMap();
    };
  });

  el.querySelector("#wishLocate")?.addEventListener("click", recalcShopRoute);

  // 동선 드래그 재정렬
  const routeList = el.querySelector("#wishRouteList");
  if (routeList) {
    new Sortable(routeList, {
      animation: 150,
      ghostClass: "sortable-ghost",
      delay: 120, delayOnTouchOnly: true,
      onEnd: () => {
        const dragged = [...routeList.querySelectorAll(".wish-route-item")].map((li) => li.dataset.key);
        // 화면에 없는 매장(다른 scope의 것)의 순서는 그대로 뒤에 남긴다
        const rest = (state.wishRoute || []).filter((k) => !dragged.includes(k));
        state.wishRoute = [...dragged, ...rest];
        commit(); renderShop(); renderMap();
      },
    });
  }
}

function renderWishFormPhotos() {
  const wrap = document.getElementById("wishPhotos");
  if (!wrap) return;
  // 폼 전체를 다시 그리면 입력 중인 글자가 날아가므로 사진 영역만 갈아끼운다
  wrap.innerHTML = wishFormPhotos.map((p, i) => `
    <div class="wish-thumb">
      <img src="${escapeHtml(p.url)}" alt="" />
      <button type="button" data-rmphoto="${i}" aria-label="사진 빼기">×</button>
    </div>`).join("");
  wrap.querySelectorAll("[data-rmphoto]").forEach((b) => {
    b.onclick = () => {
      wishFormPhotos.splice(Number(b.dataset.rmphoto), 1);
      renderWishFormPhotos();
    };
  });
  const label = document.querySelector(".wish-upload");
  const labelText = document.getElementById("wishUploadLabel");
  const left = MAX_WISH_PHOTOS - wishFormPhotos.length;
  if (labelText) labelText.textContent = `📷 사진 추가 (${left}장 더)`;
  if (label) label.style.display = left > 0 ? "" : "none";
}

function resetWishForm() {
  wishFormOpen = false;
  wishFormPhotos = [];
  wishFormDraft = {};
  wishStoreLatLng = null;
  pendingTarget = "candidate";
  if (pendingMarker) { pendingMarker.remove(); pendingMarker = null; }
  renderShop();
  flushDeferredRender();
}

function submitWish() {
  const name = document.getElementById("wishName").value.trim();
  if (!name) return;

  if (!myName) {
    myName = prompt("이름을 알려주세요 (물건에 표시돼요)") || "익명";
    localStorage.setItem("trip_name", myName);
  }

  const link = document.getElementById("wishLink").value.trim();
  const storeName = document.getElementById("wishStore").value.trim();
  const storeUrl = document.getElementById("wishStoreUrl").value.trim();
  if (storeUrl && !isUsableMapUrl(storeUrl)) {
    alert("매장 지도 링크를 확인해 주세요");
    return;
  }

  // 좌표: 지도에서 찍은 게 우선, 없으면 붙여넣은 URL에서 뽑아본다
  const fromUrl = parseLatLngFromUrl(storeUrl);
  const coords = wishStoreLatLng || fromUrl;

  const priceInput = document.getElementById("wishPrice").value;
  state.wishlist.push({
    id: "w" + Date.now(),
    name,
    note: document.getElementById("wishNote").value.trim(),
    photos: wishFormPhotos.slice(0, MAX_WISH_PHOTOS),
    link,
    price: priceInput ? Number(priceInput) : null,
    store: storeName
      ? { name: storeName, mapUrl: storeUrl, lat: coords?.lat ?? null, lng: coords?.lng ?? null }
      : null,
    owner: { uid: me, name: myName },
    bought: false,
    paid: null,
  });

  resetWishForm();
  commit();
  renderShop();
  renderMap();
  flushDeferredRender();
}

function toggleBought(id) {
  const item = (state.wishlist || []).find((i) => i.id === id);
  if (!item) return;

  if (item.bought) {
    item.bought = false;
    item.paid = null;
  } else {
    const answer = prompt(`"${item.name}" 얼마 주고 샀어요? (¥, 비우면 예상가 ${item.price ? yen(item.price) : "없음"})`, item.price ?? "");
    if (answer === null) return;
    const paid = answer.trim() ? Number(answer) : null;
    if (paid !== null && (Number.isNaN(paid) || paid < 0)) {
      alert("금액을 숫자로 입력해 주세요");
      return;
    }
    item.bought = true;
    item.paid = paid;
  }
  commit();
  renderShop();
  renderMap();
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
    </div>

    <div class="settle-box backup-box">
      <div class="settle-title">🛡️ 데이터 백업</div>
      <div class="backup-summary">${dataSummary(state)}</div>
      <div class="backup-actions">
        <button id="exportBackup" type="button">백업 파일 저장</button>
        <button id="restoreLocalBackup" type="button">로컬 백업 복구</button>
      </div>
      <div class="rate-hint">저장할 때 원격 백업도 자동으로 남고, 빈 데이터 덮어쓰기는 차단돼요.</div>
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
  el.querySelector("#exportBackup").onclick = () => {
    downloadJson(`hokkaido-trip-${Date.now()}.json`, serializable());
    flash("💾 백업 파일 저장됨");
  };
  el.querySelector("#restoreLocalBackup").onclick = async () => {
    const recovery = loadRecoveryBackup();
    if (!recovery) {
      alert("이 브라우저에 복구할 로컬 백업이 없어요.");
      return;
    }
    if (!confirm(`이 브라우저의 로컬 백업으로 복구할까요?\n${dataSummary(recovery)}`)) return;
    Object.assign(state, compactState(recovery));
    localStorage.setItem("trip_state", JSON.stringify(serializable()));
    saveRecoveryBackup(serializable());
    renderAll();
    if (saveRemote) await saveRemote(serializable(), "manual-local-restore");
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
    // 쇼핑 탭이면 지도가 매장 동선으로 바뀐다
    const changed = activeTab !== t.dataset.tab;
    activeTab = t.dataset.tab;
    if (changed) renderMap();
    setTimeout(() => map.resize(), 100);
  };
});

// ───────────────────────── 렌더 총괄 ─────────────────────────
let pendingDeferredRender = false;

function hasActiveEditingUi() {
  if (wishFormOpen || expFormDay || lightbox.classList.contains("cropper")) return true;
  const active = document.activeElement;
  return !!(isEditableElement(active) && active.closest("form"));
}

function renderAll() {
  renderLegend();
  renderDayFilter();
  renderPlan();
  renderCandidates();
  renderShop();
  renderSettle();
  renderMap();
}

function renderAllWhenSafe() {
  if (hasActiveEditingUi()) {
    pendingDeferredRender = true;
    return false;
  }
  pendingDeferredRender = false;
  renderAll();
  return true;
}

function flushDeferredRender() {
  if (!pendingDeferredRender || hasActiveEditingUi()) return;
  renderAllWhenSafe();
}

document.addEventListener("focusout", () => setTimeout(flushDeferredRender, 80));

// ───────────────────────── 저장/동기화 ─────────────────────────
let saveRemote = null; // Firebase 저장 함수 (설정 시)
let remoteRevision = 0;
const status = document.getElementById("syncStatus");

function serializable() {
  return {
    days: state.days, places: state.places, candidates: state.candidates,
    members: state.members, expenses: state.expenses, krwRate: state.krwRate,
    wishlist: state.wishlist, wishRoute: state.wishRoute,
  };
}

const seedState = {
  days: DAYS,
  places: PLACES,
  candidates: CANDIDATES,
  members: MEMBERS,
  expenses: EXPENSES,
  krwRate: JPY_TO_KRW,
  wishlist: WISHLIST,
  wishRoute: WISH_ROUTE,
};

function compactState(data) {
  return {
    days: data?.days || [],
    places: data?.places || {},
    candidates: data?.candidates || [],
    members: data?.members || [],
    expenses: data?.expenses || [],
    krwRate: data?.krwRate || JPY_TO_KRW,
    wishlist: data?.wishlist || [],
    wishRoute: data?.wishRoute || [],
  };
}

function dataScore(data) {
  const d = compactState(data);
  const votes = d.candidates.reduce((sum, c) => sum + (c.votes?.length || 0), 0);
  const scheduledStops = d.days.reduce((sum, day) => sum + (day.stops?.length || 0), 0);
  return (
    Object.keys(d.places).length +
    d.candidates.length * 4 +
    votes * 2 +
    d.members.length * 8 +
    d.expenses.length * 12 +
    d.wishlist.length * 6 +
    scheduledStops
  );
}

function dataSummary(data) {
  const d = compactState(data);
  return `후보 ${d.candidates.length}개 · 쇼핑 ${d.wishlist.length}개 · 멤버 ${d.members.length}명 · 지출 ${d.expenses.length}개`;
}

function mergeById(primaryItems, recoveryItems, mergeItem = (_, recovery) => recovery) {
  const map = new Map((primaryItems || []).map((item) => [item.id, item]));
  (recoveryItems || []).forEach((item) => {
    if (!item?.id) return;
    map.set(item.id, map.has(item.id) ? mergeItem(map.get(item.id), item) : item);
  });
  return Array.from(map.values());
}

function mergeCandidates(primaryItems, recoveryItems) {
  return mergeById(primaryItems, recoveryItems, (primary, recovery) => {
    const votes = Array.from(new Set([...(primary.votes || []), ...(recovery.votes || [])]));
    return (recovery.votes?.length || 0) > (primary.votes?.length || 0)
      ? { ...primary, ...recovery, votes }
      : { ...recovery, ...primary, votes };
  });
}

function hasUserData(data) {
  if (!data) return false;
  const d = compactState(data);
  return JSON.stringify(d) !== JSON.stringify(compactState(seedState));
}

function isSeedLikeData(data) {
  const d = compactState(data);
  const seed = compactState(seedState);
  return (
    d.members.length === 0 &&
    d.expenses.length === 0 &&
    d.wishlist.length === 0 &&
    JSON.stringify(d.days) === JSON.stringify(seed.days) &&
    JSON.stringify(d.candidates) === JSON.stringify(seed.candidates)
  );
}

function mergeRecoveryData(localData, remoteData) {
  const local = compactState(localData);
  const remote = compactState(remoteData);
  const remoteHasUserData = hasUserData(remote);
  return {
    days: remoteHasUserData ? remote.days : local.days,
    places: remoteHasUserData ? { ...local.places, ...remote.places } : local.places,
    candidates: mergeCandidates(remote.candidates, local.candidates),
    members: mergeById(remote.members, local.members),
    expenses: mergeById(remote.expenses, local.expenses),
    krwRate: remoteHasUserData ? remote.krwRate : local.krwRate,
    wishlist: mergeById(remote.wishlist, local.wishlist),
    wishRoute: remoteHasUserData && remote.wishRoute.length ? remote.wishRoute : local.wishRoute,
  };
}

function shouldRestoreLocal(localData, remoteData, mergedData) {
  if (!hasUserData(localData)) return false;
  if (!remoteData) return true;
  if (!hasUserData(remoteData)) return true;
  return JSON.stringify(compactState(mergedData)) !== JSON.stringify(compactState(remoteData));
}

function isDangerousOverwrite(incomingData, remoteData) {
  if (!hasUserData(remoteData)) return false;
  if (!hasUserData(incomingData)) return true;

  const incoming = compactState(incomingData);
  const remote = compactState(remoteData);
  if (isSeedLikeData(incoming)) return true;

  const clearsCandidates = remote.candidates.length > 0 && incoming.candidates.length === 0;
  const clearsMembers = remote.members.length > 0 && incoming.members.length === 0;
  const clearsExpenses = remote.expenses.length > 0 && incoming.expenses.length === 0;
  const dropsCandidates = remote.candidates.length >= 3 && incoming.candidates.length <= Math.floor(remote.candidates.length * 0.4);
  const dropsMembers = remote.members.length >= 2 && incoming.members.length <= Math.floor(remote.members.length * 0.4);
  const dropsExpenses = remote.expenses.length >= 2 && incoming.expenses.length <= Math.floor(remote.expenses.length * 0.4);
  // 위시리스트는 한두 개만 남았을 때 지우는 게 정상이라 "전부 비움"을 차단하지 않는다.
  // 여러 개가 한꺼번에 사라지는 경우만 의심한다.
  const dropsWishlist = remote.wishlist.length >= 3 && incoming.wishlist.length <= Math.floor(remote.wishlist.length * 0.4);
  const muchSmaller = dataScore(incoming) < dataScore(remote) * 0.55;
  if (clearsCandidates || clearsMembers || clearsExpenses) return true;
  if (dropsMembers || dropsExpenses) return true;
  return muchSmaller && (dropsCandidates || dropsMembers || dropsExpenses || dropsWishlist);
}

function saveRecoveryBackup(data) {
  if (!hasUserData(data)) return;
  try {
    const payload = JSON.stringify(compactState(data));
    localStorage.setItem("trip_recovery_latest", payload);
    localStorage.setItem(`trip_recovery_${Date.now()}`, payload);
  } catch {}
}

function loadRecoveryBackup() {
  const keys = Object.keys(localStorage)
    .filter((key) => key === "trip_recovery_latest" || key.startsWith("trip_recovery_"))
    .sort()
    .reverse();
  for (const key of keys) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (hasUserData(data)) return data;
    } catch {}
  }
  return null;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(compactState(data), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isForceRestoreMode() {
  return new URLSearchParams(location.search).has("restoreLocal");
}

let saveTimer;
function commit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveRecoveryBackup(serializable());
    localStorage.setItem("trip_state", JSON.stringify(serializable()));
    if (saveRemote) saveRemote(serializable());
  }, 300);
}

async function boot() {
  // 1) 로컬 캐시 먼저 반영 (오프라인/즉시 표시)
  const cached = localStorage.getItem("trip_state");
  let cachedState = null;
  if (cached) {
    try {
      cachedState = JSON.parse(cached);
      saveRecoveryBackup(cachedState);
      Object.assign(state, cachedState);
    } catch {}
  }
  // 쇼핑 기능 이전에 저장된 데이터에는 wishlist가 없으므로 빈 배열로 채워둔다
  if (!Array.isArray(state.wishlist)) state.wishlist = [];
  if (!Array.isArray(state.wishRoute)) state.wishRoute = [];
  mergeSeedPlaceDetails();
  renderAll();

  // 2) Firebase 설정이 있으면 실시간 동기화
  if (firebaseConfig) {
    try {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getFirestore, doc, getDoc, onSnapshot, setDoc } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const db = getFirestore(initializeApp(firebaseConfig));
      const ref = doc(db, "trips", TRIP_ID);

      saveRemote = async (data, reason = "edit") => {
        try {
          const incoming = compactState(data);
          const remoteSnap = await getDoc(ref);
          const remoteData = remoteSnap.exists() ? remoteSnap.data() : null;
          const nextRevision = Math.max(remoteRevision, remoteData?._revision || 0) + 1;

          if (isDangerousOverwrite(incoming, remoteData)) {
            flash("🛡️ 빈 데이터 덮어쓰기 차단됨");
            return false;
          }

          if (hasUserData(remoteData)) {
            const backupRef = doc(db, "tripBackups", `${TRIP_ID}_${Date.now()}`);
            setDoc(backupRef, {
              data: compactState(remoteData),
              _createdAt: Date.now(),
              _createdBy: me,
              _reason: reason,
              _sourceRevision: remoteData._revision || 0,
              _dataScore: dataScore(remoteData),
            }).catch((err) => console.warn("backup failed", err));
          }

          await setDoc(ref, {
            ...incoming,
            _by: me,
            _at: Date.now(),
            _revision: nextRevision,
            _dataScore: dataScore(incoming),
          }, { merge: false });
          remoteRevision = nextRevision;
          flash("☁️ 저장됨");
          return true;
        } catch (err) {
          console.error(err);
          flash("⚠️ 저장 실패");
          return false;
        }
      };

      if (isForceRestoreMode()) {
        const recovery = loadRecoveryBackup() || cachedState;
        if (hasUserData(recovery)) {
          saveRemote(recovery, "forced-local-restore");
          Object.assign(state, recovery);
          localStorage.setItem("trip_state", JSON.stringify(compactState(recovery)));
          renderAll();
          flash("☁️ 강제 복구 저장됨");
          return;
        }
        flash("⚠️ 복구할 로컬 데이터 없음");
        return;
      }

      onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
          const localData = loadRecoveryBackup() || serializable() || cachedState;
          const recovered = mergeRecoveryData(localData, null);
          if (shouldRestoreLocal(localData, null, recovered)) {
            saveRemote(recovered, "auto-local-restore");
            flash("☁️ 로컬 데이터 복구됨");
          }
          return;
        }
        const d = snap.data();
        const localData = loadRecoveryBackup() || serializable() || cachedState;
        const recovered = mergeRecoveryData(localData, d);
        if (shouldRestoreLocal(localData, d, recovered)) {
          saveRemote(recovered, "merge-local-recovery");
          flash("☁️ 로컬 데이터 복구됨");
          return;
        }
        remoteRevision = d._revision || 0;
        state.days = d.days; state.places = d.places; state.candidates = d.candidates;
        if (d.members) state.members = d.members;
        if (d.expenses) state.expenses = d.expenses;
        if (d.krwRate) state.krwRate = d.krwRate;
        if (d.wishlist) state.wishlist = d.wishlist;
        if (d.wishRoute) state.wishRoute = d.wishRoute;
        mergeSeedPlaceDetails();
        localStorage.setItem("trip_state", JSON.stringify(serializable()));
        const rendered = renderAllWhenSafe();
        flash(rendered ? "🔄 업데이트됨" : "🔄 업데이트 대기 중");
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
