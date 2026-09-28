/**
 * 할 일·루틴 전역 상태 — Zustand store
 *
 * 두 날짜를 동시에 관리한다.
 * - today*    : 홈 '오늘 할 일' (항상 오늘 날짜)
 * - selected* : 일정 탭 달력에서 고른 날짜 (다른 날짜의 할 일을 추가·확인할 때)
 * 추가·체크·삭제 후에는 두 목록을 모두 다시 읽는다. 로컬 SQLite라 충분히 빠르고,
 * 같은 날짜를 두 화면이 동시에 보고 있어도 상태가 어긋나지 않는다.
 */

import { create } from "zustand";
import {
  addRoutine,
  deleteRoutine,
  getRoutinesForDate,
  setRoutineDone,
  updateRoutine,
  type RoutineForDate,
} from "@/src/db/routine";
import {
  addTodo,
  deleteTodo,
  getTodosByDate,
  setTodoImportant,
  toggleTodo,
  type TodoItem,
} from "@/src/db/todo";
import { todayString } from "@/src/utils/date";

// ── 상태 타입 ──────────────────────────────────────────────────

interface TodoState {
  todos: TodoItem[];               // 오늘 할 일
  routines: RoutineForDate[];      // 오늘 해당하는 루틴
  isLoaded: boolean;

  selectedDate: string | null;     // 달력에서 보고 있는 날짜
  selectedTodos: TodoItem[];
  selectedRoutines: RoutineForDate[];

  load: () => Promise<void>;
  loadDate: (date: string) => Promise<void>;
  add: (title: string, date?: string) => Promise<void>;
  toggle: (id: number, done: boolean) => Promise<void>;
  setImportant: (id: number, important: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;

  addRoutine: (title: string, weekdays: string) => Promise<void>;
  toggleRoutine: (id: number, date: string, done: boolean) => Promise<void>;
  setRoutineImportant: (id: number, important: boolean) => Promise<void>;
  updateRoutineDays: (id: number, weekdays: string) => Promise<void>;
  removeRoutine: (id: number) => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────

export const useTodoStore = create<TodoState>((set, get) => {
  /** 오늘 목록과 (선택된 경우) 달력 날짜 목록을 함께 다시 읽는다 */
  const refresh = async () => {
    const today = todayString();
    const { selectedDate } = get();
    const [todos, routines] = await Promise.all([getTodosByDate(today), getRoutinesForDate(today)]);
    if (selectedDate) {
      const [selectedTodos, selectedRoutines] = await Promise.all([
        getTodosByDate(selectedDate),
        getRoutinesForDate(selectedDate),
      ]);
      set({ todos, routines, selectedTodos, selectedRoutines, isLoaded: true });
    } else {
      set({ todos, routines, isLoaded: true });
    }
  };

  return {
    todos: [],
    routines: [],
    isLoaded: false,
    selectedDate: null,
    selectedTodos: [],
    selectedRoutines: [],

    /** 오늘 목록을 불러온다 (날짜가 바뀐 뒤 복귀했을 때도 호출) */
    load: refresh,

    /** 달력에서 날짜를 고르면 그날의 할 일·루틴을 불러온다 */
    loadDate: async (date) => {
      set({ selectedDate: date });
      await refresh();
    },

    /** 할 일을 추가한다. 날짜를 주지 않으면 오늘 */
    add: async (title, date) => {
      if (!title.trim()) return;
      await addTodo({ title, date: date ?? todayString() });
      await refresh();
    },

    toggle: async (id, done) => {
      await toggleTodo(id, done);
      await refresh();
    },

    setImportant: async (id, important) => {
      await setTodoImportant(id, important);
      await refresh();
    },

    remove: async (id) => {
      await deleteTodo(id);
      await refresh();
    },

    /** 루틴은 만든 날부터 표시한다 (과거 날짜에 갑자기 나타나지 않게) */
    addRoutine: async (title, weekdays) => {
      if (!title.trim() || !weekdays.includes("1")) return;
      await addRoutine(title, weekdays, todayString());
      await refresh();
    },

    toggleRoutine: async (id, date, done) => {
      await setRoutineDone(id, date, done);
      await refresh();
    },

    setRoutineImportant: async (id, important) => {
      await updateRoutine(id, { important });
      await refresh();
    },

    updateRoutineDays: async (id, weekdays) => {
      if (!weekdays.includes("1")) return;
      await updateRoutine(id, { weekdays });
      await refresh();
    },

    removeRoutine: async (id) => {
      await deleteRoutine(id);
      await refresh();
    },
  };
});
