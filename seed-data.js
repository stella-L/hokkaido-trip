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
  chitose:     { name: "신치토세공항",        nameJa: "新千歳空港",         type: "sight",    lat: 42.7752, lng: 141.6923, note: "도착 + 렌터카 픽업", description: "홋카이도 여행의 관문 역할을 하는 큰 공항입니다. 삿포로와 도내 주요 지역으로 이동하기 편하고, 렌터카 픽업과 기념품 쇼핑을 한 번에 처리하기 좋습니다.", wikiTitle: { ko: "신치토세 공항", ja: "新千歳空港" } },
  ningle:      { name: "닝글테라스",          nameJa: "ニングルテラス",     type: "sight",    lat: 43.3016, lng: 142.3644, note: "저녁 / 지혜봄", description: "후라노 숲속에 작은 공방들이 모여 있는 산책형 명소입니다. 목조 오두막과 조명이 어울려 저녁 시간에 특히 분위기가 좋습니다.", wikiTitle: { ja: "ニングルテラス" } },
  furano_town: { name: "후라노 시내",         nameJa: "富良野市街",         type: "food",     lat: 43.3421, lng: 142.3833, note: "저녁 식사", description: "후라노 숙박과 식사의 거점이 되는 시내 지역입니다. 라벤더밭과 비에이 쪽으로 움직이기 전후에 식사와 장보기를 하기 좋습니다.", wikiTitle: { ko: "후라노시", ja: "富良野市" } },
  tomita:      { name: "팜 토미타",           nameJa: "ファーム富田",       type: "sight",    lat: 43.4183, lng: 142.4700, note: "라벤더 명소", description: "후라노를 대표하는 라벤더 농원입니다. 여름에는 보라색 라벤더밭과 꽃밭이 넓게 펼쳐져 사진 찍기 좋은 코스입니다.", wikiTitle: { ja: "ファーム富田" } },
  lavender_e:  { name: "Lavender East",       nameJa: "ラベンダーイースト", type: "sight",    lat: 43.3970, lng: 142.5120, note: "대규모 라벤더밭", description: "팜 토미타가 운영하는 대규모 라벤더밭 구역입니다. 넓게 펼쳐진 밭을 보러 가는 곳이라 날씨가 좋은 날 짧게 들르기 좋습니다.", wikiTitle: { ja: "ファーム富田" } },
  kamifurano:  { name: "카미후라노 언덕",     nameJa: "上富良野 丘",        type: "sight",    lat: 43.4536, lng: 142.4667, note: "언덕 드라이브", description: "후라노와 비에이 사이의 완만한 언덕 지대입니다. 차로 이동하며 밭과 산 능선이 이어지는 홋카이도다운 풍경을 보기 좋습니다.", wikiTitle: { ko: "가미후라노정", ja: "上富良野町" } },
  hinode:      { name: "히노데공원",          nameJa: "日の出公園",         type: "sight",    lat: 43.4622, lng: 142.4869, note: "전망대 라벤더", description: "카미후라노의 언덕 위 공원입니다. 라벤더 시즌에는 꽃밭과 전망대를 함께 볼 수 있어 가볍게 산책하기 좋습니다.", wikiTitle: { ja: "日の出公園" } },
  blue_pond:   { name: "청의호수",            nameJa: "青い池",             type: "sight",    lat: 43.4954, lng: 142.6408, note: "비에이 / 오전 짧게", description: "비에이의 대표적인 푸른 연못입니다. 물빛과 마른 나무가 만드는 풍경이 유명하며, 빛이 좋은 오전에 들르면 색이 더 잘 보입니다.", wikiTitle: { ko: "청의 호수", ja: "白金青い池" } },
  otaru_canal: { name: "오타루 운하",         nameJa: "小樽運河",           type: "night",    lat: 43.1988, lng: 140.9947, note: "야경", description: "오타루를 대표하는 운하 산책로입니다. 창고 건물과 가스등이 이어져 저녁 조명 시간에 걷기 좋은 코스입니다.", wikiTitle: { ko: "오타루 운하", ja: "小樽運河" } },
  kamui:       { name: "샤코탄 카무이곶",     nameJa: "神威岬",             type: "sight",    lat: 43.3336, lng: 140.3336, note: "아침 일찍 / 절경", description: "샤코탄 반도 끝자락의 해안 절경 포인트입니다. 맑은 날에는 짙은 푸른 바다와 절벽 능선을 따라 걷는 풍경이 인상적입니다.", wikiTitle: { ja: "神威岬" } },
  noboribetsu: { name: "노보리베츠 온천마을", nameJa: "登別温泉",           type: "sight",    lat: 42.4907, lng: 141.1497, note: "지옥계곡", description: "홋카이도의 대표 온천지입니다. 유황 냄새와 수증기가 올라오는 지옥계곡 산책로가 유명하고 온천 숙박과 함께 묶기 좋습니다.", wikiTitle: { ko: "노보리베쓰 온천", ja: "登別温泉" } },
  toya:        { name: "토야호",              nameJa: "洞爺湖",             type: "sight",    lat: 42.5985, lng: 140.8395, note: "호수 전망", description: "화산 활동으로 만들어진 큰 칼데라 호수입니다. 호수와 산 전망이 시원하고, 드라이브 중 쉬어가기 좋은 지점입니다.", wikiTitle: { ko: "도야호", ja: "洞爺湖" } },
  maruyama:    { name: "마루야마공원",        nameJa: "円山公園",           type: "sight",    lat: 43.0538, lng: 141.3169, note: "", description: "삿포로 서쪽의 넓은 공원입니다. 홋카이도 신궁과 가까워 함께 산책하기 좋고, 도심에서 잠깐 자연을 느끼기 좋습니다.", wikiTitle: { ja: "円山公園 (札幌市)" } },
  shrine:      { name: "홋카이도 신궁",       nameJa: "北海道神宮",         type: "sight",    lat: 43.0544, lng: 141.3072, note: "", description: "삿포로를 대표하는 신사입니다. 마루야마공원 안쪽에 있어 조용히 산책하며 들르기 좋고, 계절마다 다른 분위기를 볼 수 있습니다.", wikiTitle: { ko: "홋카이도 신궁", ja: "北海道神宮" } },
  nishi18:     { name: "니시18초메 카페거리", nameJa: "西18丁目",           type: "cafe",     lat: 43.0556, lng: 141.3247, note: "카페 투어", description: "삿포로 중심부에서 조금 벗어난 조용한 카페 지역입니다. 마루야마와 신궁 일정 뒤에 쉬어가며 커피를 마시기 좋습니다.", wikiTitle: { ja: "西18丁目駅" } },
  nakajima:    { name: "나카지마공원",        nameJa: "中島公園",           type: "sight",    lat: 43.0470, lng: 141.3540, note: "", description: "스스키노 남쪽에 있는 도심 공원입니다. 연못과 산책로가 있어 삿포로 시내 일정 중 가볍게 걷기 좋은 장소입니다.", wikiTitle: { ja: "中島公園" } },
  sosei_east:  { name: "소세이가와 이스트",   nameJa: "創成川イースト",     type: "food",     lat: 43.0625, lng: 141.3600, note: "이자카야 / 쇼핑", description: "삿포로 도심 동쪽의 식당과 술집이 늘어나는 지역입니다. 저녁에 이자카야나 작은 가게를 찾아 움직이기 좋습니다.", wikiTitle: { ja: "創成川" } },
  tanukikoji:  { name: "타누키코지 상점가",   nameJa: "狸小路商店街",       type: "shopping", lat: 43.0567, lng: 141.3540, note: "쇼핑", description: "삿포로 중심부의 긴 아케이드 상점가입니다. 날씨와 상관없이 쇼핑하기 좋고, 드럭스토어와 음식점이 많습니다.", wikiTitle: { ja: "狸小路商店街" } },
  moiwa:       { name: "모이와야마",          nameJa: "藻岩山",             type: "night",    lat: 43.0316, lng: 141.3269, note: "야경 (날씨 좋으면)", description: "삿포로 야경을 보기 좋은 산 전망대입니다. 로프웨이를 이용해 올라가며, 날씨가 맑은 밤에 가면 도시 불빛이 넓게 보입니다.", wikiTitle: { ko: "모이와산", ja: "藻岩山" } },
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

// 사고싶은 것 (쇼핑 위시리스트)
// {id, name, note, photos:[{url,alt}], link, price(엔), store:{name,mapUrl,lat,lng}|null,
//  owner:{uid,name}, bought, paid(엔)|null}
// store 가 null 이면 "어디서 살지 미정"
export const WISHLIST = [];

// 매장 방문 순서 (storeKey 배열) — 최적 동선 계산 결과를 손으로 바꾼 것도 여기 저장
export const WISH_ROUTE = [];

// 맛집·가고싶은 곳 후보 (친구들이 올리는 곳)
export const CANDIDATES = [
  { id: "c1", name: "쿠마게라 (향토요리)", nameJa: "くまげら", type: "food", lat: 43.3419, lng: 142.3835, note: "후라노 사슴고기·오리", addedBy: "샘플", votes: [] },
  { id: "c2", name: "마사즈시 (초밥)",     nameJa: "政寿司",   type: "food", lat: 43.1976, lng: 140.9945, note: "오타루 노포 초밥", addedBy: "샘플", votes: [] },
];
