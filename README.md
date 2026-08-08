# 🌸 하루 (Haru)

> 가계부 · 일정 · 날씨 · 뉴스 · 운세를 한 곳에 — 오늘 하루를 한눈에 정리하는 데일리 라이프 앱

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 💰 **가계부** | 수입·지출 기록, 카테고리 분류, 월별 요약. 데이터는 기기에만 저장 |
| 📅 **일정** | 달력 뷰로 일정 추가·관리. 일정 있는 날짜에 dot 표시 |
| 🌤 **날씨** | 현재 위치 기반 실시간 날씨 + 12시간 예보 (기상청 API) |
| 📰 **오늘의 뉴스** | 주요 뉴스 헤드라인과 원문 링크 |
| 🔮 **오늘의 운세** | Claude AI 기반 오늘의 운세 |
| 🌙 **다크모드** | 라이트 / 다크 / 시스템 테마 선택 |

---

## 기술 스택

**프론트엔드**
- Expo (React Native) + TypeScript
- expo-router, expo-sqlite, Zustand
- 소셜 로그인: Google, 카카오, 네이버

**백엔드**
- FastAPI (Python 3.12+) — Render 호스팅
- 외부 API: 기상청, 네이버 뉴스, Anthropic Claude

---

## 구조

```
haru/
├── frontend/   # Expo 앱
│   ├── app/    # 화면 (expo-router)
│   └── src/    # API · DB · Store · 컴포넌트
└── backend/    # FastAPI 서버
    └── app/    # API · Services · Schemas · Core
```

---

## 개인정보처리방침

[개인정보처리방침 보기](https://rangcloud.github.io/Haru/privacy-policy.html)
