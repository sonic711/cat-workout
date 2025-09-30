<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'

import WorkoutSessionEditor from '@/components/workout/WorkoutSessionEditor.vue'
import { useWorkoutStore } from '@/stores/workoutStore'
import { useAuthStore } from '@/stores/authStore'
import type { WorkoutSession } from '@/types/workout'

const workoutStore = useWorkoutStore()
const { calendarSummaryByDate, sessionByDate, sessionDates, exercises } = storeToRefs(workoutStore)
const authStore = useAuthStore()

const selectedDate = ref(new Date())
const isEditorVisible = ref(false)
const loginUsername = ref('')
const loginPassword = ref('')
const isLoggingIn = ref(false)

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

const openEditor = () => {
  if (!authStore.canEdit) {
    ElMessage.info('目前為唯讀模式，請輸入帳號與密碼以編輯訓練內容。')
    return
  }
  if (!workoutStore.isHydrated) {
    void ensureHydrated()
  }
  isEditorVisible.value = true
}

const closeEditor = () => {
  isEditorVisible.value = false
}

const resetSelection = () => {
  selectedDate.value = new Date()
}

const ensureHydrated = async () => {
  const hydration = await workoutStore.hydrateFromPersistence()

  const todayKey = formatDateKey(new Date())
  if (sessionByDate.value(todayKey)) {
    selectedDate.value = new Date(`${todayKey}T00:00:00`)
    return
  }

  const fallbackDate = hydration?.sessions[0]?.date ?? sessionDates.value[0]
  if (fallbackDate) {
    selectedDate.value = new Date(`${fallbackDate}T00:00:00`)
  }
}

onMounted(() => {
  void authStore.initialize().then(() => ensureHydrated())
})

watch(
  () => authStore.username,
  async (value) => {
    if (value) {
      resetSelection()
      await ensureHydrated()
    }
  },
)

const handleLogin = async () => {
  if (isLoggingIn.value) {
    return
  }
  isLoggingIn.value = true
  try {
    const trimmedUsername = loginUsername.value.trim()
    const success = await authStore.login({
      username: trimmedUsername,
      password: loginPassword.value || undefined,
    })
    if (success) {
      loginUsername.value = trimmedUsername
      loginPassword.value = ''
      await ensureHydrated()
      ElMessage.success(
        authStore.canEdit ? '登入成功，已啟用編輯權限。' : '已切換為唯讀模式，可瀏覽個人訓練紀錄。',
      )
    } else if (authStore.lastError) {
      ElMessage.error(authStore.lastError)
    }
  } finally {
    isLoggingIn.value = false
  }
}

const handleLogout = async () => {
  await authStore.logout()
  loginPassword.value = ''
  ElMessage.info('已登出，回到訪客模式。')
  resetSelection()
  await ensureHydrated()
}
</script>

<template>
  <el-container class="home-layout">
    <el-header class="home-header">
      <h1>健身日誌月曆</h1>
      <p>快速概覽每一天的訓練安排，並為選定日期管理日誌內容。</p>
      <div class="auth-panel">
        <template v-if="authStore.isLoggedIn">
          <div class="auth-status">
            <span>
              使用者：<strong>{{ authStore.displayName }}</strong>
              <el-tag size="small" type="info" class="auth-tag">{{ authStore.currentModeLabel }}</el-tag>
            </span>
            <el-button size="small" type="default" @click="handleLogout">登出</el-button>
          </div>
        </template>
        <template v-else>
          <el-form class="login-form" inline @submit.prevent="handleLogin">
            <el-form-item>
              <el-input
                v-model="loginUsername"
                placeholder="帳號"
                size="small"
                autocomplete="username"
              />
            </el-form-item>
            <el-form-item>
              <el-input
                v-model="loginPassword"
                type="password"
                placeholder="密碼 (選填)"
                size="small"
                autocomplete="current-password"
              />
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                size="small"
                :loading="isLoggingIn"
                @click="handleLogin"
              >
                登入
              </el-button>
            </el-form-item>
          </el-form>
          <p class="login-hint">
            僅輸入帳號可瀏覽個人紀錄。使用 admin/admin 或 sean/sean 取得編輯權限。
          </p>
        </template>
      </div>
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
                <el-button
                  type="primary"
                  plain
                  size="small"
                  :disabled="!authStore.canEdit"
                  @click="openEditor"
                >
                  管理訓練紀錄
                </el-button>
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
                點擊下方按鈕開始為此日期安排訓練內容。
              </p>
              <el-button type="primary" :disabled="!authStore.canEdit" @click="openEditor">
                建立訓練紀錄
              </el-button>
            </template>
          </el-card>
        </el-col>
      </el-row>
      </div>
    </el-main>
  </el-container>
  <WorkoutSessionEditor
    v-model="isEditorVisible"
    :date="selectedDateKey"
    :session="sessionForSelectedDate"
    :can-edit="authStore.canEdit"
    @saved="closeEditor"
    @deleted="closeEditor"
  />
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
  height: auto !important;
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

.auth-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.auth-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.auth-tag {
  margin-left: 0.5rem;
}

.login-form {
  display: flex;
  align-items: center;
}

.login-hint {
  margin: 0;
  font-size: 0.85rem;
  color: #4b5563;
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
