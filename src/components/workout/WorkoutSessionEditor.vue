<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useSessionDraft } from '@/composables/sessionEditor/useSessionDraft'
import { useExerciseDialog } from '@/composables/sessionEditor/useExerciseDialog'
import type { SessionDraft } from '@/composables/sessionEditor/useSessionDraft'
import { useWorkoutStore } from '@/stores/workoutStore'
import type { ExerciseDefinition, MealType, WorkoutSession } from '@/types/workout'

interface Props {
  modelValue: boolean
  date: string
  session: WorkoutSession | null
  canEdit: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
  deleted: []
}>()

const workoutStore = useWorkoutStore()
const { exercises } = storeToRefs(workoutStore)

// Dialog visibility and permission flags.
const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const isReadOnly = computed(() => !props.canEdit)

const dateRef = computed(() => props.date)
const sessionRef = computed(() => props.session)

// Draft manager centralizes entry/set/nutrition manipulation.
const {
  addEntry,
  addMealItem,
  addSet,
  draft,
  exerciseOptions,
  formatWeightLabel,
  getWeightOptions,
  handleEntryExerciseChange: doSyncEntry,
  hydrateDraft,
  isCardioEntry,
  mealLabels,
  mealTotals,
  mealTypes,
  removeEntry,
  removeMealItem,
  removeSet,
  repOptions,
  sanitizeDraft,
  totalCalories,
} = useSessionDraft({
  date: dateRef,
  session: sessionRef,
  exercises,
})

// Local exercise dialog used to add new moves without leaving the editor.
const {
  CATEGORY_LABELS,
  categoryOptions,
  exerciseDialogTargetEntry,
  exerciseDialogVisible,
  isNewExerciseStrength,
  newExerciseForm,
  openExerciseDialog,
  resetExerciseDialog,
} = useExerciseDialog({
  isReadOnly,
})

const closeDialog = () => {
  emit('update:modelValue', false)
}

const showReadOnlyInfo = () => {
  ElMessage.info('目前為唯讀模式，請以完整登入取得編輯權限。')
}

// Prevent unintended writes when the editor is opened in view-only mode.
const guardMutation = (callback: () => void) => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }
  callback()
}

type DraftEntry = SessionDraft['entries'][number]

const handleEntryExerciseChange = (entry: DraftEntry) => {
  guardMutation(() => doSyncEntry(entry))
}

const handleAddEntry = () => guardMutation(addEntry)

const handleRemoveEntry = (index: number) => {
  guardMutation(() => removeEntry(index))
}

const handleAddSet = (entry: DraftEntry) => {
  guardMutation(() => addSet(entry))
}

const handleRemoveSet = (entry: DraftEntry, index: number) => {
  guardMutation(() => removeSet(entry, index))
}

const handleAddMealItem = (mealType: MealType) => {
  guardMutation(() => addMealItem(mealType))
}

const handleRemoveMealItem = (mealType: MealType, index: number) => {
  guardMutation(() => removeMealItem(mealType, index))
}

const handleOpenExerciseDialog = (entryIndex: number) => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }
  openExerciseDialog(entryIndex)
}

const formatExerciseOptionLabel = (exercise: ExerciseDefinition): string => {
  if (exercise.category === 'cardio') {
    return `${exercise.name}（${CATEGORY_LABELS.cardio}）`
  }
  const bodyPart = exercise.bodyPart?.trim()
  return bodyPart?.length ? `${exercise.name}（${bodyPart}）` : exercise.name
}

const handleCreateExercise = () => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }

  const name = newExerciseForm.name.trim()
  const category = newExerciseForm.category
  const bodyPart = newExerciseForm.bodyPart.trim()

  if (!name) {
    ElMessage.error('請輸入動作名稱')
    return
  }
  if (category === 'strength' && !bodyPart) {
    ElMessage.error('請輸入身體部位')
    return
  }

  try {
    const created = workoutStore.registerExercise({
      name,
      category,
      bodyPart: category === 'strength' ? bodyPart : undefined,
    })
    const targetIndex = exerciseDialogTargetEntry.value
    if (targetIndex != null) {
      const targetEntry = draft.value.entries[targetIndex]
      if (targetEntry) {
        targetEntry.exerciseId = created.id
        doSyncEntry(targetEntry)
      }
    }
    ElMessage.success('成功新增動作')
    exerciseDialogVisible.value = false
    resetExerciseDialog()
  } catch (error) {
    if (error instanceof Error) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('新增動作時發生錯誤')
    }
  }
}

const validateDraft = () => {
  for (const entry of draft.value.entries) {
    if (!entry.exerciseId) {
      ElMessage.error('請為每個訓練項目選擇動作')
      return false
    }
    if (isCardioEntry(entry)) {
      const duration = Number(entry.durationMinutes)
      if (!Number.isFinite(duration) || duration <= 0) {
        ElMessage.error('請為有氧運動輸入有效的時間（分鐘）')
        return false
      }
      continue
    }
    if (!entry.sets.length) {
      ElMessage.error('每個重量訓練項目需至少一組紀錄')
      return false
    }
    for (const set of entry.sets) {
      if (set.weight < 0) {
        ElMessage.error('重量不可為負數')
        return false
      }
      if (set.reps <= 0) {
        ElMessage.error('次數需大於 0')
        return false
      }
    }
  }

  if (draft.value.nutrition.waterIntakeMl < 0) {
    ElMessage.error('喝水量不可為負數')
    return false
  }

  for (const mealType of mealTypes) {
    const items = draft.value.nutrition.meals[mealType]
    for (const item of items) {
      const name = item.name.trim()
      if (!name) {
        ElMessage.error(`請為${mealLabels[mealType]}項目填寫名稱`)
        return false
      }
      const calories = Number(item.calories)
      if (!Number.isFinite(calories) || calories < 0) {
        ElMessage.error(`請為${mealLabels[mealType]}項目設定有效的大卡數`)
        return false
      }
    }
  }

  return true
}

const handleSave = () => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }
  if (!validateDraft()) {
    return
  }

  try {
    workoutStore.upsertSession(sanitizeDraft())
    ElMessage.success('已儲存訓練紀錄')
    emit('saved')
    closeDialog()
  } catch (error) {
    if (error instanceof Error) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('儲存訓練紀錄時發生錯誤')
    }
  }
}

const handleDelete = async () => {
  if (!props.session) {
    return
  }

  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }

  try {
    await ElMessageBox.confirm('確定要刪除此日期的訓練紀錄嗎？', '刪除訓練紀錄', {
      type: 'warning',
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    workoutStore.removeSession(props.session.date)
    ElMessage.success('已刪除訓練紀錄')
    emit('deleted')
    closeDialog()
  } catch (error) {
    if (error instanceof Error) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('刪除訓練紀錄時發生錯誤')
    }
  }
}

watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      hydrateDraft(sessionRef.value)
    } else {
      resetExerciseDialog()
    }
  },
)

watch(
  () => props.canEdit,
  (value) => {
    if (!value) {
      exerciseDialogVisible.value = false
    }
  },
)
</script>


<template>
  <el-dialog :model-value="isVisible" title="管理訓練紀錄" width="720px" class="session-editor-dialog" @close="closeDialog">
    <div class="dialog-content">
      <el-alert
        v-if="isReadOnly"
        title="目前為唯讀模式，僅能檢視既有內容。"
        type="info"
        show-icon
        class="readonly-alert"
      />
      <div class="session-header">
        <span class="session-date">日期：{{ date }}</span>
        <el-input
          v-model="draft.note"
          type="textarea"
          :rows="2"
          placeholder="訓練筆記"
          :disabled="isReadOnly"
        />
        <div class="session-flags">
          <el-checkbox v-model="draft.isCoachSession" :disabled="isReadOnly">
            教練課
          </el-checkbox>
        </div>
      </div>

      <div class="entries-section">
        <div
          v-for="(entry, entryIndex) in draft.entries"
          :key="entry.id ?? entryIndex"
          class="entry-block"
        >
          <div class="entry-header">
            <el-select
              v-model="entry.exerciseId"
              placeholder="選擇訓練動作"
              filterable
              class="exercise-select"
              :disabled="isReadOnly"
              @change="handleEntryExerciseChange(entry)"
            >
              <el-option
                v-for="exercise in exerciseOptions"
                :key="exercise.id"
                :label="formatExerciseOptionLabel(exercise)"
                :value="exercise.id"
              />
            </el-select>
            <el-button type="primary" link :disabled="isReadOnly" @click="openExerciseDialog(entryIndex)">
              新增動作
            </el-button>
            <el-button type="danger" link :disabled="isReadOnly" @click="handleRemoveEntry(entryIndex)">
              移除此項目
            </el-button>
          </div>

          <el-input
            v-model="entry.note"
            type="textarea"
            placeholder="項目備註"
            :rows="2"
            class="entry-note"
            :disabled="isReadOnly"
          />

          <div v-if="isCardioEntry(entry)" class="cardio-duration">
            <el-input-number
              v-model="entry.durationMinutes"
              :min="1"
              :step="5"
              :disabled="isReadOnly"
              class="cardio-duration-input"
            />
            <span class="cardio-duration-label">分鐘</span>
          </div>

          <el-table v-else :data="entry.sets" size="small" border class="set-table">
            <el-table-column label="重量 (kg/lb)" width="180">
              <template #default="{ row }">
                <div class="set-weight">
                  <el-select
                    v-model="row.weight"
                    class="weight-select"
                    filterable
                    :disabled="isReadOnly"
                    placeholder="選擇重量"
                  >
                    <el-option
                      v-for="option in getWeightOptions(row.unit)"
                      :key="`weight-${row.unit}-${option}`"
                      :label="formatWeightLabel(option)"
                      :value="option"
                    />
                  </el-select>
                  <el-select v-model="row.unit" class="unit-select" :disabled="isReadOnly">
                    <el-option label="kg" value="kg" />
                    <el-option label="lb" value="lb" />
                  </el-select>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="次數" width="120">
              <template #default="{ row }">
                <el-select
                  v-model="row.reps"
                  class="reps-select"
                  filterable
                  :disabled="isReadOnly"
                  placeholder="選擇次數"
                >
                  <el-option
                    v-for="option in repOptions"
                    :key="`reps-${option}`"
                    :label="option"
                    :value="option"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="備註">
              <template #default="{ row }">
                <el-input v-model="row.note" placeholder="選填" :disabled="isReadOnly" />
              </template>
            </el-table-column>
            <el-table-column width="160" align="right">
              <template #default="{ row, $index }">
                <div class="table-actions">
                  <el-button type="primary" link :disabled="isReadOnly" @click="handleAddSet(entry)">
                    新增組數
                  </el-button>
                  <el-button type="danger" link :disabled="isReadOnly" @click="handleRemoveSet(entry, $index)">
                    移除此組
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="!isCardioEntry(entry)" class="table-actions">
            <el-button type="primary" plain :disabled="isReadOnly" @click="handleAddSet(entry)">
              新增組數
            </el-button>
          </div>
        </div>

        <el-button type="primary" plain :disabled="isReadOnly" @click="handleAddEntry">
          新增訓練項目
        </el-button>
      </div>

      <el-divider />

      <div class="nutrition-section">
        <div class="nutrition-header">
          <h3>飲食與水分紀錄</h3>
          <span class="nutrition-total">總熱量：{{ totalCalories }} kcal</span>
        </div>
        <div class="water-intake-row">
          <label>喝水量 (ml)</label>
          <el-input-number
            v-model="draft.nutrition.waterIntakeMl"
            :min="0"
            :step="100"
            :disabled="isReadOnly"
          />
        </div>
        <div class="meal-grid">
          <div v-for="mealType in mealTypes" :key="mealType" class="meal-column">
            <div class="meal-header-row">
              <div class="meal-title">
                <h4>{{ mealLabels[mealType] }}</h4>
                <span class="meal-total">{{ mealTotals[mealType] }} kcal</span>
              </div>
              <el-button
                type="primary"
                link
                :disabled="isReadOnly"
                @click="handleAddMealItem(mealType)"
              >
                新增項目
              </el-button>
            </div>
            <div v-if="draft.nutrition.meals[mealType].length" class="meal-items">
              <div
                v-for="(item, itemIndex) in draft.nutrition.meals[mealType]"
                :key="item.id ?? `${mealType}-${itemIndex}`"
                class="meal-item"
              >
                <el-input
                  v-model="item.name"
                  placeholder="餐點名稱"
                  :disabled="isReadOnly"
                  class="meal-name-input"
                />
                <div class="meal-calories">
                  <el-input-number
                    v-model="item.calories"
                    :min="0"
                    :step="10"
                    :disabled="isReadOnly"
                  />
                  <span class="unit">kcal</span>
                </div>
                <el-button
                  type="danger"
                  link
                  :disabled="isReadOnly"
                  @click="handleRemoveMealItem(mealType, itemIndex)"
                >
                  移除
                </el-button>
              </div>
            </div>
            <el-empty
              v-else
              description="尚未新增項目"
              :image-size="60"
            />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="closeDialog">取消</el-button>
        <el-button v-if="session" type="danger" :disabled="isReadOnly" @click="handleDelete">
          刪除
        </el-button>
        <el-button type="primary" :disabled="isReadOnly" @click="handleSave">儲存</el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="exerciseDialogVisible"
    title="新增訓練動作"
    width="360px"
    @closed="resetExerciseDialog"
  >
    <el-form label-width="80px" class="exercise-form">
      <el-form-item label="名稱">
        <el-input v-model="newExerciseForm.name" placeholder="例如：槓鈴臥推" :disabled="isReadOnly" />
      </el-form-item>
      <el-form-item label="分類">
        <el-radio-group v-model="newExerciseForm.category" :disabled="isReadOnly">
          <el-radio-button
            v-for="option in categoryOptions"
            :key="option.value"
            :label="option.value"
          >
            {{ option.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="isNewExerciseStrength" label="部位">
        <el-input v-model="newExerciseForm.bodyPart" placeholder="例如：胸" :disabled="isReadOnly" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="exerciseDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="isReadOnly" @click="handleCreateExercise">新增</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.session-editor-dialog :deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
}

.readonly-alert {
  margin-bottom: 0.5rem;
}

.session-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.session-date {
  font-weight: 600;
  color: #1f2933;
}

.session-flags {
  display: flex;
  justify-content: flex-end;
}

.entries-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.entry-block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-fill-color-blank);
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.exercise-select {
  flex: 1;
}

.entry-note {
  width: 100%;
}

.set-table {
  width: 100%;
}

.set-weight {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.weight-select {
  flex: 1;
  min-width: 0;
}

.unit-select {
  width: 90px;
}

.reps-select {
  width: 100%;
}

.table-actions {
  display: flex;
  justify-content: flex-end;
}

.cardio-duration {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.cardio-duration-input {
  width: 140px;
}

.cardio-duration-label {
  color: #4b5563;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.nutrition-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.nutrition-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nutrition-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.nutrition-total {
  font-weight: 600;
  color: #2563eb;
}

.water-intake-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.water-intake-row label {
  min-width: 96px;
  color: #4b5563;
}

.meal-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.meal-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background-color: var(--el-fill-color-blank);
}

.meal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meal-title {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meal-title h4 {
  margin: 0;
  font-size: 1rem;
}

.meal-total {
  font-size: 0.85rem;
  color: #6b7280;
}

.meal-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meal-item {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
}

.meal-name-input {
  flex: 1;
}

.meal-calories {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.meal-calories .unit {
  color: #6b7280;
  font-size: 0.85rem;
}
</style>
