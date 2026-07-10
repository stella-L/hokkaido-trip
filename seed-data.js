// 홋카이도 여행 초기 데이터 (좌표는 대략값 — 지도에서 확인 후 필요시 수정하세요)
// type: sight(관광) / food(맛집) / shopping(쇼핑) / cafe(카페) / lodging(숙소) / night(야경)

export const TYPES = {
  sight:    { label: "관광",  emoji: "🏔️", color: "#2563eb" },
  food:     { label: "맛집",  emoji: "🍜", color: "#ef4444" },
  shopping: { label: "쇼핑",  emoji: "🛍️", color: "#10b981" },
  cafe:     { label: "카페",  emoji: "☕",  color: "#d97706" },
  lodging:  { label: "숙소",  emoji: "🏨", color: "#8b5cf6" },
  night:    { label: "야경",  emoji: "🌃", color: "#6366f1" },
};

// 장소 마스터 (id로 참조)
export const PLACES = {
  chitose:     { name: "신치토세공항",        nameJa: "新千歳空港",         type: "sight",    lat: 42.7752, lng: 141.6923, note: "도착 + 렌터카 픽업" },
  ningle:      { name: "닝글테라스",          nameJa: "ニングルテラス",     type: "sight",    lat: 43.3016, lng: 142.3644, note: "저녁 / 지혜봄" },
  furano_town: { name: "후라노 시내",         nameJa: "富良野市街",         type: "food",     lat: 43.3421, lng: 142.3833, note: "저녁 식사" },
  tomita:      { name: "팜 토미타",           nameJa: "ファーム富田",       type: "sight",    lat: 43.4183, lng: 142.4700, note: "라벤더 명소" },
  lavender_e:  { name: "Lavender East",       nameJa: "ラベンダーイースト", type: "sight",    lat: 43.3970, lng: 142.5120, note: "대규모 라벤더밭" },
  kamifurano:  { name: "카미후라노 언덕",     nameJa: "上富良野 丘",        type: "sight",    lat: 43.4536, lng: 142.4667, note: "언덕 드라이브" },
  hinode:      { name: "히노데공원",          nameJa: "日の出公園",         type: "sight",    lat: 43.4622, lng: 142.4869, note: "전망대 라벤더" },
  blue_pond:   { name: "청의호수",            nameJa: "青い池",             type: "sight",    lat: 43.4954, lng: 142.6408, note: "비에이 / 오전 짧게" },
  otaru_canal: { name: "오타루 운하",         nameJa: "小樽運河",           type: "night",    lat: 43.1988, lng: 140.9947, note: "야경" },
  kamui:       { name: "샤코탄 카무이곶",     nameJa: "神威岬",             type: "sight",    lat: 43.3336, lng: 140.3336, note: "아침 일찍 / 절경" },
  noboribetsu: { name: "노보리베츠 온천마을", nameJa: "登別温泉",           type: "sight",    lat: 42.4907, lng: 141.1497, note: "지옥계곡" },
  toya:        { name: "토야호",              nameJa: "洞爺湖",             type: "sight",    lat: 42.5985, lng: 140.8395, note: "호수 전망" },
  maruyama:    { name: "마루야마공원",        nameJa: "円山公園",           type: "sight",    lat: 43.0538, lng: 141.3169, note: "" },
  shrine:      { name: "홋카이도 신궁",       nameJa: "北海道神宮",         type: "sight",    lat: 43.0544, lng: 141.3072, note: "" },
  nishi18:     { name: "니시18초메 카페거리", nameJa: "西18丁目",           type: "cafe",     lat: 43.0556, lng: 141.3247, note: "카페 투어" },
  nakajima:    { name: "나카지마공원",        nameJa: "中島公園",           type: "sight",    lat: 43.0470, lng: 141.3540, note: "" },
  sosei_east:  { name: "소세이가와 이스트",   nameJa: "創成川イースト",     type: "food",     lat: 43.0625, lng: 141.3600, note: "이자카야 / 쇼핑" },
  tanukikoji:  { name: "타누키코지 상점가",   nameJa: "狸小路商店街",       type: "shopping", lat: 43.0567, lng: 141.3540, note: "쇼핑" },
  moiwa:       { name: "모이와야마",          nameJa: "藻岩山",             type: "night",    lat: 43.0316, lng: 141.3269, note: "야경 (날씨 좋으면)" },
};

// 날짜별 일정
export const DAYS = [
  {
    id: "d1", date: "7/10", weekday: "금",
    lodging: { name: "후라노 에어비앤비", nameJa: "富良野 (대략 위치)", address: "", checkin: "15:00", lat: 43.3421, lng: 142.3833, mapUrl: "", bookingUrl: "https://www.airbnb.co.kr/rooms/1660510005927408445", bookingLabel: "에어비앤비" },
    title: "도착 → 후라노 이동",
    stops: ["chitose", "ningle", "furano_town"],
  },
  {
    id: "d2", date: "7/11", weekday: "토",
    lodging: { name: "후라노 에어비앤비", nameJa: "富良野 (대략 위치)", address: "", checkin: "", lat: 43.3421, lng: 142.3833, mapUrl: "", bookingUrl: "https://www.airbnb.co.kr/rooms/1660510005927408445", bookingLabel: "에어비앤비" },
    title: "라벤더 + 언덕 드라이브",
    stops: ["tomita", "lavender_e", "kamifurano", "hinode"],
  },
  {
    id: "d3", date: "7/12", weekday: "일",
    lodging: { name: "요이치 레우시", nameJa: "余市レウシ", address: "", checkin: "", lat: 43.1910749, lng: 140.7966893, mapUrl: "https://maps.app.goo.gl/in1vacfZ66RA77hs7", bookingUrl: "", bookingLabel: "" },
    title: "비에이 → 오타루",
    stops: ["blue_pond", "otaru_canal"],
  },
  {
    id: "d4", date: "7/13", weekday: "월",
    lodging: { name: "노보리베츠 숙소", nameJa: "登別温泉", address: "⚠️보내주신 링크는 비에이 좌표 — 확인 필요", checkin: "15:00", lat: 42.4907, lng: 141.1497, mapUrl: "https://maps.app.goo.gl/", bookingUrl: "", bookingLabel: "" },
    title: "샤코탄 → 노보리베츠 → 토야호",
    stops: ["kamui", "noboribetsu", "toya"],
  },
  {
    id: "d5", date: "7/14", weekday: "화",
    lodging: { name: "Granbell Hotel Sapporo", nameJa: "札幌 스스키노", address: "", checkin: "15:00", lat: 43.0553, lng: 141.3548, mapUrl: "", bookingUrl: "https://www.agoda.com/ko-kr/granbell-hotel-sapporo/hotel/sapporo-jp.html?ds=zlUqPG9AWBFOVoYe", bookingLabel: "아고다" },
    title: "노보리베츠 → 삿포로 (JR)",
    stops: [],
  },
  {
    id: "d6", date: "7/15", weekday: "수",
    lodging: { name: "Granbell Hotel Sapporo", nameJa: "札幌 스스키노", address: "", checkin: "", lat: 43.0553, lng: 141.3548, mapUrl: "", bookingUrl: "https://www.agoda.com/ko-kr/granbell-hotel-sapporo/hotel/sapporo-jp.html?ds=zlUqPG9AWBFOVoYe", bookingLabel: "아고다" },
    title: "마루야마 + 신궁 + 카페",
    stops: ["maruyama", "shrine", "nishi18"],
  },
  {
    id: "d7", date: "7/16", weekday: "목",
    lodging: { name: "Granbell Hotel Sapporo", nameJa: "札幌 스스키노", address: "", checkin: "", lat: 43.0553, lng: 141.3548, mapUrl: "", bookingUrl: "https://www.agoda.com/ko-kr/granbell-hotel-sapporo/hotel/sapporo-jp.html?ds=zlUqPG9AWBFOVoYe", bookingLabel: "아고다" },
    title: "나카지마 + 쇼핑 + 이자카야",
    stops: ["nakajima", "sosei_east", "tanukikoji"],
  },
  {
    id: "d8", date: "7/17", weekday: "금",
    lodging: { name: "Granbell Hotel Sapporo", nameJa: "札幌 스스키노", address: "", checkin: "", lat: 43.0553, lng: 141.3548, mapUrl: "", bookingUrl: "https://www.agoda.com/ko-kr/granbell-hotel-sapporo/hotel/sapporo-jp.html?ds=zlUqPG9AWBFOVoYe", bookingLabel: "아고다" },
    title: "여유 일정 + 모이와야마 야경",
    stops: ["moiwa"],
  },
  {
    id: "d9", date: "7/18", weekday: "토",
    lodging: null,
    title: "공항 이동 / 귀국",
    stops: [],
  },
];

// 여행 멤버 (정산 탭에서 추가/삭제) — {id, name}
export const MEMBERS = [];

// 지출 내역 — {id, dayId, payerId, amount(엔), memo, participants:[memberId]}
// participants 비어있으면 전원 N빵
export const EXPENSES = [];

// 원화 환산 환율 (¥1 ≈ ₩9.0, 정산 탭에서 수정 가능)
export const JPY_TO_KRW = 9.0;

// 맛집·가고싶은 곳 후보 (친구들이 올리는 곳)
export const CANDIDATES = [
  { id: "c1", name: "쿠마게라 (향토요리)", nameJa: "くまげら", type: "food", lat: 43.3419, lng: 142.3835, note: "후라노 사슴고기·오리", addedBy: "샘플", votes: [] },
  { id: "c2", name: "마사즈시 (초밥)",     nameJa: "政寿司",   type: "food", lat: 43.1976, lng: 140.9945, note: "오타루 노포 초밥", addedBy: "샘플", votes: [] },
];
