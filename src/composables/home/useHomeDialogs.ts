import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'

interface UseHomeDialogsOptions {
  canEdit: Ref<boolean>
  isLoggedIn: Ref<boolean>
  isHydrated: Ref<boolean>
  ensureHydrated: () => Promise<void>
}

// Handles editor and exercise manager dialogs with guardrails around permissions.
export const useHomeDialogs = ({
  canEdit,
  isLoggedIn,
  isHydrated,
  ensureHydrated,
}: UseHomeDialogsOptions) => {
  const isEditorVisible = ref(false)
  const isExerciseManagerVisible = ref(false)

  const openEditor = () => {
    if (!canEdit.value) {
      ElMessage.info('目前為唯讀模式，請輸入帳號與密碼以編輯訓練內容。')
      return
    }
    if (!isHydrated.value) {
      void ensureHydrated()
    }
    isEditorVisible.value = true
  }

  const closeEditor = () => {
    isEditorVisible.value = false
  }

  const openExerciseManager = () => {
    if (!isLoggedIn.value) {
      ElMessage.info('請先登入以瀏覽訓練動作清單。')
      return
    }
    isExerciseManagerVisible.value = true
  }

  const closeExerciseManager = () => {
    isExerciseManagerVisible.value = false
  }

  return {
    closeEditor,
    closeExerciseManager,
    isEditorVisible,
    isExerciseManagerVisible,
    openEditor,
    openExerciseManager,
  }
}
