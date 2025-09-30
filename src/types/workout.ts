export type WeightUnit = 'kg' | 'lb'

export interface WorkoutSet {
  id: string
  weight: number
  unit: WeightUnit
  reps: number
  note?: string
}

export interface WorkoutEntry {
  id: string
  exerciseId: string
  note?: string
  sets: WorkoutSet[]
}

export interface WorkoutSession {
  id: string
  date: string
  note?: string
  entries: WorkoutEntry[]
  createdAt: string
  updatedAt: string
}

export interface ExerciseDefinition {
  id: string
  name: string
  bodyPart: string
  createdAt: string
  updatedAt: string
}

export interface DraftWorkoutSet {
  id?: string
  weight: number
  unit: WeightUnit
  reps: number
  note?: string
}

export interface DraftWorkoutEntry {
  id?: string
  exerciseId: string
  note?: string
  sets: DraftWorkoutSet[]
}

export interface DraftWorkoutSession {
  id?: string
  date: string
  note?: string
  entries: DraftWorkoutEntry[]
}

export interface CreateExercisePayload {
  name: string
  bodyPart: string
}

export interface CalendarDaySummary {
  date: string
  hasWorkout: boolean
  bodyParts: string[]
  sessionId?: string
}

export interface HydrationPayload {
  exercises: ExerciseDefinition[]
  sessions: WorkoutSession[]
}
