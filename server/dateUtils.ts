const fallbackIso = () => new Date().toISOString()
const fallbackDateOnly = () => fallbackIso().slice(0, 10)

export const normalizeTimestampFromDb = (value: Date | string | null, label: string): string => {
  if (value instanceof Date) {
      return value.toISOString()
  }

  if (typeof value === 'string' && value.length) {
    return value
  }

  return fallbackIso()
}

export const normalizeDateFromDb = (value: Date | string | null, label: string): string => {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
  }

  if (typeof value === 'string' && value.length) {
      return value.length >= 10 ? value.slice(0, 10) : value
  }

  return fallbackDateOnly()
}

export const prepareTimestampForDb = (value: string, label: string): Date => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp provided for ${label}`)
  }
  return date
}

export const prepareDateForDb = (value: string, label: string): string => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid date provided for ${label}`)
  }

  return normalized
}
