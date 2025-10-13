<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CaretBottom, CaretRight, Timer } from '@element-plus/icons-vue'
import { RouterLink } from 'vue-router'

import WorkoutSessionEditor from '@/components/workout/WorkoutSessionEditor.vue'
import ExerciseManager from '@/components/workout/ExerciseManager.vue'
import { useHomeAuth } from '@/composables/home/useHomeAuth'
import { useHomeCalendar } from '@/composables/home/useHomeCalendar'
import { useHomeDialogs } from '@/composables/home/useHomeDialogs'
import { useHomeNutritionSummary } from '@/composables/home/useHomeNutritionSummary'
import { useHomeSessionDisplay } from '@/composables/home/useHomeSessionDisplay'
import { useAuthStore } from '@/stores/authStore'
import { useWorkoutStore } from '@/stores/workoutStore'
import type { ExerciseCategory } from '@/types/workout'

const workoutStore = useWorkoutStore()
const authStore = useAuthStore()

// Expose reactive primitives from the stores so downstream composables stay in sync.
const { calendarSummaryByDate, sessionByDate, sessionDates, exercises, isHydrated } = storeToRefs(workoutStore)
const { canEdit, isLoggedIn } = storeToRefs(authStore)

// Calendar-focused state and helpers (selection, hydration, scroll behavior).
const {
  bodyPartsForDay,
  detailSectionRef,
  ensureHydrated,
  formattedSelectedDate,
  handleCalendarDateClick,
  resetSelection,
  selectedBodyParts,
  selectedDate,
  selectedDateKey,
  selectedSummary,
  sessionForSelectedDate,
} = useHomeCalendar({
  calendarSummaryByDate,
  sessionByDate,
  sessionDates,
  hydrateFromPersistence: workoutStore.hydrateFromPersistence,
})

// Workout entry formatting utilities for the detail pane.
const {
  CATEGORY_LABELS,
  entryHasSetNote,
  formatEntrySummary,
  getExerciseBodyPartLabel,
  getExerciseCategory,
  getExerciseName,
  isCardioEntry,
} = useHomeSessionDisplay({
  sessionForSelectedDate,
  exercises,
})

const DEFAULT_GROUP_ORDER: ExerciseCategory[] = ['strength', 'cardio']

const collapsedGroups = reactive<Record<ExerciseCategory, boolean>>({
  strength: false,
  cardio: false,
})

const derivedGroupOrder = computed<ExerciseCategory[]>(() => {
  const entries = sessionForSelectedDate.value?.entries ?? []
  const seen = new Set<ExerciseCategory>()
  const order: ExerciseCategory[] = []
  for (const entry of entries) {
    const category = getExerciseCategory(entry.exerciseId)
    if (!seen.has(category)) {
      seen.add(category)
      order.push(category)
    }
  }
  for (const category of DEFAULT_GROUP_ORDER) {
    if (!seen.has(category)) {
      order.push(category)
    }
  }
  return order
})

const entryGroups = computed(() => {
  const entries = sessionForSelectedDate.value?.entries ?? []
  return derivedGroupOrder.value
    .map((category) => {
      const groupEntries = entries.filter((entry) => getExerciseCategory(entry.exerciseId) === category)
      return {
        category,
        label: CATEGORY_LABELS[category],
        entries: groupEntries,
      }
    })
    .filter((group) => group.entries.length > 0)
})

const toggleGroupCollapsed = (category: ExerciseCategory) => {
  collapsedGroups[category] = !collapsedGroups[category]
}

// Nutrition summary derived from the selected session.
const {
  hasNutritionForSelectedDate,
  mealLabels,
  mealTotalsForSelectedDate,
  mealTypes,
  mealsForSelectedDate,
  nutritionForSelectedDate,
  totalCaloriesForSelectedDate,
  waterIntakeForSelectedDate,
} = useHomeNutritionSummary(sessionForSelectedDate)

// UI dialog toggles guarded by permissions.
const {
  closeEditor,
  isEditorVisible,
  isExerciseManagerVisible,
  openEditor,
  openExerciseManager,
} = useHomeDialogs({
  canEdit,
  isLoggedIn,
  isHydrated,
  ensureHydrated,
})

// Authentication flow wiring (login, logout, initial hydration).
const {
  handleLogin,
  handleLogout,
  initializeAuth,
  isLoggingIn,
  loginPassword,
  loginUsername,
} = useHomeAuth({
  authStore,
  ensureHydrated,
  resetSelection,
})

const isCoachDay = (dateKey: string) => Boolean(calendarSummaryByDate.value[dateKey]?.isCoachSession)
const isCoachForSelectedDate = computed(() => Boolean(sessionForSelectedDate.value?.isCoachSession))

const bodyWeightForSelectedDate = computed(() => {
  const weight = sessionForSelectedDate.value?.bodyWeightKg
  if (typeof weight !== 'number') {
    return null
  }
  const normalized = Math.round(weight * 10) / 10
  return normalized > 0 && normalized <= 400 ? normalized : null
})

const formattedBodyWeightForSelectedDate = computed(() => {
  const weight = bodyWeightForSelectedDate.value
  if (weight == null) {
    return ''
  }
  return Number.isInteger(weight) ? weight.toFixed(0) : weight.toFixed(1)
})

const hasBodyWeightForSelectedDate = computed(() => bodyWeightForSelectedDate.value != null)
const hasWaterForSelectedDate = computed(() => waterIntakeForSelectedDate.value > 0)
const hasDailyStatsForSelectedDate = computed(
  () => hasBodyWeightForSelectedDate.value || hasWaterForSelectedDate.value,
)

watch(
  () => sessionForSelectedDate.value?.id,
  () => {
    collapsedGroups.strength = false
    collapsedGroups.cardio = false
  },
)

onMounted(() => {
  void initializeAuth()
})
</script>


<template>
  <el-container class="home-layout">
    <el-header :class="['home-header', { 'home-header--compact': authStore.isLoggedIn }]">
      <h1>健身日誌月曆</h1>
      <p>快速概覽每一天的訓練安排，並為選定日期管理日誌內容。</p>
      <div class="home-header__links">
        <RouterLink to="/reports">
          <el-button type="primary" plain>查看報表</el-button>
        </RouterLink>
      </div>
      <div :class="['auth-panel', { 'auth-panel--compact': authStore.isLoggedIn }]">
        <template v-if="authStore.isLoggedIn">
          <div class="auth-status">
            <span>
              使用者：<strong>{{ authStore.displayName }}</strong>
              <el-tag size="small" type="info" class="auth-tag">{{ authStore.currentModeLabel }}</el-tag>
            </span>
            <div class="auth-actions">
              <el-button size="small" type="default" @click="handleLogout">登出</el-button>
              <el-button
                size="small"
                type="primary"
                plain
                @click="openExerciseManager"
              >
                {{ authStore.canEdit ? '管理訓練動作' : '檢視訓練動作' }}
              </el-button>
            </div>
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
            僅輸入帳號可瀏覽個人紀錄。輸入密碼可取得編輯權限。
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
                <div
                  class="day-cell"
                  :class="{ 'is-selected': data.isSelected, 'is-coach': isCoachDay(data.day) }"
                  @click="handleCalendarDateClick(data.day)"
                >
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
          <div ref="detailSectionRef" class="detail-section">
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
              <div class="session-meta" v-if="selectedBodyParts.length || isCoachForSelectedDate">
                <el-tag
                  v-if="isCoachForSelectedDate"
                  type="warning"
                  effect="dark"
                >
                  教練課
                </el-tag>
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
              <div v-if="hasDailyStatsForSelectedDate" class="daily-stats">
                <div v-if="hasBodyWeightForSelectedDate" class="stat-card stat-card--weight">
                  <span class="stat-label">今日體重</span>
                  <span class="stat-value">{{ formattedBodyWeightForSelectedDate }} kg</span>
                </div>
                <div v-if="hasWaterForSelectedDate" class="stat-card stat-card--water">
                  <span class="stat-label">喝水量</span>
                  <span class="stat-value">{{ waterIntakeForSelectedDate }} ml</span>
                </div>
              </div>
              <div v-if="sessionForSelectedDate.entries.length" class="entry-list">
                <section
                  v-for="group in entryGroups"
                  :key="group.category"
                  class="entry-group"
                >
                  <header class="entry-group-header">
                    <el-button link class="group-toggle" @click="toggleGroupCollapsed(group.category)">
                      <el-icon class="group-toggle-icon">
                        <CaretBottom v-if="!collapsedGroups[group.category]" />
                        <CaretRight v-else />
                      </el-icon>
                      <span class="group-title">{{ group.label }}</span>
                      <span class="group-count">（{{ group.entries.length }}）</span>
                    </el-button>
                  </header>
                  <transition name="group-collapse">
                    <div v-show="!collapsedGroups[group.category]" class="entry-group-body">
                      <div
                        v-for="entry in group.entries"
                        :key="entry.id ?? `${group.category}-${entry.exerciseId}`"
                        class="entry-card"
                      >
                        <div class="entry-header">
                          <div>
                            <h3 class="exercise-name">{{ getExerciseName(entry.exerciseId) }}</h3>
                            <span class="entry-body-part">{{ getExerciseBodyPartLabel(entry.exerciseId) }}</span>
                          </div>
                          <span class="set-count">{{ formatEntrySummary(entry) }}</span>
                        </div>
                        <p v-if="entry.note" class="entry-note">{{ entry.note }}</p>
                        <div v-if="isCardioEntry(entry)" class="cardio-summary">
                          <el-icon><Timer /></el-icon>
                          <span class="cardio-summary-label">時長</span>
                          <span class="cardio-summary-value">{{ entry.durationMinutes ?? 0 }} 分鐘</span>
                        </div>
                        <el-table
                          v-else
                          :data="entry.sets"
                          size="small"
                          border
                          row-key="id"
                          class="set-table"
                        >
                          <el-table-column prop="weight" label="重量" width="100%">
                            <template #default="{ row }">{{ row.weight }}</template>
                          </el-table-column>
                          <el-table-column prop="unit" label="單位" width="80">
                            <template #default="{ row }">{{ row.unit }}</template>
                          </el-table-column>
                          <el-table-column prop="reps" label="次數" width="100%">
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
                  </transition>
                </section>
              </div>
              <el-empty
                v-else
                description="尚未新增訓練"
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

            <template v-if="sessionForSelectedDate">
              <el-divider content-position="left">每日飲食</el-divider>
              <div v-if="hasNutritionForSelectedDate" class="nutrition-summary">
                <div class="meal-summary-grid">
                  <div
                    v-for="meal in mealsForSelectedDate"
                    :key="meal.mealType"
                    class="meal-summary-card"
                  >
                    <div class="meal-summary-header">
                      <span class="meal-name">{{ meal.label }}</span>
                      <span class="meal-calories">{{ meal.calories }} kcal</span>
                    </div>
                    <ul v-if="meal.items.length" class="meal-item-list">
                      <li v-for="item in meal.items" :key="item.id" class="meal-item">
                        <span>{{ item.name }}</span>
                        <span class="kcal">{{ item.calories }} kcal</span>
                      </li>
                    </ul>
                    <p v-else class="meal-empty">尚未記錄</p>
                  </div>
                </div>
                <div class="nutrition-total-row">
                  <span>每日總熱量</span>
                  <strong>{{ totalCaloriesForSelectedDate }} kcal</strong>
                </div>
              </div>
              <div v-else class="nutrition-placeholder-wrapper">
                <el-empty description="尚未紀錄今日飲食" class="nutrition-placeholder" />
              </div>
            </template>
            </el-card>
          </div>
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
  <ExerciseManager
    v-model="isExerciseManagerVisible"
    :can-edit="authStore.canEdit"
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
  transition: padding 0.3s ease;
}

.home-header h1 {
  margin: 0;
  font-size: clamp(1.6rem, 2vw + 1rem, 2.1rem);
  font-weight: 700;
  color: #1f2933;
}

.home-header--compact {
  padding: 1.5rem 1.5rem;
  align-items: flex-start;
  text-align: left;
  gap: 0.35rem;
}

.home-header--compact h1 {
  font-size: clamp(1.4rem, 1.6vw + 1rem, 1.9rem);
}

.home-header__links {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.home-header__links .el-button {
  font-weight: 600;
}

.home-header--compact .home-header__links {
  align-self: flex-start;
}

.auth-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  transition: all 0.3s ease;
}

.auth-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.auth-panel--compact {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 720px;
  margin-top: 0.25rem;
  align-self: flex-end;
}

.auth-panel--compact .auth-status {
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.auth-panel--compact .auth-actions {
  flex-wrap: wrap;
}

.auth-actions {
  display: flex;
  gap: 0.5rem;
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
  max-width: 360px;
  text-align: center;
}

.home-header--compact .login-hint {
  display: none;
}

.home-header p {
  margin: 0;
  max-width: 560px;
  color: #3e4c59;
  line-height: 1.6;
}

.home-header--compact p {
  text-align: left;
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

.detail-section {
  scroll-margin-top: 96px;
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

.day-cell.is-coach {
  box-shadow: inset 0 0 0 2px rgba(250, 204, 21, 0.75);
  background-color: rgba(250, 204, 21, 0.12);
}

.day-cell.is-selected.is-coach {
  background-color: rgba(250, 204, 21, 0.2);
  box-shadow: inset 0 0 0 2px rgba(250, 204, 21, 0.9);
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

.entry-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 0.9rem;
  background-color: var(--el-fill-color-light);
}

.entry-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #1f2937;
  font-weight: 600;
  padding: 0;
}

.group-toggle-icon {
  font-size: 1rem;
}

.group-title {
  font-weight: 600;
}

.group-count {
  color: #6b7280;
}

.entry-group-body {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.group-collapse-enter-active,
.group-collapse-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
}

.group-collapse-enter-from,
.group-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

.group-collapse-enter-to,
.group-collapse-leave-from {
  max-height: 800px;
  opacity: 1;
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

.cardio-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  color: #1f2937;
}

.cardio-summary-label {
  font-weight: 600;
}

.cardio-summary-value {
  font-weight: 600;
}

.entry-note {
  margin-bottom: 0.75rem;
  color: #4b5563;
  font-size: 0.9rem;
}

.muted {
  color: #9ca3af;
}

.nutrition-summary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.daily-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stat-card {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(56, 189, 248, 0.12));
  border: 1px solid rgba(59, 130, 246, 0.18);
}

.stat-card--weight {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.12));
  border-color: rgba(16, 185, 129, 0.24);
}

.stat-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e3a8a;
}

.meal-summary-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .meal-summary-grid {
    flex-direction: row;
  }
}

.meal-summary-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-fill-color-blank);
}

.meal-summary-header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

.meal-name {
  color: #1f2937;
}

.meal-calories {
  color: #2563eb;
}

.meal-item-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 0.75rem;
  margin: 0;
}

.meal-item {
  display: flex;
  justify-content: space-between;
  color: #374151;
}

.meal-item .kcal {
  color: #2563eb;
}

.meal-empty {
  margin: 0;
  color: #9ca3af;
  font-size: 0.9rem;
}

.nutrition-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background-color: rgba(16, 185, 129, 0.12);
  font-weight: 600;
  color: #047857;
}

.nutrition-placeholder-wrapper {
  margin-top: 1rem;
}

.nutrition-placeholder {
  margin: 0;
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
