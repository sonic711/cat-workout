<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useWorkoutStore } from '@/stores/workoutStore'
import type {
  DraftWorkoutEntry,
  DraftWorkoutSession,
  DraftWorkoutSet,
  ExerciseDefinition,
  WorkoutSession,
} from '@/types/workout'

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

const draft = ref<DraftWorkoutSession>(createEmptyDraft())

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const isReadOnly = computed(() => !props.canEdit)

const exerciseDialogVisible = ref(false)
const exerciseDialogTargetEntry = ref<number | null>(null)

const newExerciseForm = reactive({
  name: '',
  bodyPart: '',
})

const exerciseOptions = computed<ExerciseDefinition[]>(() => Object.values(exercises.value))

function createEmptyDraft(): DraftWorkoutSession {
  return {
    date: props.date,
    note: '',
    entries: [],
  }
}

const createEmptySet = (): DraftWorkoutSet => ({
  weight: 0,
  unit: 'kg',
  reps: 0,
  note: '',
})

const hydrateDraft = () => {
  if (props.session) {
    draft.value = {
      id: props.session.id,
      date: props.session.date,
      note: props.session.note ?? '',
      entries: props.session.entries.map((entry) => ({
        id: entry.id,
        exerciseId: entry.exerciseId,
        note: entry.note ?? '',
        sets: entry.sets.map((set) => ({
          id: set.id,
          weight: set.weight,
          unit: set.unit,
          reps: set.reps,
          note: set.note ?? '',
        })),
      })),
    }
    if (!draft.value.entries.length) {
      draft.value.entries.push(createEmptyEntry())
    }
  } else {
    draft.value = createEmptyDraft()
    draft.value.entries.push(createEmptyEntry())
  }
}

const createEmptyEntry = (): DraftWorkoutEntry => ({
  exerciseId: exerciseOptions.value[0]?.id ?? '',
  note: '',
  sets: [createEmptySet()],
})

const closeDialog = () => {
  emit('update:modelValue', false)
}

const guardMutation = (callback: () => void) => {
  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，請以完整登入取得編輯權限。')
    return
  }
  callback()
}

const handleAddEntry = () => {
  guardMutation(() => {
    draft.value.entries.push(createEmptyEntry())
  })
}

const handleRemoveEntry = (index: number) => {
  guardMutation(() => {
    draft.value.entries.splice(index, 1)
    if (!draft.value.entries.length) {
      draft.value.entries.push(createEmptyEntry())
    }
  })
}

const handleAddSet = (entry: DraftWorkoutEntry) => {
  guardMutation(() => {
    entry.sets.push(createEmptySet())
  })
}

const handleRemoveSet = (entry: DraftWorkoutEntry, index: number) => {
  guardMutation(() => {
    entry.sets.splice(index, 1)
    if (!entry.sets.length) {
      entry.sets.push(createEmptySet())
    }
  })
}

const resetExerciseDialog = () => {
  newExerciseForm.name = ''
  newExerciseForm.bodyPart = ''
  exerciseDialogTargetEntry.value = null
}

const openExerciseDialog = (entryIndex: number) => {
  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，請以完整登入取得編輯權限。')
    return
  }
  exerciseDialogTargetEntry.value = entryIndex
  exerciseDialogVisible.value = true
}

const handleCreateExercise = () => {
  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，請以完整登入取得編輯權限。')
    return
  }

  const name = newExerciseForm.name.trim()
  const bodyPart = newExerciseForm.bodyPart.trim()
  if (!name) {
    ElMessage.error('請輸入動作名稱')
    return
  }
  if (!bodyPart) {
    ElMessage.error('請輸入身體部位')
    return
  }
  try {
    const created = workoutStore.registerExercise({ name, bodyPart })
    const targetIndex = exerciseDialogTargetEntry.value
    if (targetIndex != null) {
      const targetEntry = draft.value.entries[targetIndex]
      if (targetEntry) {
        targetEntry.exerciseId = created.id
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

const resetDraftOnOpen = (value: boolean) => {
  if (value) {
    hydrateDraft()
  }
}

watch(
  () => props.modelValue,
  (value) => {
    resetDraftOnOpen(value)
    if (!value) {
      resetExerciseDialog()
    }
  },
)

watch(
  () => props.session,
  (value) => {
    if (props.modelValue) {
      resetDraftOnOpen(true)
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

const sanitizeDraft = (): DraftWorkoutSession => ({
  id: draft.value.id,
  date: props.date,
  note: draft.value.note?.trim() || undefined,
  entries: draft.value.entries.map((entry) => ({
    id: entry.id,
    exerciseId: entry.exerciseId,
    note: entry.note?.trim() || undefined,
    sets: entry.sets.map((set) => ({
      id: set.id,
      weight: Number(set.weight),
      unit: set.unit,
      reps: Number(set.reps),
      note: set.note?.trim() || undefined,
    })),
  })),
})

const validateDraft = () => {
  if (!draft.value.entries.length) {
    ElMessage.error('請至少新增一個訓練項目')
    return false
  }

  for (const entry of draft.value.entries) {
    if (!entry.exerciseId) {
      ElMessage.error('請為每個訓練項目選擇動作')
      return false
    }
    if (!entry.sets.length) {
      ElMessage.error('每個訓練項目需至少一組紀錄')
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

  return true
}

const handleSave = () => {
  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，請以完整登入取得編輯權限。')
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
    ElMessage.info('目前為唯讀模式，請以完整登入取得編輯權限。')
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
</script>

<template>
  <el-dialog :model-value="isVisible" title="管理訓練紀錄" width="720px" @close="closeDialog">
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
            >
              <el-option
                v-for="exercise in exerciseOptions"
                :key="exercise.id"
                :label="`${exercise.name}（${exercise.bodyPart}）`"
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

          <el-table :data="entry.sets" size="small" border class="set-table">
            <el-table-column label="重量 (kg/lb)" width="180">
              <template #default="{ row }">
                <div class="set-weight">
                  <el-input-number v-model="row.weight" :min="0" :step="0.5" :disabled="isReadOnly" />
                  <el-select v-model="row.unit" class="unit-select" :disabled="isReadOnly">
                    <el-option label="kg" value="kg" />
                    <el-option label="lb" value="lb" />
                  </el-select>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="次數" width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.reps" :min="1" :disabled="isReadOnly" />
              </template>
            </el-table-column>
            <el-table-column label="備註">
              <template #default="{ row }">
                <el-input v-model="row.note" placeholder="選填" :disabled="isReadOnly" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ $index }">
                <el-button type="danger" link :disabled="isReadOnly" @click="handleRemoveSet(entry, $index)">
                  移除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="table-actions">
            <el-button type="primary" plain :disabled="isReadOnly" @click="handleAddSet(entry)">
              新增組數
            </el-button>
          </div>
        </div>

        <el-button type="primary" plain :disabled="isReadOnly" @click="handleAddEntry">
          新增訓練項目
        </el-button>
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
      <el-form-item label="部位">
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

.unit-select {
  width: 90px;
}

.table-actions {
  display: flex;
  justify-content: flex-end;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
