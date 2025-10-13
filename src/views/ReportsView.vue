<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/authStore'
import { useWorkoutStore } from '@/stores/workoutStore'
import { useWorkoutReports } from '@/composables/reports/useWorkoutReports'
import type { WorkoutExerciseUsage } from '@/composables/reports/useWorkoutReports'
import type { MealType } from '@/types/workout'

const authStore = useAuthStore()
const workoutStore = useWorkoutStore()

const { exercises, sessionsByDate, isHydrated, isHydrating } = storeToRefs(workoutStore)
const { displayName, currentModeLabel, isLoggedIn, isInitializing, username } = storeToRefs(authStore)

const selectedRange = ref<[Date, Date] | null>(null)

const reports = useWorkoutReports({ exercises, sessionsByDate, selectedRange })
const { availableRange, activeRange, metrics, nutritionSummary, bodyWeightSummary, exerciseUsage, sessionBreakdown, sessionsInRange } = reports

const isLoading = computed(() => isInitializing.value || isHydrating.value)

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const formatDecimal = (value: number | null | undefined, digits = 1) => {
  if (!isFiniteNumber(value)) {
    return '—'
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const formatCount = (value: number) => value.toLocaleString()

const formatWeightValue = (value: number | undefined) => {
  if (!isFiniteNumber(value)) {
    return '—'
  }
  const digits = Number.isInteger(value) ? 0 : 1
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const formatExerciseMaxWeight = (usage: WorkoutExerciseUsage) => {
  if (usage.maxWeightKg == null) {
    return '—'
  }
  const base = `${formatWeightValue(usage.maxWeightKg)} kg`
  if (!usage.maxWeightSource || usage.maxWeightSource.unit === 'kg') {
    return base
  }
  const original = `${usage.maxWeightSource.value.toLocaleString()} lb`
  return `${base}（原始 ${original}）`
}

const formatDateLabel = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return dateKey
  }
  return parsed.toLocaleDateString()
}

const formattedRange = computed(() => {
  const range = activeRange.value
  if (!range) {
    return '尚無資料可顯示'
  }
  const start = range.start.toLocaleDateString()
  const end = range.end.toLocaleDateString()
  return start === end ? start : `${start} 至 ${end}`
})

const metricsCards = computed(() => {
  const overview = metrics.value
  return [
    {
      label: '訓練紀錄',
      value: formatCount(overview.totalSessions),
      hint:
        overview.totalDays > 0
          ? `涵蓋 ${overview.totalDays.toLocaleString()} 天`
          : '請選擇分析範圍',
    },
    {
      label: '重量訓練組數',
      value: formatCount(overview.totalStrengthSets),
      hint: '累積的重量訓練組數',
    },
    {
      label: '有氧分鐘',
      value: formatCount(overview.totalCardioMinutes),
      hint: '累積的有氧運動時間',
    },
    {
      label: '教練課次數',
      value: formatCount(overview.totalCoachSessions),
      hint: '勾選教練課之日期',
    },
  ]
})

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner']
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

const nutritionCards = computed(() => {
  const summary = nutritionSummary.value
  const hasActiveDays = summary.activeDays > 0
  const averageCalories = hasActiveDays ? `${formatDecimal(summary.averageCaloriesPerActiveDay)} kcal` : '—'
  const averageWater = hasActiveDays ? `${formatDecimal(summary.averageWaterMlPerActiveDay)} ml` : '—'

  return [
    {
      label: '總熱量',
      value: `${summary.totalCalories.toLocaleString()} kcal`,
      hint: hasActiveDays ? `有飲食紀錄的日期：${summary.activeDays.toLocaleString()} 天` : '尚無飲食紀錄',
    },
    {
      label: '平均熱量（有紀錄日）',
      value: averageCalories,
      hint: hasActiveDays ? '依有飲食紀錄的日期計算' : '待新增飲食資料',
    },
    {
      label: '總飲水',
      value: `${summary.totalWaterIntakeMl.toLocaleString()} ml`,
      hint: hasActiveDays ? '包含所有飲食紀錄日' : '尚無飲水紀錄',
    },
    {
      label: '平均飲水（有紀錄日）',
      value: averageWater,
      hint: hasActiveDays ? '依有飲食紀錄的日期計算' : '待新增飲水資料',
    },
  ]
})

const nutritionRows = computed(() =>
  MEAL_ORDER.map((meal) => ({
    meal,
    label: MEAL_LABELS[meal],
    calories: nutritionSummary.value.caloriesByMeal[meal] ?? 0,
  })),
)

const hasNutritionData = computed(
  () => nutritionSummary.value.totalCalories > 0 || nutritionSummary.value.totalWaterIntakeMl > 0,
)

const hasBodyWeightData = computed(() => bodyWeightSummary.value.sampleCount > 0)

const bodyWeightCards = computed(() => {
  if (!hasBodyWeightData.value) {
    return []
  }
  const summary = bodyWeightSummary.value
  return [
    {
      label: '樣本天數',
      value: summary.sampleCount.toLocaleString(),
      hint: '包含有體重紀錄的日期',
    },
    {
      label: '平均體重',
      value: `${formatDecimal(summary.averageKg)} kg`,
      hint: '',
    },
    {
      label: '最低體重',
      value: `${formatDecimal(summary.minKg)} kg`,
      hint: '',
    },
    {
      label: '最高體重',
      value: `${formatDecimal(summary.maxKg)} kg`,
      hint: '',
    },
  ]
})

const hasSessions = computed(() => sessionsInRange.value.length > 0)
const hasExerciseUsage = computed(() => exerciseUsage.value.length > 0)

const resetRange = () => {
  const range = availableRange.value
  if (!range) {
    selectedRange.value = null
    return
  }
  selectedRange.value = [new Date(range.start), new Date(range.end)]
}

const initializeData = async () => {
  await authStore.initialize()
  if (!isHydrated.value) {
    await workoutStore.hydrateFromPersistence()
  }
}

onMounted(() => {
  void initializeData()
})

watch(
  availableRange,
  (range) => {
    if (!range) {
      selectedRange.value = null
      return
    }
    if (!selectedRange.value) {
      selectedRange.value = [new Date(range.start), new Date(range.end)]
    }
  },
  { immediate: true },
)

watch(username, () => {
  selectedRange.value = null
})
</script>

<template>
  <el-container class="reports-layout">
    <el-header class="reports-header">
      <div class="reports-header__info">
        <RouterLink to="/" class="reports-back" aria-label="返回月曆">
          <el-button :icon="ArrowLeft" link>返回月曆</el-button>
        </RouterLink>
        <h1>訓練報表</h1>
        <p>聚焦指定區間的訓練、飲食、體重與動作使用概況。</p>
      </div>
      <div v-if="isLoggedIn" class="reports-header__auth">
        <span>使用者：<strong>{{ displayName }}</strong></span>
        <el-tag size="small" type="info">{{ currentModeLabel }}</el-tag>
      </div>
    </el-header>
    <el-main class="reports-content">
      <el-card class="reports-card reports-card--filters" shadow="never">
        <div class="reports-filters">
          <div class="reports-filters__control">
            <span class="reports-filters__label">分析區間</span>
            <el-date-picker
              v-model="selectedRange"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              unlink-panels
              clearable
              :disabled="isLoading"
              :editable="false"
            />
            <el-button
              :icon="Refresh"
              size="small"
              @click="resetRange"
              :disabled="!availableRange"
            >
              重設範圍
            </el-button>
          </div>
          <div class="reports-filters__summary">
            <span>目前範圍：{{ formattedRange }}</span>
            <span v-if="metrics.totalSessions || metrics.totalDays">
              共 {{ metrics.totalSessions.toLocaleString() }} 筆訓練紀錄，涵蓋
              {{ metrics.totalDays.toLocaleString() }} 天
            </span>
          </div>
        </div>
      </el-card>

      <el-row :gutter="16" class="reports-metrics" v-if="metricsCards.length">
        <el-col
          v-for="card in metricsCards"
          :key="card.label"
          :xs="12"
          :sm="12"
          :md="6"
        >
          <el-card class="reports-card reports-card--metric" shadow="hover">
            <div class="reports-metrics__label">{{ card.label }}</div>
            <div class="reports-metrics__value">{{ card.value }}</div>
            <div class="reports-metrics__hint">{{ card.hint }}</div>
          </el-card>
        </el-col>
      </el-row>

      <el-card class="reports-card" shadow="never">
        <template #header>
          <div class="reports-card__header">
            <h2>飲食與飲水概況</h2>
          </div>
        </template>
        <div v-if="hasNutritionData" class="reports-nutrition">
          <el-row :gutter="16" class="reports-nutrition__cards">
            <el-col
              v-for="card in nutritionCards"
              :key="card.label"
              :xs="12"
              :sm="12"
              :md="6"
            >
              <el-card class="reports-card reports-card--metric" shadow="never">
                <div class="reports-metrics__label">{{ card.label }}</div>
                <div class="reports-metrics__value">{{ card.value }}</div>
                <div class="reports-metrics__hint">{{ card.hint }}</div>
              </el-card>
            </el-col>
          </el-row>
          <el-table :data="nutritionRows" border class="reports-table">
            <el-table-column prop="label" label="餐別" width="120" />
            <el-table-column label="熱量 (kcal)" align="center">
              <template #default="{ row }">
                {{ row.calories.toLocaleString() }}
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-empty v-else description="指定區間內沒有飲食紀錄" />
      </el-card>

      <el-card class="reports-card" shadow="never">
        <template #header>
          <div class="reports-card__header">
            <h2>體重趨勢摘要</h2>
          </div>
        </template>
        <div v-if="hasBodyWeightData">
          <el-row :gutter="16" class="reports-metrics">
            <el-col
              v-for="card in bodyWeightCards"
              :key="card.label"
              :xs="12"
              :sm="12"
              :md="6"
            >
              <el-card class="reports-card reports-card--metric" shadow="never">
                <div class="reports-metrics__label">{{ card.label }}</div>
                <div class="reports-metrics__value">{{ card.value }}</div>
                <div v-if="card.hint" class="reports-metrics__hint">{{ card.hint }}</div>
              </el-card>
            </el-col>
          </el-row>
        </div>
        <el-empty v-else description="尚無體重紀錄" />
      </el-card>

      <el-card class="reports-card" shadow="never">
        <template #header>
          <div class="reports-card__header">
            <h2>動作使用統計</h2>
          </div>
        </template>
        <div v-if="hasExerciseUsage">
          <el-table :data="exerciseUsage" border class="reports-table">
            <el-table-column label="動作" min-width="200">
              <template #default="{ row }">
                <div class="reports-exercise__name">{{ row.name }}</div>
                <div class="reports-exercise__meta">
                  {{ row.bodyPart ? row.bodyPart : '—' }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="分類" width="140" align="center">
              <template #default="{ row }">
                {{ row.category === 'cardio' ? '有氧運動' : '重量訓練' }}
              </template>
            </el-table-column>
            <el-table-column prop="sessionCount" label="涉入日數" width="120" align="center">
              <template #default="{ row }">
                {{ row.sessionCount.toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column prop="entryCount" label="總使用次數" width="140" align="center">
              <template #default="{ row }">
                {{ row.entryCount.toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="最高重量" min-width="200" align="center">
              <template #default="{ row }">
                {{ formatExerciseMaxWeight(row) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-empty v-else description="指定區間內尚無訓練動作紀錄" />
      </el-card>

      <el-card class="reports-card" shadow="never">
        <template #header>
          <div class="reports-card__header">
            <h2>日誌明細</h2>
          </div>
        </template>
        <div v-if="hasSessions">
          <el-table :data="sessionBreakdown" border class="reports-table" row-key="session.id">
            <el-table-column label="日期" width="140" align="center">
              <template #default="{ row }">
                {{ formatDateLabel(row.session.date) }}
              </template>
            </el-table-column>
            <el-table-column label="標籤" min-width="220">
              <template #default="{ row }">
                <el-space wrap>
                  <el-tag
                    v-for="label in row.labels"
                    :key="label"
                    size="small"
                    class="reports-tag"
                  >
                    {{ label }}
                  </el-tag>
                </el-space>
                <span v-if="!row.labels.length">—</span>
              </template>
            </el-table-column>
            <el-table-column label="重量組數" width="120" align="center">
              <template #default="{ row }">
                {{ row.strengthSets.toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="有氧 (分)" width="120" align="center">
              <template #default="{ row }">
                {{ row.cardioMinutes.toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="飲食熱量" width="120" align="center">
              <template #default="{ row }">
                {{ row.totalCalories.toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="體重 (kg)" width="120" align="center">
              <template #default="{ row }">
                {{ formatWeightValue(row.session.bodyWeightKg) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-empty v-else description="指定區間內沒有訓練紀錄" />
      </el-card>
    </el-main>
  </el-container>
</template>

<style scoped>
.reports-layout {
  min-height: 100vh;
  background: #f5f7fa;
  flex-direction: column;
}

.reports-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 32px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.reports-header__info h1 {
  margin: 4px 0;
  font-size: 28px;
  font-weight: 600;
}

.reports-header__info p {
  margin: 0;
  color: #606266;
}

.reports-header__auth {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #606266;
}

.reports-back .el-button {
  padding-left: 0;
}

.reports-content {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.reports-card {
  width: 100%;
}

.reports-card--filters {
  border: 1px solid #e4e7ed;
}

.reports-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reports-filters__control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.reports-filters__label {
  font-weight: 500;
  color: #303133;
}

.reports-filters__summary {
  color: #606266;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.reports-metrics {
  width: 100%;
}

.reports-card--metric {
  height: 100%;
  border: 1px solid #e4e7ed;
  background-color: #fff;
}

.reports-metrics__label {
  font-size: 14px;
  color: #606266;
}

.reports-metrics__value {
  margin-top: 4px;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.reports-metrics__hint {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.reports-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.reports-nutrition__cards {
  margin-bottom: 16px;
}

.reports-table {
  width: 100%;
}

.reports-exercise__name {
  font-weight: 500;
}

.reports-exercise__meta {
  font-size: 12px;
  color: #909399;
}

.reports-tag {
  margin-bottom: 4px;
}

@media (max-width: 768px) {
  .reports-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .reports-content {
    padding: 24px 16px;
  }
}
</style>
