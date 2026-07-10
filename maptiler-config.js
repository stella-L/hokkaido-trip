// ─────────────────────────────────────────────────────────────
// MapTiler 설정 (지도 라벨을 영어/로마자로 표시)
//
// MAPTILER_KEY 가 null 이면 → 무료 OSM 지도(일본어 라벨)로 자동 폴백.
//
// 로마자(Sapporo·Otaru…) 라벨을 켜려면:
//   1) https://cloud.maptiler.com 무료 가입
//   2) 로그인 후 좌측 "API Keys" → 기본 키 복사 (무료 100k 로드/월)
//   3) 아래 null 을 지우고 "키값" 붙여넣기
// ─────────────────────────────────────────────────────────────

export const MAPTILER_KEY = null;

// 라벨 언어: "latin"(로마자, 커버리지 완전) | "ko"(한국어 우선) | "ja"(일본어)
export const MAP_LANG = "latin";
