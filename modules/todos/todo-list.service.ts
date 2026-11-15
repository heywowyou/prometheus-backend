import { Types } from "mongoose";
import Todo from "./todo.model";
import TodoHistory from "./todo-history.model";
import { TodoArea, TodoProject } from "./todo-list.model";
import { BadRequestError, NotFoundError } from "../../core/errors/AppError";

const assertId = (id: string, what: string) => {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError(what);
};

const plain = <T extends { _id: unknown }>(doc: T) => ({ ...doc, _id: String(doc._id) });

/** Areas and open projects, in sidebar order. */
export const getLists = async (userId: string) => {
  const [areas, projects] = await Promise.all([
    TodoArea.find({ userId }).sort({ order: 1, createdAt: 1 }).lean(),
    TodoProject.find({ userId, completedAt: null }).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  return { areas: areas.map(plain), projects: projects.map(plain) };
};

const nextOrder = async (model: typeof TodoArea | typeof TodoProject, userId: string) => {
  const last = await (model as typeof TodoArea).findOne({ userId }).sort({ order: -1 }).select({ order: 1 }).lean();
  return (last?.order ?? -1) + 1;
};

export const createArea = async (userId: string, title: string) => {
  const area = await TodoArea.create({ userId, title, order: await nextOrder(TodoArea, userId) });
  return plain(area.toObject());
};

export const updateArea = async (userId: string, id: string, input: { title?: string }) => {
  assertId(id, "Area");
  const area = await TodoArea.findOne({ _id: id, userId });
  if (!area) throw new NotFoundError("Area");
  if (input.title !== undefined) area.title = input.title;
  await area.save();
  return plain(area.toObject());
};

/** Deletes an area; its projects and tasks stay, without an area. */
export const deleteArea = async (userId: string, id: string) => {
  assertId(id, "Area");
  const area = await TodoArea.findOneAndDelete({ _id: id, userId });
  if (!area) throw new NotFoundError("Area");
  await Promise.all([
    TodoProject.updateMany({ userId, areaId: area._id }, { $set: { areaId: null } }),
    Todo.updateMany({ userId, areaId: area._id }, { $set: { areaId: null } }),
  ]);
};

export interface ProjectInput {
  title?: string;
  notes?: string;
  areaId?: string | null;
  headings?: Array<{ _id?: string; title: string }>;
  when?: string | null;
  dueDate?: string | null;
  completed?: boolean;
}

const assertArea = async (userId: string, areaId: string) => {
  assertId(areaId, "Area");
  if (!(await TodoArea.exists({ _id: areaId, userId }))) throw new NotFoundError("Area");
};

export const createProject = async (userId: string, input: ProjectInput) => {
  if (input.areaId) await assertArea(userId, input.areaId);
  const project = await TodoProject.create({
    userId,
    title: input.title ?? "",
    notes: input.notes ?? "",
    areaId: input.areaId ?? null,
    order: await nextOrder(TodoProject, userId),
  });
  return plain(project.toObject());
};

/**
 * Updates a project. Completing it completes its open tasks too (they go to
 * the Logbook with it); reopening leaves them done. Removing a heading moves
 * its tasks out of the heading.
 */
export const updateProject = async (userId: string, id: string, input: ProjectInput) => {
  assertId(id, "Project");
  const project = await TodoProject.findOne({ _id: id, userId });
  if (!project) throw new NotFoundError("Project");

  if (input.title !== undefined) project.title = input.title;
  if (input.notes !== undefined) project.notes = input.notes;
  if (input.when !== undefined) project.when = input.when;
  if (input.dueDate !== undefined) project.dueDate = input.dueDate;
  if (input.areaId !== undefined) {
    if (input.areaId) await assertArea(userId, input.areaId);
    project.areaId = input.areaId ? new Types.ObjectId(input.areaId) : null;
  }
  if (input.headings !== undefined) {
    const kept = input.headings.slice(0, 50).map((heading) => ({
      ...(heading._id && Types.ObjectId.isValid(heading._id) ? { _id: heading._id } : {}),
      title: heading.title.slice(0, 120),
    }));
    project.set("headings", kept);
    const ids = project.headings.map((heading) => heading._id);
    await Todo.updateMany(
      { userId, projectId: project._id, headingId: { $nin: [...ids, null] } },
      { $set: { headingId: null } },
    );
  }
  if (input.completed !== undefined) {
    const now = new Date();
    if (input.completed && !project.completedAt) {
      project.completedAt = now;
      await Todo.updateMany(
        { userId, projectId: project._id, recurrenceType: "none", completed: false },
        { $set: { completed: true, completedAt: now, lastCompletedAt: now, reminderAt: null } },
      );
    } else if (!input.completed) {
      project.completedAt = null;
    }
  }
  await project.save();
  return plain(project.toObject());
};

/** Deletes a project and every task in it. */
export const deleteProject = async (userId: string, id: string) => {
  assertId(id, "Project");
  const project = await TodoProject.findOneAndDelete({ _id: id, userId });
  if (!project) throw new NotFoundError("Project");
  const tasks = await Todo.find({ userId, projectId: project._id }, { _id: 1 }).lean();
  const ids = tasks.map((task) => task._id);
  await Promise.all([
    Todo.deleteMany({ _id: { $in: ids } }),
    TodoHistory.deleteMany({ todoId: { $in: ids } }),
  ]);
};

/** Sets the sidebar order of areas or of projects. */
export const reorderLists = async (userId: string, kind: "area" | "project", ids: string[]) => {
  if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new BadRequestError("ids must be valid ids");
  const model = kind === "area" ? TodoArea : TodoProject;
  const owned = await (model as typeof TodoArea).countDocuments({ _id: { $in: ids }, userId });
  if (owned !== ids.length) throw new NotFoundError(kind === "area" ? "Area" : "Project");
  await (model as typeof TodoArea).bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id, userId }, update: { $set: { order: index } } },
    })),
  );
};
