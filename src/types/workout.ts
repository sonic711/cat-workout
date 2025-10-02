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
  createdAt: string
  updatedAt: string
  nutrition?: DailyNutrition
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
}

export interface CreateExercisePayload {
  name: string
  bodyPart: string
}

export interface UpdateExercisePayload extends CreateExercisePayload {
  id: string
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
