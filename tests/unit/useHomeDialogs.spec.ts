import { ref } from 'vue'
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useHomeDialogs } from '@/composables/home/useHomeDialogs'

vi.mock('element-plus', () => ({
  ElMessage: {
    info: vi.fn(),
  },
}))

import { ElMessage } from 'element-plus'

describe('useHomeDialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents opening the editor in read-only mode and shows an info toast', () => {
    const canEdit = ref(false)
    const isLoggedIn = ref(true)
    const isHydrated = ref(true)
    const ensureHydrated = vi.fn()

    const dialogs = useHomeDialogs({
      canEdit,
      isLoggedIn,
      isHydrated,
      ensureHydrated,
    })

    dialogs.openEditor()

    expect(ElMessage.info).toHaveBeenCalledWith('目前為唯讀模式，請輸入帳號與密碼以編輯訓練內容。')
    expect(dialogs.isEditorVisible.value).toBe(false)
    expect(ensureHydrated).not.toHaveBeenCalled()
  })

  it('opens the editor when editable, hydrating if necessary', () => {
    const canEdit = ref(true)
    const isLoggedIn = ref(true)
    const isHydrated = ref(false)
    const ensureHydrated = vi.fn()

    const dialogs = useHomeDialogs({
      canEdit,
      isLoggedIn,
      isHydrated,
      ensureHydrated,
    })

    dialogs.openEditor()

    expect(dialogs.isEditorVisible.value).toBe(true)
    expect(ensureHydrated).toHaveBeenCalledTimes(1)
    expect(ElMessage.info).not.toHaveBeenCalled()

    dialogs.closeEditor()
    expect(dialogs.isEditorVisible.value).toBe(false)
  })

  it('guards the exercise manager by login state', () => {
    const canEdit = ref(true)
    const isLoggedIn = ref(false)
    const isHydrated = ref(true)
    const ensureHydrated = vi.fn()

    const dialogs = useHomeDialogs({
      canEdit,
      isLoggedIn,
      isHydrated,
      ensureHydrated,
    })

    dialogs.openExerciseManager()
    expect(ElMessage.info).toHaveBeenCalledWith('請先登入以瀏覽訓練動作清單。')
    expect(dialogs.isExerciseManagerVisible.value).toBe(false)

    vi.clearAllMocks()
    isLoggedIn.value = true

    dialogs.openExerciseManager()
    expect(dialogs.isExerciseManagerVisible.value).toBe(true)
    expect(ElMessage.info).not.toHaveBeenCalled()
  })
})
