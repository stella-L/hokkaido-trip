// ─────────────────────────────────────────────────────────────
// Firebase 설정 (실시간 공유용)
//
// firebaseConfig 가 null 이면 → 브라우저 localStorage 에만 저장됩니다.
//   (혼자 테스트할 땐 이 상태로도 잘 동작합니다. 단, 친구와 공유 안 됨)
//
// 실시간 공유를 켜려면:
//   1) https://console.firebase.google.com 에서 프로젝트 생성 (무료)
//   2) 빌드 > Firestore Database 만들기 (테스트 모드로 시작)
//   3) 프로젝트 설정 > 내 앱 > 웹 앱 추가 → firebaseConfig 복사
//   4) 아래 null 을 지우고 붙여넣기
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = null;

// 예시 ↓ (위 null 을 지우고 이런 형태로 채우세요)
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "hokkaido-trip.firebaseapp.com",
//   projectId: "hokkaido-trip",
//   storageBucket: "hokkaido-trip.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abcdef",
// };

// 여러 여행/그룹을 구분하는 문서 키 (친구끼리 같은 값이어야 같은 일정 공유)
export const TRIP_ID = "hokkaido-2026-07";
