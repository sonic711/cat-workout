import { createDemoPersistenceService } from './demoPersistenceService'
import type { PersistenceService } from './persistenceService'
import {
  type MysqlPersistenceOptions,
  createMysqlPersistenceService,
} from './mysqlPersistenceService'

let currentService: PersistenceService | null = null
let currentKey: string | null = null

type ConfigureOptions = MysqlPersistenceOptions | undefined

const buildService = (options?: ConfigureOptions): PersistenceService => {
  try {
    return createMysqlPersistenceService(options)
  } catch (error) {
    console.warn('[PersistenceProvider] Falling back to demo service due to MySQL init failure.', error)
    return createDemoPersistenceService()
  }
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
