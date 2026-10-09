# 하루(Haru) — 프로젝트 규칙

> 이 파일은 **Antigravity**와 **Claude Code**가 함께 따르는 공통 규칙이다.
> 동일한 내용을 저장소 루트의 `CLAUDE.md`와 `AGENTS.md` 두 이름으로 둔다.
> 답변·주석·커밋 메시지는 **한국어**로 작성한다.

---

## 1. 프로젝트 개요
- **제품**: 하루(Haru) — 가계부 · 일정 · 날씨 · 오늘의 뉴스 · 오늘의 운세를 모은 데일리 라이프 앱
- **플랫폼**: iOS / Android (단일 코드베이스)
- **구조**: 모노레포 — `backend/`(FastAPI) + `frontend/`(Expo)

## 2. 기술 스택 (이 범위 안에서만 작업)
- **프론트엔드**: Expo(React Native) + TypeScript, expo-router, expo-sqlite, Zustand
- **백엔드**: FastAPI(Python 3.12+), httpx, Pydantic, 패키지 관리 uv
- **품질 도구**: 프론트 ESLint + Prettier / 백엔드 Ruff
- 새 라이브러리·프레임워크 도입은 **먼저 이유를 설명하고 승인을 받은 뒤** 추가한다.

## 3. 폴더 구조 (파일을 둘 위치)
- **화면**은 `frontend/app/` 아래에 둔다(파일 = 라우트). 그 외 로직은 모두 `frontend/src/`.
  - 재사용 UI → `src/components/`, 백엔드 호출 → `src/api/`, 로컬 DB → `src/db/`, 전역 상태 → `src/store/`
- **백엔드 역할 분리**를 지킨다.
  - 라우팅 → `app/api/` · 외부 API 호출·가공 → `app/services/` · 순수 계산(격자 변환 등) → `app/core/` · 입출력 타입 → `app/schemas/`

## 4. 아키텍처 원칙
- 외부 API(기상청 · 네이버 뉴스 · Claude)는 **반드시 백엔드를 통해서만** 호출한다. 앱이 외부 API를 직접 부르지 않는다.
- 가계부·일정 데이터는 **앱 로컬(SQLite)** 에 저장한다(로컬 우선). MVP 단계에서 외부 전송 금지.
- 백엔드는 **키 보관 · 좌표 변환 · 응답 파싱 · 캐싱**을 담당하고, 앱에는 **정제된 JSON만** 전달한다.

## 5. 코딩 컨벤션
**Python (backend)**
- 타입 힌트 필수, Ruff 규칙 준수, 함수/변수 `snake_case` · 클래스 `PascalCase`
- 외부 호출은 `async` + httpx, 입출력은 Pydantic 모델로 정의

**TypeScript (frontend)**
- 함수형 컴포넌트 + Hooks, 컴포넌트 `PascalCase` · 그 외 `camelCase`
- `any` 지양·타입 명시, UI와 로직 분리(components ↔ hooks/api/db)

## 6. 보안 규칙 (반드시 준수)
- API 키·시크릿은 **백엔드 `.env`에만** 둔다. 코드·프론트엔드·깃에 절대 포함 금지.
- `.env`는 커밋하지 않는다. 형식 예시 `.env.example`만 커밋한다.
- 앱↔백엔드 전 구간 **HTTPS**. 백엔드는 입력값을 검증한 뒤 처리한다.
- 유료/외부 호출(운세 등)은 **캐싱 + 레이트 리밋**으로 비용·남용을 막는다.
- 뉴스 본문은 저장·재출력하지 않고 **헤드라인·요약·출처 링크만** 다룬다(저작권 준수).

## 7. 에이전트 작업 방식 ★
1. **질문 시 전체를 다시 읽지 않는다.** 대화나 프로젝트 전체를 처음부터 재독하지 말고, 질문과 **직접 관련된 파일·코드 부분만 선택적으로** 읽는다. 컨텍스트에 없는 내용은 추측하지 말고 **코드 검색(grep/파일 검색)** 또는 필요 시 **웹 검색**으로 확인한 뒤 답한다.
2. **한 번에 충분히 설명한다.** 처음 안내할 때 근거·대안·주의점까지 **세세하게** 설명하여 같은 질문·답변이 반복되지 않게 한다.
3. **코드에 상세한 주석을 단다.** '무엇'보다 **'왜'**를 한국어 주석으로 충분히 설명한다. 격자 변환·캐싱 같은 복잡한 로직은 단계별로 주석을 남긴다.
4. 큰 변경 전에는 **먼저 계획을 제시하고 동의를 구한다.**
5. 변경은 **최소·집중**으로 한다. 요청하지 않은 리팩터링이나 파일 생성을 하지 않는다.
6. 작업 후 **무엇을, 왜 바꿨는지** 짧게 요약한다.

## 8. Git / 커밋
- Conventional Commits 사용: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- 시크릿·`.env`·빌드 산출물은 커밋 금지. 작은 단위로 자주 커밋한다.

## 9. 테스트
- `하루_앱_테스트케이스.xlsx`의 케이스를 기준으로 검증한다.
- 핵심 로직(격자 변환 등)은 단위 테스트를 작성한다. 예외·경계 케이스 처리를 빠뜨리지 않는다.

## 10. 금지사항 요약
외부 키 노출 · 앱에서 외부 API 직접 호출 · 뉴스 본문 복제 · `.env` 커밋 · 승인 없는 대규모 리팩터링.

## 11. 디자인 가이드라인
> 화면·웹페이지·시안을 만들거나 고칠 때 적용한다. 사용자 요청(2026-10-09)으로 추가.

### 11.1 AI가 만든 듯한 디자인 피하기 (frontend-design)
- 내용을 **똑같은 모양의 둥근 카드**로 잘게 나누어 늘어놓지 않는다(SaaS 카드 키트).
- **그라데이션을 장식용**으로 깔지 않는다.
- 구조·색·글꼴은 소재(하루·달력·가계부·일정)에서 가져와 이 앱에만 있는 형식을 만든다.
- 번호·구분선·라벨 같은 장치는 내용에 실제 의미가 있을 때만 쓴다.

### 11.2 ui-ux-pro-max 스킬
- 위치: `.claude/skills/ui-ux-pro-max/` (출처: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, MIT, 2026-10-08 커밋 1a2c459 기준 복사본)
  - `.claude/`는 `.gitignore` 대상이라 저장소에는 올라가지 않는다. 다른 PC에서는 위 저장소에서 다시 복사한다.
- UI 구조·색·글꼴·접근성·레이아웃을 정하거나 검토할 때 먼저 참고한다. 검색 결과는 **권고**이며 이 문서와 사용자 지시가 우선한다.
- 실행(프로젝트 루트에서, 외부 의존성 없음):
  - 디자인 시스템 추천: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<제품·분위기 키워드>" --design-system -p "Haru"`
  - 주제별 검색: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<키워드>" --domain ux` (`style`·`color`·`typography`·`icons` 등)
  - React Native 지침: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<키워드>" --stack react-native`
- 앱 UI를 넘기기 전에 `.claude/skills/ui-ux-pro-max/references/pro-rules.md`의 점검표를 확인한다. 핵심:
  - 메뉴·설정·탭 같은 **구조 아이콘에 이모지를 쓰지 않는다** (벡터 아이콘 사용)
  - 터치 영역 최소 **iOS 44pt / Android 48dp**, 누르면 80~150ms 안에 반응
  - 본문 글자 대비 **4.5:1 이상** (라이트·다크 모두), 색은 화면별 하드코딩 대신 **의미 토큰**으로
  - 고정 헤더·탭 바는 **안전 영역**을 지키고, 간격은 4/8 단위로 맞춘다

### 11.3 디자인 점검 명령
```
hallmark audit ./landing
```

### 11.4 web-design-guidelines
웹 페이지(지원·개인정보처리방침 페이지, 시안 HTML 등)에 적용한다.
- Icon-only buttons need `aria-label`
- Form controls need `<label>` or `aria-label`
- Inputs need `autocomplete` and a meaningful `name`
- Never `outline: none` without a focus replacement
- Use `:focus-visible` over `:focus`

앱(React Native)에서는 같은 원칙을 이렇게 옮긴다.
- 아이콘만 있는 버튼 → `accessibilityLabel` + `accessibilityRole="button"`
- 입력칸 → 보이는 라벨 또는 `accessibilityLabel`, 알맞은 `autoComplete`·`textContentType`·`keyboardType`
- 포커스·선택 상태는 색만이 아니라 테두리·굵기 등 모양으로도 구분한다
