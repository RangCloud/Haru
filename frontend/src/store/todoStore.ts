/**
 * 투두리스트 전역 상태 — Zustand store
 *
 * - 오늘 날짜 기준으로 투두를 로드·관리한다
 * - 추가/토글/삭제 후 즉시 DB를 갱신하고 상태를 동기화한다
 */

import { create } from "zustand";
import {
  addTodo,
  deleteTodo,
  getTodosByDate,
  toggleTodo,
  type TodoItem,
} from "@/src/db/todo";

// ── 오늘 날짜 문자열 ──────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── 상태 타입 ──────────────────────────────────────────────────

interface TodoState {
  todos: TodoItem[];
  isLoaded: boolean;

  load: () => Promise<void>;
  add: (title: string) => Promise<void>;
  toggle: (id: number, done: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  isLoaded: false,

  /** 오늘 날짜의 투두 목록을 DB에서 불러온다 */
  load: async () => {
    const todos = await getTodosByDate(todayString());
    set({ todos, isLoaded: true });
  },

  /** 투두를 추가하고 목록을 갱신한다 */
  add: async (title) => {
    if (!title.trim()) return;
    await addTodo({ title, date: todayString() });
    const todos = await getTodosByDate(todayString());
    set({ todos });
  },

  /** 완료 여부를 토글하고 목록을 갱신한다 */
  toggle: async (id, done) => {
    await toggleTodo(id, done);
    set({ todos: get().todos.map((t) => t.id === id ? { ...t, done } : t) });
  },

  /** 투두를 삭제하고 목록을 갱신한다 */
  remove: async (id) => {
    await deleteTodo(id);
    set({ todos: get().todos.filter((t) => t.id !== id) });
  },
}));
