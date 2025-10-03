# Cat Workout Backend API Blueprint

This document describes the HTTP interface expected by the current front-end. The goal is to move all persistence responsibilities to a dedicated backend while keeping front-end behaviour unchanged. Endpoints are grouped by the workflows exercised in the app today.

## Conventions

- **Base URL**: the front-end defaults to sending requests to `/api`. Configure the backend or reverse proxy so that these routes resolve to the service documented here.
- **Storage Partitioning**: every request includes the header `x-storage-key` (configured from the signed-in username). Use this value to namespace data per user. If the header is missing, treat the caller as a guest and fall back to a shared/default bucket.
- **Content Types**: requests with bodies are JSON encoded (`Content-Type: application/json`). Responses must return JSON with `application/json` unless explicitly noted.
- **Timestamps**: `createdAt` and `updatedAt` use ISO 8601 strings (`new Date().toISOString()` on the client). The client currently generates ids and timestamps, but the backend may overwrite them; simply echoing the authoritative values back is sufficient.
- **IDs**: Exercises and sessions are identified by stable string ids. The client sends the full document on every save, so id collisions must be handled gracefully (e.g., reject duplicates with 409).
- **Error Handling**: respond with standard HTTP status codes. The client displays the response body verbatim when available, so return a human-readable message (plain text or `{ "message": string }`).

## Data Models

TypeScript interfaces used by the front-end are listed here for reference. Field names are case-sensitive.

```ts
interface ExerciseDefinition {
  id: string
  name: string
  category: 'strength' | 'cardio'
  bodyPart?: string
  createdAt: string
  updatedAt: string
}

interface WorkoutSet {
  id: string
  weight: number
  unit: 'kg' | 'lb'
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

interface DailyNutrition {
  meals: {
    breakfast: NutritionItem[]
    lunch: NutritionItem[]
    dinner: NutritionItem[]
  }
  waterIntakeMl: number
}

interface NutritionItem {
  id: string
  mealType: 'breakfast' | 'lunch' | 'dinner'
  name: string
  calories: number
  note?: string
}

interface WorkoutSession {
  id: string
  date: string // yyyy-mm-dd
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
```

## Endpoints

### GET /health

Simple liveness probe used by the existing Express server and suitable for load balancer checks.

- **Headers**: none required
- **Response 200**: `{ "status": "ok" }`
- **Response 500**: `{ "status": "error" }` when the underlying database connection fails

### GET /hydration

Returns the full dataset needed to hydrate the application on launch or after login switches.

- **Headers**: `x-storage-key: <string>` (optional, but recommended)
- **Response 200**: `HydrationPayload`
- **Response 204**: optional when no data exists yet (the client treats `null` the same way)
- **Errors**:
  - `400` if the storage key is invalid
  - `500` for unexpected failures

**Example Response**

```json
{
  "exercises": [
    {
      "id": "exercise-squat",
      "name": "槓鈴深蹲",
      "category": "strength",
      "bodyPart": "腿",
      "createdAt": "2024-03-01T12:00:00.000Z",
      "updatedAt": "2024-03-05T09:30:00.000Z"
    }
  ],
  "sessions": [
    {
      "id": "session-2024-03-06",
      "date": "2024-03-06",
      "note": "腿部訓練",
      "entries": [
        {
          "id": "entry-squat-1",
          "exerciseId": "exercise-squat",
          "sets": [
            { "id": "set-1", "weight": 80, "unit": "kg", "reps": 8 }
          ]
        }
      ],
      "createdAt": "2024-03-06T08:00:00.000Z",
      "updatedAt": "2024-03-06T09:10:00.000Z",
      "nutrition": {
        "waterIntakeMl": 1800,
        "meals": {
          "breakfast": [],
          "lunch": [],
          "dinner": []
        }
      }
    }
  ]
}
```

### PUT /exercises

Replaces the caller's exercise catalog with the provided array. The front-end always sends the *entire* list (not a diff), so the backend should overwrite the previous contents atomically.

- **Headers**:
  - `Content-Type: application/json`
  - `x-storage-key: <string>`
- **Request Body**: `ExerciseDefinition[]`
- **Response 204**: success with no body
- **Errors**:
  - `400` when validation fails (missing fields, invalid category/unit)
  - `409` when duplicate ids are detected
  - `500` for server errors

**Implementation Notes**

- Treat missing `bodyPart` as `null` for cardio records; the front-end expects the value to be omitted or empty.
- To support audit trails, regenerate `updatedAt` server-side if desired and return the authoritative list in a 200 response variant (optional change—would require front-end adjustment).

### PUT /sessions

Stores all workout sessions for the caller. Like `/exercises`, the client sends the complete set each time.

- **Headers**:
  - `Content-Type: application/json`
  - `x-storage-key: <string>`
- **Request Body**: `WorkoutSession[]`
- **Response 204**: success with no body
- **Errors**:
  - `400` when schema validation fails (e.g., missing `date`, invalid meal entries)
  - `409` when ids conflict or refer to unknown exercises
  - `500` for server errors

**Implementation Notes**

- Ensure the transaction updates all sessions atomically so the calendar view never sees partial writes.
- Return a helpful error message when an `exerciseId` references a deleted exercise so the UI can guide the user.

### DELETE /data

Clears all persisted data associated with the caller's storage key. Used when the user resets their workspace.

- **Headers**: `x-storage-key: <string>`
- **Response 204**: data cleared
- **Errors**:
  - `400` for invalid storage keys
  - `500` for server errors

## Future Extensions (Optional)

While not currently consumed, these additions would align with upcoming refactors:

- **Auth endpoints** (`POST /auth/login`, `POST /auth/logout`) returning a JWT or session id to replace the current in-browser credential mock.
- **Incremental updates** (`POST /exercises`, `PATCH /sessions/:id`) if we decide to reduce payload sizes. This would require front-end changes to consume the new contract.
- **Metadata endpoints** for statistics (exercise usage, calendar summaries) if we move computation server-side later.

Backend developers can start with the endpoints above to unblock the migration. The front-end will switch to the new service once these routes are available.
