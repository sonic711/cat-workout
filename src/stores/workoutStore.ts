import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  CalendarDaySummary,
  CreateExercisePayload,
  DraftWorkoutSession,
  ExerciseDefinition,
  HydrationPayload,
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
      const uniqueBodyParts = new Set<string>()
      for (const entry of session.entries) {
        const exercise = exercises.value[entry.exerciseId]
        if (exercise?.bodyPart) {
          uniqueBodyParts.add(exercise.bodyPart)
        }
      }
      summaries[session.date] = {
        date: session.date,
        hasWorkout: session.entries.length > 0,
        bodyParts: Array.from(uniqueBodyParts).sort(),
        sessionId: session.id,
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

  const registerExercise = (payload: CreateExercisePayload): ExerciseDefinition => {
    ensureCanMutate('新增或更新訓練動作')
    const name = normalizeLabel(payload.name)
    if (!name) {
      throw new Error('Exercise name is required.')
    }

    if (isNameTaken(name)) {
      throw new Error('已有相同名稱的訓練動作，請使用其他名稱。')
    }

    const timestamp = nowIso()

    const id = generateId()
    const exercise: ExerciseDefinition = {
      id,
      name,
      bodyPart: normalizeLabel(payload.bodyPart),
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

    const bodyPart = normalizeLabel(payload.bodyPart)
    const timestamp = nowIso()

    const updated: ExerciseDefinition = {
      ...target,
      name,
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
      }
    })

    const session: WorkoutSession = {
      id: sessionId,
      date: dateKey,
      note: draft.note?.trim() || undefined,
      entries: normalizedEntries,
      createdAt: existingSession?.createdAt ?? timestamp,
      updatedAt: timestamp,
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
    exercises.value = Object.fromEntries(payload.exercises.map((exercise) => [exercise.id, exercise]))
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
