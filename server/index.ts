import express, { type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import { createPool, type Pool, type PoolConnection } from 'mysql2/promise'

import {
  normalizeDateFromDb,
  normalizeTimestampFromDb,
  prepareDateForDb,
  prepareTimestampForDb,
} from './dateUtils'

type ExerciseCategory = 'strength' | 'cardio'

interface ExerciseRow {
  id: string
  name: string
  category: string
  bodyPart: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface SessionRow {
  id: string
  date: string | Date
  note: string | null
  bodyWeightKg: number | null
  waterMl: number | null
  isCoachSession: number | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface SessionEntryRow {
  id: string
  sessionId: string
  exerciseId: string
  note: string | null
  sortOrder: number
  durationMinutes: number | null
}

interface SetRow {
  id: string
  entryId: string
  weight: number
  unit: string
  reps: number
  note: string | null
  sortOrder: number
}

type MealType = 'breakfast' | 'lunch' | 'dinner'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

interface NutritionRow {
  id: string
  sessionId: string
  mealType: MealType
  name: string
  calories: number
  note: string | null
  sortOrder: number
}

interface ExerciseDefinition {
  id: string
  name: string
  category: ExerciseCategory
  bodyPart?: string
  createdAt: string
  updatedAt: string
}

interface WorkoutSet {
  id: string
  weight: number
  unit: string
  reps: number
  note?: string
}

interface WorkoutEntry {
  id: string
  exerciseId: string
  note?: string
  sets: WorkoutSet[]
  durationMinutes?: number
}

interface NutritionItem {
  id: string
  mealType: MealType
  name: string
  calories: number
  note?: string
}

interface DailyNutrition {
  meals: Record<MealType, NutritionItem[]>
  waterIntakeMl: number
}

interface WorkoutSession {
  id: string
  date: string
  note?: string
  entries: WorkoutEntry[]
  bodyWeightKg?: number
  createdAt: string
  updatedAt: string
  nutrition?: DailyNutrition
  isCoachSession?: boolean
}

interface HydrationPayload {
  exercises: ExerciseDefinition[]
  sessions: WorkoutSession[]
}

interface MysqlConfig {
  url?: string
  host: string
  port: number
  user: string
  password: string
  database: string
}

const resolveEnv = (): MysqlConfig => {
  const url = process.env.MYSQL_URL
  if (url && url.length) {
    return {
      url,
      host: '',
      port: 0,
      user: '',
      password: '',
      database: '',
    }
  }

  const required = ['MYSQL_USER', 'MYSQL_PASSWORD'] as const
  const missing = required.filter((key) => (process.env[key] ?? '').length === 0)
  if (missing.length) {
    console.warn('[MySQL] Missing environment variables:', missing)
  }

  return {
    host: process.env.MYSQL_HOST ?? '152.69.193.219',
    port: Number(process.env.MYSQL_PORT ?? '3306'),
    user: process.env.MYSQL_USER ?? 'user',
    password: process.env.MYSQL_PASSWORD ?? 'userpassword',
    database: process.env.MYSQL_DATABASE ?? 'mydatabase',
  }
}

const mysqlConfig = resolveEnv()

const pool: Pool = mysqlConfig.url
  ? createPool({
      uri: mysqlConfig.url,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      supportBigNumbers: true,
    })
  : createPool({
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: mysqlConfig.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      supportBigNumbers: true,
    })

const app = express()
app.use(express.json({ limit: '1mb' }))

const DEFAULT_TENANT = 'cat-workout.mysql.default'

const sanitizeTenant = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_TENANT
  }
  const normalized = value.trim().slice(0, 120)
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, '')
  return safe.length ? safe : DEFAULT_TENANT
}

const resolveTenant = (req: Request): string => sanitizeTenant(req.header('x-storage-key'))

const isDuplicateColumnError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_FIELDNAME'

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_KEYNAME'

const isDuplicateEntryError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_ENTRY'

const isMissingKeyOrColumnError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  ((error as { code?: string }).code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
    (error as { code?: string }).code === 'ER_KEY_DOES_NOT_EXIST')

const fallbackId = () => `id-${Math.random().toString(36).slice(2, 11)}`

const generateId = () => {
  try {
    return randomUUID()
  } catch {
    return fallbackId()
  }
}

const normalizeLabel = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const nowIso = () => new Date().toISOString()

const ensureIndex = async (connection: PoolConnection, sql: string) => {
  try {
    await connection.query(sql)
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error
    }
  }
}

const buildInsertPlaceholders = (rowCount: number, columnCount: number): string =>
  Array.from({ length: rowCount }, () => `(${Array.from({ length: columnCount }, () => '?').join(', ')})`).join(', ')

const ensureSchema = async () => {
  const connection = await pool.getConnection()
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS exercises (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(32) NOT NULL DEFAULT 'strength',
        body_part VARCHAR(64) NULL,
        created_at DATETIME(6) NOT NULL,
        updated_at DATETIME(6) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_exercises_name_category (name, category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await connection
      .query('ALTER TABLE exercises MODIFY body_part VARCHAR(64) NULL')
      .catch((error) => {
        if (!isDuplicateColumnError(error) && !isMissingKeyOrColumnError(error)) {
          throw error
        }
      })
    await deduplicateExercises(connection)
    await ensureIndex(
      connection,
      'CREATE UNIQUE INDEX uniq_exercises_name_category ON exercises (name, category)',
    )
    await connection.query(
      `CREATE TABLE IF NOT EXISTS sessions (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        date DATE NOT NULL,
        note TEXT NULL,
        body_weight_kg DOUBLE NULL,
        water_ml INT UNSIGNED NOT NULL DEFAULT 0,
        is_coach_session TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL,
        updated_at DATETIME(6) NOT NULL,
        PRIMARY KEY (tenant_id, id),
        INDEX idx_sessions_date (tenant_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await connection
      .query('ALTER TABLE sessions ADD COLUMN body_weight_kg DOUBLE NULL AFTER note')
      .catch((error) => {
        if (!isDuplicateColumnError(error)) {
          throw error
        }
      })
    await connection
      .query('ALTER TABLE sessions ADD COLUMN water_ml INT UNSIGNED NOT NULL DEFAULT 0 AFTER body_weight_kg')
      .catch((error) => {
        if (!isDuplicateColumnError(error)) {
          throw error
        }
      })
    await connection
      .query(
        'ALTER TABLE sessions ADD COLUMN is_coach_session TINYINT(1) NOT NULL DEFAULT 0 AFTER water_ml',
      )
      .catch((error) => {
        if (!isDuplicateColumnError(error)) {
          throw error
        }
      })
    await connection
      .query(
        "ALTER TABLE exercises ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'strength' AFTER name",
      )
      .catch((error) => {
        if (!isDuplicateColumnError(error)) {
          throw error
        }
      })
    await connection.query(
      `CREATE TABLE IF NOT EXISTS session_entries (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        exercise_id VARCHAR(64) NOT NULL,
        note TEXT NULL,
        duration_minutes INT UNSIGNED NOT NULL DEFAULT 0,
        sort_order INT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        CONSTRAINT fk_entries_session FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id) ON DELETE CASCADE,
        CONSTRAINT fk_entries_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT,
        INDEX idx_entries_session (tenant_id, session_id),
        INDEX idx_entries_session_sort (tenant_id, session_id, sort_order),
        INDEX idx_entries_exercise (exercise_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await connection
      .query('ALTER TABLE exercises DROP PRIMARY KEY')
      .catch((error) => {
        if (!isMissingKeyOrColumnError(error)) {
          throw error
        }
      })
    await connection
      .query('ALTER TABLE exercises DROP COLUMN tenant_id')
      .catch((error) => {
        if (!isMissingKeyOrColumnError(error)) {
          throw error
        }
      })
    await connection
      .query('ALTER TABLE exercises ADD PRIMARY KEY (id)')
      .catch((error) => {
        if (!isDuplicateKeyError(error)) {
          throw error
        }
      })
    await connection
      .query(
        'ALTER TABLE session_entries ADD CONSTRAINT fk_entries_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT',
      )
      .catch((error) => {
        if (!isDuplicateKeyError(error)) {
          throw error
        }
      })
    await connection
      .query(
        'ALTER TABLE session_entries ADD COLUMN duration_minutes INT UNSIGNED NOT NULL DEFAULT 0 AFTER note',
      )
      .catch((error) => {
        if (!isDuplicateColumnError(error)) {
          throw error
        }
      })
    await connection.query(
      `CREATE TABLE IF NOT EXISTS entry_sets (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        entry_id VARCHAR(64) NOT NULL,
        weight DOUBLE NOT NULL,
        unit VARCHAR(16) NOT NULL,
        reps INT NOT NULL,
        note TEXT NULL,
        sort_order INT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        CONSTRAINT fk_sets_entry FOREIGN KEY (tenant_id, entry_id) REFERENCES session_entries(tenant_id, id) ON DELETE CASCADE,
        INDEX idx_sets_entry (tenant_id, entry_id),
        INDEX idx_sets_entry_sort (tenant_id, entry_id, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await connection.query(
      `CREATE TABLE IF NOT EXISTS session_nutrition_items (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        meal_type VARCHAR(16) NOT NULL,
        name VARCHAR(255) NOT NULL,
        calories INT NOT NULL,
        note TEXT NULL,
        sort_order INT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        CONSTRAINT fk_nutrition_session FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id) ON DELETE CASCADE,
        INDEX idx_nutrition_session (tenant_id, session_id),
        INDEX idx_nutrition_session_sort (tenant_id, session_id, sort_order),
        INDEX idx_nutrition_meal (tenant_id, meal_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await ensureIndex(
      connection,
      'CREATE INDEX idx_entries_session_sort ON session_entries (tenant_id, session_id, sort_order)',
    )
    await ensureIndex(
      connection,
      'CREATE INDEX idx_sets_entry_sort ON entry_sets (tenant_id, entry_id, sort_order)',
    )
    await ensureIndex(
      connection,
      'CREATE INDEX idx_nutrition_session_sort ON session_nutrition_items (tenant_id, session_id, sort_order)',
    )
  } finally {
    connection.release()
  }
}

const mapExerciseRow = (row: ExerciseRow): ExerciseDefinition => {
  const category: ExerciseCategory = row.category === 'cardio' ? 'cardio' : 'strength'
  const bodyPartValue = typeof row.bodyPart === 'string' ? row.bodyPart.trim() : ''
  return {
    id: row.id,
    name: row.name,
    category,
    bodyPart: category === 'strength' && bodyPartValue.length ? bodyPartValue : undefined,
    createdAt: normalizeTimestampFromDb(row.createdAt, `exercise(${row.id}).createdAt`),
    updatedAt: normalizeTimestampFromDb(row.updatedAt, `exercise(${row.id}).updatedAt`),
  }
}

const mapSessionRow = (
  row: SessionRow,
): Omit<WorkoutSession, 'entries' | 'nutrition'> & { waterIntakeMl: number; isCoachSession: boolean } => {
  const rawWeight = typeof row.bodyWeightKg === 'number' ? Number(row.bodyWeightKg) : NaN
  const bodyWeightKg = Number.isFinite(rawWeight) && rawWeight > 0 && rawWeight <= 400
    ? Math.round(rawWeight * 10) / 10
    : undefined

  return {
    id: row.id,
    date: normalizeDateFromDb(row.date, `session(${row.id}).date`),
    note: row.note ?? undefined,
    bodyWeightKg,
    createdAt: normalizeTimestampFromDb(row.createdAt, `session(${row.id}).createdAt`),
    updatedAt: normalizeTimestampFromDb(row.updatedAt, `session(${row.id}).updatedAt`),
    waterIntakeMl: typeof row.waterMl === 'number' ? Number(row.waterMl) : 0,
    isCoachSession: Boolean(row.isCoachSession),
  }
}

const validateSessions = (payload: unknown): payload is WorkoutSession[] => {
  return Array.isArray(payload) && payload.every((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }
    const session = item as Partial<WorkoutSession>
    if (
      typeof session.id !== 'string' ||
      typeof session.date !== 'string' ||
      typeof session.createdAt !== 'string' ||
      typeof session.updatedAt !== 'string' ||
      !Array.isArray(session.entries)
    ) {
      return false
    }

    const entriesValid = session.entries.every((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false
      }
      const detail = entry as Partial<WorkoutEntry>
      if (typeof detail.id !== 'string' || typeof detail.exerciseId !== 'string' || !Array.isArray(detail.sets)) {
        return false
      }
      if (detail.durationMinutes != null && typeof detail.durationMinutes !== 'number') {
        return false
      }
      return detail.sets.every((set) => {
        if (!set || typeof set !== 'object') {
          return false
        }
        const candidate = set as Partial<WorkoutSet>
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.weight === 'number' &&
          typeof candidate.unit === 'string' &&
          typeof candidate.reps === 'number'
        )
      })
    })

    if (!entriesValid) {
      return false
    }

    if (session.bodyWeightKg != null) {
      if (typeof session.bodyWeightKg !== 'number') {
        return false
      }
      if (!Number.isFinite(session.bodyWeightKg) || session.bodyWeightKg <= 0 || session.bodyWeightKg > 400) {
        return false
      }
    }

    if (session.isCoachSession != null && typeof session.isCoachSession !== 'boolean') {
      return false
    }

    if (!session.nutrition) {
      return true
    }

    const nutrition = session.nutrition as Partial<DailyNutrition>
    if (typeof nutrition.waterIntakeMl !== 'number' || nutrition.waterIntakeMl < 0) {
      return false
    }

    if (!nutrition.meals || typeof nutrition.meals !== 'object') {
      return false
    }

    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner']
    return mealTypes.every((mealType) => {
      const meals = (nutrition.meals as Record<string, unknown>)[mealType]
      if (!Array.isArray(meals)) {
        return false
      }
      return meals.every((meal) => {
        if (!meal || typeof meal !== 'object') {
          return false
        }
        const candidate = meal as Partial<NutritionItem>
        return (
          typeof candidate.id === 'string' &&
          candidate.mealType === mealType &&
          typeof candidate.name === 'string' &&
          typeof candidate.calories === 'number'
        )
      })
    })
  })
}

const withTransaction = async <T>(handler: (connection: PoolConnection) => Promise<T>): Promise<T> => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await handler(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

const fetchExerciseById = async (exerciseId: string): Promise<ExerciseDefinition | null> => {
  const [rows] = await pool.query<ExerciseRow[]>(
    'SELECT id, name, category, body_part AS bodyPart, created_at AS createdAt, updated_at AS updatedAt FROM exercises WHERE id = ? LIMIT 1',
    [exerciseId],
  )
  if (!rows.length) {
    return null
  }
  return mapExerciseRow(rows[0]!)
}

const fetchExerciseByNameCategory = async (
  name: string,
  category: ExerciseCategory,
  excludeId?: string,
): Promise<ExerciseDefinition | null> => {
  const params: unknown[] = [name, category]
  let sql =
    'SELECT id, name, category, body_part AS bodyPart, created_at AS createdAt, updated_at AS updatedAt FROM exercises WHERE name = ? AND category = ?'
  if (excludeId) {
    sql += ' AND id <> ?'
    params.push(excludeId)
  }
  sql += ' LIMIT 1'
  const [rows] = await pool.query<ExerciseRow[]>(sql, params)
  if (!rows.length) {
    return null
  }
  return mapExerciseRow(rows[0]!)
}

const countExerciseUsage = async (exerciseId: string): Promise<number> => {
  const [rows] = await pool.query<Array<{ usage: number }>>(
    'SELECT COUNT(*) AS usage FROM session_entries WHERE exercise_id = ?',
    [exerciseId],
  )
  const usage = rows[0]?.usage ?? 0
  return typeof usage === 'number' ? Number(usage) : 0
}

const normalizeForDbTimestamp = (value: Date | string, context: string) => {
  if (value instanceof Date) {
    return prepareTimestampForDb(value.toISOString(), context)
  }
  return prepareTimestampForDb(value, context)
}

const deduplicateExercises = async (connection: PoolConnection) => {
  type DuplicateRow = {
    name: string
    category: string
    ids: string
    minCreatedAt: Date | string
    maxUpdatedAt: Date | string
  }

  const query = `SELECT name, category, GROUP_CONCAT(id ORDER BY created_at) AS ids,
                        MIN(created_at) AS minCreatedAt,
                        MAX(updated_at) AS maxUpdatedAt
                 FROM exercises
                 GROUP BY name, category
                 HAVING COUNT(*) > 1`

  const [duplicates] = await connection.query<DuplicateRow[]>(query)

  if (!duplicates.length) {
    return
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0')
  try {
    for (const row of duplicates) {
      const rawIds = row.ids?.split(',') ?? []
      const ids = rawIds.map((id) => id.trim()).filter((id) => id.length > 0)
      if (ids.length < 2) {
        continue
      }
      const [keepId, ...duplicateIds] = ids
      if (!keepId || !duplicateIds.length) {
        continue
      }

      for (const duplicateId of duplicateIds) {
        await connection.query('UPDATE session_entries SET exercise_id = ? WHERE exercise_id = ?', [keepId, duplicateId])
      }
      await connection.query('DELETE FROM exercises WHERE id IN (?)', [duplicateIds])
      const createdAt = normalizeForDbTimestamp(row.minCreatedAt, `exercise(${keepId}).createdAt`)
      const updatedAt = normalizeForDbTimestamp(row.maxUpdatedAt, `exercise(${keepId}).updatedAt`)
      await connection.query(
        'UPDATE exercises SET created_at = ?, updated_at = ? WHERE id = ?',
        [createdAt, updatedAt, keepId],
      )
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
  }
}

const buildHydration = async (tenantId: string): Promise<HydrationPayload> => {
  const [exerciseQuery, sessionQuery, entryQuery, setQuery, nutritionQuery] = await Promise.all([
    pool.query<ExerciseRow[]>(
      'SELECT id, name, category, body_part AS bodyPart, created_at AS createdAt, updated_at AS updatedAt FROM exercises ORDER BY name',
    ),
    pool.query<SessionRow[]>(
      'SELECT id, date, note, body_weight_kg AS bodyWeightKg, water_ml AS waterMl, is_coach_session AS isCoachSession, created_at AS createdAt, updated_at AS updatedAt FROM sessions WHERE tenant_id = ? ORDER BY date',
      [tenantId],
    ),
    pool.query<SessionEntryRow[]>(
      'SELECT id, session_id AS sessionId, exercise_id AS exerciseId, note, duration_minutes AS durationMinutes, sort_order AS sortOrder FROM session_entries WHERE tenant_id = ? ORDER BY session_id, sort_order',
      [tenantId],
    ),
    pool.query<SetRow[]>(
      'SELECT id, entry_id AS entryId, weight, unit, reps, note, sort_order AS sortOrder FROM entry_sets WHERE tenant_id = ? ORDER BY entry_id, sort_order',
      [tenantId],
    ),
    pool.query<NutritionRow[]>(
      'SELECT id, session_id AS sessionId, meal_type AS mealType, name, calories, note, sort_order AS sortOrder FROM session_nutrition_items WHERE tenant_id = ? ORDER BY session_id, sort_order',
      [tenantId],
    ),
  ])

  const [exerciseRows] = exerciseQuery
  const [sessionRows] = sessionQuery
  const [entryRows] = entryQuery
  const [setRows] = setQuery
  const [nutritionRows] = nutritionQuery

  const exercises = exerciseRows.map(mapExerciseRow)
  const entriesBySession = new Map<string, SessionEntryRow[]>()
  for (const entry of entryRows) {
    let list = entriesBySession.get(entry.sessionId)
    if (!list) {
      list = []
      entriesBySession.set(entry.sessionId, list)
    }
    list.push(entry)
  }

  const setsByEntry = new Map<string, SetRow[]>()
  for (const set of setRows) {
    let list = setsByEntry.get(set.entryId)
    if (!list) {
      list = []
      setsByEntry.set(set.entryId, list)
    }
    list.push(set)
  }

  type NutritionBuckets = Record<MealType, NutritionRow[]>
  const createNutritionBuckets = (): NutritionBuckets => ({
    breakfast: [],
    lunch: [],
    dinner: [],
  })

  const nutritionBySession = new Map<string, NutritionBuckets>()
  for (const item of nutritionRows) {
    let buckets = nutritionBySession.get(item.sessionId)
    if (!buckets) {
      buckets = createNutritionBuckets()
      nutritionBySession.set(item.sessionId, buckets)
    }
    buckets[item.mealType].push(item)
  }

  const sessions: WorkoutSession[] = sessionRows.map((row) => {
    const base = mapSessionRow(row)
    const entryRowsForSession = entriesBySession.get(row.id) ?? []
    const entries = entryRowsForSession.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      note: entry.note ?? undefined,
      durationMinutes: entry.durationMinutes ?? undefined,
      sets: (setsByEntry.get(entry.id) ?? []).map((set) => ({
        id: set.id,
        weight: set.weight,
        unit: set.unit,
        reps: set.reps,
        note: set.note ?? undefined,
      })),
    }))

    const nutritionBuckets = nutritionBySession.get(row.id)
    const nutritionItems = nutritionBuckets
      ? {
          breakfast: nutritionBuckets.breakfast.map((item) => ({
            id: item.id,
            mealType: item.mealType,
            name: item.name,
            calories: Number(item.calories),
            note: item.note ?? undefined,
          })),
          lunch: nutritionBuckets.lunch.map((item) => ({
            id: item.id,
            mealType: item.mealType,
            name: item.name,
            calories: Number(item.calories),
            note: item.note ?? undefined,
          })),
          dinner: nutritionBuckets.dinner.map((item) => ({
            id: item.id,
            mealType: item.mealType,
            name: item.name,
            calories: Number(item.calories),
            note: item.note ?? undefined,
          })),
        }
      : {
          breakfast: [],
          lunch: [],
          dinner: [],
        }

    const hasMeals = MEAL_TYPES.some((mealType) => nutritionItems[mealType].length > 0)

    const shouldIncludeNutrition = base.waterIntakeMl > 0 || hasMeals

    const { waterIntakeMl, ...sessionBase } = base

    return {
      ...sessionBase,
      entries,
      nutrition: shouldIncludeNutrition
        ? {
            meals: nutritionItems,
            waterIntakeMl,
          }
        : undefined,
    }
  })

  return { exercises, sessions }
}

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch (error) {
    console.error('[API] Health check failed', error)
    res.status(500).json({ status: 'error' })
  }
})

app.get('/api/hydration', async (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenant(req)
    const payload = await buildHydration(tenantId)
    res.json(payload)
  } catch (error) {
    console.error('[API] Failed to load hydration payload', error)
    res.status(500).json({ message: 'Failed to load workouts.' })
  }
})

app.post('/api/exercises', async (req: Request, res: Response) => {
  const name = normalizeLabel(req.body?.name)
  if (!name) {
    res.status(400).json({ message: '請輸入動作名稱。' })
    return
  }

  const rawCategory = normalizeLabel(req.body?.category)
  const category: ExerciseCategory = rawCategory === 'cardio' ? 'cardio' : 'strength'

  let bodyPart: string | null = null
  if (category === 'strength') {
    bodyPart = normalizeLabel(req.body?.bodyPart)
    if (!bodyPart) {
      res.status(400).json({ message: '請輸入身體部位。' })
      return
    }
  }

  try {
    const existing = await fetchExerciseByNameCategory(name, category)
    if (existing) {
      res.status(200).json(existing)
      return
    }

    const id = generateId()
    const timestamp = nowIso()
    await pool.query(
      'INSERT INTO exercises (id, name, category, body_part, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        id,
        name,
        category,
        bodyPart,
        prepareTimestampForDb(timestamp, `exercise(${id}).createdAt`),
        prepareTimestampForDb(timestamp, `exercise(${id}).updatedAt`),
      ],
    )

    const created: ExerciseDefinition = {
      id,
      name,
      category,
      bodyPart: bodyPart ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    res.status(201).json(created)
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      try {
        const duplicate = await fetchExerciseByNameCategory(name, category)
        if (duplicate) {
          res.status(200).json(duplicate)
          return
        }
      } catch (lookupError) {
        console.error('[API] Failed to resolve duplicate exercise', lookupError)
      }
    }
    console.error('[API] Failed to create exercise', error)
    res.status(500).json({ message: 'Failed to create exercise.' })
  }
})

app.put('/api/exercises/:id', async (req: Request, res: Response) => {
  const exerciseId = normalizeLabel(req.params.id)
  if (!exerciseId) {
    res.status(400).json({ message: 'Exercise id is required.' })
    return
  }

  const name = normalizeLabel(req.body?.name)
  if (!name) {
    res.status(400).json({ message: '請輸入動作名稱。' })
    return
  }

  const rawCategory = normalizeLabel(req.body?.category)
  const category: ExerciseCategory = rawCategory === 'cardio' ? 'cardio' : 'strength'

  let bodyPart: string | null = null
  if (category === 'strength') {
    bodyPart = normalizeLabel(req.body?.bodyPart)
    if (!bodyPart) {
      res.status(400).json({ message: '請輸入身體部位。' })
      return
    }
  }

  try {
    const existing = await fetchExerciseById(exerciseId)
    if (!existing) {
      res.status(404).json({ message: '找不到對應的訓練動作。' })
      return
    }

    if (category !== existing.category) {
      const usage = await countExerciseUsage(exerciseId)
      if (usage > 0) {
        res.status(409).json({ message: '已有訓練紀錄使用此動作，無法變更分類。' })
        return
      }
    }

    const duplicate = await fetchExerciseByNameCategory(name, category, exerciseId)
    if (duplicate) {
      res.status(409).json({ message: '已有相同名稱的訓練動作，請使用其他名稱。' })
      return
    }

    const timestamp = nowIso()
    await pool.query(
      'UPDATE exercises SET name = ?, category = ?, body_part = ?, updated_at = ? WHERE id = ?',
      [
        name,
        category,
        bodyPart,
        prepareTimestampForDb(timestamp, `exercise(${exerciseId}).updatedAt`),
        exerciseId,
      ],
    )

    const updated: ExerciseDefinition = {
      id: exerciseId,
      name,
      category,
      bodyPart: category === 'strength' ? bodyPart ?? existing.bodyPart : undefined,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    }

    res.json(updated)
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      res.status(409).json({ message: '已有相同名稱的訓練動作，請使用其他名稱。' })
      return
    }
    console.error('[API] Failed to update exercise', error)
    res.status(500).json({ message: 'Failed to update exercise.' })
  }
})

app.delete('/api/exercises/:id', async (req: Request, res: Response) => {
  const exerciseId = normalizeLabel(req.params.id)
  if (!exerciseId) {
    res.status(400).json({ message: 'Exercise id is required.' })
    return
  }

  try {
    const existing = await fetchExerciseById(exerciseId)
    if (!existing) {
      res.sendStatus(204)
      return
    }

    const usage = await countExerciseUsage(exerciseId)
    if (usage > 0) {
      res.status(409).json({ message: '該訓練動作仍有訓練紀錄使用，請先調整訓練內容後再刪除。' })
      return
    }

    await pool.query('DELETE FROM exercises WHERE id = ?', [exerciseId])
    res.sendStatus(204)
  } catch (error) {
    console.error('[API] Failed to delete exercise', error)
    res.status(500).json({ message: 'Failed to delete exercise.' })
  }
})

app.put('/api/sessions', async (req: Request, res: Response) => {
  if (!validateSessions(req.body)) {
    res.status(400).json({ message: 'Invalid session payload.' })
    return
  }

  try {
    const tenantId = resolveTenant(req)
    await withTransaction(async (connection) => {
      await connection.query('DELETE FROM entry_sets WHERE tenant_id = ?', [tenantId])
      await connection.query('DELETE FROM session_entries WHERE tenant_id = ?', [tenantId])
      await connection.query('DELETE FROM session_nutrition_items WHERE tenant_id = ?', [tenantId])
      await connection.query('DELETE FROM sessions WHERE tenant_id = ?', [tenantId])

      const sessions = req.body
      if (!sessions.length) {
        return
      }

      const sessionValues: unknown[][] = []
      const entryValues: unknown[][] = []
      const setValues: unknown[][] = []
      const nutritionValues: unknown[][] = []
      const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner']

      for (const session of sessions) {
        sessionValues.push([
          tenantId,
          session.id,
          prepareDateForDb(session.date, `session(${session.id}).date`),
          session.note ?? null,
          session.bodyWeightKg ?? null,
          session.nutrition?.waterIntakeMl ?? 0,
          session.isCoachSession ? 1 : 0,
          prepareTimestampForDb(session.createdAt, `session(${session.id}).createdAt`),
          prepareTimestampForDb(session.updatedAt, `session(${session.id}).updatedAt`),
        ])

        session.entries.forEach((entry, entryIndex) => {
          const durationMinutes =
            typeof entry.durationMinutes === 'number' && entry.durationMinutes > 0
              ? Math.round(entry.durationMinutes)
              : 0

          entryValues.push([
            tenantId,
            entry.id,
            session.id,
            entry.exerciseId,
            entry.note ?? null,
            durationMinutes,
            entryIndex,
          ])

          entry.sets.forEach((set, setIndex) => {
            setValues.push([
              tenantId,
              set.id,
              entry.id,
              set.weight,
              set.unit,
              set.reps,
              set.note ?? null,
              setIndex,
            ])
          })
        })

        if (session.nutrition?.meals) {
          mealTypes.forEach((mealType) => {
            const meals = session.nutrition?.meals?.[mealType] ?? []
            meals.forEach((meal, index) => {
              nutritionValues.push([
                tenantId,
                meal.id,
                session.id,
                mealType,
                meal.name,
                meal.calories,
                meal.note ?? null,
                index,
              ])
            })
          })
        }
      }

      const runBulkInsert = async (baseSql: string, values: unknown[][]) => {
        if (!values.length) {
          return
        }
        const placeholders = buildInsertPlaceholders(values.length, values[0]!.length)
        await connection.query(`${baseSql} VALUES ${placeholders}`, values.flat())
      }

      await runBulkInsert(
        'INSERT INTO sessions (tenant_id, id, date, note, body_weight_kg, water_ml, is_coach_session, created_at, updated_at)',
        sessionValues,
      )
      await runBulkInsert(
        'INSERT INTO session_entries (tenant_id, id, session_id, exercise_id, note, duration_minutes, sort_order)',
        entryValues,
      )
      await runBulkInsert(
        'INSERT INTO entry_sets (tenant_id, id, entry_id, weight, unit, reps, note, sort_order)',
        setValues,
      )
      await runBulkInsert(
        'INSERT INTO session_nutrition_items (tenant_id, id, session_id, meal_type, name, calories, note, sort_order)',
        nutritionValues,
      )
    })

    res.sendStatus(204)
  } catch (error) {
    console.error('[API] Failed to save sessions', error)
    res.status(500).json({ message: 'Failed to save sessions.' })
  }
})

app.delete('/api/data', async (req: Request, res: Response) => {
  try {
    const tenantId = resolveTenant(req)
    await withTransaction(async (connection) => {
      await connection.query('DELETE FROM entry_sets WHERE tenant_id = ?', [tenantId])
      await connection.query('DELETE FROM session_entries WHERE tenant_id = ?', [tenantId])
      await connection.query('DELETE FROM session_nutrition_items WHERE tenant_id = ?', [tenantId])
      await connection.query('DELETE FROM sessions WHERE tenant_id = ?', [tenantId])
    })
    res.sendStatus(204)
  } catch (error) {
    console.error('[API] Failed to clear data', error)
    res.status(500).json({ message: 'Failed to clear workouts.' })
  }
})

const start = async () => {
  try {
    await ensureSchema()
  } catch (error) {
    console.error('[API] Failed to initialize schema', error)
    process.exit(1)
  }

  const port = Number(process.env.PORT ?? 5174)
  app.listen(port, () => {
    console.info(`Workout persistence API listening on http://localhost:${port}`)
  })
}

void start()
