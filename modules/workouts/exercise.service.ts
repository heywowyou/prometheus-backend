import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../core/errors/AppError";
import Exercise, {
  toNameKey,
  type ExerciseDoc,
  type ExerciseKind,
  type MuscleGroup,
} from "./exercise.model";
import Routine from "./routine.model";
import WorkoutSession from "./workout-session.model";

export interface ExerciseInput {
  name?: string;
  kind?: ExerciseKind;
  /** `null` clears it. */
  muscleGroup?: MuscleGroup | null;
  notes?: string;
  archived?: boolean;
}

export const findOwnedExercise = async (id: string, userId: string): Promise<ExerciseDoc> => {
  const exercise = await Exercise.findById(id);
  if (!exercise) throw new NotFoundError("Exercise");
  if (exercise.userId !== userId) throw new ForbiddenError();
  return exercise;
};

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

const duplicateName = (name: string) =>
  new ConflictError("EXERCISE_EXISTS", `You already have an exercise called "${name}"`);

/**
 * Saves, refusing a name the user already has. Checked up front because the
 * unique index is built asynchronously on a new collection; the index still
 * catches a race, and its violation becomes the same readable 409.
 */
const saveExercise = async (exercise: ExerciseDoc): Promise<ExerciseDoc> => {
  const taken = await Exercise.exists({
    userId: exercise.userId,
    nameKey: toNameKey(exercise.name),
    _id: { $ne: exercise._id },
  });
  if (taken) throw duplicateName(exercise.name);
  try {
    return await exercise.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateName(exercise.name);
    throw error;
  }
};

export const listExercises = async (
  userId: string,
  opts: { archived?: boolean } = {},
): Promise<ExerciseDoc[]> =>
  Exercise.find({ userId, archived: opts.archived ?? false })
    .collation({ locale: "en", strength: 2 })
    .sort({ name: 1 });

export const createExercise = async (
  input: ExerciseInput,
  userId: string,
): Promise<ExerciseDoc> => {
  if (!input.name) throw new BadRequestError("name is required");
  if (!input.kind) throw new BadRequestError("kind is required");

  // Re-creating an archived exercise brings it back instead of failing.
  const archived = await Exercise.findOne({
    userId,
    nameKey: toNameKey(input.name),
    archived: true,
  });
  if (archived) {
    archived.archived = false;
    return saveExercise(archived);
  }

  return saveExercise(
    new Exercise({
      userId,
      name: input.name,
      kind: input.kind,
      muscleGroup: input.muscleGroup ?? undefined,
      notes: input.notes || undefined,
    }),
  );
};

const isUsed = async (exerciseId: string, userId: string): Promise<boolean> => {
  const [inSession, inRoutine] = await Promise.all([
    WorkoutSession.exists({ userId, "entries.exerciseId": exerciseId }),
    Routine.exists({ userId, "exercises.exerciseId": exerciseId }),
  ]);
  return Boolean(inSession || inRoutine);
};

export const updateExercise = async (
  id: string,
  userId: string,
  input: ExerciseInput,
): Promise<ExerciseDoc> => {
  const exercise = await findOwnedExercise(id, userId);

  if (input.kind !== undefined && input.kind !== exercise.kind) {
    // Logged sets would no longer match the exercise's fields.
    if (await WorkoutSession.exists({ userId, "entries.exerciseId": exercise._id })) {
      throw new BadRequestError("An exercise's kind can't change once it has been logged");
    }
    exercise.kind = input.kind;
  }
  if (input.name !== undefined) {
    if (!input.name) throw new BadRequestError("name is required");
    exercise.name = input.name;
  }
  if (input.muscleGroup !== undefined) exercise.muscleGroup = input.muscleGroup ?? undefined;
  if (input.notes !== undefined) exercise.notes = input.notes || undefined;
  if (input.archived !== undefined) exercise.archived = input.archived;

  return saveExercise(exercise);
};

/**
 * Deletes an exercise nothing refers to; otherwise archives it, so past
 * sessions and routines keep a valid reference.
 */
export const deleteExercise = async (
  id: string,
  userId: string,
): Promise<{ id: string; archived: boolean }> => {
  const exercise = await findOwnedExercise(id, userId);
  if (await isUsed(id, userId)) {
    exercise.archived = true;
    await exercise.save();
    return { id, archived: true };
  }
  await exercise.deleteOne();
  return { id, archived: false };
};
