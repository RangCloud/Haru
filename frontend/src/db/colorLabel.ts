/**
 * 일정 색상별 이름(카테고리) DB 레이어
 *
 * 사용자가 색상마다 이름을 붙일 수 있다 (예: 파랑 = 회사, 노랑 = 약속).
 * 일정 자체에는 색상만 저장하므로, 이름을 바꾸면 그 색상의 모든 일정에 바로 반영된다.
 */

import { getDatabase } from "./database";

/** { '#3B82F6': '회사', ... } */
export type ColorLabels = Record<string, string>;

export async function getColorLabels(): Promise<ColorLabels> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ color: string; label: string }>("SELECT color, label FROM color_labels");
  return Object.fromEntries(rows.map((r) => [r.color, r.label]));
}

/** 이름을 저장한다. 빈 문자열이면 이름을 지운다 */
export async function setColorLabel(color: string, label: string): Promise<void> {
  const db = await getDatabase();
  const trimmed = label.trim();
  if (trimmed) {
    await db.runAsync(
      "INSERT INTO color_labels (color, label) VALUES (?, ?) ON CONFLICT(color) DO UPDATE SET label = excluded.label",
      [color, trimmed],
    );
  } else {
    await db.runAsync("DELETE FROM color_labels WHERE color = ?", [color]);
  }
}
