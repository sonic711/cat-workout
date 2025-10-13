import { computed } from 'vue'
import type { Ref } from 'vue'

import type {
  ExerciseDefinition,
  MealType,
  WorkoutSession,
  ExerciseCategory,
  WeightUnit,
} from '@/types/workout'
import { homeCalendarUtils } from '@/composables/home/useHomeCalendar'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']
const CARDIO_LABEL = '有氧'
const MS_PER_DAY = 86_400_000
const LB_TO_KG = 0.45359237

const convertToKg = (value: number, unit: WeightUnit) => (unit === 'kg' ? value : value * LB_TO_KG)
const roundTo = (value: number, decimals = 1) => Number(value.toFixed(decimals))

export interface WorkoutReportRange {
  start: Date
  end: Date
}

export interface WorkoutReportMetrics {
  totalSessions: number
  totalEntries: number
  totalStrengthSets: number
  totalCardioMinutes: number
  totalCoachSessions: number
  totalDays: number
}

export interface WorkoutReportNutritionSummary {
  totalCalories: number
  totalWaterIntakeMl: number
  caloriesByMeal: Record<MealType, number>
  activeDays: number
  averageCaloriesPerActiveDay: number | null
  averageWaterMlPerActiveDay: number | null
}

export interface WorkoutReportBodyWeightSummary {
  sampleCount: number
  averageKg: number | null
  minKg: number | null
  maxKg: number | null
}

export interface WorkoutSessionBreakdown {
  session: WorkoutSession
  strengthSets: number
  cardioMinutes: number
  totalCalories: number
  labels: string[]
}

export interface WorkoutExerciseUsage {
  exerciseId: string
  name: string
  category: ExerciseCategory
  bodyPart?: string
  sessionCount: number
  entryCount: number
  maxWeightKg: number | null
  maxWeightSource: { value: number; unit: WeightUnit } | null
}

interface UseWorkoutReportsOptions {
  exercises: Ref<Record<string, ExerciseDefinition>>
  sessionsByDate: Ref<Record<string, WorkoutSession>>
  selectedRange: Ref<[Date, Date] | null>
}

const { formatDateKey } = homeCalendarUtils

const normalizeRange = (range: [Date, Date] | null): WorkoutReportRange | null => {
  if (!range || range.length < 2) {
    return null
  }
  const [a, b] = range
  const start = a.getTime() <= b.getTime() ? a : b
  const end = a.getTime() <= b.getTime() ? b : a
  return {
    start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    end: new Date(end.getFullYear(), end.getMonth(), end.getDate()),
  }
}

const isWithinRange = (dateKey: string, range: WorkoutReportRange) => {
  const minKey = formatDateKey(range.start)
  const maxKey = formatDateKey(range.end)
  return dateKey >= minKey && dateKey <= maxKey
}

const createSessionLabels = (
  session: WorkoutSession,
  exercises: Record<string, ExerciseDefinition>,
): string[] => {
  const labels = new Set<string>()
  for (const entry of session.entries) {
    const exercise = exercises[entry.exerciseId]
    if (!exercise) {
      continue
    }
    if (exercise.category === 'cardio') {
      labels.add(CARDIO_LABEL)
      continue
    }
    if (exercise.bodyPart) {
      labels.add(exercise.bodyPart)
    }
  }
  if (session.isCoachSession) {
    labels.add('教練課')
  }
  return Array.from(labels).sort()
}

const sumCaloriesForSession = (session: WorkoutSession): number => {
  const nutrition = session.nutrition
  if (!nutrition) {
    return 0
  }
  return MEAL_TYPES.reduce((acc, mealType) => {
    const items = nutrition.meals[mealType] ?? []
    const mealTotal = items.reduce((mealAcc, item) => mealAcc + (item.calories || 0), 0)
    return acc + mealTotal
  }, 0)
}

const sumCardioMinutes = (
  session: WorkoutSession,
  exercises: Record<string, ExerciseDefinition>,
): number => {
  let total = 0
  for (const entry of session.entries) {
    const exercise = exercises[entry.exerciseId]
    if (exercise?.category === 'cardio' && typeof entry.durationMinutes === 'number') {
      total += Math.max(0, entry.durationMinutes)
    }
  }
  return total
}

const countStrengthSets = (
  session: WorkoutSession,
  exercises: Record<string, ExerciseDefinition>,
): number => {
  let total = 0
  for (const entry of session.entries) {
    const exercise = exercises[entry.exerciseId]
    if ((exercise?.category ?? 'strength') === 'strength') {
      total += entry.sets.length
    }
  }
  return total
}

const deriveBodyWeightStats = (sessions: WorkoutSession[]): WorkoutReportBodyWeightSummary => {
  const samples = sessions
    .map((session) => session.bodyWeightKg)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!samples.length) {
    return {
      sampleCount: 0,
      averageKg: null,
      minKg: null,
      maxKg: null,
    }
  }
  const total = samples.reduce((acc, value) => acc + value, 0)
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const average = Number((total / samples.length).toFixed(1))
  return {
    sampleCount: samples.length,
    averageKg: average,
    minKg: Number(min.toFixed(1)),
    maxKg: Number(max.toFixed(1)),
  }
}

const deriveNutritionSummary = (sessions: WorkoutSession[]): WorkoutReportNutritionSummary => {
  const caloriesByMeal: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  }
  let totalWater = 0
  let activeDays = 0

  for (const session of sessions) {
    const nutrition = session.nutrition
    if (!nutrition) {
      continue
    }
    activeDays += 1
    totalWater += Math.max(0, nutrition.waterIntakeMl || 0)
    for (const mealType of MEAL_TYPES) {
      const items = nutrition.meals[mealType] ?? []
      caloriesByMeal[mealType] += items.reduce((acc, item) => acc + (item.calories || 0), 0)
    }
  }

  const totalCalories = Object.values(caloriesByMeal).reduce((acc, value) => acc + value, 0)
  const averageCaloriesPerActiveDay = activeDays > 0 ? roundTo(totalCalories / activeDays) : null
  const averageWaterMlPerActiveDay = activeDays > 0 ? roundTo(totalWater / activeDays) : null

  return {
    totalCalories,
    totalWaterIntakeMl: totalWater,
    caloriesByMeal,
    activeDays,
    averageCaloriesPerActiveDay,
    averageWaterMlPerActiveDay,
  }
}

const deriveExerciseUsage = (
  sessions: WorkoutSession[],
  exercises: Record<string, ExerciseDefinition>,
): WorkoutExerciseUsage[] => {
  const stats: Record<
    string,
    {
      sessionCount: number
      entryCount: number
      maxWeightKg: number | null
      maxWeightSource: { value: number; unit: WeightUnit } | null
    }
  > = {}

  for (const session of sessions) {
    const seenThisSession = new Set<string>()
    for (const entry of session.entries) {
      const id = entry.exerciseId
      if (!stats[id]) {
        stats[id] = { sessionCount: 0, entryCount: 0, maxWeightKg: null, maxWeightSource: null }
      }
      const exercise = exercises[id]
      const category = exercise?.category ?? 'strength'
      if (category === 'strength') {
        for (const set of entry.sets) {
          const weightKg = convertToKg(set.weight, set.unit)
          if (!Number.isFinite(weightKg) || weightKg <= 0) {
            continue
          }
          if (stats[id]!.maxWeightKg == null || weightKg > stats[id]!.maxWeightKg!) {
            stats[id]!.maxWeightKg = weightKg
            stats[id]!.maxWeightSource = { value: set.weight, unit: set.unit }
          }
        }
      }
      stats[id]!.entryCount += 1
      if (!seenThisSession.has(id)) {
        stats[id]!.sessionCount += 1
        seenThisSession.add(id)
      }
    }
  }

  return Object.entries(stats)
    .map(([exerciseId, usage]) => {
      const exercise = exercises[exerciseId]
      return {
        exerciseId,
        name: exercise?.name ?? '已刪除的訓練動作',
        category: exercise?.category ?? 'strength',
        bodyPart: exercise?.bodyPart,
        sessionCount: usage.sessionCount,
        entryCount: usage.entryCount,
        maxWeightKg: usage.maxWeightKg == null ? null : roundTo(usage.maxWeightKg),
        maxWeightSource: usage.maxWeightSource,
      }
    })
    .sort((a, b) => {
      if (b.entryCount !== a.entryCount) {
        return b.entryCount - a.entryCount
      }
      if (b.sessionCount !== a.sessionCount) {
        return b.sessionCount - a.sessionCount
      }
      return a.name.localeCompare(b.name, 'zh-Hant', { sensitivity: 'base' })
    })
}

const deriveMetrics = (
  sessions: WorkoutSession[],
  exercises: Record<string, ExerciseDefinition>,
  range: WorkoutReportRange | null,
): WorkoutReportMetrics => {
  const totals = {
    totalSessions: sessions.length,
    totalEntries: 0,
    totalStrengthSets: 0,
    totalCardioMinutes: 0,
    totalCoachSessions: 0,
    totalDays: 0,
  }

  if (range) {
    const diff = range.end.getTime() - range.start.getTime()
    totals.totalDays = Math.floor(diff / MS_PER_DAY) + 1
  }

  for (const session of sessions) {
    totals.totalEntries += session.entries.length
    totals.totalStrengthSets += countStrengthSets(session, exercises)
    totals.totalCardioMinutes += sumCardioMinutes(session, exercises)
    if (session.isCoachSession) {
      totals.totalCoachSessions += 1
    }
  }

  return totals
}

const deriveSessionBreakdown = (
  sessions: WorkoutSession[],
  exercises: Record<string, ExerciseDefinition>,
): WorkoutSessionBreakdown[] =>
  sessions.map((session) => {
    const strengthSets = countStrengthSets(session, exercises)
    const cardioMinutes = sumCardioMinutes(session, exercises)
    const totalCalories = sumCaloriesForSession(session)
    const labels = createSessionLabels(session, exercises)
    return {
      session,
      strengthSets,
      cardioMinutes,
      totalCalories,
      labels,
    }
  })

export const useWorkoutReports = ({ exercises, sessionsByDate, selectedRange }: UseWorkoutReportsOptions) => {
  const sortedSessions = computed(() =>
    Object.values(sessionsByDate.value).sort((a, b) => a.date.localeCompare(b.date)),
  )

  const availableRange = computed<WorkoutReportRange | null>(() => {
    if (!sortedSessions.value.length) {
      return null
    }
    const first = sortedSessions.value[0]!
    const last = sortedSessions.value[sortedSessions.value.length - 1]!
    return {
      start: new Date(`${first.date}T00:00:00`),
      end: new Date(`${last.date}T00:00:00`),
    }
  })

  const userRange = computed(() => normalizeRange(selectedRange.value))

  const activeRange = computed<WorkoutReportRange | null>(() => userRange.value ?? availableRange.value)

  const sessionsInRange = computed(() => {
    if (!activeRange.value) {
      return [] as WorkoutSession[]
    }
    return sortedSessions.value.filter((session) => isWithinRange(session.date, activeRange.value!))
  })

  const metrics = computed(() => deriveMetrics(sessionsInRange.value, exercises.value, activeRange.value))

  const nutritionSummary = computed(() => deriveNutritionSummary(sessionsInRange.value))

  const bodyWeightSummary = computed(() => deriveBodyWeightStats(sessionsInRange.value))

  const exerciseUsage = computed(() => deriveExerciseUsage(sessionsInRange.value, exercises.value))

  const sessionBreakdown = computed(() => deriveSessionBreakdown(sessionsInRange.value, exercises.value))

  return {
    sortedSessions,
    availableRange,
    activeRange,
    sessionsInRange,
    metrics,
    nutritionSummary,
    bodyWeightSummary,
    exerciseUsage,
    sessionBreakdown,
  }
}

export type UseWorkoutReportsReturn = ReturnType<typeof useWorkoutReports>
