import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import type {
  DraftDailyNutrition,
  DraftNutritionItem,
  DraftWorkoutEntry,
  DraftWorkoutSession,
  DraftWorkoutSet,
  ExerciseCategory,
  ExerciseDefinition,
  MealType,
  WeightUnit,
  WorkoutSession,
} from '@/types/workout'

export type SessionDraft = DraftWorkoutSession & {
  nutrition: DraftDailyNutrition
  isCoachSession: boolean
}

const DEFAULT_CARDIO_DURATION = 30

const createDraftKey = (): string => {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (globalCrypto?.randomUUID) {
    try {
      return globalCrypto.randomUUID()
    } catch {
      // Fall back to manual generation if randomUUID throws.
    }
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner']

const mealLabels: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

const createEmptySet = (): DraftWorkoutSet => ({
  weight: 0,
  unit: 'kg',
  reps: 0,
  note: '',
})

const createEmptyEntry = (category: ExerciseCategory = 'strength'): DraftWorkoutEntry => {
  if (category === 'cardio') {
    return {
      draftKey: createDraftKey(),
      exerciseId: '',
      note: '',
      sets: [],
      durationMinutes: DEFAULT_CARDIO_DURATION,
      categoryHint: 'cardio',
    }
  }

  return {
    draftKey: createDraftKey(),
    exerciseId: '',
    note: '',
    sets: [createEmptySet()],
    durationMinutes: 0,
    categoryHint: 'strength',
  }
}

const createEmptyMealItem = (mealType: MealType): DraftNutritionItem => ({
  mealType,
  name: '',
  calories: 0,
})

const createEmptyNutritionDraft = (): DraftDailyNutrition => ({
  waterIntakeMl: 0,
  meals: {
    breakfast: [],
    lunch: [],
    dinner: [],
  },
})

const repOptions = Array.from({ length: 50 }, (_, index) => index + 1)

const weightOptionsByUnit: Record<WeightUnit, number[]> = {
  kg: createRange(0, 200, 0.5),
  lb: createRange(0, 440, 1),
}

function createRange(start: number, end: number, step: number): number[] {
  const values: number[] = []
  const decimals = Math.max(0, (step.toString().split('.')[1]?.length ?? 0))
  for (let current = start; current <= end + step / 2; current += step) {
    values.push(Number(current.toFixed(decimals)))
  }
  return values
}

interface UseSessionDraftOptions {
  date: ComputedRef<string>
  session: ComputedRef<WorkoutSession | null>
  exercises: Ref<Record<string, ExerciseDefinition>>
  isActive?: Ref<boolean>
}

// Centralizes session draft manipulation (entries, sets, nutrition) used by the editor dialog.
export const useSessionDraft = ({ date, session, exercises, isActive }: UseSessionDraftOptions) => {
  const draft = ref<SessionDraft>({
    date: date.value,
    note: '',
    entries: [],
    nutrition: createEmptyNutritionDraft(),
    isCoachSession: false,
  })

  const isDraftActive = isActive ?? ref(true)

  const exerciseOptions = computed<ExerciseDefinition[]>(() => Object.values(exercises.value))

  const getExerciseById = (exerciseId: string): ExerciseDefinition | undefined => exercises.value[exerciseId]

  const getExerciseCategory = (exerciseId: string): ExerciseCategory =>
    getExerciseById(exerciseId)?.category ?? 'strength'

  const resolveEntryCategory = (entry: DraftWorkoutEntry): ExerciseCategory => {
    if (entry.exerciseId) {
      return getExerciseCategory(entry.exerciseId)
    }
    return entry.categoryHint ?? 'strength'
  }

  const isCardioEntry = (entry: DraftWorkoutEntry) => resolveEntryCategory(entry) === 'cardio'

  const ensureStrengthSets = (entry: DraftWorkoutEntry) => {
    if (!entry.sets.length) {
      entry.sets.push(createEmptySet())
    }
  }

  const syncEntryWithExercise = (entry: DraftWorkoutEntry) => {
    const category = resolveEntryCategory(entry)
    entry.categoryHint = category
    if (category === 'cardio') {
      entry.sets = []
      const duration = Number(entry.durationMinutes)
      if (!Number.isFinite(duration) || duration <= 0) {
        entry.durationMinutes = DEFAULT_CARDIO_DURATION
      } else {
        entry.durationMinutes = Math.round(duration)
      }
      return
    }

    ensureStrengthSets(entry)
    entry.durationMinutes = 0
  }

  const handleEntryExerciseChange = (entry: DraftWorkoutEntry) => {
    syncEntryWithExercise(entry)
  }

  const hydrateDraft = (source: WorkoutSession | null) => {
    if (!source) {
      draft.value = {
        date: date.value,
        note: '',
        entries: [],
        nutrition: createEmptyNutritionDraft(),
        isCoachSession: false,
      }
      return
    }

    draft.value = {
      id: source.id,
      date: source.date,
      note: source.note ?? '',
      entries: source.entries.map((entry) => ({
        id: entry.id,
        draftKey: entry.id ?? createDraftKey(),
        exerciseId: entry.exerciseId,
        note: entry.note ?? '',
        sets: entry.sets.map((set) => ({
          id: set.id,
          weight: set.weight,
          unit: set.unit,
          reps: set.reps,
          note: set.note ?? '',
        })),
        durationMinutes: entry.durationMinutes ?? 0,
        categoryHint: getExerciseCategory(entry.exerciseId),
      })),
      nutrition: (() => {
        const nutritionDraft = createEmptyNutritionDraft()
        if (source.nutrition) {
          nutritionDraft.waterIntakeMl = source.nutrition.waterIntakeMl
          for (const mealType of mealTypes) {
            nutritionDraft.meals[mealType] = source.nutrition.meals[mealType].map((item) => ({
              id: item.id,
              mealType,
              name: item.name,
              calories: item.calories,
              note: item.note ?? '',
            }))
          }
        }
        return nutritionDraft
      })(),
      isCoachSession: Boolean(source.isCoachSession),
    }

    draft.value.entries.forEach((entry) => {
      if (!entry.sets.length) {
        entry.sets = []
      }
      syncEntryWithExercise(entry)
    })
  }

  const addEntry = (category: ExerciseCategory = 'strength') => {
    const entry = createEmptyEntry(category)
    draft.value.entries.push(entry)
    return entry
  }

  const removeEntry = (index: number) => {
    draft.value.entries.splice(index, 1)
  }

  const addSet = (entry: DraftWorkoutEntry) => {
    if (isCardioEntry(entry)) {
      return
    }
    entry.sets.push(createEmptySet())
  }

  const removeSet = (entry: DraftWorkoutEntry, index: number) => {
    if (isCardioEntry(entry)) {
      entry.sets = []
      return
    }
    entry.sets.splice(index, 1)
    if (!entry.sets.length) {
      entry.sets.push(createEmptySet())
    }
  }

  const addMealItem = (mealType: MealType) => {
    draft.value.nutrition.meals[mealType].push(createEmptyMealItem(mealType))
  }

  const removeMealItem = (mealType: MealType, index: number) => {
    draft.value.nutrition.meals[mealType].splice(index, 1)
  }

  const mealTotals = computed<Record<MealType, number>>(() => {
    const totals: Record<MealType, number> = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
    }
    for (const mealType of mealTypes) {
      totals[mealType] = draft.value.nutrition.meals[mealType].reduce((sum, item) => {
        const value = Number(item.calories)
        return sum + (Number.isFinite(value) ? value : 0)
      }, 0)
    }
    return totals
  })

  const totalCalories = computed(() => mealTypes.reduce((sum, type) => sum + mealTotals.value[type], 0))

  const formatWeightLabel = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(1))

  const getWeightOptions = (unit: WeightUnit): number[] => weightOptionsByUnit[unit]

  const sanitizeDraft = (): DraftWorkoutSession => ({
    id: draft.value.id,
    date: date.value,
    note: draft.value.note?.trim() || undefined,
    entries: draft.value.entries.map((entry) => {
      const category = getExerciseCategory(entry.exerciseId)
      const base = {
        id: entry.id,
        exerciseId: entry.exerciseId,
        note: entry.note?.trim() || undefined,
      }

      if (category === 'cardio') {
        const duration = Number(entry.durationMinutes)
        const normalizedDuration = Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0
        return {
          ...base,
          sets: [],
          durationMinutes: normalizedDuration > 0 ? normalizedDuration : undefined,
        }
      }

      return {
        ...base,
        sets: entry.sets.map((set) => ({
          id: set.id,
          weight: Number(set.weight),
          unit: set.unit,
          reps: Number(set.reps),
          note: set.note?.trim() || undefined,
        })),
        durationMinutes: undefined,
      }
    }),
    nutrition: {
      waterIntakeMl: Number(draft.value.nutrition.waterIntakeMl) || 0,
      meals: mealTypes.reduce<DraftDailyNutrition['meals']>((acc, mealType) => {
        acc[mealType] = draft.value.nutrition.meals[mealType].map((item) => ({
          id: item.id,
          mealType,
          name: item.name,
          calories: Number(item.calories) || 0,
          note: item.note?.trim() || undefined,
        }))
        return acc
      }, {
        breakfast: [],
        lunch: [],
        dinner: [],
      }),
    },
    isCoachSession: draft.value.isCoachSession,
  })

  // Ensure each entry stays aligned with the latest exercise metadata (e.g. category changes).
  watch(exercises, () => {
    if (!isDraftActive.value) {
      return
    }
    draft.value.entries.forEach(syncEntryWithExercise)
  })

  // Keep the draft date mirrored with the parent prop.
  watch(date, (value) => {
    if (!isDraftActive.value) {
      return
    }
    draft.value.date = value
  })

  // Rehydrate whenever the selected workout session changes upstream.
  watch(session, (value) => {
    if (!isDraftActive.value) {
      return
    }
    hydrateDraft(value)
  })

  return {
    addEntry,
    addMealItem,
    addSet,
    draft,
    exerciseOptions,
    formatWeightLabel,
    getWeightOptions,
    handleEntryExerciseChange,
    hydrateDraft,
    isCardioEntry,
    mealLabels,
    mealTotals,
    mealTypes,
    removeEntry,
    removeMealItem,
    removeSet,
    repOptions,
    sanitizeDraft,
    syncEntryWithExercise,
    totalCalories,
  }
}

export const sessionDraftUtils = {
  DEFAULT_CARDIO_DURATION,
}
