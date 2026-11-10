"""
스토어 제출용 스크린샷 변환 스크립트

사용법 (C:\\dev\\haru 에서):
    uv run --no-project --with pillow python store/resize_screenshots.py

입력 (PNG/JPG):
    store/screenshots/원본/아이폰/   ← 아이폰 16 캡처 (App Store용)
    store/screenshots/원본/갤럭시/   ← 갤럭시 Z 플립5 캡처 (Google Play용)
    store/screenshots/원본/          ← (예전 방식) 바로 아래에 둔 파일은 아이폰 캡처로 취급

출력:
    store/screenshots/ios_6.1/   → App Store "iPhone with Dynamic Island (medium display)" 칸 — 현재 필수
    store/screenshots/ios_6.9/   → App Store "iPhone with Dynamic Island (large display)" 칸 — 선택(올려 두면 큰 화면에서 선명)
    store/screenshots/android/   → Google Play 휴대전화 스크린샷

왜 기기별로 나누는가:
- App Store 스크린샷은 "iOS 앱을 실제로 쓰는 화면"이어야 한다. 갤럭시 캡처(안드로이드 상태 표시줄·뒤로 가기 바)를
  App Store에 올리면 가이드라인 2.3.3(실제 사용 화면)·2.3.10(다른 플랫폼 언급 금지) 위반으로 거절될 수 있다.
- 반대로 Play에는 Android 화면이 자연스럽다. 갤럭시 캡처가 없을 때만 아이폰 캡처로 대신 만든다.

왜 변환이 필요한가:
- 2026-11 기준 Apple의 필수 칸(medium display)은 1179×2556 또는 1206×2622를 받는다.
  아이폰 16 캡처가 바로 1179×2556이라 원본 크기 그대로 쓰고, 투명 채널만 확실히 없앤다(Apple은 알파 채널 금지).
- 6.9인치 칸(1290×2796)은 비율이 거의 같아서(0.4613 vs 0.4614) 확대만 하면 찌그러지지 않는다.
- Google Play는 "긴 변이 짧은 변의 2배를 넘으면 안 된다"는 규칙이 있다.
  아이폰 1179×2556은 2.17배, 플립5 1080×2640은 2.44배라 둘 다 그대로는 거절되므로,
  양옆에 화면 배경색 여백을 붙여 정확히 1:2 비율로 맞춘다. 잘라내기가 아니라 여백이라 내용 손실이 없다.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent / "screenshots"
SRC = ROOT / "원본"
SRC_IPHONE = SRC / "아이폰"
SRC_GALAXY = SRC / "갤럭시"
IOS_61_OUT = ROOT / "ios_6.1"
IOS_69_OUT = ROOT / "ios_6.9"
ANDROID_OUT = ROOT / "android"

# Apple "medium display" 칸이 받는 세로 크기. 이 중 하나면 원본 그대로 쓰고, 아니면 첫 번째 크기에 맞춘다.
IOS_61_SIZES = [(1179, 2556), (1206, 2622)]
IOS_69_SIZE = (1290, 2796)  # App Store Connect 6.9인치 허용 크기 중 하나
EXTS = {".png", ".jpg", ".jpeg"}


def list_images(folder: Path) -> list[Path]:
    """폴더 바로 아래의 이미지 파일만 이름순으로 돌려준다(하위 폴더는 보지 않는다)."""
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in EXTS)


def edge_color(img: Image.Image) -> tuple[int, int, int]:
    """여백 색 — 화면 왼쪽 가운데 픽셀(앱 배경색)을 사용해 여백이 티 나지 않게 한다."""
    return img.getpixel((2, img.height // 2))[:3]


def fit_with_padding(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """비율을 유지한 채 size 안에 맞추고, 남는 부분은 배경색으로 채운다."""
    tw, th = size
    scale = min(tw / img.width, th / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", size, edge_color(img))
    canvas.paste(resized, ((tw - resized.width) // 2, (th - resized.height) // 2))
    return canvas


def to_ios_61(img: Image.Image) -> Image.Image:
    """필수 칸용 — 허용 크기면 그대로, 아니면(예: 다른 아이폰 기종) 1179×2556에 맞춘다."""
    if img.size in IOS_61_SIZES:
        return img
    return fit_with_padding(img, IOS_61_SIZES[0])


def to_android(img: Image.Image) -> Image.Image:
    """긴 변 ≤ 짧은 변 × 2 가 되도록 양옆(또는 위아래)에 여백을 붙인다. 크기는 원본 해상도 유지."""
    w, h = img.size
    if h > w * 2:
        new_w = (h + 1) // 2
        canvas = Image.new("RGB", (new_w, h), edge_color(img))
        canvas.paste(img, ((new_w - w) // 2, 0))
        return canvas
    if w > h * 2:
        new_h = (w + 1) // 2
        canvas = Image.new("RGB", (w, new_h), edge_color(img))
        canvas.paste(img, (0, (new_h - h) // 2))
        return canvas
    return img


def load_rgb(path: Path) -> Image.Image:
    # PNG의 투명 채널·JPG의 CMYK 등을 RGB로 통일 — 두 스토어 모두 알파 채널 없는 이미지를 요구한다
    return Image.open(path).convert("RGB")


def main() -> None:
    # Windows 콘솔 기본 인코딩(cp949)에서 한글 안내 문구가 깨지지 않도록 UTF-8로 출력
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # 아이폰 캡처: 새 폴더(원본/아이폰) + 예전 방식(원본 바로 아래) 둘 다 받는다
    iphone_files = list_images(SRC_IPHONE) + list_images(SRC)
    galaxy_files = list_images(SRC_GALAXY)
    if not iphone_files and not galaxy_files:
        print(f"'{SRC_IPHONE}' 또는 '{SRC_GALAXY}' 폴더에 캡처 이미지를 넣은 뒤 다시 실행하세요.")
        return

    # ── App Store: 아이폰 캡처만 사용 ──
    if iphone_files:
        IOS_61_OUT.mkdir(parents=True, exist_ok=True)
        IOS_69_OUT.mkdir(parents=True, exist_ok=True)
        for i, path in enumerate(iphone_files, start=1):
            img = load_rgb(path)
            name = f"{i:02d}_{path.stem}.png"
            to_ios_61(img).save(IOS_61_OUT / name)
            fit_with_padding(img, IOS_69_SIZE).save(IOS_69_OUT / name)
            print(f"[아이폰] {path.name}  {img.size} → ios_6.1 / ios_6.9 {IOS_69_SIZE}")
    else:
        print("[안내] 아이폰 캡처가 없어 App Store용 파일은 만들지 않았습니다. 갤럭시 화면은 App Store에 쓰면 안 됩니다.")

    # ── Google Play: 갤럭시 캡처 우선, 없으면 아이폰 캡처로 대신 ──
    android_src = galaxy_files or iphone_files
    if not galaxy_files:
        print("[안내] 갤럭시 캡처가 없어 아이폰 캡처로 Play용 파일을 만듭니다(상태 표시줄이 iOS 모양으로 보입니다).")
    ANDROID_OUT.mkdir(parents=True, exist_ok=True)
    for i, path in enumerate(android_src, start=1):
        img = load_rgb(path)
        name = f"{i:02d}_{path.stem}.png"
        android = to_android(img)
        android.save(ANDROID_OUT / name)
        print(f"[Play]   {path.name}  {img.size} → android {android.size}")

    print("\n완료. 파일명 앞 번호 순서대로 스토어에 올리면 됩니다.")


if __name__ == "__main__":
    main()
