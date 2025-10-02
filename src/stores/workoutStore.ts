import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  CalendarDaySummary,
  CreateExercisePayload,
  DailyNutrition,
  DraftDailyNutrition,
  DraftWorkoutSession,
  ExerciseCategory,
  ExerciseDefinition,
  HydrationPayload,
  MealType,
  NutritionItem,
  UpdateExercisePayload,
  WorkoutSession,
} from '@/types/workout'
import { getPersistenceService } from '@/services/persistenceProvider'
import { useAuthStore } from '@/stores/authStore'

const fallbackId = () => `id-${Math.random().toString(36).slice(2, 11)}`

const generateId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return fallbackId()
}

const normalizeLabel = (value: string) => value.trim()

const nowIso = () => new Date().toISOString()

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']
const EXERCISE_CATEGORIES: ExerciseCategory[] = ['strength', 'cardio']
const CARDIO_CALENDAR_LABEL = '有氧'
const isValidCategory = (category: string): category is ExerciseCategory =>
  EXERCISE_CATEGORIES.includes(category as ExerciseCategory)

export const useWorkoutStore = defineStore('workout', () => {
  const isHydrated = ref(false)
  const isHydrating = ref(false)
  const exercises = ref<Record<string, ExerciseDefinition>>({})
  const sessionsByDate = ref<Record<string, WorkoutSession>>({})

  const handlePersistenceError = (error: unknown, context: string) => {
    console.error(`[WorkoutStore] Failed to ${context}`, error)
  }

  const ensureCanMutate = (action: string) => {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error(`目前僅有瀏覽權限，無法${action}`)
    }
  }

  const persistExercises = async () => {
    const service = getPersistenceService()
    await service.saveExercises(Object.values(exercises.value))
  }

  const persistSessions = async () => {
    const service = getPersistenceService()
    await service.saveSessions(Object.values(sessionsByDate.value))
  }

  const sessionDates = computed(() => Object.keys(sessionsByDate.value).sort())

  const sessionByDate = computed(() => (date: string) => sessionsByDate.value[date] ?? null)

  const calendarSummaryByDate = computed<Record<string, CalendarDaySummary>>(() => {
    const summaries: Record<string, CalendarDaySummary> = {}
    for (const session of Object.values(sessionsByDate.value)) {
      const uniqueLabels = new Set<string>()
      for (const entry of session.entries) {
        const exercise = exercises.value[entry.exerciseId]
        if (!exercise) {
          continue
        }
        if (exercise.category === 'cardio') {
          uniqueLabels.add(CARDIO_CALENDAR_LABEL)
        } else if (exercise.bodyPart) {
          uniqueLabels.add(exercise.bodyPart)
        }
      }
      summaries[session.date] = {
        date: session.date,
        hasWorkout: session.entries.length > 0,
        bodyParts: Array.from(uniqueLabels).sort(),
        sessionId: session.id,
        isCoachSession: Boolean(session.isCoachSession),
      }
    }
    return summaries
  })

  const calendarSummaries = computed<CalendarDaySummary[]>(() => Object.values(calendarSummaryByDate.value))

  const exerciseList = computed<ExerciseDefinition[]>(() =>
    Object.values(exercises.value).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { sensitivity: 'base' })),
  )

  const exerciseUsage = computed<Record<string, { sessionCount: number; entryCount: number }>>(() => {
    const usage: Record<string, { sessionCount: number; entryCount: number }> = {}
    for (const session of Object.values(sessionsByDate.value)) {
      const countedInSession = new Set<string>()
      for (const entry of session.entries) {
        if (!usage[entry.exerciseId]) {
          usage[entry.exerciseId] = { sessionCount: 0, entryCount: 0 }
        }
        const stats = usage[entry.exerciseId]!
        if (!countedInSession.has(entry.exerciseId)) {
          stats.sessionCount += 1
          countedInSession.add(entry.exerciseId)
        }
        stats.entryCount += 1
      }
    }
    return usage
  })

  const exerciseUsageById = computed(
    () =>
      (exerciseId: string) =>
        exerciseUsage.value[exerciseId] ?? { sessionCount: 0, entryCount: 0 },
  )

  const isNameTaken = (name: string, excludeId?: string) => {
    const lower = name.toLowerCase()
    return Object.values(exercises.value).some(
      (exercise) => exercise.id !== excludeId && exercise.name.toLowerCase() === lower,
    )
  }

  const normalizeDraftNutrition = (
    draftNutrition: DraftDailyNutrition | undefined,
    existingNutrition: DailyNutrition | undefined,
  ): DailyNutrition | undefined => {
    if (!draftNutrition) {
      return undefined
    }

    const waterIntake = Number.isFinite(draftNutrition.waterIntakeMl)
      ? Math.max(0, Number(draftNutrition.waterIntakeMl))
      : 0

    const normalizedMeals = MEAL_TYPES.reduce<Record<MealType, NutritionItem[]>>((acc, mealType) => {
      const sourceItems = draftNutrition.meals[mealType] ?? []
      const existingItems = existingNutrition?.meals[mealType] ?? []
      const mapped = sourceItems
        .map((item) => {
          const baseItem = item.id
            ? existingItems.find((candidate) => candidate.id === item.id)
            : undefined
          const itemId = item.id ?? baseItem?.id ?? generateId()
          const name = normalizeLabel(item.name)
          const calories = Number.isFinite(item.calories) ? Number(item.calories) : 0
          const note = item.note?.trim() || undefined

          return {
            id: itemId,
            mealType,
            name,
            calories,
            note,
          }
        })
        .filter((item) => item.name.length > 0 || item.calories > 0 || Boolean(item.note))

      acc[mealType] = mapped
      return acc
    }, {
      breakfast: [],
      lunch: [],
      dinner: [],
    })

    const hasMeals = MEAL_TYPES.some((mealType) => normalizedMeals[mealType]!.length > 0)

    if (!hasMeals && waterIntake <= 0) {
      return undefined
    }

    return {
      waterIntakeMl: waterIntake,
      meals: normalizedMeals,
    }
  }

  const normalizePersistedExercise = (exercise: ExerciseDefinition): ExerciseDefinition => {
    const category = isValidCategory(exercise.category) ? exercise.category : 'strength'
    return {
      ...exercise,
      category,
      bodyPart: category === 'strength' ? exercise.bodyPart ?? '' : undefined,
    }
  }

  const registerExercise = (payload: CreateExercisePayload): ExerciseDefinition => {
    ensureCanMutate('新增或更新訓練動作')
    const name = normalizeLabel(payload.name)
    if (!name) {
      throw new Error('Exercise name is required.')
    }

    if (isNameTaken(name)) {
      throw new Error('已有相同名稱的訓練動作，請使用其他名稱。')
    }

    const category = isValidCategory(payload.category) ? payload.category : 'strength'

    let bodyPart: string | undefined
    if (category === 'strength') {
      bodyPart = normalizeLabel(payload.bodyPart ?? '')
      if (!bodyPart) {
        throw new Error('請輸入身體部位。')
      }
    }

    const timestamp = nowIso()

    const id = generateId()
    const exercise: ExerciseDefinition = {
      id,
      name,
      category,
      bodyPart,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    exercises.value[id] = exercise
    void persistExercises().catch((error) => handlePersistenceError(error, 'save exercises'))
    return exercise
  }

  const updateExercise = (payload: UpdateExercisePayload): ExerciseDefinition => {
    ensureCanMutate('更新訓練動作')
    const target = exercises.value[payload.id]
    if (!target) {
      throw new Error('找不到對應的訓練動作')
    }

    const name = normalizeLabel(payload.name)
    if (!name) {
      throw new Error('Exercise name is required.')
    }

    if (isNameTaken(name, target.id)) {
      throw new Error('已有相同名稱的訓練動作，請使用其他名稱。')
    }

    const category = isValidCategory(payload.category) ? payload.category : target.category
    if (category !== target.category) {
      const usage = exerciseUsageById.value(target.id)
      if (usage.entryCount > 0) {
        throw new Error('已有訓練紀錄使用此動作，無法變更分類。')
      }
    }

    let bodyPart: string | undefined
    if (category === 'strength') {
      const bodyPartInput = payload.bodyPart ?? target.bodyPart ?? ''
      bodyPart = normalizeLabel(bodyPartInput)
      if (!bodyPart) {
        throw new Error('請輸入身體部位。')
      }
    }

    const timestamp = nowIso()

    const updated: ExerciseDefinition = {
      ...target,
      name,
      category,
      bodyPart,
      updatedAt: timestamp,
    }

    exercises.value[target.id] = updated
    void persistExercises().catch((error) => handlePersistenceError(error, 'save exercises'))
    return updated
  }

  const removeExercise = (exerciseId: string) => {
    ensureCanMutate('刪除訓練動作')
    const target = exercises.value[exerciseId]
    if (!target) {
      throw new Error('找不到對應的訓練動作')
    }

    const usage = exerciseUsageById.value(exerciseId)
    if (usage.entryCount > 0) {
      throw new Error('該訓練動作仍有訓練紀錄使用，請先調整訓練內容後再刪除。')
    }

    delete exercises.value[exerciseId]
    void persistExercises().catch((error) => handlePersistenceError(error, 'save exercises'))
  }

  const upsertSession = (draft: DraftWorkoutSession): WorkoutSession => {
    ensureCanMutate('儲存訓練紀錄')
    const dateKey = normalizeLabel(draft.date)
    if (!dateKey) {
      throw new Error('Session date is required.')
    }

    const existingSession = sessionsByDate.value[dateKey]
    const timestamp = nowIso()
    const sessionId = draft.id ?? existingSession?.id ?? generateId()

    const normalizedEntries = draft.entries.map((entry) => {
      const baseEntry = entry.id
        ? existingSession?.entries.find((item) => item.id === entry.id)
        : undefined
      const entryId = entry.id ?? baseEntry?.id ?? generateId()

      const exercise = exercises.value[entry.exerciseId]
      const category = exercise?.category ?? 'strength'

      if (category === 'cardio') {
        const rawDuration = Number(entry.durationMinutes)
        const normalizedDuration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0
        const durationMinutes = normalizedDuration > 0 ? normalizedDuration : undefined

        return {
          id: entryId,
          exerciseId: entry.exerciseId,
          note: entry.note?.trim() || undefined,
          sets: [],
          durationMinutes,
        }
      }

      const sets = entry.sets.map((set) => {
        const baseSet = set.id
          ? baseEntry?.sets.find((candidate) => candidate.id === set.id)
          : undefined
        const setId = set.id ?? baseSet?.id ?? generateId()
        return {
          id: setId,
          weight: set.weight,
          unit: set.unit,
          reps: set.reps,
          note: set.note?.trim() || undefined,
        }
      })

      return {
        id: entryId,
        exerciseId: entry.exerciseId,
        note: entry.note?.trim() || undefined,
        sets,
        durationMinutes: undefined,
      }
    })

    const normalizedNutrition = normalizeDraftNutrition(draft.nutrition, existingSession?.nutrition)

    const session: WorkoutSession = {
      id: sessionId,
      date: dateKey,
      note: draft.note?.trim() || undefined,
      entries: normalizedEntries,
      createdAt: existingSession?.createdAt ?? timestamp,
      updatedAt: timestamp,
      nutrition: normalizedNutrition,
      isCoachSession: Boolean(draft.isCoachSession),
    }

    sessionsByDate.value[dateKey] = session
    void persistSessions().catch((error) => handlePersistenceError(error, 'save sessions'))

    return session
  }

  const removeSession = (date: string) => {
    ensureCanMutate('刪除訓練紀錄')
    const trimmed = normalizeLabel(date)
    if (trimmed in sessionsByDate.value) {
      delete sessionsByDate.value[trimmed]
      void persistSessions().catch((error) => handlePersistenceError(error, 'save sessions'))
    }
  }

  const clearLocalState = () => {
    exercises.value = {}
    sessionsByDate.value = {}
    isHydrated.value = false
    isHydrating.value = false
  }

  const reset = () => {
    ensureCanMutate('清除所有紀錄')
    clearLocalState()
    void getPersistenceService()
      .clear()
      .catch((error) => handlePersistenceError(error, 'clear persisted data'))
  }

  const primeFromStorage = (payload: HydrationPayload) => {
    exercises.value = Object.fromEntries(
      payload.exercises.map((exercise) => {
        const normalized = normalizePersistedExercise(exercise)
        return [normalized.id, normalized]
      }),
    )
    sessionsByDate.value = Object.fromEntries(payload.sessions.map((session) => [session.date, session]))
    isHydrated.value = true
  }

  const hydrateFromPersistence = async (): Promise<HydrationPayload | null> => {
    if (isHydrated.value || isHydrating.value) {
      return null
    }

    isHydrating.value = true

    try {
      const service = getPersistenceService()
      const hydration = (await service.loadHydration()) ?? { exercises: [], sessions: [] }
      primeFromStorage(hydration)
      return hydration
    } catch (error) {
      handlePersistenceError(error, 'load persisted workouts')
      const fallback: HydrationPayload = { exercises: [], sessions: [] }
      primeFromStorage(fallback)
      return fallback
    } finally {
      isHydrating.value = false
    }
  }

  return {
    // state
    isHydrated,
    isHydrating,
    exercises,
    sessionsByDate,
    // getters
    sessionDates,
    sessionByDate,
    calendarSummaries,
    calendarSummaryByDate,
    exerciseList,
    exerciseUsage,
    exerciseUsageById,
    // actions
    registerExercise,
    updateExercise,
    removeExercise,
    upsertSession,
    removeSession,
    reset,
    clearLocalState,
    primeFromStorage,
    hydrateFromPersistence,
  }
})
