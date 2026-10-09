/**
 * 기기 캘린더 일정 → 하루 일정 변환 (순수 계산)
 *
 * 삼성 캘린더·Google 캘린더·iPhone 캘린더 앱은 일정을 폰의 공용 캘린더 저장소에 둔다.
 * 그 저장소에서 읽은 일정 한 건을 하루의 일정 형식으로 바꾸는 규칙만 여기에 모았다.
 * 기기 API·DB에 의존하지 않아 날짜 경계 같은 까다로운 경우를 따로 검증할 수 있다.
 *
 * 일정은 폰 안에서만 복사되고 서버로 보내지 않는다 (CLAUDE.md §4 로컬 우선).
 */

import { toDateStr } from "@/src/utils/date";
import { nearestScheduleColor } from "@/src/utils/scheduleColors";

/** 기기 캘린더에서 읽은 일정 중 변환에 필요한 부분 */
export interface DeviceEvent {
  id: string;
  title?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay: boolean;
  notes?: string | null;
}

/** 하루 DB에 넣을 형태 */
export interface ImportedSchedule {
  title: string;
  date: string;       // 시작일 YYYY-MM-DD
  end_date: string;   // 마지막 날, 하루짜리면 ""
  time: string;       // HH:MM, 종일이면 ""
  end_time: string;   // HH:MM, 없으면 ""
  note: string;
  color: string;
  /** 같은 일정을 두 번 가져오지 않기 위한 표식 — 기기 일정 ID + 시작 시각 */
  source_id: string;
}

export type ImportPlatform = "android" | "ios";

const NOTE_MAX = 500;   // 메모가 지나치게 긴 일정(초대장 본문 등)은 앞부분만 가져온다

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 날짜를 YYYY-MM-DD로.
 * useUtc: 종일 일정을 Android에서 읽을 때만 true (아래 toSchedule 설명 참고).
 */
function dateOf(d: Date, useUtc: boolean): string {
  return useUtc
    ? toDateStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    : toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * 기기 일정 한 건을 하루 일정으로 바꾼다. 날짜를 읽을 수 없으면 null.
 *
 * 종일 일정의 날짜 처리가 플랫폼마다 다르다.
 * - Android: 종일 일정은 "UTC 자정 ~ 다음 날 UTC 자정"으로 저장된다.
 *   이를 한국 시간으로 읽으면 오전 9시 ~ 다음 날 오전 9시가 되어 이틀짜리 일정처럼 보이므로,
 *   UTC 기준 날짜를 그대로 쓴다.
 * - iOS: 종일 일정은 기기 시간대의 자정 ~ 그날 23:59:59로 온다. 기기 시간대 기준 날짜를 쓴다.
 * 끝 시각은 대개 "그 순간 직전까지"라는 뜻이라, 1밀리초를 빼고 날짜를 구해야 마지막 날이 하루 밀리지 않는다.
 */
export function toSchedule(event: DeviceEvent, calendarColor: string | null | undefined, platform: ImportPlatform): ImportedSchedule | null {
  const start = new Date(event.startDate);
  const rawEnd = new Date(event.endDate);
  if (Number.isNaN(start.getTime())) return null;
  // 끝 시각이 없거나 시작보다 앞서면 시작 시각 하나짜리 일정으로 본다
  const end = Number.isNaN(rawEnd.getTime()) || rawEnd < start ? start : rawEnd;
  const lastMoment = end > start ? new Date(end.getTime() - 1) : start;

  const useUtc = event.allDay && platform === "android";
  const date = dateOf(start, useUtc);
  const lastDate = dateOf(lastMoment, useUtc);

  let time = "";
  let endTime = "";
  if (!event.allDay) {
    time = timeOf(start);
    if (end > start) {
      // 자정에 딱 끝나는 일정(22:00~00:00)은 마지막 날이 시작일과 같다. 끝 시각을 00:00으로 두면
      // 시작보다 앞선 시각이 되므로 그날의 마지막 분으로 적는다.
      endTime = dateOf(end, false) === lastDate ? timeOf(end) : "23:59";
    }
  }

  return {
    title: event.title?.trim() || "(제목 없음)",
    date,
    end_date: lastDate > date ? lastDate : "",
    time,
    end_time: endTime,
    note: (event.notes ?? "").trim().slice(0, NOTE_MAX),
    color: nearestScheduleColor(calendarColor),
    // 반복 일정은 회차마다 기기 ID가 같으므로 시작 시각을 붙여 회차를 구분한다
    source_id: `${platform}:${event.id}:${start.toISOString()}`,
  };
}

/** 가져올 기간 선택지 — 오늘부터 앞으로 몇 달 */
export const IMPORT_RANGES = [
  { months: 3, label: "3개월" },
  { months: 6, label: "6개월" },
  { months: 12, label: "1년" },
] as const;

// 지난 일정은 최근 한 달만 가져온다 — 오래된 일정까지 다 가져오면 달력이 과거 기록으로 가득 찬다
const PAST_MONTHS = 1;

/** 가져올 기간: 한 달 전 ~ 오늘부터 months개월 뒤 */
export function importRange(months: number, now: Date = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth() - PAST_MONTHS, now.getDate()),
    end: new Date(now.getFullYear(), now.getMonth() + months, now.getDate(), 23, 59, 59),
  };
}
