import type {
  ExerciseDefinition,
  HydrationPayload,
  WorkoutSession,
} from '@/types/workout'

export interface PersistenceService {
  loadHydration(): Promise<HydrationPayload | null>
  saveExercises(exercises: ExerciseDefinition[]): Promise<void>
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
    saveExercises: () => notImplemented('saveExercises'),
    saveSessions: () => notImplemented('saveSessions'),
    clear: () => notImplemented('clear'),
  }
}
