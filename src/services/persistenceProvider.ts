import { createDemoPersistenceService } from './demoPersistenceService'
import type { PersistenceService } from './persistenceService'

let currentService: PersistenceService | null = null

export const getPersistenceService = (): PersistenceService => {
  if (!currentService) {
    currentService = createDemoPersistenceService()
  }
  return currentService
}

export const setPersistenceService = (service: PersistenceService) => {
  currentService = service
}
