import express, { type Request, type Response } from 'express'
import { createPool, type Pool, type PoolConnection } from 'mysql2/promise'

import {
  normalizeDateFromDb,
  normalizeTimestampFromDb,
  prepareDateForDb,
  prepareTimestampForDb,
} from './dateUtils'

interface ExerciseRow {
  id: string
  name: string
  bodyPart: string
  createdAt: Date | string
  updatedAt: Date | string
}

interface SessionRow {
  id: string
  date: string | Date
  note: string | null
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
  bodyPart: string
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
    host: process.env.MYSQL_HOST ?? '10.0.0.135',
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

const ensureSchema = async () => {
  const connection = await pool.getConnection()
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS exercises (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        body_part VARCHAR(64) NOT NULL,
        created_at DATETIME(6) NOT NULL,
        updated_at DATETIME(6) NOT NULL,
        PRIMARY KEY (tenant_id, id),
        INDEX idx_exercises_name (tenant_id, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await connection.query(
      `CREATE TABLE IF NOT EXISTS sessions (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        date DATE NOT NULL,
        note TEXT NULL,
        water_ml INT UNSIGNED NOT NULL DEFAULT 0,
        is_coach_session TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL,
        updated_at DATETIME(6) NOT NULL,
        PRIMARY KEY (tenant_id, id),
        INDEX idx_sessions_date (tenant_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
    await connection
      .query('ALTER TABLE sessions ADD COLUMN water_ml INT UNSIGNED NOT NULL DEFAULT 0 AFTER note')
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
    await connection.query(
      `CREATE TABLE IF NOT EXISTS session_entries (
        tenant_id VARCHAR(128) NOT NULL,
        id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        exercise_id VARCHAR(64) NOT NULL,
        note TEXT NULL,
        sort_order INT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        CONSTRAINT fk_entries_session FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id) ON DELETE CASCADE,
        CONSTRAINT fk_entries_exercise FOREIGN KEY (tenant_id, exercise_id) REFERENCES exercises(tenant_id, id) ON DELETE RESTRICT,
        INDEX idx_entries_session (tenant_id, session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
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
        INDEX idx_sets_entry (tenant_id, entry_id)
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
        INDEX idx_nutrition_meal (tenant_id, meal_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
  } finally {
    connection.release()
  }
}

const mapExerciseRow = (row: ExerciseRow): ExerciseDefinition => ({
  id: row.id,
  name: row.name,
  bodyPart: row.bodyPart,
  createdAt: normalizeTimestampFromDb(row.createdAt, `exercise(${row.id}).createdAt`),
  updatedAt: normalizeTimestampFromDb(row.updatedAt, `exercise(${row.id}).updatedAt`),
})

const mapSessionRow = (
  row: SessionRow,
): Omit<WorkoutSession, 'entries' | 'nutrition'> & { waterIntakeMl: number; isCoachSession: boolean } => ({
  id: row.id,
  date: normalizeDateFromDb(row.date, `session(${row.id}).date`),
  note: row.note ?? undefined,
  createdAt: normalizeTimestampFromDb(row.createdAt, `session(${row.id}).createdAt`),
  updatedAt: normalizeTimestampFromDb(row.updatedAt, `session(${row.id}).updatedAt`),
  waterIntakeMl: typeof row.waterMl === 'number' ? Number(row.waterMl) : 0,
  isCoachSession: Boolean(row.isCoachSession),
})

const validateExercises = (payload: unknown): payload is ExerciseDefinition[] => {
  return Array.isArray(payload) && payload.every((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }
    const exercise = item as Partial<ExerciseDefinition>
    return (
      typeof exercise.id === 'string' &&
      typeof exercise.name === 'string' &&
      typeof exercise.bodyPart === 'string' &&
      typeof exercise.createdAt === 'string' &&
      typeof exercise.updatedAt === 'string'
    )
  })
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

const buildHydration = async (tenantId: string): Promise<HydrationPayload> => {
  const [exerciseRows] = await pool.query<ExerciseRow[]>(
    'SELECT id, name, body_part AS bodyPart, created_at AS createdAt, updated_at AS updatedAt FROM exercises WHERE tenant_id = ? ORDER BY name',
    [tenantId],
  )
  const [sessionRows] = await pool.query<SessionRow[]>(
    'SELECT id, date, note, water_ml AS waterMl, is_coach_session AS isCoachSession, created_at AS createdAt, updated_at AS updatedAt FROM sessions WHERE tenant_id = ? ORDER BY date',
    [tenantId],
  )
  const [entryRows] = await pool.query<SessionEntryRow[]>(
    'SELECT id, session_id AS sessionId, exercise_id AS exerciseId, note, sort_order AS sortOrder FROM session_entries WHERE tenant_id = ? ORDER BY session_id, sort_order',
    [tenantId],
  )
  const [setRows] = await pool.query<SetRow[]>(
    'SELECT id, entry_id AS entryId, weight, unit, reps, note, sort_order AS sortOrder FROM entry_sets WHERE tenant_id = ? ORDER BY entry_id, sort_order',
    [tenantId],
  )
  const [nutritionRows] = await pool.query<NutritionRow[]>(
    'SELECT id, session_id AS sessionId, meal_type AS mealType, name, calories, note, sort_order AS sortOrder FROM session_nutrition_items WHERE tenant_id = ? ORDER BY session_id, sort_order',
    [tenantId],
  )

  const exercises = exerciseRows.map(mapExerciseRow)
  const entriesBySession = new Map<string, SessionEntryRow[]>()
  entryRows.forEach((entry) => {
    const list = entriesBySession.get(entry.sessionId) ?? []
    list.push(entry)
    entriesBySession.set(entry.sessionId, list)
  })

  const setsByEntry = new Map<string, SetRow[]>()
  setRows.forEach((set) => {
    const list = setsByEntry.get(set.entryId) ?? []
    list.push(set)
    setsByEntry.set(set.entryId, list)
  })

  const nutritionBySession = new Map<string, NutritionRow[]>()
  nutritionRows.forEach((item) => {
    const list = nutritionBySession.get(item.sessionId) ?? []
    list.push(item)
    nutritionBySession.set(item.sessionId, list)
  })

  const sessions: WorkoutSession[] = sessionRows.map((row) => {
    const base = mapSessionRow(row)
    const entries = (entriesBySession.get(row.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry) => ({
        id: entry.id,
        exerciseId: entry.exerciseId,
        note: entry.note ?? undefined,
        sets: (setsByEntry.get(entry.id) ?? [])
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((set) => ({
            id: set.id,
            weight: set.weight,
            unit: set.unit,
            reps: set.reps,
            note: set.note ?? undefined,
          })),
      }))

    const nutritionSource = (nutritionBySession.get(row.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)

    const mapNutritionItems = (mealType: MealType) =>
      nutritionSource
        .filter((item) => item.mealType === mealType)
        .map((item) => ({
          id: item.id,
          mealType: item.mealType,
          name: item.name,
          calories: Number(item.calories),
          note: item.note ?? undefined,
        }))

    const nutritionItems = {
      breakfast: mapNutritionItems('breakfast'),
      lunch: mapNutritionItems('lunch'),
      dinner: mapNutritionItems('dinner'),
    }

    const shouldIncludeNutrition =
      base.waterIntakeMl > 0 || nutritionItems.breakfast.length || nutritionItems.lunch.length || nutritionItems.dinner.length

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

app.put('/api/exercises', async (req: Request, res: Response) => {
  if (!validateExercises(req.body)) {
    res.status(400).json({ message: 'Invalid exercise payload.' })
    return
  }

  try {
    const tenantId = resolveTenant(req)
    await withTransaction(async (connection) => {
      const exercises = req.body
      if (!exercises.length) {
        await connection.query('DELETE FROM entry_sets WHERE tenant_id = ?', [tenantId])
        await connection.query('DELETE FROM session_entries WHERE tenant_id = ?', [tenantId])
        await connection.query('DELETE FROM session_nutrition_items WHERE tenant_id = ?', [tenantId])
        await connection.query('DELETE FROM sessions WHERE tenant_id = ?', [tenantId])
        await connection.query('DELETE FROM exercises WHERE tenant_id = ?', [tenantId])
        return
      }

      const ids = exercises.map((exercise) => exercise.id)
      if (ids.length) {
        await connection.query('DELETE FROM exercises WHERE tenant_id = ? AND id NOT IN (?)', [tenantId, ids])
      } else {
        await connection.query('DELETE FROM exercises WHERE tenant_id = ?', [tenantId])
      }

      for (const exercise of exercises) {
        await connection.query(
          `INSERT INTO exercises (tenant_id, id, name, body_part, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             body_part = VALUES(body_part),
             created_at = VALUES(created_at),
             updated_at = VALUES(updated_at)`,
          [
            tenantId,
            exercise.id,
            exercise.name,
            exercise.bodyPart,
            prepareTimestampForDb(exercise.createdAt, `exercise(${exercise.id}).createdAt`),
            prepareTimestampForDb(exercise.updatedAt, `exercise(${exercise.id}).updatedAt`),
          ],
        )
      }
    })

    res.sendStatus(204)
  } catch (error) {
    console.error('[API] Failed to save exercises', error)
    res.status(500).json({ message: 'Failed to save exercises.' })
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

      for (const session of sessions) {
        await connection.query(
          `INSERT INTO sessions (tenant_id, id, date, note, water_ml, is_coach_session, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            session.id,
            prepareDateForDb(session.date, `session(${session.id}).date`),
            session.note ?? null,
            session.nutrition?.waterIntakeMl ?? 0,
            session.isCoachSession ? 1 : 0,
            prepareTimestampForDb(session.createdAt, `session(${session.id}).createdAt`),
            prepareTimestampForDb(session.updatedAt, `session(${session.id}).updatedAt`),
          ],
        )

        for (let entryIndex = 0; entryIndex < session.entries.length; entryIndex += 1) {
          const entry = session.entries[entryIndex]!
          await connection.query(
            `INSERT INTO session_entries (tenant_id, id, session_id, exercise_id, note, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`
            ,
            [
              tenantId,
              entry.id,
              session.id,
              entry.exerciseId,
              entry.note ?? null,
              entryIndex,
            ],
          )

          for (let setIndex = 0; setIndex < entry.sets.length; setIndex += 1) {
            const set = entry.sets[setIndex]!
            await connection.query(
              `INSERT INTO entry_sets (tenant_id, id, entry_id, weight, unit, reps, note, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              ,
              [
                tenantId,
                set.id,
                entry.id,
                set.weight,
                set.unit,
                set.reps,
                set.note ?? null,
                setIndex,
              ],
            )
          }
        }

        if (session.nutrition?.meals) {
          const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner']
          for (const mealType of mealTypes) {
            const meals = session.nutrition.meals[mealType] ?? []
            for (let index = 0; index < meals.length; index += 1) {
              const meal = meals[index]!
              await connection.query(
                `INSERT INTO session_nutrition_items (tenant_id, id, session_id, meal_type, name, calories, note, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                ,
                [
                  tenantId,
                  meal.id,
                  session.id,
                  mealType,
                  meal.name,
                  meal.calories,
                  meal.note ?? null,
                  index,
                ],
              )
            }
          }
        }
      }
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
      await connection.query('DELETE FROM exercises WHERE tenant_id = ?', [tenantId])
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
