import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  CalendarDaySummary,
  CreateExercisePayload,
  DraftWorkoutSession,
  ExerciseDefinition,
  HydrationPayload,
  WorkoutSession,
} from '@/types/workout'

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
  const exercises = ref<Record<string, ExerciseDefinition>>({})
  const sessionsByDate = ref<Record<string, WorkoutSession>>({})

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

  const registerExercise = (payload: CreateExercisePayload): ExerciseDefinition => {
    const name = normalizeLabel(payload.name)
    if (!name) {
      throw new Error('Exercise name is required.')
    }

    const existing = Object.values(exercises.value).find(
      (exercise) => exercise.name.toLowerCase() === name.toLowerCase(),
    )

    const timestamp = nowIso()

    if (existing) {
      const bodyPart = normalizeLabel(payload.bodyPart)
      if (bodyPart && bodyPart !== existing.bodyPart) {
        const updated: ExerciseDefinition = {
          ...existing,
          bodyPart,
          updatedAt: timestamp,
        }
        exercises.value[existing.id] = updated
        return updated
      }
      return existing
    }

    const id = generateId()
    const exercise: ExerciseDefinition = {
      id,
      name,
      bodyPart: normalizeLabel(payload.bodyPart),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    exercises.value[id] = exercise
    return exercise
  }

  const upsertSession = (draft: DraftWorkoutSession): WorkoutSession => {
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

    return session
  }

  const removeSession = (date: string) => {
    const trimmed = normalizeLabel(date)
    if (trimmed in sessionsByDate.value) {
      delete sessionsByDate.value[trimmed]
    }
  }

  const reset = () => {
    exercises.value = {}
    sessionsByDate.value = {}
    isHydrated.value = false
  }

  const primeFromStorage = (payload: HydrationPayload) => {
    exercises.value = Object.fromEntries(payload.exercises.map((exercise) => [exercise.id, exercise]))
    sessionsByDate.value = Object.fromEntries(payload.sessions.map((session) => [session.date, session]))
    isHydrated.value = true
  }

  return {
    // state
    isHydrated,
    exercises,
    sessionsByDate,
    // getters
    sessionDates,
    sessionByDate,
    calendarSummaries,
    calendarSummaryByDate,
    // actions
    registerExercise,
    upsertSession,
    removeSession,
    reset,
    primeFromStorage,
  }
})
