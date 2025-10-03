import { computed, reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'

import type { ExerciseCategory } from '@/types/workout'

interface UseExerciseDialogOptions {
  isReadOnly: Ref<boolean>
}

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: '重量訓練',
  cardio: '有氧運動',
}

const categoryOptions: { value: ExerciseCategory; label: string }[] = [
  { value: 'strength', label: CATEGORY_LABELS.strength },
  { value: 'cardio', label: CATEGORY_LABELS.cardio },
]

// Manages the inline dialog for creating new exercises from within the session editor.
export const useExerciseDialog = ({ isReadOnly }: UseExerciseDialogOptions) => {
  const exerciseDialogVisible = ref(false)
  const exerciseDialogTargetEntry = ref<number | null>(null)

  const newExerciseForm = reactive({
    name: '',
    bodyPart: '',
    category: 'strength' as ExerciseCategory,
  })

  const isNewExerciseStrength = computed(() => newExerciseForm.category === 'strength')

  const openExerciseDialog = (entryIndex: number) => {
    if (isReadOnly.value) {
      return
    }
    exerciseDialogTargetEntry.value = entryIndex
    exerciseDialogVisible.value = true
  }

  const resetExerciseDialog = () => {
    newExerciseForm.name = ''
    newExerciseForm.bodyPart = ''
    newExerciseForm.category = 'strength'
    exerciseDialogTargetEntry.value = null
  }

  watch(
    () => newExerciseForm.category,
    (value) => {
      if (value === 'cardio') {
        newExerciseForm.bodyPart = ''
      }
    },
  )

  return {
    CATEGORY_LABELS,
    categoryOptions,
    exerciseDialogTargetEntry,
    exerciseDialogVisible,
    isNewExerciseStrength,
    newExerciseForm,
    openExerciseDialog,
    resetExerciseDialog,
  }
}
