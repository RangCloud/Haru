/**
 * withHaruWidget — iOS 홈 화면 위젯 Extension 자동 설정 플러그인
 *
 * 역할:
 *   1. HaruWidget Extension 타겟을 Xcode 프로젝트에 추가한다.
 *   2. 앱·위젯 양쪽에 App Groups 엔타이틀먼트를 추가한다.
 *   3. 위젯의 Info.plist, .entitlements 파일을 생성한다.
 *   4. Swift 소스 파일을 빌드 타겟에 연결한다.
 *
 * 실행 시점:
 *   EAS Build의 macOS 서버 또는 로컬 Mac에서 `npx expo prebuild`를 실행할 때.
 *   Windows에서는 EAS Build가 대신 처리하므로 별도 Mac이 필요 없다.
 *
 * 사용법 (app.json):
 *   "plugins": [ ..., "./plugins/withHaruWidget" ]
 */

const { withXcodeProject, withEntitlementsPlist, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── 상수 ────────────────────────────────────────────────────────
const WIDGET_NAME    = 'HaruWidget';
const APP_GROUP      = 'group.com.rangcloud.haru';
const WIDGET_BUNDLE  = 'com.rangcloud.haru.HaruWidget';
const DEPLOY_TARGET  = '16.0';   // iOS 최소 지원 버전 (WidgetKit)
const SWIFT_VERSION  = '5.0';
const SWIFT_FILES    = [
  'HaruWidget.swift',
  'HaruWidgetBundle.swift',
  'HaruWidgetModels.swift',
  'HaruWidgetView.swift',
];

// ── 지원 파일 콘텐츠 ─────────────────────────────────────────────

/**
 * 위젯 Extension의 Info.plist.
 * NSExtensionPointIdentifier = com.apple.widgetkit-extension 이 필수.
 */
const WIDGET_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;

/** 위젯 Extension의 App Groups 엔타이틀먼트. */
const widgetEntitlements = (appGroup) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`;

// ── Xcode 프로젝트 수정 함수 ─────────────────────────────────────

/**
 * xcode 패키지의 `project` 객체를 사용해 위젯 Extension 타겟을 추가한다.
 *
 * @param {import('xcode').XcodeProject} xcodeProject
 * @param {string} platformProjectRoot  ios/ 디렉터리 절대 경로
 * @param {string} mainTargetName       메인 앱 타겟명 (보통 'haru')
 */
function addWidgetTargetToProject(xcodeProject, platformProjectRoot, mainTargetName) {
  // ── 1) 이미 추가된 경우 스킵 ─────────────────────────────────
  const existingTargets = xcodeProject.pbxNativeTargetSection();
  const alreadyAdded = Object.values(existingTargets).some(
    (t) => t && typeof t === 'object' && t.name === WIDGET_NAME
  );
  if (alreadyAdded) {
    console.log(`[withHaruWidget] '${WIDGET_NAME}' 타겟 이미 존재 — 건너뜀`);
    return;
  }

  // ── 2) 위젯 디렉터리에 지원 파일 생성 ────────────────────────
  const widgetDir = path.join(platformProjectRoot, WIDGET_NAME);
  if (!fs.existsSync(widgetDir)) {
    fs.mkdirSync(widgetDir, { recursive: true });
  }

  const infoPlistPath = path.join(widgetDir, 'Info.plist');
  if (!fs.existsSync(infoPlistPath)) {
    fs.writeFileSync(infoPlistPath, WIDGET_INFO_PLIST, 'utf8');
  }

  const entitlementsPath = path.join(widgetDir, `${WIDGET_NAME}.entitlements`);
  if (!fs.existsSync(entitlementsPath)) {
    fs.writeFileSync(entitlementsPath, widgetEntitlements(APP_GROUP), 'utf8');
  }

  // ── 3) 위젯 Extension 타겟 추가 ──────────────────────────────
  // addTarget: (targetName, targetType, subFolder, bundleId)
  // 'app_extension' = com.apple.product-type.app-extension
  const widgetTarget = xcodeProject.addTarget(
    WIDGET_NAME,
    'app_extension',
    WIDGET_NAME,
    WIDGET_BUNDLE
  );

  if (!widgetTarget) {
    console.error('[withHaruWidget] addTarget 실패');
    return;
  }

  const widgetTargetUuid = widgetTarget.uuid;

  // ── 4) 위젯 그룹 + Swift 소스 파일 추가 ─────────────────────
  // 위젯 디렉터리를 Xcode 그룹으로 등록
  xcodeProject.addPbxGroup(SWIFT_FILES, WIDGET_NAME, WIDGET_NAME);

  // 각 Swift 파일을 소스 빌드 페이즈에 추가
  SWIFT_FILES.forEach((file) => {
    xcodeProject.addSourceFile(
      `${WIDGET_NAME}/${file}`,
      { target: widgetTargetUuid },
      widgetTargetUuid
    );
  });

  // ── 5) Info.plist, entitlements 파일을 프로젝트에 참조 추가 ─
  xcodeProject.addResourceFile(
    `${WIDGET_NAME}/Info.plist`,
    { target: widgetTargetUuid },
    widgetTargetUuid
  );

  // ── 6) 위젯 타겟의 빌드 설정 구성 ───────────────────────────
  // Xcode 14부터 Extension 타겟도 DEVELOPMENT_TEAM을 명시해야 한다.
  // EAS Secret(APPLE_TEAM_ID)에서 팀 ID를 읽어 빌드 설정에 주입한다.
  const teamId = process.env.APPLE_TEAM_ID || '';

  // 위젯 타겟의 빌드 구성 UUID 목록을 추출해 해당 타겟에만 설정 적용
  const nativeTargets = xcodeProject.pbxNativeTargetSection();
  let widgetConfigListUuid;
  for (const target of Object.values(nativeTargets)) {
    if (target && typeof target === 'object' && target.name === WIDGET_NAME) {
      widgetConfigListUuid = target.buildConfigurationList;
      break;
    }
  }

  if (widgetConfigListUuid) {
    const configLists = xcodeProject.pbxXCConfigurationListSection();
    const widgetConfigList = configLists[widgetConfigListUuid];
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();

    // 위젯 타겟의 각 빌드 구성(Debug/Release)에만 설정 추가
    (widgetConfigList.buildConfigurations || []).forEach(({ value: uuid }) => {
      const cfg = buildConfigs[uuid];
      if (!cfg || !cfg.buildSettings) return;
      cfg.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY_TARGET;
      cfg.buildSettings['SWIFT_VERSION'] = SWIFT_VERSION;
      cfg.buildSettings['PRODUCT_BUNDLE_IDENTIFIER'] = `"${WIDGET_BUNDLE}"`;
      cfg.buildSettings['SKIP_INSTALL'] = 'YES';
      cfg.buildSettings['SWIFT_EMIT_LOC_STRINGS'] = 'YES';
      cfg.buildSettings['INFOPLIST_FILE'] = `"${WIDGET_NAME}/Info.plist"`;
      cfg.buildSettings['CODE_SIGN_ENTITLEMENTS'] =
        `"${WIDGET_NAME}/${WIDGET_NAME}.entitlements"`;
      // Xcode 14 필수: Extension 타겟에 팀 ID 명시
      if (teamId) cfg.buildSettings['DEVELOPMENT_TEAM'] = teamId;
    });
  }

  // ── 7) 메인 앱 타겟에 위젯 의존성 + Embed Extension 추가 ─────
  // 메인 타겟에서 "Embed Foundation Extensions" copy phase가 없으면 자동 생성됨
  xcodeProject.addBuildPhase(
    [`${WIDGET_NAME}/${WIDGET_NAME}.appex`],
    'PBXCopyFilesBuildPhase',
    'Embed Foundation Extensions',
    xcodeProject.findTargetKey(mainTargetName),
    'wrapper.app-extension'
  );

  console.log(`[withHaruWidget] '${WIDGET_NAME}' Extension 타겟 추가 완료`);
}

// ── 플러그인 함수 ────────────────────────────────────────────────

/**
 * Expo Config Plugin 진입점.
 * app.json의 "plugins" 배열에 "./plugins/withHaruWidget" 을 추가하면 자동 실행된다.
 */
function withHaruWidget(config) {
  // 1) 메인 앱 타겟의 entitlements에 App Groups 추가
  //    (app.json의 ios.entitlements와 병합됨)
  config = withEntitlementsPlist(config, (mod) => {
    const groups = mod.modResults['com.apple.security.application-groups'];
    if (!Array.isArray(groups)) {
      mod.modResults['com.apple.security.application-groups'] = [APP_GROUP];
    } else if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    return mod;
  });

  // 2) Podfile에 리소스 번들 서명 우회 훅 추가
  //    Xcode 14부터 CocoaPods 리소스 번들 타겟에도 서명이 요구된다.
  //    post_install 훅으로 번들 타겟의 CODE_SIGNING_ALLOWED를 NO로 설정해 우회한다.
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const podfilePath = require('path').join(
        mod.modRequest.platformProjectRoot,
        'Podfile',
      );
      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, 'utf8');
        const FIX_MARKER = '# [withHaruWidget] Xcode14 resource bundle signing fix';
        if (!podfile.includes(FIX_MARKER)) {
          const hook = `\n  ${FIX_MARKER}\n` +
            `  installer.pods_project.targets.each do |target|\n` +
            `    if target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"\n` +
            `      target.build_configurations.each do |cfg|\n` +
            `        cfg.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'\n` +
            `      end\n` +
            `    end\n` +
            `  end\n`;
          // post_install 블록이 있으면 그 안에 삽입, 없으면 블록 자체를 추가
          if (podfile.includes('post_install do |installer|')) {
            podfile = podfile.replace(
              'post_install do |installer|',
              `post_install do |installer|${hook}`,
            );
          } else {
            podfile += `\npost_install do |installer|${hook}end\n`;
          }
          fs.writeFileSync(podfilePath, podfile, 'utf8');
          console.log('[withHaruWidget] Podfile 리소스 번들 서명 우회 훅 추가 완료');
        }
      }
      return mod;
    },
  ]);

  // 3) Xcode 프로젝트에 위젯 Extension 타겟 추가
  config = withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const platformProjectRoot = mod.modRequest.platformProjectRoot; // .../ios/

    // 메인 앱 타겟명 결정 (프로젝트명과 동일)
    const projectName = mod.modRequest.projectName || 'haru';

    try {
      addWidgetTargetToProject(xcodeProject, platformProjectRoot, projectName);
    } catch (e) {
      console.error('[withHaruWidget] Xcode 프로젝트 수정 중 오류:', e.message);
    }

    return mod;
  });

  return config;
}

module.exports = withHaruWidget;
