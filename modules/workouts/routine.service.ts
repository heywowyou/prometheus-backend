import { Types } from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError";
import Exercise from "./exercise.model";
import Routine, { DEFAULT_REST_SEC, type RoutineDoc } from "./routine.model";

export interface RoutineExerciseInput {
  exerciseId: string;
  sets: number;
  targetReps?: number;
  targetWeightKg?: number;
  targetDurationSec?: number;
  targetDistanceM?: number;
  restSec?: number;
}

export interface RoutineInput {
  name?: string;
  notes?: string;
  exercises?: RoutineExerciseInput[];
}

export const findOwnedRoutine = async (id: string, userId: string): Promise<RoutineDoc> => {
  const routine = await Routine.findById(id);
  if (!routine) throw new NotFoundError("Routine");
  if (routine.userId !== userId) throw new ForbiddenError();
  return routine;
};

/** Every referenced exercise must exist and belong to the user. */
const toRoutineExercises = async (input: RoutineExerciseInput[], userId: string) => {
  const ids = [...new Set(input.map((e) => e.exerciseId))];
  if (!ids.every((id) => Types.ObjectId.isValid(id))) {
    throw new BadRequestError("exercises contain an invalid exerciseId");
  }
  const owned = await Exercise.countDocuments({ _id: { $in: ids }, userId });
  if (owned !== ids.length) throw new NotFoundError("Exercise");

  return input.map((e) => ({
    exerciseId: new Types.ObjectId(e.exerciseId),
    sets: e.sets,
    targetReps: e.targetReps,
    targetWeightKg: e.targetWeightKg,
    targetDurationSec: e.targetDurationSec,
    targetDistanceM: e.targetDistanceM,
    restSec: e.restSec ?? DEFAULT_REST_SEC,
  }));
};

export const listRoutines = async (userId: string): Promise<RoutineDoc[]> =>
  Routine.find({ userId }).sort({ order: 1, createdAt: 1 });

export const getRoutine = (id: string, userId: string): Promise<RoutineDoc> =>
  findOwnedRoutine(id, userId);

export const createRoutine = async (input: RoutineInput, userId: string): Promise<RoutineDoc> => {
  if (!input.name) throw new BadRequestError("name is required");
  const last = await Routine.findOne({ userId }).sort({ order: -1 }).select("order");

  return Routine.create({
    userId,
    name: input.name,
    notes: input.notes || undefined,
    order: (last?.order ?? -1) + 1,
    exercises: await toRoutineExercises(input.exercises ?? [], userId),
  });
};

export const updateRoutine = async (
  id: string,
  userId: string,
  input: RoutineInput,
): Promise<RoutineDoc> => {
  const routine = await findOwnedRoutine(id, userId);
  if (input.name !== undefined) {
    if (!input.name) throw new BadRequestError("name is required");
    routine.name = input.name;
  }
  if (input.notes !== undefined) routine.notes = input.notes || undefined;
  if (input.exercises !== undefined) {
    routine.set("exercises", await toRoutineExercises(input.exercises, userId));
  }
  return routine.save();
};

export const reorderRoutines = async (userId: string, ids: string[]): Promise<void> => {
  const owned = await Routine.countDocuments({ _id: { $in: ids }, userId });
  if (owned !== ids.length) throw new NotFoundError("Routine");

  await Routine.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id, userId }, update: { $set: { order: index } } },
    })),
  );
};

export const deleteRoutine = async (id: string, userId: string): Promise<{ id: string }> => {
  const routine = await findOwnedRoutine(id, userId);
  await routine.deleteOne();
  return { id };
};
