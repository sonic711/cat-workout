import type { PersistenceService } from './persistenceService'
import type {
  DailyNutrition,
  ExerciseDefinition,
  HydrationPayload,
  MealType,
  CreateExercisePayload,
  UpdateExercisePayload,
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
        bodyWeightKg: 68.2,
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
        bodyWeightKg: 68.8,
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
        bodyWeightKg: 68.5,
      },
    ],
  }
}

export const createDemoPersistenceService = (): PersistenceService => {
  let state = createSeedHydration()

  const isExerciseInUse = (exerciseId: string) =>
    state.sessions.some((session) => session.entries.some((entry) => entry.exerciseId === exerciseId))

  const findExerciseById = (exerciseId: string) =>
    state.exercises.find((exercise) => exercise.id === exerciseId)

  const findExerciseByNameCategory = (
    name: string,
    category: ExerciseDefinition['category'],
    excludeId?: string,
  ) => {
    const targetName = name.toLowerCase()
    return state.exercises.find(
      (exercise) =>
        exercise.id !== excludeId &&
        exercise.category === category &&
        exercise.name.toLowerCase() === targetName,
    )
  }

  const cloneExercise = (exercise: ExerciseDefinition): ExerciseDefinition => ({ ...exercise })

  return {
    async loadHydration() {
      return cloneHydration(state)
    },
    async createExercise(payload: CreateExercisePayload) {
      const name = normalizeLabel(payload.name)
      if (!name) {
        throw new Error('Exercise name is required.')
      }

      const category = payload.category === 'cardio' ? 'cardio' : 'strength'
      let bodyPart: string | undefined
      if (category === 'strength') {
        bodyPart = normalizeLabel(payload.bodyPart ?? '')
        if (!bodyPart) {
          throw new Error('請輸入身體部位。')
        }
      }

      const existing = findExerciseByNameCategory(name, category)
      if (existing) {
        return cloneExercise(existing)
      }

      const timestamp = nowIso()
      const created: ExerciseDefinition = {
        id: generateId(),
        name,
        category,
        bodyPart,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      state = {
        ...state,
        exercises: [...state.exercises, created],
      }

      return cloneExercise(created)
    },
    async updateExercise(payload: UpdateExercisePayload) {
      const target = findExerciseById(payload.id)
      if (!target) {
        throw new Error('找不到對應的訓練動作')
      }

      const name = normalizeLabel(payload.name)
      if (!name) {
        throw new Error('Exercise name is required.')
      }

      const category = payload.category === 'cardio' ? 'cardio' : 'strength'

      if (category !== target.category && isExerciseInUse(target.id)) {
        throw new Error('已有訓練紀錄使用此動作，無法變更分類。')
      }

      let bodyPart: string | undefined
      if (category === 'strength') {
        bodyPart = normalizeLabel(payload.bodyPart ?? target.bodyPart ?? '')
        if (!bodyPart) {
          throw new Error('請輸入身體部位。')
        }
      }

      const duplicate = findExerciseByNameCategory(name, category, target.id)
      if (duplicate) {
        throw new Error('已有相同名稱的訓練動作，請使用其他名稱。')
      }

      const timestamp = nowIso()
      const updated: ExerciseDefinition = {
        ...target,
        name,
        category,
        bodyPart,
        updatedAt: timestamp,
      }

      state = {
        ...state,
        exercises: state.exercises.map((exercise) =>
          exercise.id === updated.id ? updated : exercise,
        ),
      }

      return cloneExercise(updated)
    },
    async deleteExercise(exerciseId: string) {
      const target = findExerciseById(exerciseId)
      if (!target) {
        return
      }
      if (isExerciseInUse(exerciseId)) {
        throw new Error('該訓練動作仍有訓練紀錄使用，請先調整訓練內容後再刪除。')
      }

      state = {
        ...state,
        exercises: state.exercises.filter((exercise) => exercise.id !== exerciseId),
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
      state = { ...state, sessions: [] }
    },
  }
}

export type DemoPersistenceService = ReturnType<typeof createDemoPersistenceService>
