import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

import {
  type PersistenceContext,
  type PersistenceOptions,
  type PersistenceService,
  createNotImplementedService,
  defaultPersistenceContext,
} from './persistenceService'
import type {
  ExerciseDefinition,
  HydrationPayload,
  WorkoutEntry,
  WorkoutSession,
  WorkoutSet,
} from '@/types/workout'

export interface SqlitePersistenceOptions extends PersistenceOptions {
  storageKey?: string
  context?: PersistenceContext
}

const DEFAULT_STORAGE_KEY = 'cat-workout.sqlite'
const SCHEMA_VERSION = 2
const SCHEMA_VERSION_KEY = 'schema_version'

const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    body_part TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    note TEXT,
    sort_order INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entry_sets (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES session_entries(id) ON DELETE CASCADE,
    weight REAL NOT NULL,
    unit TEXT NOT NULL,
    reps INTEGER NOT NULL,
    note TEXT,
    sort_order INTEGER NOT NULL
  );
`

const DROP_SCHEMA_SQL = `
  DROP TABLE IF EXISTS entry_sets;
  DROP TABLE IF EXISTS session_entries;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS exercises;
`

const REQUIRED_TABLE_COLUMNS: Record<string, string[]> = {
  exercises: ['id', 'name', 'body_part', 'created_at', 'updated_at'],
  sessions: ['id', 'date', 'note', 'created_at', 'updated_at'],
  session_entries: ['id', 'session_id', 'exercise_id', 'note', 'sort_order'],
  entry_sets: ['id', 'entry_id', 'weight', 'unit', 'reps', 'note', 'sort_order'],
}

const hasWindow = typeof window !== 'undefined'

const isStorageAvailable = () => {
  if (!hasWindow) {
    return false
  }
  try {
    const key = '__sqlite_persistence_test__'
    window.localStorage.setItem(key, 'ok')
    window.localStorage.removeItem(key)
    return true
  } catch (error) {
    console.warn('[SQLitePersistence] Local storage unavailable:', error)
    return false
  }
}

export const isSqlitePersistenceSupported = () => isStorageAvailable()

const fromBase64 = (base64: string): Uint8Array => {
  const binary = atob(base64)
  const length = binary.length
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const toBase64 = (buffer: Uint8Array): string => {
  let binary = ''
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index] ?? 0
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const safeString = (value: unknown) => (typeof value === 'string' && value.length ? value : undefined)

const SQL_INSTANCE: { promise: Promise<SqlJsStatic> | null } = { promise: null }

const getSqlModule = () => {
  if (!SQL_INSTANCE.promise) {
    SQL_INSTANCE.promise = initSqlJs({
      locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
    })
  }
  return SQL_INSTANCE.promise
}

const createDatabase = async (
  storageKey: string,
  enableLogging: boolean,
  context: PersistenceContext,
): Promise<Database> => {
  const SQL = await getSqlModule()
  let database: Database
  const persisted = window.localStorage.getItem(storageKey)

  if (persisted) {
    try {
      const binary = fromBase64(persisted)
      database = new SQL.Database(binary)
    } catch (error) {
      if (enableLogging) {
        console.warn('[SQLitePersistence] Failed to restore database, creating new instance.', error)
      }
      database = new SQL.Database()
    }
  } else {
    database = new SQL.Database()
  }

  const schemaReset = ensureSchema(database, enableLogging)
  database.exec('PRAGMA foreign_keys = ON;')

  let seeded = false
  if (!persisted || schemaReset) {
    seeded = seedDatabase(database, context, enableLogging)
  }

  if (schemaReset || !persisted || seeded) {
    persistDatabase(database, storageKey)
  }

  return database
}

const persistDatabase = (database: Database, storageKey: string) => {
  const binary = database.export()
  const payload = toBase64(binary)
  window.localStorage.setItem(storageKey, payload)
}

const setSchemaVersion = (database: Database, version: number) => {
  const statement = database.prepare(
    `REPLACE INTO schema_meta (key, value) VALUES ($key, $value)`,
  )

  try {
    statement.bind({
      $key: SCHEMA_VERSION_KEY,
      $value: String(version),
    })
    statement.step()
  } finally {
    statement.free()
  }
}

const hasRequiredColumns = (database: Database, table: string): boolean => {
  const required = REQUIRED_TABLE_COLUMNS[table]
  if (!required) {
    return true
  }

  const columns = new Set<string>()
  const statement = database.prepare(`PRAGMA table_info(${table})`)

  try {
    while (statement.step()) {
      const row = statement.getAsObject<{ name?: unknown }>()
      if (row && typeof row.name === 'string' && row.name.length) {
        columns.add(row.name)
      }
    }
  } finally {
    statement.free()
  }

  return required.every((column) => columns.has(column))
}

const ensureSchema = (database: Database, enableLogging: boolean): boolean => {
  database.exec(CREATE_SCHEMA_SQL)

  let currentVersion: number | null = null

  const versionStatement = database.prepare(
    `SELECT value FROM schema_meta WHERE key = $key LIMIT 1`,
  )

  try {
    versionStatement.bind({ $key: SCHEMA_VERSION_KEY })
    if (versionStatement.step()) {
      const row = versionStatement.getAsObject<{ value?: unknown }>()
      if (row?.value != null) {
        const numeric = Number(row.value)
        if (!Number.isNaN(numeric)) {
          currentVersion = numeric
        }
      }
    }
  } finally {
    versionStatement.free()
  }

  const schemaValid = Object.keys(REQUIRED_TABLE_COLUMNS).every((table) =>
    hasRequiredColumns(database, table),
  )

  if (currentVersion !== SCHEMA_VERSION || !schemaValid) {
    if (enableLogging) {
      console.warn('[SQLitePersistence] Schema mismatch detected. Rebuilding data tables.', {
        currentVersion,
        schemaValid,
        expectedVersion: SCHEMA_VERSION,
      })
    }
    database.exec('PRAGMA foreign_keys = OFF;')
    database.exec(DROP_SCHEMA_SQL)
    database.exec(CREATE_SCHEMA_SQL)
    database.exec('PRAGMA foreign_keys = ON;')
    setSchemaVersion(database, SCHEMA_VERSION)
    return true
  }

  if (currentVersion == null) {
    setSchemaVersion(database, SCHEMA_VERSION)
    return true
  }

  return false
}

const resolveBaseDate = (context: PersistenceContext): { date: Date; iso: string } => {
  const candidateIso = context.now()
  const candidateDate = new Date(candidateIso)

  if (!Number.isNaN(candidateDate.getTime())) {
    return { date: candidateDate, iso: candidateDate.toISOString() }
  }

  const fallback = new Date()
  return { date: fallback, iso: fallback.toISOString() }
}

const createSampleHydration = (context: PersistenceContext): HydrationPayload => {
  const base = resolveBaseDate(context)
  const baseDate = base.date
  const timestamp = base.iso

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const addDays = (date: Date, amount: number) => {
    const next = new Date(date)
    next.setDate(date.getDate() + amount)
    return next
  }

  const today = formatDate(baseDate)
  const threeDaysAgo = formatDate(addDays(baseDate, -3))
  const twoDaysAhead = formatDate(addDays(baseDate, 2))
  return {
    exercises: [
      {
        id: 'sample-exercise-squat',
        name: '後蹲',
        bodyPart: '腿',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'sample-exercise-ohp',
        name: '推舉',
        bodyPart: '肩',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'sample-exercise-row',
        name: '划船',
        bodyPart: '背',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    sessions: [
      {
        id: `sample-session-${threeDaysAgo}`,
        date: threeDaysAgo,
        note: '拉日：背部與二頭肌訓練',
        entries: [
          {
            id: 'sample-entry-row',
            exerciseId: 'sample-exercise-row',
            note: '控制離心，專注肩胛啟動',
            sets: [
              { id: 'sample-set-row-1', weight: 45, unit: 'kg', reps: 10 },
              { id: 'sample-set-row-2', weight: 50, unit: 'kg', reps: 8 },
            ],
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `sample-session-${today}`,
        date: today,
        note: '腿日：深蹲與輔助訓練',
        entries: [
          {
            id: 'sample-entry-squat',
            exerciseId: 'sample-exercise-squat',
            sets: [
              { id: 'sample-set-squat-1', weight: 80, unit: 'kg', reps: 6 },
              { id: 'sample-set-squat-2', weight: 85, unit: 'kg', reps: 5 },
              { id: 'sample-set-squat-3', weight: 90, unit: 'kg', reps: 3 },
            ],
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `sample-session-${twoDaysAhead}`,
        date: twoDaysAhead,
        note: '推日：肩推與核心',
        entries: [
          {
            id: 'sample-entry-ohp',
            exerciseId: 'sample-exercise-ohp',
            sets: [
              { id: 'sample-set-ohp-1', weight: 35, unit: 'kg', reps: 8 },
              { id: 'sample-set-ohp-2', weight: 37.5, unit: 'kg', reps: 6 },
              { id: 'sample-set-ohp-3', weight: 40, unit: 'kg', reps: 4 },
            ],
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}

const seedDatabase = (
  database: Database,
  context: PersistenceContext,
  enableLogging: boolean,
): boolean => {
  const seed = createSampleHydration(context)
  const fallbackTimestamp = context.now()

  if (!seed.exercises.length && !seed.sessions.length) {
    return false
  }

  database.exec('BEGIN TRANSACTION;')

  try {
    if (seed.exercises.length) {
      const exerciseStatement = database.prepare(
        `INSERT INTO exercises (id, name, body_part, created_at, updated_at)
         VALUES ($id, $name, $bodyPart, $createdAt, $updatedAt)`,
      )

      try {
        for (const exercise of seed.exercises) {
          exerciseStatement.bind({
            $id: exercise.id,
            $name: exercise.name,
            $bodyPart: exercise.bodyPart,
            $createdAt: exercise.createdAt ?? fallbackTimestamp,
            $updatedAt: exercise.updatedAt ?? fallbackTimestamp,
          })
          exerciseStatement.step()
          exerciseStatement.reset()
        }
      } finally {
        exerciseStatement.free()
      }
    }

    if (seed.sessions.length) {
      const sessionStatement = database.prepare(
        `INSERT INTO sessions (id, date, note, created_at, updated_at)
         VALUES ($id, $date, $note, $createdAt, $updatedAt)`,
      )
      const entryStatement = database.prepare(
        `INSERT INTO session_entries (id, session_id, exercise_id, note, sort_order)
         VALUES ($id, $sessionId, $exerciseId, $note, $sortOrder)`,
      )
      const setStatement = database.prepare(
        `INSERT INTO entry_sets (id, entry_id, weight, unit, reps, note, sort_order)
         VALUES ($id, $entryId, $weight, $unit, $reps, $note, $sortOrder)`,
      )

      try {
        seed.sessions.forEach((session) => {
          sessionStatement.bind({
            $id: session.id,
            $date: session.date,
            $note: session.note ?? null,
            $createdAt: session.createdAt ?? fallbackTimestamp,
            $updatedAt: session.updatedAt ?? fallbackTimestamp,
          })
          sessionStatement.step()
          sessionStatement.reset()

          session.entries.forEach((entry, entryIndex) => {
            entryStatement.bind({
              $id: entry.id,
              $sessionId: session.id,
              $exerciseId: entry.exerciseId,
              $note: entry.note ?? null,
              $sortOrder: entryIndex,
            })
            entryStatement.step()
            entryStatement.reset()

            entry.sets.forEach((set, setIndex) => {
              setStatement.bind({
                $id: set.id,
                $entryId: entry.id,
                $weight: set.weight,
                $unit: set.unit,
                $reps: set.reps,
                $note: set.note ?? null,
                $sortOrder: setIndex,
              })
              setStatement.step()
              setStatement.reset()
            })
          })
        })
      } finally {
        sessionStatement.free()
        entryStatement.free()
        setStatement.free()
      }
    }

    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }

  if (enableLogging) {
    console.info('[SQLitePersistence] Seeded sample workout data into SQLite store.')
  }

  return true
}

const readExercises = (database: Database): ExerciseDefinition[] => {
  const exercises: ExerciseDefinition[] = []
  const statement = database.prepare(
    `SELECT id, name, body_part AS bodyPart, created_at AS createdAt, updated_at AS updatedAt
     FROM exercises ORDER BY created_at, id`,
  )

  try {
    while (statement.step()) {
      const row = statement.getAsObject<Record<string, unknown>>()
      exercises.push({
        id: String(row.id),
        name: String(row.name),
        bodyPart: String(row.bodyPart || ''),
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
      })
    }
  } finally {
    statement.free()
  }

  return exercises
}

const readSetsForEntry = (database: Database, entryId: string): WorkoutSet[] => {
  const sets: WorkoutSet[] = []
  const statement = database.prepare(
    `SELECT id, weight, unit, reps, note
     FROM entry_sets WHERE entry_id = $entryId ORDER BY sort_order`,
  )

  try {
    statement.bind({ $entryId: entryId })
    while (statement.step()) {
      const row = statement.getAsObject<Record<string, unknown>>()
      sets.push({
        id: String(row.id),
        weight: Number(row.weight),
        unit: String(row.unit) as WorkoutSet['unit'],
        reps: Number(row.reps),
        note: safeString(row.note),
      })
    }
  } finally {
    statement.free()
  }

  return sets
}

const readEntriesForSession = (database: Database, sessionId: string): WorkoutEntry[] => {
  const entries: WorkoutEntry[] = []
  const statement = database.prepare(
    `SELECT id, exercise_id AS exerciseId, note
     FROM session_entries WHERE session_id = $sessionId ORDER BY sort_order`,
  )

  try {
    statement.bind({ $sessionId: sessionId })
    while (statement.step()) {
      const row = statement.getAsObject<Record<string, unknown>>()
      entries.push({
        id: String(row.id),
        exerciseId: String(row.exerciseId),
        note: safeString(row.note),
        sets: readSetsForEntry(database, String(row.id)),
      })
    }
  } finally {
    statement.free()
  }

  return entries
}

const readSessions = (database: Database): WorkoutSession[] => {
  const sessions: WorkoutSession[] = []
  const statement = database.prepare(
    `SELECT id, date, note, created_at AS createdAt, updated_at AS updatedAt
     FROM sessions ORDER BY date, id`,
  )

  try {
    while (statement.step()) {
      const row = statement.getAsObject<Record<string, unknown>>()
      sessions.push({
        id: String(row.id),
        date: String(row.date),
        note: safeString(row.note),
        createdAt: String(row.createdAt),
        updatedAt: String(row.updatedAt),
        entries: readEntriesForSession(database, String(row.id)),
      })
    }
  } finally {
    statement.free()
  }

  return sessions
}

export const createSqlitePersistenceService = (
  options: SqlitePersistenceOptions = {},
): PersistenceService => {
  if (!isSqlitePersistenceSupported()) {
    return createNotImplementedService()
  }

  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const context = options.context ?? defaultPersistenceContext
  const enableLogging = options.enableLogging ?? false

  let databasePromise: Promise<Database> | null = null

  const getDatabase = () => {
    if (!databasePromise) {
      databasePromise = createDatabase(storageKey, enableLogging, context)
    }
    return databasePromise
  }

  const log = (message: string, payload?: unknown) => {
    if (enableLogging) {
      if (payload) {
        console.info(`[SQLitePersistence] ${message}`, payload)
      } else {
        console.info(`[SQLitePersistence] ${message}`)
      }
    }
  }

  const runTransaction = async (
    callback: (database: Database) => void,
  ): Promise<Database> => {
    const database = await getDatabase()
    database.exec('BEGIN TRANSACTION;')
    try {
      callback(database)
      database.exec('COMMIT;')
      return database
    } catch (error) {
      database.exec('ROLLBACK;')
      throw error
    }
  }

  return {
    async loadHydration() {
      const database = await getDatabase()
      const payload: HydrationPayload = {
        exercises: readExercises(database),
        sessions: readSessions(database),
      }
      log('Loaded hydration payload', {
        exerciseCount: payload.exercises.length,
        sessionCount: payload.sessions.length,
      })
      return payload
    },

    async saveExercises(exercises) {
      const database = await runTransaction((database) => {
        if (!exercises.length) {
          database.exec('DELETE FROM entry_sets; DELETE FROM session_entries; DELETE FROM sessions; DELETE FROM exercises;')
          return
        }

        const upsertStatement = database.prepare(
          `INSERT INTO exercises (id, name, body_part, created_at, updated_at)
           VALUES ($id, $name, $bodyPart, $createdAt, $updatedAt)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             body_part = excluded.body_part,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )

        try {
          for (const exercise of exercises) {
            upsertStatement.bind({
              $id: exercise.id,
              $name: exercise.name,
              $bodyPart: exercise.bodyPart,
              $createdAt: exercise.createdAt ?? context.now(),
              $updatedAt: exercise.updatedAt ?? context.now(),
            })
            upsertStatement.step()
            upsertStatement.reset()
          }
        } finally {
          upsertStatement.free()
        }
      })

      if (exercises.length) {
        persistDatabase(database, storageKey)
      } else {
        window.localStorage.removeItem(storageKey)
      }
      log('Saved exercises', { count: exercises.length })
    },

    async saveSessions(sessions) {
      const database = await runTransaction((database) => {
        database.exec('DELETE FROM entry_sets; DELETE FROM session_entries; DELETE FROM sessions;')
        if (!sessions.length) {
          return
        }

        const sessionStatement = database.prepare(
          `INSERT INTO sessions (id, date, note, created_at, updated_at)
           VALUES ($id, $date, $note, $createdAt, $updatedAt)`,
        )
        const entryStatement = database.prepare(
          `INSERT INTO session_entries (id, session_id, exercise_id, note, sort_order)
           VALUES ($id, $sessionId, $exerciseId, $note, $sortOrder)`,
        )
        const setStatement = database.prepare(
          `INSERT INTO entry_sets (id, entry_id, weight, unit, reps, note, sort_order)
           VALUES ($id, $entryId, $weight, $unit, $reps, $note, $sortOrder)`,
        )

        try {
          sessions.forEach((session) => {
            sessionStatement.bind({
              $id: session.id,
              $date: session.date,
              $note: session.note ?? null,
              $createdAt: session.createdAt ?? context.now(),
              $updatedAt: session.updatedAt ?? context.now(),
            })
            sessionStatement.step()
            sessionStatement.reset()

            session.entries.forEach((entry, entryIndex) => {
              entryStatement.bind({
                $id: entry.id,
                $sessionId: session.id,
                $exerciseId: entry.exerciseId,
                $note: entry.note ?? null,
                $sortOrder: entryIndex,
              })
              entryStatement.step()
              entryStatement.reset()

              entry.sets.forEach((set, setIndex) => {
                setStatement.bind({
                  $id: set.id,
                  $entryId: entry.id,
                  $weight: set.weight,
                  $unit: set.unit,
                  $reps: set.reps,
                  $note: set.note ?? null,
                  $sortOrder: setIndex,
                })
                setStatement.step()
                setStatement.reset()
              })
            })
          })
        } finally {
          sessionStatement.free()
          entryStatement.free()
          setStatement.free()
        }
      })

      persistDatabase(database, storageKey)
      log('Saved sessions', { count: sessions.length })
    },

    async clear() {
      await runTransaction((database) => {
        database.exec('DELETE FROM entry_sets; DELETE FROM session_entries; DELETE FROM sessions; DELETE FROM exercises;')
      })
      window.localStorage.removeItem(storageKey)
      log('Cleared persisted data')
    },
  }
}
