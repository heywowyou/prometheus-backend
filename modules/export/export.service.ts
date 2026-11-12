import Todo from "../todos/todo.model";
import TodoHistory from "../todos/todo-history.model";
import MediaLog from "../media/mediaLog.model";
import Note from "../notes/note.model";

/** Bumped whenever the export's shape changes, so an importer can adapt. */
export const EXPORT_VERSION = 1;

export interface DataExport {
  app: "prometheus";
  version: number;
  exportedAt: string;
  counts: Record<"todos" | "todoHistory" | "mediaLogs" | "notes", number>;
  todos: unknown[];
  todoHistory: unknown[];
  mediaLogs: unknown[];
  /** Includes archived notes and notes in the trash. */
  notes: unknown[];
}

/**
 * Everything one user owns, as plain JSON — a personal backup that doesn't
 * depend on MongoDB Atlas. Images stay in Cloudinary; their URLs are included.
 */
export const exportUserData = async (userId: string): Promise<DataExport> => {
  const projection = { __v: 0 };
  const [todos, todoHistory, mediaLogs, notes] = await Promise.all([
    Todo.find({ userId }, projection).sort({ createdAt: 1 }).lean(),
    TodoHistory.find({ userId }, projection).sort({ completedAt: 1 }).lean(),
    MediaLog.find({ userId }, projection).sort({ date: 1 }).lean(),
    // plainText/empty are derived from content on save; no need to back them up.
    Note.find({ userId }, { ...projection, plainText: 0, empty: 0 })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  return {
    app: "prometheus",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      todos: todos.length,
      todoHistory: todoHistory.length,
      mediaLogs: mediaLogs.length,
      notes: notes.length,
    },
    todos,
    todoHistory,
    mediaLogs,
    notes,
  };
};
