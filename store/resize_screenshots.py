"""
스토어 제출용 스크린샷 변환 스크립트

사용법 (C:\\dev\\haru 에서):
    uv run --no-project --with pillow python store/resize_screenshots.py

입력:  store/screenshots/원본/  에 아이폰 캡처(PNG/JPG)를 넣는다.
출력:  store/screenshots/ios_6.9/   → App Store 6.9인치 칸 (1290×2796)
       store/screenshots/android/   → Google Play 휴대전화 스크린샷

왜 변환이 필요한가:
- 아이폰 16/15 기본 모델 캡처는 1179×2556(6.1인치)인데, App Store는 6.9인치(또는 6.5인치) 크기를 요구한다.
  두 크기는 가로세로 비율이 거의 같아서(0.4613 vs 0.4614) 확대만 하면 화면이 찌그러지지 않는다.
- Google Play는 "긴 변이 짧은 변의 2배를 넘으면 안 된다" 규칙이 있다. 1179×2556은 2.17배라 거절되므로,
  양옆에 화면 배경색 여백을 붙여 정확히 1:2 비율로 맞춘다. 잘라내기가 아니라 여백이라 내용 손실이 없다.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent / "screenshots"
SRC = ROOT / "원본"
IOS_OUT = ROOT / "ios_6.9"
ANDROID_OUT = ROOT / "android"

IOS_SIZE = (1290, 2796)  # App Store Connect 6.9인치 허용 크기 중 하나
EXTS = {".png", ".jpg", ".jpeg"}


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


def main() -> None:
    # Windows 콘솔 기본 인코딩(cp949)에서 한글 안내 문구가 깨지지 않도록 UTF-8로 출력
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    files =sorted(p for p in SRC.iterdir() if p.suffix.lower() in EXTS) if SRC.exists() else []
    if not files:
        print(f"'{SRC}' 폴더에 캡처 이미지를 넣은 뒤 다시 실행하세요.")
        return

    IOS_OUT.mkdir(parents=True, exist_ok=True)
    ANDROID_OUT.mkdir(parents=True, exist_ok=True)

    for i, path in enumerate(files, start=1):
        # PNG의 투명 채널·JPG의 CMYK 등을 RGB로 통일 — 스토어는 알파 없는 이미지를 권장한다
        img = Image.open(path).convert("RGB")
        name = f"{i:02d}_{path.stem}.png"
        fit_with_padding(img, IOS_SIZE).save(IOS_OUT / name)
        android = to_android(img)
        android.save(ANDROID_OUT / name)
        print(f"{path.name}  {img.size} → iOS {IOS_SIZE} / Android {android.size}")

    print(f"\n완료: {len(files)}장. 파일명 앞 번호 순서대로 스토어에 올리면 됩니다.")


if __name__ == "__main__":
    main()
