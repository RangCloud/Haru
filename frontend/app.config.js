// app.config.js — 동적 설정 레이어
//
// app.json(정적 기반)을 읽어 필요한 값만 런타임 환경변수로 교체한다.
// 현재는 pass-through 역할만 하며, EAS projectId 등은 app.json에 자동 기록된다.
//
// 카카오 nativeAppKey는 APK에 내장되는 값으로 역공학으로 노출되므로
// app.json에 직접 기록한다(실제 시크릿이 아님).
// Google/Naver 키처럼 런타임에 접근하는 값만 .env.local / EAS Secret으로 관리한다.

module.exports = ({ config }) => config;
