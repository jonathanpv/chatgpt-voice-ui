export type TodoItem = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
};

const STORAGE_KEY = "biblechat.todo.items";

function readTodos(): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TodoItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeTodos(items: TodoItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getTodoItems(): TodoItem[] {
  return readTodos();
}

export function addTodoItem(text: string): TodoItem[] {
  const next: TodoItem = {
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    completed: false,
    createdAt: Date.now(),
  };
  const items = [...readTodos(), next];
  writeTodos(items);
  return items;
}

export function toggleTodoItem(id: string, completed?: boolean): TodoItem[] {
  const items = readTodos().map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      completed: completed ?? !item.completed,
    };
  });
  writeTodos(items);
  return items;
}

export function replaceTodoItems(items: TodoItem[]): TodoItem[] {
  const normalized = items.map((item) => ({
    id: item.id,
    text: item.text,
    completed: Boolean(item.completed),
    createdAt: item.createdAt ?? Date.now(),
  }));
  writeTodos(normalized);
  return normalized;
}
