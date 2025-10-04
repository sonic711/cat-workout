export type ExerciseCategory = 'strength' | 'cardio'

export type WeightUnit = 'kg' | 'lb'

export type MealType = 'breakfast' | 'lunch' | 'dinner'

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
  durationMinutes?: number
}

export interface NutritionItem {
  id: string
  name: string
  calories: number
  note?: string
  mealType: MealType
}

export interface DailyNutrition {
  meals: Record<MealType, NutritionItem[]>
  waterIntakeMl: number
}

export interface WorkoutSession {
  id: string
  date: string
  note?: string
  entries: WorkoutEntry[]
  bodyWeightKg?: number
  createdAt: string
  updatedAt: string
  nutrition?: DailyNutrition
  isCoachSession?: boolean
}

export interface ExerciseDefinition {
  id: string
  name: string
  category: ExerciseCategory
  bodyPart?: string
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
  durationMinutes?: number
  draftKey?: string
  categoryHint?: ExerciseCategory
}

export interface DraftNutritionItem {
  id?: string
  name: string
  calories: number
  note?: string
  mealType: MealType
}

export interface DraftDailyNutrition {
  meals: Record<MealType, DraftNutritionItem[]>
  waterIntakeMl: number
}

export interface DraftWorkoutSession {
  id?: string
  date: string
  note?: string
  entries: DraftWorkoutEntry[]
  nutrition?: DraftDailyNutrition
  isCoachSession?: boolean
  bodyWeightKg?: number | null
}

export interface CreateExercisePayload {
  name: string
  category: ExerciseCategory
  bodyPart?: string
}

export interface UpdateExercisePayload extends CreateExercisePayload {
  id: string
}

export interface CalendarDaySummary {
  date: string
  hasWorkout: boolean
  bodyParts: string[]
  sessionId?: string
  isCoachSession?: boolean
}

export interface HydrationPayload {
  exercises: ExerciseDefinition[]
  sessions: WorkoutSession[]
}
