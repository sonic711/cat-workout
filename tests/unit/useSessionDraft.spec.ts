import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSessionDraft, sessionDraftUtils } from '@/composables/sessionEditor/useSessionDraft'
import type { ExerciseDefinition, WorkoutSession } from '@/types/workout'

const createHarness = () => {
  const date = ref('2024-05-12')
  const session = ref<WorkoutSession | null>(null)
  const exercises = ref<Record<string, ExerciseDefinition>>({
    bench: {
      id: 'bench',
      name: 'Bench Press',
      category: 'strength',
      bodyPart: '胸',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    run: {
      id: 'run',
      name: 'Treadmill Run',
      category: 'cardio',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  })

  const draftApi = useSessionDraft({
    date: computed(() => date.value),
    session: computed(() => session.value),
    exercises,
    isActive: ref(true),
  })

  return {
    date,
    session,
    exercises,
    ...draftApi,
  }
}

describe('useSessionDraft', () => {
  let harness: ReturnType<typeof createHarness>

  beforeEach(() => {
    harness = createHarness()
  })

  it('hydrates an existing session and syncs entry categories', () => {
    const { hydrateDraft, draft } = harness

    const existingSession: WorkoutSession = {
      id: 'session-1',
      date: '2024-05-11',
      note: '  push day  ',
      entries: [
        {
          id: 'e-1',
          exerciseId: 'bench',
          note: '  warmup set  ',
          sets: [
            {
              id: 'set-1',
              weight: 60,
              unit: 'kg',
              reps: 8,
              note: ' focus ',
            },
          ],
        },
        {
          id: 'e-2',
          exerciseId: 'run',
          note: ' cardio ',
          sets: [],
          durationMinutes: 42,
        },
      ],
      nutrition: {
        waterIntakeMl: 900,
        meals: {
          breakfast: [
            { id: 'n-1', name: 'Oatmeal', calories: 320, mealType: 'breakfast', note: ' berries ' },
          ],
          lunch: [],
          dinner: [],
        },
      },
      bodyWeightKg: 81.6,
      isCoachSession: true,
      createdAt: '2024-05-11T00:00:00Z',
      updatedAt: '2024-05-11T01:00:00Z',
    }

    hydrateDraft(existingSession)

    expect(draft.value.entries).toHaveLength(2)
    const [strengthEntry, cardioEntry] = draft.value.entries

    expect(strengthEntry.exerciseId).toBe('bench')
    expect(strengthEntry.categoryHint).toBe('strength')
    expect(strengthEntry.sets).toHaveLength(1)
    expect(strengthEntry.sets[0].note).toBe(' focus ')

    expect(cardioEntry.exerciseId).toBe('run')
    expect(cardioEntry.categoryHint).toBe('cardio')
    expect(cardioEntry.sets).toEqual([])
    expect(cardioEntry.durationMinutes).toBe(42)

    expect(draft.value.nutrition.meals.breakfast[0].note).toBe(' berries ')
    expect(draft.value.isCoachSession).toBe(true)
    expect(draft.value.bodyWeightKg).toBe(81.6)
  })

  it('duplicates the previous strength set when adding a new set', () => {
    const { addEntry, addSet } = harness

    const entry = addEntry('strength')
    entry.exerciseId = 'bench'
    entry.sets[0].weight = 50
    entry.sets[0].unit = 'kg'
    entry.sets[0].reps = 10
    entry.sets[0].note = 'warmup'

    addSet(entry)

    expect(entry.sets).toHaveLength(2)
    expect(entry.sets[1]).toMatchObject({
      weight: 50,
      unit: 'kg',
      reps: 10,
      note: 'warmup',
    })
  })

  it('keeps at least one set for strength entries when removing the last set', () => {
    const { addEntry, removeSet } = harness

    const entry = addEntry('strength')
    entry.exerciseId = 'bench'

    removeSet(entry, 0)

    expect(entry.sets).toHaveLength(1)
    expect(entry.sets[0].weight).toBe(0)
    expect(entry.sets[0].reps).toBe(0)
    expect(entry.sets[0].unit).toBe('lb')
  })

  it('converts an entry to cardio when selecting a cardio exercise', () => {
    const { addEntry, handleEntryExerciseChange, isCardioEntry } = harness

    const entry = addEntry('strength')
    entry.exerciseId = 'bench'
    handleEntryExerciseChange(entry)

    entry.exerciseId = 'run'
    handleEntryExerciseChange(entry)

    expect(entry.categoryHint).toBe('cardio')
    expect(entry.sets).toEqual([])
    expect(entry.durationMinutes).toBe(sessionDraftUtils.DEFAULT_CARDIO_DURATION)
    expect(isCardioEntry(entry)).toBe(true)
  })

  it('sanitizes the draft before persisting', () => {
    const { addEntry, handleEntryExerciseChange, sanitizeDraft, draft } = harness

    draft.value.note = '  session notes  '
    draft.value.bodyWeightKg = 83.74
    draft.value.nutrition.waterIntakeMl = 1400

    draft.value.nutrition.meals.breakfast.push({
      mealType: 'breakfast',
      name: '  smoothie ',
      calories: 280,
      note: '  mango ',
    })

    const strengthEntry = addEntry('strength')
    strengthEntry.exerciseId = 'bench'
    strengthEntry.note = '  heavy bench  '
    strengthEntry.sets[0].weight = 92.5
    strengthEntry.sets[0].unit = 'kg'
    strengthEntry.sets[0].reps = 4
    strengthEntry.sets[0].note = '  pause  '

    const cardioEntry = addEntry('cardio')
    cardioEntry.exerciseId = 'run'
    handleEntryExerciseChange(cardioEntry)
    cardioEntry.durationMinutes = 44.6
    cardioEntry.note = '  easy pace  '

    const sanitized = sanitizeDraft()

    expect(sanitized.note).toBe('session notes')
    expect(sanitized.bodyWeightKg).toBe(83.7)
    const breakfastItem = sanitized.nutrition?.meals.breakfast[0]
    expect(breakfastItem?.name).toBe('  smoothie ')
    expect(breakfastItem?.note).toBe('mango')

    const [firstEntry, secondEntry] = sanitized.entries
    expect(firstEntry.note).toBe('heavy bench')
    expect(firstEntry.sets[0]).toMatchObject({
      weight: 92.5,
      unit: 'kg',
      reps: 4,
      note: 'pause',
    })

    expect(secondEntry.durationMinutes).toBe(45)
    expect(secondEntry.sets).toHaveLength(0)
  })
})
