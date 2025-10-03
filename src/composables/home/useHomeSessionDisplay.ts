import type { ComputedRef, Ref } from 'vue'

import type { ExerciseCategory, ExerciseDefinition, WorkoutSession } from '@/types/workout'

type WorkoutEntry = WorkoutSession['entries'][number]

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: '重量訓練',
  cardio: '有氧運動',
}

interface UseHomeSessionDisplayOptions {
  sessionForSelectedDate: ComputedRef<WorkoutSession | null>
  exercises: Ref<Record<string, ExerciseDefinition>>
}

// Encapsulates workout-entry formatting helpers so the view stays declarative.
export const useHomeSessionDisplay = ({
  sessionForSelectedDate,
  exercises,
}: UseHomeSessionDisplayOptions) => {
  const getExerciseById = (exerciseId: string) => exercises.value[exerciseId]

  const getExerciseName = (exerciseId: string) => getExerciseById(exerciseId)?.name ?? '未命名動作'

  const getExerciseCategory = (exerciseId: string): ExerciseCategory =>
    getExerciseById(exerciseId)?.category ?? 'strength'

  const isCardioEntry = (entry: WorkoutEntry) => getExerciseCategory(entry.exerciseId) === 'cardio'

  const getExerciseBodyPartLabel = (exerciseId: string) => {
    const exercise = getExerciseById(exerciseId)
    if (!exercise) {
      return '未分類'
    }
    if (exercise.category === 'cardio') {
      return CATEGORY_LABELS.cardio
    }
    return exercise.bodyPart?.trim() || '未分類'
  }

  const entryHasSetNote = (entry: WorkoutEntry) =>
    !isCardioEntry(entry) && entry.sets.some((set) => Boolean(set.note?.trim()))

  const formatEntrySummary = (entry: WorkoutEntry) => {
    if (isCardioEntry(entry)) {
      const duration = Number(entry.durationMinutes)
      if (!Number.isFinite(duration) || duration <= 0) {
        return '時長 0 分鐘'
      }
      return `時長 ${duration} 分鐘`
    }
    return `共 ${entry.sets.length} 組`
  }

  return {
    CATEGORY_LABELS,
    entryHasSetNote,
    formatEntrySummary,
    getExerciseBodyPartLabel,
    getExerciseById,
    getExerciseCategory,
    getExerciseName,
    isCardioEntry,
    sessionForSelectedDate,
  }
}
