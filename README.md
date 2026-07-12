# 🗺️ 홋카이도 여행 지도 (2026.7.10~18)

친구들과 함께 보는 모바일용 여행 일정 + 지도 웹앱.
**서버 없이** GitHub Pages 로 배포됩니다. 실시간 공유는 Firebase 무료 티어 사용.

## 기능
- 🗾 무료 지도(Leaflet + OpenStreetMap) 위에 동선 표시
- 📌 핀 종류 색/아이콘 구분: 🏔️관광 · 🍜맛집 · 🛍️쇼핑 · ☕카페 · 🏨숙소 · 🌃야경
- ✋ 드래그앤드롭으로 일정 순서 변경 (날짜 간 이동도 가능)
- 🏨 날짜별 숙소 정보 카드
- 🗳️ 가고싶은 곳 "후보" 올리고 👍 투표
- 📱 모바일 우선 (상단 지도 + 하단 시트)

## 바로 실행 (로컬)
정적 파일이라 그냥 열면 됩니다. 단, ES module 때문에 로컬 서버 권장:
```bash
cd trip
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## GitHub Pages 배포
```bash
git init && git add . && git commit -m "홋카이도 여행 지도"
git branch -M main
git remote add origin https://github.com/<your-id>/<repo>.git
git push -u origin main
```
→ GitHub 저장소 **Settings > Pages > Branch: main / root** 저장 → 몇 분 뒤 `https://<your-id>.github.io/<repo>/` 공유.

## 실시간 공유 켜기 (Firebase, 무료)
`firebase-config.js` 열어서 안내대로:
1. https://console.firebase.google.com 에서 프로젝트 생성
2. **Firestore Database** 만들기 (테스트 모드로 시작)
3. 웹 앱 추가 → `firebaseConfig` 복사해서 붙여넣기
4. 다시 배포(push)하면 친구들 편집이 실시간 공유됨

> 설정 안 하면 각자 브라우저(localStorage)에만 저장됩니다. (혼자 확인용으로는 OK)

## 데이터 수정
- 일정/장소/좌표: `seed-data.js` 편집
- 좌표는 대략값이라, 지도에서 확인하고 맞춰주세요.

## 데이터 보호 / 복구
- 앱은 Firestore에 저장하기 전에 기존 원격 데이터가 빈 데이터로 덮이지 않도록 차단합니다.
- 원격 데이터를 덮어쓰기 전에는 `tripBackups` 컬렉션에 이전 상태를 자동 저장합니다.
- 정산 탭의 **데이터 백업**에서 현재 데이터를 JSON 파일로 내려받을 수 있습니다.
- 같은 브라우저에는 `trip_recovery_latest` 로컬 백업도 자동 저장됩니다.

### 사고가 났을 때
1. 데이터가 아직 보이는 기기/브라우저는 닫거나 새로고침하지 않습니다.
2. 그 기기에서 정산 탭 > **데이터 백업** > **백업 파일 저장**을 먼저 누릅니다.
3. 같은 기기에서 **로컬 백업 복구**를 눌러 Firestore에 다시 저장합니다.
4. 화면에 `☁️ 저장됨`이 뜨면 다른 기기에서 일반 주소로 새로고침합니다.
5. 그래도 안 되면 데이터가 보이는 같은 기기에서 `?restoreLocal=1`을 붙여 강제 복구합니다.

Firebase 콘솔에서 Firestore scheduled backup 또는 PITR(Point-in-time recovery)을 켜두면 추가 안전망이 됩니다.
