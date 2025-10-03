import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import type { useAuthStore } from '@/stores/authStore'

type AuthStore = ReturnType<typeof useAuthStore>

interface UseHomeAuthOptions {
  authStore: AuthStore
  ensureHydrated: () => Promise<void>
  resetSelection: () => void
}

// Wraps login/logout flows so the view can focus on wiring instead of side-effects.
export const useHomeAuth = ({ authStore, ensureHydrated, resetSelection }: UseHomeAuthOptions) => {
  const loginUsername = ref('')
  const loginPassword = ref('')
  const isLoggingIn = ref(false)

  const handleLogin = async () => {
    if (isLoggingIn.value) {
      return
    }
    isLoggingIn.value = true
    try {
      const trimmedUsername = loginUsername.value.trim()
      const success = await authStore.login({
        username: trimmedUsername,
        password: loginPassword.value || undefined,
      })
      if (success) {
        loginUsername.value = trimmedUsername
        loginPassword.value = ''
        await ensureHydrated()
        ElMessage.success(
          authStore.canEdit ? '登入成功，已啟用編輯權限。' : '已切換為唯讀模式，可瀏覽個人訓練紀錄。',
        )
      } else if (authStore.lastError) {
        ElMessage.error(authStore.lastError)
      }
    } finally {
      isLoggingIn.value = false
    }
  }

  const handleLogout = async () => {
    await authStore.logout()
    loginPassword.value = ''
    ElMessage.info('已登出，回到訪客模式。')
    resetSelection()
    await ensureHydrated()
  }

  const initializeAuth = async () => {
    await authStore.initialize()
    await ensureHydrated()
  }

  // Auto-refresh workouts when the active user changes (login switch or persisted auth).
  watch(
    () => authStore.username,
    async (value) => {
      if (value) {
        resetSelection()
        await ensureHydrated()
      }
    },
  )

  return {
    handleLogin,
    handleLogout,
    initializeAuth,
    isLoggingIn,
    loginPassword,
    loginUsername,
  }
}
