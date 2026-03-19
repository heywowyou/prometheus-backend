import Note from "./note.model";

export interface NoteUpdatePayload {
  title?: string;
  content?: string;
  pinned?: boolean;
  archived?: boolean;
}

export const getNotes = async (userId: string) => {
  return Note.find({ userId, archived: false }).sort({ pinned: -1, updatedAt: -1 });
};

export const getNoteById = async (id: string, userId: string) => {
  return Note.findOne({ _id: id, userId });
};

export const createNote = async (
  data: { title: string; content?: string },
  userId: string
) => {
  return Note.create({ ...data, userId });
};

export const updateNote = async (
  id: string,
  userId: string,
  data: NoteUpdatePayload
) => {
  const note = await Note.findById(id);
  if (!note) return null;
  if (note.userId !== userId) return undefined; // signals 403

  if (data.title !== undefined) note.title = data.title;
  if (data.content !== undefined) note.content = data.content;
  if (data.pinned !== undefined) note.pinned = data.pinned;
  if (data.archived !== undefined) note.archived = data.archived;

  await note.save();
  return note;
};

export const deleteNote = async (id: string, userId: string) => {
  const note = await Note.findById(id);
  if (!note) return null;
  if (note.userId !== userId) return undefined; // signals 403
  await note.deleteOne();
  return id;
};
