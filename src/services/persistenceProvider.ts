import { createDemoPersistenceService } from './demoPersistenceService'
import type { PersistenceOptions, PersistenceService } from './persistenceService'
import {
  type SqlitePersistenceOptions,
  createSqlitePersistenceService,
  isSqlitePersistenceSupported,
} from './sqlitePersistenceService'

let currentService: PersistenceService | null = null
let currentKey: string | null = null

type ConfigureOptions = (SqlitePersistenceOptions & PersistenceOptions) | undefined

const buildService = (options?: ConfigureOptions): PersistenceService => {
  if (isSqlitePersistenceSupported()) {
    try {
      return createSqlitePersistenceService(options)
    } catch (error) {
      console.warn('[PersistenceProvider] Falling back to demo service due to SQLite init failure.', error)
    }
  } else {
    console.warn('[PersistenceProvider] SQLite persistence unsupported, using demo service.')
  }
  return createDemoPersistenceService()
}

export const configurePersistenceService = (options?: ConfigureOptions) => {
  const storageKey = options?.storageKey ?? null
  if (currentService && currentKey === storageKey) {
    return currentService
  }

  currentService = buildService(options)
  currentKey = storageKey
  return currentService
}

export const getPersistenceService = (): PersistenceService => {
  if (!currentService) {
    currentService = configurePersistenceService()
  }
  return currentService
}

export const setPersistenceService = (service: PersistenceService) => {
  currentService = service
  currentKey = null
}
