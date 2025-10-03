<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useExerciseManagerForm } from '@/composables/exerciseManager/useExerciseManagerForm'
import { useWorkoutStore } from '@/stores/workoutStore'
import type { ExerciseCategory, ExerciseDefinition } from '@/types/workout'
import { useResponsiveDialog } from '@/composables/useResponsiveDialog'

interface Props {
  modelValue: boolean
  canEdit: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const workoutStore = useWorkoutStore()
const { exerciseList, exerciseUsageById } = storeToRefs(workoutStore)

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const isReadOnly = computed(() => !props.canEdit)

// Extract reusable form state (mode, fields, category helpers).
const {
  CATEGORY_LABELS,
  categoryOptions,
  editingExerciseId,
  form,
  isStrengthCategory,
  mode,
  startCreate: formStartCreate,
  startEdit: formStartEdit,
} = useExerciseManagerForm()

const usageFor = (exerciseId: string) => exerciseUsageById.value(exerciseId)

const {
  dialogTop: managerDialogTop,
  dialogWidth: managerDialogWidth,
  isMobile: isManagerDialogMobile,
} = useResponsiveDialog({
  desktopWidth: 720,
  mobileHorizontalPadding: 32,
  mobileTop: '4vh',
})

const closeDialog = () => {
  emit('update:modelValue', false)
}

const guardEditAction = (callback: () => void) => {
  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，僅能檢視訓練動作。')
    return
  }
  callback()
}

const startCreate = () => {
  guardEditAction(() => {
    formStartCreate()
  })
}

const startEdit = (exercise: ExerciseDefinition) => {
  guardEditAction(() => {
    formStartEdit(exercise)
  })
}

const handleSubmit = () => {
  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，僅能檢視訓練動作。')
    return
  }

  const name = form.name.trim()
  const category = form.category
  const bodyPart = form.bodyPart.trim()

  if (!name) {
    ElMessage.error('請輸入動作名稱')
    return
  }
  if (category === 'strength' && !bodyPart) {
    ElMessage.error('請輸入身體部位')
    return
  }

  try {
    if (mode.value === 'edit' && editingExerciseId.value) {
      workoutStore.updateExercise({
        id: editingExerciseId.value,
        name,
        category,
        bodyPart: category === 'strength' ? bodyPart : undefined,
      })
      ElMessage.success('已更新訓練動作')
    } else {
      workoutStore.registerExercise({
        name,
        category,
        bodyPart: category === 'strength' ? bodyPart : undefined,
      })
      ElMessage.success('已新增訓練動作')
    }
    formStartCreate()
  } catch (error) {
    if (error instanceof Error) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('儲存訓練動作時發生錯誤')
    }
  }
}

const handleDelete = async (exercise: ExerciseDefinition) => {
  const usage = usageFor(exercise.id)
  if (usage.entryCount > 0) {
    ElMessage.warning('此訓練動作仍被訓練紀錄使用，無法刪除。')
    return
  }

  if (isReadOnly.value) {
    ElMessage.info('目前為唯讀模式，僅能檢視訓練動作。')
    return
  }

  try {
    await ElMessageBox.confirm(
      `確定要刪除「${exercise.name}」嗎？`,
      '刪除訓練動作',
      {
        type: 'warning',
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  try {
    workoutStore.removeExercise(exercise.id)
    ElMessage.success('已刪除訓練動作')
    if (editingExerciseId.value === exercise.id) {
      formStartCreate()
    }
  } catch (error) {
    if (error instanceof Error) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('刪除訓練動作時發生錯誤')
    }
  }
}

const handleCancelEdit = () => {
  formStartCreate()
}

const formatTimestamp = (value: string) => {
  if (!value) {
    return '—'
  }
  if (value.includes('T')) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString()
    }
  }
  return value
}

const formatCategory = (category: ExerciseCategory) => CATEGORY_LABELS[category] ?? category
</script>


<template>
  <el-dialog
    :model-value="isVisible"
    title="訓練動作管理"
    :width="managerDialogWidth"
    :top="managerDialogTop"
    :class="['exercise-manager-dialog', { 'is-compact': isManagerDialogMobile }]"
    @close="closeDialog"
  >
    <div class="manager-toolbar">
      <div>
        <strong>總數：</strong>{{ exerciseList.length }}
      </div>
      <el-button type="primary" plain size="small" :disabled="isReadOnly" @click="startCreate">
        新增訓練動作
      </el-button>
    </div>

    <el-form
      :model="form"
      label-width="80px"
      class="exercise-form"
      :disabled="isReadOnly"
      @submit.prevent
    >
      <el-form-item label="名稱">
        <el-input v-model="form.name" placeholder="例如：槓鈴深蹲" />
      </el-form-item>
      <el-form-item label="分類">
        <el-radio-group v-model="form.category">
          <el-radio-button
            v-for="option in categoryOptions"
            :key="option.value"
            :label="option.value"
          >
            {{ option.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="isStrengthCategory" label="部位">
        <el-input v-model="form.bodyPart" placeholder="例如：腿" />
      </el-form-item>
      <div class="form-actions">
        <el-button @click="handleCancelEdit" :disabled="isReadOnly">
          取消
        </el-button>
        <el-button type="primary" @click="handleSubmit" :disabled="isReadOnly">
          {{ mode === 'edit' ? '儲存變更' : '新增動作' }}
        </el-button>
      </div>
    </el-form>

    <div class="exercise-table-wrapper">
      <el-table :data="exerciseList" border stripe class="exercise-table" size="small">
        <el-table-column prop="name" label="名稱" min-width="160" />
        <el-table-column label="分類" width="120">
          <template #default="{ row }">
            {{ formatCategory(row.category) }}
          </template>
        </el-table-column>
        <el-table-column label="身體部位" min-width="140">
          <template #default="{ row }">
            <span v-if="row.category === 'strength' && row.bodyPart">{{ row.bodyPart }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="使用情況" min-width="140">
          <template #default="{ row }">
            <div>
              <span>Session：{{ usageFor(row.id).sessionCount }}</span>
            </div>
            <div class="usage-sub">Entry：{{ usageFor(row.id).entryCount }}</div>
          </template>
        </el-table-column>
        <el-table-column label="建立 / 更新" min-width="180">
          <template #default="{ row }">
            <div class="timestamp">建立：{{ formatTimestamp(row.createdAt) }}</div>
            <div class="timestamp">更新：{{ formatTimestamp(row.updatedAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" link @click="startEdit(row)" :disabled="isReadOnly">
              編輯
            </el-button>
            <el-divider direction="vertical" />
            <el-button type="danger" link @click="handleDelete(row)" :disabled="isReadOnly">
              刪除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<style scoped>
.manager-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.exercise-form {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.exercise-table {
  width: 100%;
}

.timestamp {
  font-size: 0.85rem;
  color: #6b7280;
}

.usage-sub {
  font-size: 0.85rem;
  color: #6b7280;
}

.muted {
  color: #9ca3af;
}

.exercise-table-wrapper {
  overflow-x: auto;
}

.exercise-manager-dialog.is-compact :deep(.el-dialog__header) {
  padding: 1rem;
}

.exercise-manager-dialog.is-compact :deep(.el-dialog__body) {
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 1rem;
}

@media (max-width: 768px) {
  .manager-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .exercise-form {
    padding: 0.75rem;
  }

  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
