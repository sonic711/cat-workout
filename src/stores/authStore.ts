import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { configurePersistenceService } from '@/services/persistenceProvider'
import { useWorkoutStore } from './workoutStore'

type AuthMode = 'guest' | 'view' | 'edit'

type LoginPayload = {
  username: string
  password?: string
}

interface PersistedAuthState {
  username: string
  mode: AuthMode
}

const predefinedUsers: Record<string, { password: string }> = {
  admin: { password: 'admin' },
  sean: { password: 'sean' },
  shekx: { password: 'shekx' },
  72: { password: '72' },
}

const normalizeUsername = (value: string) => value.trim().toLowerCase()

const storageKeyForUser = (username: string) => `cat-workout.mysql.${normalizeUsername(username)}`

const AUTH_STORAGE_KEY = 'cat-workout.auth.state'

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const readPersistedState = (): PersistedAuthState | null => {
  const storage = getLocalStorage()
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as PersistedAuthState | null
    if (!parsed || typeof parsed.username !== 'string' || typeof parsed.mode !== 'string') {
      return null
    }
    if (!['guest', 'view', 'edit'].includes(parsed.mode)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const persistState = (state: PersistedAuthState | null) => {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }
  try {
    if (!state) {
      storage.removeItem(AUTH_STORAGE_KEY)
      return
    }
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore persistence errors silently
  }
}

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
    persistState({ username: trimmed, mode: nextMode })

    return true
  }

  const logout = async () => {
    username.value = null
    mode.value = 'guest'
    lastError.value = null
    await applyPersistenceContext()
    persistState(null)
  }

  const initialize = async () => {
    if (isInitializing.value) {
      return
    }
    isInitializing.value = true
    try {
      const persisted = readPersistedState()
      if (persisted) {
        const normalized = normalizeUsername(persisted.username)
        if (predefinedUsers[normalized]) {
          username.value = persisted.username
          mode.value = persisted.mode
          await applyPersistenceContext(storageKeyForUser(persisted.username))
          return
        }
        persistState(null)
      }
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
