<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useWorkoutStore } from '@/stores/workoutStore'
import type { HydrationPayload, WorkoutSession } from '@/types/workout'

const workoutStore = useWorkoutStore()
const { calendarSummaryByDate, sessionByDate, exercises } = storeToRefs(workoutStore)

const selectedDate = ref(new Date())

const formatDateKey = (date: Date) => {
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

const selectedDateKey = computed(() => formatDateKey(selectedDate.value))
const formattedSelectedDate = computed(() => selectedDate.value.toLocaleDateString())
const selectedSummary = computed(() => calendarSummaryByDate.value[selectedDateKey.value])
const selectedBodyParts = computed(() => selectedSummary.value?.bodyParts ?? [])
const bodyPartsForDay = (dateKey: string) => calendarSummaryByDate.value[dateKey]?.bodyParts ?? []

const sessionForSelectedDate = computed(() => sessionByDate.value(selectedDateKey.value))

type WorkoutEntry = WorkoutSession['entries'][number]

const entryHasSetNote = (entry: WorkoutEntry) => entry.sets.some((set) => Boolean(set.note?.trim()))

const getExerciseName = (exerciseId: string) => exercises.value[exerciseId]?.name ?? '未命名動作'
const getExerciseBodyPart = (exerciseId: string) => exercises.value[exerciseId]?.bodyPart ?? '未分類'

const ensureHydrated = () => {
  if (workoutStore.isHydrated) return

  const mockData = createMockHydration()
  workoutStore.primeFromStorage(mockData)

  const todayKey = formatDateKey(new Date())
  if (workoutStore.sessionByDate(todayKey)) {
    selectedDate.value = new Date(`${todayKey}T00:00:00`)
  }
}

const createMockHydration = (): HydrationPayload => {
  const now = new Date()
  const isoNow = now.toISOString()

  const todayKey = formatDateKey(now)
  const pushKey = formatDateKey(addDays(now, -2))
  const pullKey = formatDateKey(addDays(now, 3))

  return {
    exercises: [
      {
        id: 'exercise-squat',
        name: '槓鈴深蹲',
        bodyPart: '腿',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'exercise-bench',
        name: '臥推',
        bodyPart: '胸',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'exercise-row',
        name: '俯身划船',
        bodyPart: '背',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
    ],
    sessions: [
      {
        id: `session-${pushKey}`,
        date: pushKey,
        note: '推訓—胸肩三頭',
        entries: [
          {
            id: 'entry-bench-1',
            exerciseId: 'exercise-bench',
            note: '漸進增加重量',
            sets: [
              { id: 'set-bench-1', weight: 60, unit: 'kg', reps: 8 },
              { id: 'set-bench-2', weight: 70, unit: 'kg', reps: 6 },
            ],
          },
        ],
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: `session-${todayKey}`,
        date: todayKey,
        note: '腿部訓練',
        entries: [
          {
            id: 'entry-squat-1',
            exerciseId: 'exercise-squat',
            sets: [
              { id: 'set-squat-1', weight: 80, unit: 'kg', reps: 8 },
              { id: 'set-squat-2', weight: 90, unit: 'kg', reps: 6 },
            ],
          },
        ],
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: `session-${pullKey}`,
        date: pullKey,
        note: '拉訓—背與二頭',
        entries: [
          {
            id: 'entry-row-1',
            exerciseId: 'exercise-row',
            sets: [
              { id: 'set-row-1', weight: 40, unit: 'kg', reps: 10 },
              { id: 'set-row-2', weight: 45, unit: 'kg', reps: 8 },
            ],
          },
        ],
        createdAt: isoNow,
        updatedAt: isoNow,
      },
    ],
  }
}

onMounted(() => {
  ensureHydrated()
})
</script>

<template>
  <el-container class="home-layout">
    <el-header class="home-header">
      <h1>健身日誌月曆</h1>
      <p>快速概覽每一天的訓練安排，並為選定日期管理日誌內容。</p>
    </el-header>
    <el-main class="home-main">
      <div class="home-content">
        <el-row :gutter="20">
          <el-col :xs="24" :lg="14">
            <el-card class="calendar-card">
            <template #header>
              <div class="card-header">
                <span>月曆檢視</span>
              </div>
            </template>
            <el-calendar v-model="selectedDate">
              <template #date-cell="{ data }">
                <div class="day-cell" :class="{ 'is-selected': data.isSelected }">
                  <span class="day-number">{{ Number(data.day.split('-')[2]) }}</span>
                  <div class="tag-list" v-if="bodyPartsForDay(data.day).length">
                    <el-tag
                      v-for="part in bodyPartsForDay(data.day)"
                      :key="`${data.day}-${part}`"
                      size="small"
                      effect="plain"
                      type="success"
                    >
                      {{ part }}
                    </el-tag>
                  </div>
                </div>
              </template>
            </el-calendar>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="10">
          <el-card class="detail-card">
            <template #header>
              <div class="card-header">
                <span>選取日期：{{ formattedSelectedDate }}</span>
              </div>
            </template>
            <template v-if="sessionForSelectedDate">
              <div class="session-meta" v-if="selectedBodyParts.length">
                <el-tag
                  v-for="part in selectedBodyParts"
                  :key="`selected-${part}`"
                  type="info"
                  effect="plain"
                >
                  {{ part }}
                </el-tag>
              </div>
              <p v-if="sessionForSelectedDate.note" class="session-note">
                {{ sessionForSelectedDate.note }}
              </p>
              <div v-if="sessionForSelectedDate.entries.length" class="entry-list">
                <div
                  v-for="entry in sessionForSelectedDate.entries"
                  :key="entry.id"
                  class="entry-card"
                >
                  <div class="entry-header">
                    <div>
                      <h3 class="exercise-name">{{ getExerciseName(entry.exerciseId) }}</h3>
                      <span class="entry-body-part">{{ getExerciseBodyPart(entry.exerciseId) }}</span>
                    </div>
                    <span class="set-count">共 {{ entry.sets.length }} 組</span>
                  </div>
                  <p v-if="entry.note" class="entry-note">{{ entry.note }}</p>
                  <el-table
                    :data="entry.sets"
                    size="small"
                    border
                    row-key="id"
                    class="set-table"
                  >
                    <el-table-column prop="weight" label="重量" width="80">
                      <template #default="{ row }">{{ row.weight }}</template>
                    </el-table-column>
                    <el-table-column prop="unit" label="單位" width="80">
                      <template #default="{ row }">{{ row.unit }}</template>
                    </el-table-column>
                    <el-table-column prop="reps" label="次數" width="80">
                      <template #default="{ row }">{{ row.reps }}</template>
                    </el-table-column>
                    <el-table-column
                      v-if="entryHasSetNote(entry)"
                      prop="note"
                      label="備註"
                    >
                      <template #default="{ row }">
                        <span v-if="row.note">{{ row.note }}</span>
                        <span v-else class="muted">—</span>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </div>
              <el-empty
                v-else
                description="尚未新增訓練動作"
                class="detail-placeholder"
              />
            </template>
            <template v-else>
              <el-empty
                description="尚未建立訓練紀錄"
                class="detail-placeholder"
              />
              <p class="next-step-hint">
                下一步將加入新增 / 編輯訓練紀錄的互動操作與同步儲存。
              </p>
            </template>
          </el-card>
        </el-col>
      </el-row>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped>
.home-layout {
  min-height: 100vh;
  background-color: var(--el-fill-color-lighter);
}

.home-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 2.5rem 1.5rem;
  background: linear-gradient(135deg, #f4f7ff 0%, #dce6ff 100%);
  border-bottom: 1px solid rgba(180, 198, 255, 0.4);
  align-items: center;
  text-align: center;
}

.home-header h1 {
  margin: 0;
  font-size: clamp(1.6rem, 2vw + 1rem, 2.1rem);
  font-weight: 700;
  color: #1f2933;
}

.home-header p {
  margin: 0;
  max-width: 560px;
  color: #3e4c59;
  line-height: 1.6;
}

.home-main {
  display: flex;
  justify-content: center;
  padding: 2rem 1.25rem 3rem;
}

.home-content {
  width: 100%;
  max-width: 1200px;
}

.calendar-card,
.detail-card {
  height: 100%;
  border-radius: 1rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.day-cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 72px;
  padding: 0.35rem 0.5rem;
  border-radius: 0.75rem;
  transition: background-color 0.2s ease;
}

.day-cell.is-selected {
  background-color: rgba(64, 158, 255, 0.12);
}

.day-number {
  font-weight: 600;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag-list .el-tag {
  border-radius: 999px;
  padding: 0 0.5rem;
}

.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.session-note {
  margin: 0 0 1rem;
  color: #374151;
  font-weight: 500;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.entry-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 0.75rem;
  padding: 1.15rem;
  background-color: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-lighter);
}

.entry-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.exercise-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.entry-body-part {
  display: inline-block;
  margin-top: 0.25rem;
  color: #6b7280;
  font-size: 0.85rem;
}

.set-count {
  color: #2563eb;
  font-weight: 600;
}

.set-table {
  margin-top: 0.25rem;
  border-radius: 0.75rem;
  overflow: hidden;
}

.entry-note {
  margin-bottom: 0.75rem;
  color: #4b5563;
  font-size: 0.9rem;
}

.muted {
  color: #9ca3af;
}

.detail-placeholder {
  margin-top: 1rem;
}

.next-step-hint {
  margin-top: 1rem;
  color: #6b7280;
  font-size: 0.9rem;
}

@media (max-width: 1024px) {
  .home-main {
    padding: 1.75rem 1rem 2.5rem;
  }

  .home-header {
    padding: 2rem 1rem 1.75rem;
  }

  .entry-card {
    padding: 1rem;
  }
}

@media (max-width: 720px) {
  .home-header {
    padding: 1.75rem 1rem 1.5rem;
  }

  .home-main {
    padding: 1.5rem 0.75rem 2rem;
  }

  .day-cell {
    min-height: 64px;
    padding: 0.3rem 0.4rem;
  }

  .entry-card {
    padding: 0.85rem;
  }

  .set-count {
    font-size: 0.85rem;
  }

  .entry-note {
    font-size: 0.85rem;
  }
}

@media (max-width: 480px) {
  .home-header p {
    font-size: 0.95rem;
  }

  .card-header {
    font-size: 0.95rem;
  }

  .session-meta {
    gap: 0.4rem;
  }

  .entry-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .set-count {
    align-self: flex-end;
  }
}
</style>
