import type { PersistenceService } from './persistenceService'
import type { DailyNutrition, HydrationPayload, MealType } from '@/types/workout'

const cloneHydration = (payload: HydrationPayload): HydrationPayload => ({
  exercises: payload.exercises.map((exercise) => ({ ...exercise })),
  sessions: payload.sessions.map((session) => ({
    ...session,
    entries: session.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({ ...set })),
    })),
    nutrition: cloneNutrition(session.nutrition),
  })),
})

const cloneNutrition = (nutrition: DailyNutrition | undefined): DailyNutrition | undefined => {
  if (!nutrition) {
    return undefined
  }

  const cloneMeals = (mealType: MealType) => nutrition.meals[mealType]?.map((item) => ({ ...item })) ?? []

  return {
    waterIntakeMl: nutrition.waterIntakeMl,
    meals: {
      breakfast: cloneMeals('breakfast'),
      lunch: cloneMeals('lunch'),
      dinner: cloneMeals('dinner'),
    },
  }
}

const createSeedHydration = (): HydrationPayload => {
  const now = new Date().toISOString()
  const nowDate = new Date()

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const addDays = (date: Date, amount: number) => {
    const next = new Date(date)
    next.setDate(date.getDate() + amount)
    return next
  }

  const today = formatDate(nowDate)
  const pushDay = formatDate(addDays(nowDate, -2))
  const pullDay = formatDate(addDays(nowDate, 3))

  const nutrition: DailyNutrition = {
    waterIntakeMl: 1800,
    meals: {
      breakfast: [
        {
          id: 'meal-breakfast-1',
          mealType: 'breakfast',
          name: '燕麥牛奶',
          calories: 320,
        },
      ],
      lunch: [
        {
          id: 'meal-lunch-1',
          mealType: 'lunch',
          name: '雞胸便當',
          calories: 560,
        },
      ],
      dinner: [
        {
          id: 'meal-dinner-1',
          mealType: 'dinner',
          name: '鮭魚沙拉',
          calories: 420,
        },
      ],
    },
  }

  return {
    exercises: [
      {
        id: 'exercise-squat',
        name: '槓鈴深蹲',
        category: 'strength',
        bodyPart: '腿',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'exercise-bench',
        name: '臥推',
        category: 'strength',
        bodyPart: '胸',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'exercise-row',
        name: '俯身划船',
        category: 'strength',
        bodyPart: '背',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'exercise-run',
        name: '跑步機慢跑',
        category: 'cardio',
        createdAt: now,
        updatedAt: now,
      },
    ],
    sessions: [
      {
        id: `session-${pushDay}`,
        date: pushDay,
        note: '推訓—胸肩三頭',
        entries: [
          {
            id: 'entry-bench-1',
            exerciseId: 'exercise-bench',
            note: '漸進增加重量',
            sets: [
              { id: 'set-bench-1', weight: 60, unit: 'kg', reps: 8 },
              { id: 'set-bench-2', weight: 70, unit: 'kg', reps: 6 },
            ],
          },
        ],
        createdAt: now,
        updatedAt: now,
        isCoachSession: true,
      },
      {
        id: `session-${today}`,
        date: today,
        note: '腿部訓練',
        entries: [
          {
            id: 'entry-squat-1',
            exerciseId: 'exercise-squat',
            sets: [
              { id: 'set-squat-1', weight: 80, unit: 'kg', reps: 8 },
              { id: 'set-squat-2', weight: 90, unit: 'kg', reps: 6 },
            ],
          },
          {
            id: 'entry-run-1',
            exerciseId: 'exercise-run',
            note: '慢跑暖身',
            durationMinutes: 30,
            sets: [],
          },
        ],
        nutrition,
        createdAt: now,
        updatedAt: now,
        isCoachSession: false,
      },
      {
        id: `session-${pullDay}`,
        date: pullDay,
        note: '拉訓—背與二頭',
        entries: [
          {
            id: 'entry-row-1',
            exerciseId: 'exercise-row',
            sets: [
              { id: 'set-row-1', weight: 40, unit: 'kg', reps: 10 },
              { id: 'set-row-2', weight: 45, unit: 'kg', reps: 8 },
            ],
          },
        ],
        createdAt: now,
        updatedAt: now,
        isCoachSession: false,
      },
    ],
  }
}

export const createDemoPersistenceService = (): PersistenceService => {
  let state = createSeedHydration()

  return {
    async loadHydration() {
      return cloneHydration(state)
    },
    async saveExercises(exercises) {
      state = {
        ...state,
        exercises: exercises.map((exercise) => ({ ...exercise })),
      }
    },
    async saveSessions(sessions) {
      state = {
        ...state,
        sessions: sessions.map((session) => ({
          ...session,
          entries: session.entries.map((entry) => ({
            ...entry,
            sets: entry.sets.map((set) => ({ ...set })),
          })),
          nutrition: cloneNutrition(session.nutrition),
        })),
      }
    },
    async clear() {
      state = { exercises: [], sessions: [] }
    },
  }
}

export type DemoPersistenceService = ReturnType<typeof createDemoPersistenceService>
