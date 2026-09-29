# 🌸 하루 (Haru)

> 가계부 · 일정 · 할 일 · 날씨 · 뉴스 · 오늘의 운세를 한 곳에 — 오늘 하루를 한눈에 정리하는 데일리 라이프 앱

iOS · Android 단일 코드베이스(Expo) + FastAPI 백엔드로 만든 개인 프로젝트입니다.
현재 **v1.0 출시 준비 중**이며 TestFlight 내부 테스트를 진행하고 있습니다.

---

## 주요 기능

### 홈 — 오늘을 한눈에
- **날씨**: 현재 위치의 기온·하늘 상태 (기상청 단기예보). 위치 권한이 없으면 서울 기준
- **오늘 일정**: 여러 날에 걸친 일정도 해당하는 날마다 표시
- **오늘 할 일**
  - ★ 중요 표시 → 고정 루틴 → 일반 할 일 순으로 정렬
  - 요일을 골라 반복하는 **고정 루틴** (매일·평일·주말·직접 선택), 체크는 날짜별로 기록
  - 날짜를 정해 미리 추가해 두면 그날 홈에 나타남
- **월별 가계부**: 수입 총액·지출 총액. 카드 제목을 눌러 연·월을 골라 다른 달 확인

### 일정 · 가계부
- **달력 칸 안에 일정 제목** 표시
  - 시간 있는 일정은 색 막대, 종일 일정은 색 띠, 여러 날 일정은 칸을 이어 한 줄 띠로
  - 칸당 최대 3줄, 넘치면 `+N`, 긴 제목은 말줄임표
  - 날짜별 **수입·지출 금액**(−2.2만, +320만)을 칸 아래에 표시
- 좌우로 밀어 달 이동, 월 제목을 눌러 연·월·일로 바로 이동, 오늘 버튼
- 앞뒤 달 날짜도 흐리게 표시하고 누르면 그 달로 이동
- **일정 추가**: 시작일~종료일과 시작~종료 시간을 한 패널에서 선택, 색상 지정
- **색상별 이름**: 색마다 이름을 붙여 카테고리처럼 사용 (예: 파랑 = 회사)
- **한눈에 보기**: 선택한 날의 일정·지출·수입을 팝업으로 요약
- 시작 시간이 있는 일정은 **10분 전 알림**

### 오늘의 운세
- 생년월일(양력·음력, 태어난 시각 선택)을 입력하면 AI(Claude)가 하루 한 번 새 운세를 작성
- 재미로 보는 콘텐츠

### 뉴스
- 카테고리 8개: 전체 · 정치 · 경제 · 사회 · IT·과학 · 생활·문화 · 스포츠 · 연예
- **필터**: 보고 싶은 카테고리만 켜고 순서 변경 (기기에 저장)
- 새로고침 버튼·당겨서 새로고침, 헤드라인·요약·원문 링크만 제공 (본문 저장·재출력 없음)

### 공통
- **게스트 모드**: 로그인 없이 모든 기능 사용. Google · Apple 로그인은 선택
- **시작 화면 설정**: 앱을 켤 때 먼저 보일 탭 선택 (홈·일정·운세·뉴스)
- 라이트 / 다크 / 시스템 테마, 광고 없음

---

## 데이터·개인정보 원칙

| 데이터 | 저장 위치 |
|---|---|
| 가계부 · 일정 · 할 일 · 루틴 · 색상 이름 | 기기 로컬 SQLite (서버 전송 없음) |
| 로그인 정보 · 테마 · 시작 화면 · 뉴스 필터 | 기기 보안 저장소 (expo-secure-store) |
| 날씨 · 뉴스 · 운세 | 백엔드에서 외부 API 호출 후 캐싱해 정제된 JSON만 전달 |

- 외부 API(기상청 · 네이버 · Anthropic)는 **반드시 백엔드를 거쳐** 호출하고, API 키는 서버의 `.env`에만 둡니다.
- 백엔드 오류 응답과 오류 로그에는 API 키와 위치 좌표를 남기지 않습니다.

---

## 기술 스택

**프론트엔드** — `frontend/`
- Expo SDK 54 (React Native 0.81) + TypeScript
- expo-router(파일 기반 라우팅), expo-sqlite, Zustand
- expo-location, expo-notifications, expo-secure-store
- Google 로그인(expo-auth-session), Apple 로그인(expo-apple-authentication)
- 빌드·배포: EAS Build / EAS Submit

**백엔드** — `backend/`
- FastAPI (Python 3.14+), httpx, Pydantic, 패키지 관리 uv
- 외부 API: 기상청 API 허브(단기예보), 네이버 뉴스 검색, Anthropic Claude
- Oracle Cloud에서 systemd 서비스로 운영, HTTPS

---

## 폴더 구조

```
haru/
├── frontend/              # Expo 앱
│   ├── app/               # 화면 (파일 = 라우트)
│   │   ├── (auth)/        # 로그인
│   │   └── (tabs)/        # 홈 · 일정 · 운세 · 뉴스
│   ├── components/        # 기본 UI (아이콘 등)
│   └── src/
│       ├── api/           # 백엔드 호출
│       ├── components/    # 공용 UI (달력, 바텀시트, 날짜·시간 선택, 할 일 목록 등)
│       ├── db/            # 로컬 SQLite (버전별 마이그레이션)
│       ├── store/         # Zustand 전역 상태
│       └── utils/         # 날짜 계산, 알림, 위젯 데이터 등
├── backend/               # FastAPI 서버
│   └── app/
│       ├── api/           # 라우터
│       ├── services/      # 외부 API 호출·가공·캐싱
│       ├── schemas/       # Pydantic 입출력 타입
│       └── core/          # 설정, 순수 계산 (위경도 → 기상청 격자 변환 등)
└── store/                 # 스토어 제출 자료 (설명문, 그래픽, 스크린샷 변환 스크립트)
```

---

## 개발 환경에서 실행하기

### 백엔드
```bash
cd backend
uv sync                      # 의존성 설치 (uv.lock 기준)
cp .env.example .env         # 키 입력
uv run uvicorn main:app --reload --port 8000
```
- API 문서: http://localhost:8000/docs

`.env`에 필요한 값

| 키 | 용도 |
|---|---|
| `WEATHER_API_KEY` | 기상청 API 허브 인증키 (단기예보 조회서비스 활용신청 필요) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 네이버 뉴스 검색 API |
| `ANTHROPIC_API_KEY` | 오늘의 운세 생성 |
| `WEATHER_CACHE_TTL` | 날씨 캐시 시간(초), 선택 |

### 프론트엔드
```bash
cd frontend
npm install
cp .env.local.example .env.local   # Google 로그인 클라이언트 ID 입력
npx expo run:android               # 또는 npx expo run:ios (macOS)
```
- 네이티브 모듈을 쓰는 bare workflow라 Expo Go 대신 개발 빌드로 실행합니다.
- 앱이 호출하는 백엔드 주소는 `src/api/*.ts`의 `API_BASE`에 있습니다.

### 품질 검사
```bash
cd frontend && npx tsc --noEmit && npx expo lint
cd backend && uv run --with ruff ruff check app
```

---

## 앞으로 할 일

- 친구와 일정 공유 (백엔드 기능은 있으나 v1.0에서는 비활성)
- 홈 화면 위젯 (iOS · Android)

---

## 문서

- [개인정보처리방침](https://claude.ai/artifact/Wtow7QzFfP4kb38yesbSKC)
- [고객 지원](https://claude.ai/artifact/BspFhWyr3TRYUw5K3njyEF)
- 문의: taerang0088@gmail.com
