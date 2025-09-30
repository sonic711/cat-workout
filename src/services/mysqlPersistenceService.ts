import type {
  ExerciseDefinition,
  HydrationPayload,
  WorkoutSession,
} from '@/types/workout'
import {
  type PersistenceOptions,
  type PersistenceService,
  createNotImplementedService,
} from './persistenceService'

export interface MysqlPersistenceOptions extends PersistenceOptions {
  baseUrl?: string
  storageKey?: string
}

interface RequestOptions extends RequestInit {
  parseJson?: boolean
}

const DEFAULT_BASE_URL = '/api'
const DEFAULT_STORAGE_KEY = 'cat-workout.mysql.default'
const STORAGE_HEADER = 'x-storage-key'

const createRequest = (baseUrl: string, storageKey: string) => {
  const toUrl = (path: string) => `${baseUrl}${path}`

  const applyHeaders = (init: RequestOptions = {}): RequestOptions => {
    const headers = new Headers(init.headers ?? {})
    headers.set('Accept', 'application/json')
    headers.set(STORAGE_HEADER, storageKey)
    return { ...init, headers }
  }

  const request = async <T = unknown>(path: string, init: RequestOptions = {}): Promise<T | void> => {
    const response = await fetch(toUrl(path), applyHeaders(init))
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `Request to ${path} failed with status ${response.status}`)
    }
    if (init.parseJson === false || response.status === 204) {
      return undefined
    }
    return (await response.json()) as T
  }

  return request
}

export const createMysqlPersistenceService = (
  options?: MysqlPersistenceOptions,
): PersistenceService => {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY
  const enableLogging = options?.enableLogging ?? false
  const log = (message: string, payload?: unknown) => {
    if (!enableLogging) {
      return
    }
    if (payload) {
      console.info(`[MysqlPersistence] ${message}`, payload)
    } else {
      console.info(`[MysqlPersistence] ${message}`)
    }
  }

  if (typeof fetch === 'undefined') {
    console.warn('[MysqlPersistence] Fetch API is unavailable in this environment.')
    return createNotImplementedService()
  }

  const request = createRequest(baseUrl, storageKey)

  return {
    async loadHydration() {
      const payload = await request<HydrationPayload>('/hydration')
      log('Loaded hydration payload', {
        exerciseCount: payload?.exercises.length ?? 0,
        sessionCount: payload?.sessions.length ?? 0,
      })
      return payload ?? null
    },

    async saveExercises(exercises: ExerciseDefinition[]) {
      await request('/exercises', {
        method: 'PUT',
        body: JSON.stringify(exercises),
        headers: { 'Content-Type': 'application/json' },
        parseJson: false,
      })
      log('Saved exercises', { count: exercises.length })
    },

    async saveSessions(sessions: WorkoutSession[]) {
      await request('/sessions', {
        method: 'PUT',
        body: JSON.stringify(sessions),
        headers: { 'Content-Type': 'application/json' },
        parseJson: false,
      })
      log('Saved sessions', { count: sessions.length })
    },

    async clear() {
      await request('/data', {
        method: 'DELETE',
        parseJson: false,
      })
      log('Cleared persisted data')
    },
  }
}

export type MysqlPersistenceService = ReturnType<typeof createMysqlPersistenceService>
