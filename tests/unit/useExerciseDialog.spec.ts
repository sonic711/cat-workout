import { computed, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { useExerciseDialog } from '@/composables/sessionEditor/useExerciseDialog'

describe('useExerciseDialog', () => {
  it('opens the dialog when editable and tracks target index', () => {
    const isReadOnly = ref(false)
    const dialog = useExerciseDialog({ isReadOnly })

    dialog.openExerciseDialog(2)

    expect(dialog.exerciseDialogVisible.value).toBe(true)
    expect(dialog.exerciseDialogTargetEntry.value).toBe(2)
  })

  it('does not open in read-only mode', () => {
    const isReadOnly = ref(true)
    const dialog = useExerciseDialog({ isReadOnly })

    dialog.openExerciseDialog(1)

    expect(dialog.exerciseDialogVisible.value).toBe(false)
    expect(dialog.exerciseDialogTargetEntry.value).toBeNull()
  })

  it('resets the form and target entry', () => {
    const isReadOnly = ref(false)
    const dialog = useExerciseDialog({ isReadOnly })

    dialog.newExerciseForm.name = 'Bench'
    dialog.newExerciseForm.bodyPart = '胸'
    dialog.newExerciseForm.category = 'cardio'
    dialog.exerciseDialogTargetEntry.value = 5

    dialog.resetExerciseDialog()

    expect(dialog.newExerciseForm).toMatchObject({
      name: '',
      bodyPart: '',
      category: 'strength',
    })
    expect(dialog.exerciseDialogTargetEntry.value).toBeNull()
  })

  it('clears body part when switching to cardio', async () => {
    const isReadOnly = ref(false)
    const dialog = useExerciseDialog({ isReadOnly })

    dialog.newExerciseForm.bodyPart = '腿'
    dialog.newExerciseForm.category = 'cardio'
    await nextTick()

    expect(dialog.newExerciseForm.bodyPart).toBe('')
    expect(dialog.isNewExerciseStrength.value).toBe(false)
  })
})
