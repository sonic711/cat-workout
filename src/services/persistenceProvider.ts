import { createDemoPersistenceService } from './demoPersistenceService'
import type { PersistenceService } from './persistenceService'
import { createSqlitePersistenceService, isSqlitePersistenceSupported } from './sqlitePersistenceService'

let currentService: PersistenceService | null = null

export const getPersistenceService = (): PersistenceService => {
  if (!currentService) {
    if (isSqlitePersistenceSupported()) {
      try {
        currentService = createSqlitePersistenceService()
      } catch (error) {
        console.warn('[PersistenceProvider] Falling back to demo service due to SQLite init failure.', error)
        currentService = createDemoPersistenceService()
      }
    } else {
      console.warn('[PersistenceProvider] SQLite persistence unsupported, using demo service.')
      currentService = createDemoPersistenceService()
    }
  }
  return currentService
}

export const setPersistenceService = (service: PersistenceService) => {
  currentService = service
}
