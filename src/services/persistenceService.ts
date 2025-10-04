import type {
  ExerciseDefinition,
  HydrationPayload,
  WorkoutSession,
  CreateExercisePayload,
  UpdateExercisePayload,
} from '@/types/workout'

export interface PersistenceService {
  loadHydration(): Promise<HydrationPayload | null>
  createExercise(payload: CreateExercisePayload): Promise<ExerciseDefinition>
  updateExercise(payload: UpdateExercisePayload): Promise<ExerciseDefinition>
  deleteExercise(exerciseId: string): Promise<void>
  saveSessions(sessions: WorkoutSession[]): Promise<void>
  clear(): Promise<void>
}

export interface PersistenceOptions {
  enableLogging?: boolean
}

export interface PersistenceContext {
  now(): string
}

export const defaultPersistenceContext: PersistenceContext = {
  now: () => new Date().toISOString(),
}

export const createNotImplementedService = (): PersistenceService => {
  const notImplemented = (method: string) =>
    Promise.reject(new Error(`Persistence service method "${method}" is not implemented yet.`))

  return {
    loadHydration: () => notImplemented('loadHydration'),
    createExercise: () => notImplemented('createExercise'),
    updateExercise: () => notImplemented('updateExercise'),
    deleteExercise: () => notImplemented('deleteExercise'),
    saveSessions: () => notImplemented('saveSessions'),
    clear: () => notImplemented('clear'),
  }
}
