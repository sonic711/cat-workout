import { computed, reactive, ref, watch } from 'vue'

import type { ExerciseCategory, ExerciseDefinition } from '@/types/workout'

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: '重量訓練',
  cardio: '有氧運動',
}

const categoryOptions: { value: ExerciseCategory; label: string }[] = [
  { value: 'strength', label: CATEGORY_LABELS.strength },
  { value: 'cardio', label: CATEGORY_LABELS.cardio },
]

// Provides reusable form state for the exercise manager dialog.
export const useExerciseManagerForm = () => {
  const mode = ref<'create' | 'edit'>('create')
  const editingExerciseId = ref<string | null>(null)

  const form = reactive({
    name: '',
    bodyPart: '',
    category: 'strength' as ExerciseCategory,
  })

  const isStrengthCategory = computed(() => form.category === 'strength')

  const resetForm = () => {
    form.name = ''
    form.bodyPart = ''
    form.category = 'strength'
    mode.value = 'create'
    editingExerciseId.value = null
  }

  const startCreate = () => {
    resetForm()
  }

  const startEdit = (exercise: ExerciseDefinition) => {
    mode.value = 'edit'
    editingExerciseId.value = exercise.id
    form.name = exercise.name
    form.bodyPart = exercise.bodyPart ?? ''
    form.category = exercise.category
  }

  const applyCardioDefaults = (category: ExerciseCategory) => {
    if (category === 'cardio') {
      form.bodyPart = ''
    }
  }

  watch(
    () => form.category,
    (value) => {
      applyCardioDefaults(value)
    },
  )

  return {
    CATEGORY_LABELS,
    categoryOptions,
    editingExerciseId,
    form,
    isStrengthCategory,
    mode,
    resetForm,
    startCreate,
    startEdit,
  }
}
