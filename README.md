# 🌸 하루 (Haru)

> 가계부 · 일정 · 투두 · 날씨 · 뉴스 · 운세를 한 곳에 — 오늘 하루를 한눈에 정리하는 데일리 라이프 앱

[![Android](https://img.shields.io/badge/Android-Play%20Store-green)](https://play.google.com/store)

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 💰 **가계부** | 수입·지출 기록, 카테고리 분류, 월별 요약. 데이터는 기기에만 저장 |
| 📅 **일정** | 달력 뷰로 일정 추가·관리. 일정 있는 날짜에 dot 표시 |
| ✅ **투두리스트** | 오늘 할 일을 체크리스트로 관리. 완료 체크 및 삭제 가능 |
| 🌤 **날씨** | 현재 위치 기반 실시간 날씨 + 12시간 예보 (기상청 API) |
| 📰 **오늘의 뉴스** | 주요 뉴스 헤드라인과 원문 링크 |
| 🔮 **오늘의 운세** | Claude AI 기반 오늘의 운세 |
| 🌙 **다크모드** | 라이트 / 다크 / 시스템 테마 선택 |
| 👤 **게스트 모드** | 로그인 없이도 모든 기능 사용 가능 |

---

## 기술 스택

**프론트엔드**
- Expo (React Native) + TypeScript
- expo-router, expo-sqlite, Zustand
- 소셜 로그인: Google (게스트 모드 지원)

**백엔드**
- FastAPI (Python 3.12+) — Oracle Cloud 호스팅 (Always Free)
- 외부 API: 기상청, 네이버 뉴스, Anthropic Claude

---

## 구조

```
haru/
├── frontend/         # Expo 앱
│   ├── app/          # 화면 (expo-router)
│   │   ├── (auth)/   # 로그인 화면
│   │   └── (tabs)/   # 메인 탭 화면
│   └── src/
│       ├── api/      # 백엔드 API 호출
│       ├── db/       # SQLite DB (로컬 저장)
│       ├── store/    # Zustand 전역 상태
│       └── constants/
└── backend/          # FastAPI 서버
    └── app/
        ├── api/      # 라우터
        ├── services/ # 외부 API 호출·가공
        ├── schemas/  # Pydantic 입출력 타입
        └── core/     # 순수 계산 (격자 변환 등)
```

---

## 데이터 저장 방식

- **가계부·일정·투두**: 앱 로컬 SQLite에만 저장 (외부 전송 없음)
- **인증 세션**: expo-secure-store (기기 보안 저장소)
- **날씨·뉴스·운세**: 백엔드 캐싱 후 전달

---

## 개인정보처리방침

[개인정보처리방침 보기](https://rangcloud.github.io/Haru/privacy-policy.html)
