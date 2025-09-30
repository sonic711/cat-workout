import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { configurePersistenceService } from '@/services/persistenceProvider'
import { useWorkoutStore } from './workoutStore'

type AuthMode = 'guest' | 'view' | 'edit'

type LoginPayload = {
  username: string
  password?: string
}

const predefinedUsers: Record<string, { password: string }> = {
  admin: { password: 'admin' },
  sean: { password: 'sean' },
  shex: { password: 'shex' },
}

const normalizeUsername = (value: string) => value.trim().toLowerCase()

const storageKeyForUser = (username: string) => `cat-workout.mysql.${normalizeUsername(username)}`

export const useAuthStore = defineStore('auth', () => {
  const username = ref<string | null>(null)
  const mode = ref<AuthMode>('guest')
  const lastError = ref<string | null>(null)
  const isInitializing = ref(false)

  const isLoggedIn = computed(() => mode.value !== 'guest')
  const canEdit = computed(() => mode.value === 'edit')
  const displayName = computed(() => username.value ?? '訪客')
  const currentModeLabel = computed(() => {
    if (mode.value === 'edit') {
      return '編輯模式'
    }
    if (mode.value === 'view') {
      return '唯讀模式'
    }
    return '未登入'
  })

  const applyPersistenceContext = async (storageKey?: string) => {
    configurePersistenceService(storageKey ? { storageKey } : undefined)
    const workoutStore = useWorkoutStore()
    workoutStore.clearLocalState()
    await workoutStore.hydrateFromPersistence()
  }

  const login = async ({ username: rawUsername, password }: LoginPayload) => {
    const trimmed = rawUsername.trim()
    if (!trimmed) {
      lastError.value = '請輸入帳號'
      return false
    }

    const normalized = normalizeUsername(trimmed)
    const credential = predefinedUsers[normalized]
    if (!credential) {
      lastError.value = '帳號不存在'
      return false
    }
    let nextMode: AuthMode

    if (password && password.length) {
      if (!credential || credential.password !== password) {
        lastError.value = '帳號或密碼錯誤'
        return false
      }
      nextMode = 'edit'
    } else {
      nextMode = 'view'
    }

    username.value = trimmed
    mode.value = nextMode
    lastError.value = null

    await applyPersistenceContext(storageKeyForUser(trimmed))

    return true
  }

  const logout = async () => {
    username.value = null
    mode.value = 'guest'
    lastError.value = null
    await applyPersistenceContext()
  }

  const initialize = async () => {
    if (isInitializing.value) {
      return
    }
    isInitializing.value = true
    try {
      await applyPersistenceContext()
    } finally {
      isInitializing.value = false
    }
  }

  return {
    username,
    mode,
    lastError,
    isInitializing,
    isLoggedIn,
    canEdit,
    displayName,
    currentModeLabel,
    login,
    logout,
    initialize,
  }
})
