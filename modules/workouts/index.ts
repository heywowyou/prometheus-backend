import workoutRoutes from "./workout.routes";

export { workoutRoutes };
export { EXERCISE_KINDS, MUSCLE_GROUPS } from "./exercise.model";
export { SESSION_STATUSES } from "./workout-session.model";
export { PR_TYPES } from "./workout.metrics";
export type { IExercise, ExerciseKind, MuscleGroup } from "./exercise.model";
export type { IRoutine, RoutineExercise } from "./routine.model";
export type {
  IWorkoutSession,
  SessionEntry,
  SessionSet,
  SessionStatus,
} from "./workout-session.model";
export type { ExerciseMetrics, PersonalRecords, PrType } from "./workout.metrics";
export type { ExerciseProgress, WorkoutHistory, WorkoutSummary } from "./progress.service";
