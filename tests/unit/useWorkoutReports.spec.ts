import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useWorkoutReports } from '@/composables/reports/useWorkoutReports'
import type { ExerciseDefinition, WorkoutSession } from '@/types/workout'

const buildExercises = () =>
  ref<Record<string, ExerciseDefinition>>({
    squat: {
      id: 'squat',
      name: '深蹲',
      category: 'strength',
      bodyPart: '腿',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    run: {
      id: 'run',
      name: '跑步機慢跑',
      category: 'cardio',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  })

const buildSessions = () =>
  ref<Record<string, WorkoutSession>>({
    '2024-01-01': {
      id: 'session-1',
      date: '2024-01-01',
      note: undefined,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      bodyWeightKg: 70.2,
      isCoachSession: true,
      nutrition: {
        waterIntakeMl: 1200,
        meals: {
          breakfast: [
            {
              id: 'meal-1',
              mealType: 'breakfast',
              name: '燕麥',
              calories: 500,
              note: undefined,
            },
          ],
          lunch: [],
          dinner: [
            {
              id: 'meal-2',
              mealType: 'dinner',
              name: '雞胸肉',
              calories: 700,
              note: undefined,
            },
          ],
        },
      },
      entries: [
        {
          id: 'entry-1',
          exerciseId: 'squat',
          note: undefined,
          durationMinutes: undefined,
          sets: [
            { id: 'set-1', weight: 100, unit: 'kg', reps: 5, note: undefined },
            { id: 'set-2', weight: 100, unit: 'kg', reps: 5, note: undefined },
          ],
        },
        {
          id: 'entry-2',
          exerciseId: 'run',
          note: undefined,
          durationMinutes: 30,
          sets: [],
        },
      ],
    },
    '2024-01-04': {
      id: 'session-2',
      date: '2024-01-04',
      note: undefined,
      createdAt: '2024-01-04T00:00:00.000Z',
      updatedAt: '2024-01-04T00:00:00.000Z',
      bodyWeightKg: 69.6,
      isCoachSession: false,
      nutrition: {
        waterIntakeMl: 900,
        meals: {
          breakfast: [],
          lunch: [
            {
              id: 'meal-3',
              mealType: 'lunch',
              name: '便當',
              calories: 600,
              note: undefined,
            },
          ],
          dinner: [],
        },
      },
      entries: [
        {
          id: 'entry-3',
          exerciseId: 'squat',
          note: undefined,
          durationMinutes: undefined,
          sets: [
            { id: 'set-3', weight: 105, unit: 'kg', reps: 5, note: undefined },
            { id: 'set-4', weight: 105, unit: 'kg', reps: 5, note: undefined },
            { id: 'set-5', weight: 105, unit: 'kg', reps: 5, note: undefined },
          ],
        },
      ],
    },
    '2024-01-08': {
      id: 'session-3',
      date: '2024-01-08',
      note: undefined,
      createdAt: '2024-01-08T00:00:00.000Z',
      updatedAt: '2024-01-08T00:00:00.000Z',
      bodyWeightKg: undefined,
      isCoachSession: false,
      nutrition: undefined,
      entries: [
        {
          id: 'entry-4',
          exerciseId: 'run',
          note: undefined,
          durationMinutes: 40,
          sets: [],
        },
        {
          id: 'entry-5',
          exerciseId: 'squat',
          note: undefined,
          durationMinutes: undefined,
          sets: [
            { id: 'set-6', weight: 250, unit: 'lb', reps: 3, note: undefined },
          ],
        },
      ],
    },
  })

describe('useWorkoutReports', () => {
  it('aggregates metrics for the entire available range when no custom range is selected', () => {
    const exercises = buildExercises()
    const sessionsByDate = buildSessions()
    const selectedRange = ref<[Date, Date] | null>(null)

    const { activeRange, metrics, nutritionSummary, bodyWeightSummary, exerciseUsage, sessionBreakdown } =
      useWorkoutReports({ exercises, sessionsByDate, selectedRange })

    expect(activeRange.value?.start.toISOString().slice(0, 10)).toBe('2024-01-01')
    expect(activeRange.value?.end.toISOString().slice(0, 10)).toBe('2024-01-08')

    expect(metrics.value.totalSessions).toBe(3)
    expect(metrics.value.totalEntries).toBe(5)
    expect(metrics.value.totalStrengthSets).toBe(6)
    expect(metrics.value.totalCardioMinutes).toBe(70)
    expect(metrics.value.totalCoachSessions).toBe(1)
    expect(metrics.value.totalDays).toBe(8)

    expect(nutritionSummary.value.totalCalories).toBe(1800)
    expect(nutritionSummary.value.caloriesByMeal.breakfast).toBe(500)
    expect(nutritionSummary.value.caloriesByMeal.lunch).toBe(600)
    expect(nutritionSummary.value.caloriesByMeal.dinner).toBe(700)
    expect(nutritionSummary.value.totalWaterIntakeMl).toBe(2100)
    expect(nutritionSummary.value.activeDays).toBe(2)
    expect(nutritionSummary.value.averageCaloriesPerActiveDay).toBe(900)
    expect(nutritionSummary.value.averageWaterMlPerActiveDay).toBe(1050)

    expect(bodyWeightSummary.value.sampleCount).toBe(2)
    expect(bodyWeightSummary.value.averageKg).toBe(69.9)
    expect(bodyWeightSummary.value.minKg).toBe(69.6)
    expect(bodyWeightSummary.value.maxKg).toBe(70.2)

    const squatUsage = exerciseUsage.value.find((usage) => usage.exerciseId === 'squat')
    const runUsage = exerciseUsage.value.find((usage) => usage.exerciseId === 'run')

    expect(squatUsage).toMatchObject({ sessionCount: 3, entryCount: 3 })
    expect(runUsage).toMatchObject({ sessionCount: 2, entryCount: 2 })
    expect(squatUsage?.maxWeightKg).toBe(113.4)
    expect(squatUsage?.maxWeightSource).toEqual({ value: 250, unit: 'lb' })
    expect(runUsage?.maxWeightKg).toBeNull()

    const firstSession = sessionBreakdown.value[0]
    expect(firstSession.session.id).toBe('session-1')
    expect(firstSession.strengthSets).toBe(2)
    expect(firstSession.cardioMinutes).toBe(30)
    expect(firstSession.totalCalories).toBe(1200)
    expect(firstSession.labels).toHaveLength(3)
    expect(firstSession.labels).toEqual(expect.arrayContaining(['腿', '有氧', '教練課']))
  })

  it('filters data when a custom range is provided', () => {
    const exercises = buildExercises()
    const sessionsByDate = buildSessions()
    const selectedRange = ref<[Date, Date] | null>(null)

    const { metrics, nutritionSummary, bodyWeightSummary, exerciseUsage, sessionsInRange } = useWorkoutReports({
      exercises,
      sessionsByDate,
      selectedRange,
    })

    selectedRange.value = [new Date('2024-01-08T00:00:00'), new Date('2024-01-04T00:00:00')]

    expect(metrics.value.totalSessions).toBe(2)
    expect(metrics.value.totalStrengthSets).toBe(4)
    expect(metrics.value.totalCardioMinutes).toBe(40)
    expect(metrics.value.totalCoachSessions).toBe(0)
    expect(metrics.value.totalDays).toBe(5)

    expect(nutritionSummary.value.totalCalories).toBe(600)
    expect(nutritionSummary.value.activeDays).toBe(1)
    expect(nutritionSummary.value.averageCaloriesPerActiveDay).toBe(600)
    expect(nutritionSummary.value.totalWaterIntakeMl).toBe(900)

    expect(bodyWeightSummary.value.sampleCount).toBe(1)
    expect(bodyWeightSummary.value.averageKg).toBe(69.6)

    const squatUsage = exerciseUsage.value.find((usage) => usage.exerciseId === 'squat')
    const runUsage = exerciseUsage.value.find((usage) => usage.exerciseId === 'run')

    expect(squatUsage).toMatchObject({ sessionCount: 2, entryCount: 2 })
    expect(runUsage).toMatchObject({ sessionCount: 1, entryCount: 1 })
    expect(squatUsage?.maxWeightKg).toBe(113.4)
    expect(squatUsage?.maxWeightSource).toEqual({ value: 250, unit: 'lb' })
    expect(runUsage?.maxWeightKg).toBeNull()

    expect(sessionsInRange.value.map((session) => session.id)).toEqual(['session-2', 'session-3'])
  })
})
