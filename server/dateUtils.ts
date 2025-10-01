type Direction = 'APP->DB' | 'DB->APP'

const logFlow = (direction: Direction, label: string, original: unknown, formatted: string) => {
  console.log(`[DateUtils] ${direction} ${label}`, { original, formatted })
}

const fallbackIso = () => new Date().toISOString()
const fallbackDateOnly = () => fallbackIso().slice(0, 10)

export const normalizeTimestampFromDb = (value: Date | string | null, label: string): string => {
  if (value instanceof Date) {
    const formatted = value.toISOString()
    logFlow('DB->APP', label, value, formatted)
    return formatted
  }

  if (typeof value === 'string' && value.length) {
    logFlow('DB->APP', label, value, value)
    return value
  }

  const fallback = fallbackIso()
  logFlow('DB->APP', label, value, fallback)
  return fallback
}

export const normalizeDateFromDb = (value: Date | string | null, label: string): string => {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    const formatted = `${year}-${month}-${day}`
    logFlow('DB->APP', label, value, formatted)
    return formatted
  }

  if (typeof value === 'string' && value.length) {
    const formatted = value.length >= 10 ? value.slice(0, 10) : value
    logFlow('DB->APP', label, value, formatted)
    return formatted
  }

  const fallback = fallbackDateOnly()
  logFlow('DB->APP', label, value, fallback)
  return fallback
}

export const prepareTimestampForDb = (value: string, label: string): Date => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp provided for ${label}`)
  }

  const formatted = date.toISOString()
  logFlow('APP->DB', label, value, formatted)
  return date
}

export const prepareDateForDb = (value: string, label: string): string => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid date provided for ${label}`)
  }

  logFlow('APP->DB', label, value, normalized)
  return normalized
}
