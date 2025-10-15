<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CaretBottom, CaretRight, Rank } from '@element-plus/icons-vue'
import Draggable from 'vuedraggable'

import { useSessionDraft } from '@/composables/sessionEditor/useSessionDraft'
import { useExerciseDialog } from '@/composables/sessionEditor/useExerciseDialog'
import { useResponsiveDialog } from '@/composables/useResponsiveDialog'
import type { SessionDraft } from '@/composables/sessionEditor/useSessionDraft'
import { useWorkoutStore } from '@/stores/workoutStore'
import type { ExerciseCategory, ExerciseDefinition, MealType, WorkoutSession } from '@/types/workout'

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
  isActive: isVisible,
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

const DEFAULT_GROUP_ORDER: ExerciseCategory[] = ['strength', 'cardio']

type GroupItem = {
  id: ExerciseCategory
}

const GROUP_LABELS: Record<ExerciseCategory, string> = {
  strength: '重量訓練',
  cardio: '有氧運動',
}

const groupItems = ref<GroupItem[]>(DEFAULT_GROUP_ORDER.map((category) => ({ id: category })))

const collapsedState = reactive<Record<ExerciseCategory, boolean>>({
  strength: false,
  cardio: false,
})

const {
  dialogTop: sessionDialogTop,
  dialogWidth: sessionDialogWidth,
  isMobile: isCompactLayout,
  viewportWidth,
} = useResponsiveDialog({
  desktopWidth: 720,
  mobileHorizontalPadding: 32,
  mobileTop: '4vh',
})

const exerciseDialogWidth = computed(() => {
  const availableWidth = Math.max(viewportWidth.value - 32, 280)
  const width = Math.min(availableWidth, 360)
  return `${width}px`
})

const exerciseDialogTop = computed(() => (isCompactLayout.value ? '8vh' : '15vh'))

type ExerciseOptionGroup = {
  id: string
  label: string
  options: ExerciseDefinition[]
}

const collator = new Intl.Collator('zh-Hant', {
  sensitivity: 'base',
  numeric: true,
})

const UNASSIGNED_BODY_PART_LABEL = '未分類'

const exerciseOptionGroups = computed<ExerciseOptionGroup[]>(() => {
  const grouped: ExerciseOptionGroup[] = []
  const strengthByBodyPart = new Map<string, ExerciseDefinition[]>()
  const cardioExercises: ExerciseDefinition[] = []

  const toBodyPartKey = (bodyPart?: string | null) => {
    const trimmed = bodyPart?.trim()
    return trimmed && trimmed.length ? trimmed : UNASSIGNED_BODY_PART_LABEL
  }

  for (const exercise of exerciseOptions.value) {
    if (exercise.category === 'cardio') {
      cardioExercises.push(exercise)
      continue
    }
    const key = toBodyPartKey(exercise.bodyPart)
    const bucket = strengthByBodyPart.get(key)
    if (bucket) {
      bucket.push(exercise)
    } else {
      strengthByBodyPart.set(key, [exercise])
    }
  }

  const compareStrings = (a: string, b: string) => collator.compare(a, b)

  const strengthKeys = Array.from(strengthByBodyPart.keys()).sort((a, b) => {
    if (a === UNASSIGNED_BODY_PART_LABEL) {
      return b === UNASSIGNED_BODY_PART_LABEL ? 0 : 1
    }
    if (b === UNASSIGNED_BODY_PART_LABEL) {
      return -1
    }
    return compareStrings(a, b)
  })

  for (const key of strengthKeys) {
    const exercises = strengthByBodyPart.get(key)
    if (!exercises?.length) {
      continue
    }
    const sortedExercises = [...exercises].sort((a, b) => compareStrings(a.name, b.name))
    grouped.push({
      id: `body-part:${key}`,
      label: key,
      options: sortedExercises,
    })
  }

  if (cardioExercises.length) {
    const sortedCardio = [...cardioExercises].sort((a, b) => compareStrings(a.name, b.name))
    grouped.push({
      id: 'category:cardio',
      label: CATEGORY_LABELS.cardio,
      options: sortedCardio,
    })
  }

  return grouped
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
type DraftSet = DraftEntry['sets'][number]

const getEntryCategory = (entry: DraftEntry): ExerciseCategory => (isCardioEntry(entry) ? 'cardio' : 'strength')

const currentGroupOrder = computed(() => groupItems.value.map((item) => item.id))

const entryGroups = computed(() =>
  currentGroupOrder.value.map((category) => ({
    category,
    label: GROUP_LABELS[category],
    entries: draft.value.entries.filter((entry) => getEntryCategory(entry) === category),
  })),
)

const entriesByCategory = computed<Record<ExerciseCategory, DraftEntry[]>>(() => {
  const initial: Record<ExerciseCategory, DraftEntry[]> = {
    strength: [],
    cardio: [],
  }
  entryGroups.value.forEach((group) => {
    initial[group.category] = group.entries
  })
  return initial
})

const deriveGroupOrderFromEntries = (entries: DraftEntry[]): ExerciseCategory[] => {
  const seen = new Set<ExerciseCategory>()
  const order: ExerciseCategory[] = []
  for (const entry of entries) {
    const category = getEntryCategory(entry)
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
}

const setGroupOrder = (order: ExerciseCategory[]) => {
  const normalized = Array.from(new Set<ExerciseCategory>([...order, ...DEFAULT_GROUP_ORDER]))
  const current = currentGroupOrder.value
  const differs =
    normalized.length !== current.length || normalized.some((category, index) => category !== current[index])
  if (!differs) {
    return
  }
  groupItems.value = normalized.map((category) => ({ id: category }))
}

const collectEntriesByCategory = (): Record<ExerciseCategory, DraftEntry[]> => {
  const groups: Record<ExerciseCategory, DraftEntry[]> = {
    strength: [],
    cardio: [],
  }
  for (const entry of draft.value.entries) {
    groups[getEntryCategory(entry)].push(entry)
  }
  return groups
}

const rebuildDraftEntries = (
  overrides: Partial<Record<ExerciseCategory, DraftEntry[]>> = {},
  order: ExerciseCategory[] = currentGroupOrder.value,
) => {
  const groups = collectEntriesByCategory()
  for (const category of Object.keys(overrides) as ExerciseCategory[]) {
    if (overrides[category]) {
      groups[category] = overrides[category]!
    }
  }
  const flattened = order.flatMap((category) => groups[category])
  draft.value.entries.splice(0, draft.value.entries.length, ...flattened)
}

const closeExerciseDialogIfOpen = () => {
  if (exerciseDialogVisible.value) {
    exerciseDialogVisible.value = false
    resetExerciseDialog()
  }
}

const handleGroupOrderChange = (items: GroupItem[]) => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }
  groupItems.value = items.map((item) => ({ ...item }))
  const categories = groupItems.value.map((item) => item.id)
  setGroupOrder(categories)
  rebuildDraftEntries({}, categories)
  closeExerciseDialogIfOpen()
}

const handleEntryOrderChange = (category: ExerciseCategory, items: DraftEntry[]) => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }
  rebuildDraftEntries({ [category]: items })
  closeExerciseDialogIfOpen()
}

const createEntryOrderUpdater = (category: ExerciseCategory) => (items: DraftEntry[]) => {
  handleEntryOrderChange(category, items)
}

const toggleGroupCollapsed = (category: ExerciseCategory) => {
  collapsedState[category] = !collapsedState[category]
}

const handleEntryExerciseChange = (entry: DraftEntry) => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }

  const previousCategory = entry.categoryHint ?? getEntryCategory(entry)
  doSyncEntry(entry)
  const nextCategory = getEntryCategory(entry)
  if (previousCategory !== nextCategory) {
    rebuildDraftEntries()
    collapsedState[nextCategory] = false
  }
}

const handleAddEntry = (category: ExerciseCategory) => {
  guardMutation(() => {
    addEntry(category)
    rebuildDraftEntries()
    collapsedState[category] = false
  })
}

const handleRemoveEntry = (category: ExerciseCategory, index: number) => {
  guardMutation(() => {
    const entry = entriesByCategory.value[category]?.[index]
    if (!entry) {
      return
    }
    const absoluteIndex = draft.value.entries.indexOf(entry)
    if (absoluteIndex >= 0) {
      removeEntry(absoluteIndex)
    }
  })
}

const handleAddSet = (entry: DraftEntry) => {
  guardMutation(() => addSet(entry))
}

const handleRemoveSet = (entry: DraftEntry, index: number) => {
  guardMutation(() => removeSet(entry, index))
}

const findInputElement = (event: FocusEvent): HTMLInputElement | null => {
  const target = event.target as HTMLElement | null
  if (!target) {
    return null
  }
  if (target instanceof HTMLInputElement) {
    return target
  }
  const input = target.querySelector('input')
  return input instanceof HTMLInputElement ? input : null
}

const extractNumericValue = (event: FocusEvent): number | null => {
  const input = findInputElement(event)
  if (!input) {
    return null
  }
  const raw = input.value.trim()
  if (!raw.length) {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

const findClosestOption = (options: number[], value: number): number => {
  if (!options.length) {
    return value
  }
  const [firstOption] = options
  let closest = firstOption ?? value
  let smallestDiff = Math.abs(value - closest)
  for (const option of options) {
    const diff = Math.abs(value - option)
    if (diff < smallestDiff) {
      closest = option
      smallestDiff = diff
    }
  }
  return closest
}

const handleWeightInputBlur = (set: DraftSet, event: FocusEvent) => {
  if (isReadOnly.value) {
    return
  }
  const parsedValue = extractNumericValue(event)
  if (parsedValue == null) {
    return
  }
  const options = getWeightOptions(set.unit)
  const normalized = options.includes(parsedValue) ? parsedValue : findClosestOption(options, parsedValue)
  set.weight = normalized
}

const handleRepsInputBlur = (set: DraftSet, event: FocusEvent) => {
  if (isReadOnly.value) {
    return
  }
  const parsedValue = extractNumericValue(event)
  if (parsedValue == null) {
    return
  }
  const normalized = repOptions.includes(parsedValue)
    ? parsedValue
    : findClosestOption(repOptions, parsedValue)
  set.reps = Math.max(1, Math.round(normalized))
}

const handleAddMealItem = (mealType: MealType) => {
  guardMutation(() => addMealItem(mealType))
}

const handleRemoveMealItem = (mealType: MealType, index: number) => {
  guardMutation(() => removeMealItem(mealType, index))
}

const handleOpenExerciseDialog = (entry: DraftEntry) => {
  if (isReadOnly.value) {
    showReadOnlyInfo()
    return
  }
  const targetIndex = draft.value.entries.indexOf(entry)
  if (targetIndex < 0) {
    return
  }
  openExerciseDialog(targetIndex)
}

watch(
  () => draft.value.entries.map((entry) => `${entry.draftKey ?? ''}:${getEntryCategory(entry)}`),
  () => {
    setGroupOrder(deriveGroupOrderFromEntries(draft.value.entries))
  },
  { immediate: true },
)

const formatExerciseOptionLabel = (exercise: ExerciseDefinition): string => {
  if (exercise.category === 'cardio') {
    return `${exercise.name}（${CATEGORY_LABELS.cardio}）`
  }
  const bodyPart = exercise.bodyPart?.trim()
  return bodyPart?.length ? `${exercise.name}（${bodyPart}）` : exercise.name
}

const handleCreateExercise = async () => {
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
    const created = await workoutStore.registerExercise({
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
        const nextCategory = getEntryCategory(targetEntry)
        rebuildDraftEntries()
        collapsedState[nextCategory] = false
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

  if (draft.value.bodyWeightKg != null) {
    const weight = Number(draft.value.bodyWeightKg)
    if (!Number.isFinite(weight) || weight <= 0 || weight > 400) {
      ElMessage.error('請輸入有效的體重（kg）')
      return false
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
  <el-dialog
    :model-value="isVisible"
    title="管理訓練紀錄"
    :width="sessionDialogWidth"
    :top="sessionDialogTop"
    :class="['session-editor-dialog', { 'is-compact': isCompactLayout }]"
    :close-on-click-modal="false"
    @close="closeDialog"
  >
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
        <div class="session-meta-row">
          <div class="weight-input">
            <label for="session-weight-input">今日體重 (kg)</label>
            <el-input-number
              id="session-weight-input"
              v-model="draft.bodyWeightKg"
              :min="0"
              :max="400"
              :step="0.1"
              :precision="1"
              controls-position="right"
              :disabled="isReadOnly"
              :value-on-clear="null"
            />
          </div>
        </div>
        <div class="session-flags">
          <el-checkbox v-model="draft.isCoachSession" :disabled="isReadOnly">
            教練課
          </el-checkbox>
        </div>
      </div>

      <div class="entries-section">
        <Draggable
          :model-value="groupItems"
          item-key="id"
          animation="150"
          handle=".group-drag-handle"
          :disabled="isReadOnly"
          class="entry-groups"
          @update:model-value="handleGroupOrderChange"
        >
          <template #item="{ element: group }: { element: GroupItem }">
            <section :key="group.id" class="entry-group">
              <header class="entry-group-header">
                <div class="group-header-left">
                  <el-button link class="group-toggle" @click="toggleGroupCollapsed(group.id)">
                    <el-icon class="group-toggle-icon">
                      <CaretBottom v-if="!collapsedState[group.id]" />
                      <CaretRight v-else />
                    </el-icon>
                    <span class="group-title">{{ GROUP_LABELS[group.id] }}</span>
                    <span v-if="entriesByCategory[group.id].length" class="group-count">
                      （{{ entriesByCategory[group.id].length }}）
                    </span>
                  </el-button>
                </div>
                <div class="group-header-right">
                  <span v-if="!isReadOnly" class="group-drag-handle" aria-hidden="true">
                    <el-icon><Rank /></el-icon>
                  </span>
                  <el-button type="primary" plain :disabled="isReadOnly" @click="handleAddEntry(group.id)">
                    新增訓練項目
                  </el-button>
                </div>
              </header>
              <transition name="group-collapse">
                <div v-show="!collapsedState[group.id]" class="entry-group-body">
                  <div v-if="!entriesByCategory[group.id].length" class="entry-group-empty">
                    尚未新增{{ GROUP_LABELS[group.id] }}項目。
                  </div>
                  <Draggable
                    v-else
                    :model-value="entriesByCategory[group.id]"
                    item-key="draftKey"
                    animation="150"
                    handle=".entry-drag-handle"
                    :disabled="isReadOnly"
                    @update:model-value="createEntryOrderUpdater(group.id)"
                  >
                    <template #item="{ element: entry, index }: { element: DraftEntry; index: number }">
                      <div :key="entry.draftKey" class="entry-block">
                        <div class="entry-header">
                          <span v-if="!isReadOnly" class="entry-drag-handle" aria-hidden="true">
                            <el-icon><Rank /></el-icon>
                          </span>
                          <el-select
                            v-model="entry.exerciseId"
                            placeholder="選擇訓練動作"
                            filterable
                            class="exercise-select"
                            :disabled="isReadOnly"
                            @change="handleEntryExerciseChange(entry)"
                          >
                            <el-option-group
                              v-for="group in exerciseOptionGroups"
                              :key="group.id"
                              :label="group.label"
                            >
                              <el-option
                                v-for="exercise in group.options"
                                :key="exercise.id"
                                :label="formatExerciseOptionLabel(exercise)"
                                :value="exercise.id"
                              />
                            </el-option-group>
                          </el-select>
                          <el-button type="primary" link :disabled="isReadOnly" @click="handleOpenExerciseDialog(entry)">
                            新增動作
                          </el-button>
                          <el-button
                            type="danger"
                            link
                            :disabled="isReadOnly"
                            @click="handleRemoveEntry(group.id, index)"
                          >
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
                                  :default-first-option="true"
                                  :reserve-keyword="false"
                                  :disabled="isReadOnly"
                                  placeholder="選擇重量"
                                  @blur="handleWeightInputBlur(row, $event)"
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
                                :default-first-option="true"
                                :reserve-keyword="false"
                                :disabled="isReadOnly"
                                placeholder="選擇次數"
                                @blur="handleRepsInputBlur(row, $event)"
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
                                <el-button
                                  type="danger"
                                  link
                                  :disabled="isReadOnly"
                                  @click="handleRemoveSet(entry, $index)"
                                >
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
                    </template>
                  </Draggable>
                </div>
              </transition>
            </section>
          </template>
        </Draggable>
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
    :width="exerciseDialogWidth"
    :top="exerciseDialogTop"
    :class="['exercise-dialog', { 'is-compact': isCompactLayout }]"
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

.session-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
}

.weight-input {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 160px;
}

.weight-input label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #4b5563;
}

.weight-input :deep(.el-input-number) {
  width: 160px;
}

.session-flags {
  display: flex;
  justify-content: flex-end;
}

.entries-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.entry-groups {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.entry-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  background-color: var(--el-fill-color-light);
}

.entry-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.group-header-left {
  display: flex;
  align-items: center;
}

.group-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.25rem;
  color: #111827;
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

.group-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.group-drag-handle {
  display: flex;
  align-items: center;
  color: #9ca3af;
  cursor: grab;
}

.group-drag-handle :deep(.el-icon) {
  font-size: 1.1rem;
}

.entry-group-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.entry-group-empty {
  padding: 1rem;
  border-radius: 8px;
  border: 1px dashed var(--el-border-color);
  color: #6b7280;
  text-align: center;
  background-color: var(--el-fill-color-blank);
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

.entry-drag-handle {
  display: flex;
  align-items: center;
  color: #9ca3af;
  cursor: grab;
}

.entry-drag-handle :deep(.el-icon) {
  font-size: 1rem;
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
  max-height: 1200px;
  opacity: 1;
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

.session-editor-dialog.is-compact :deep(.el-dialog__header) {
  padding: 1rem;
}

.session-editor-dialog.is-compact :deep(.el-dialog__body) {
  max-height: calc(100vh - 160px);
  padding: 1rem;
  padding-right: 1rem;
}

.exercise-dialog.is-compact :deep(.el-dialog__header) {
  padding: 1rem;
}

.exercise-dialog.is-compact :deep(.el-dialog__body) {
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  padding: 1rem;
}

@media (max-width: 768px) {
  .dialog-content {
    gap: 1rem;
  }

  .session-header {
    gap: 0.5rem;
  }

  .session-flags {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .entry-header {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .entry-drag-handle {
    order: -1;
  }

  .group-header-right {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .dialog-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .water-intake-row {
    flex-direction: column;
    align-items: stretch;
  }

  .water-intake-row label {
    min-width: 0;
  }

  .cardio-duration {
    flex-direction: column;
    align-items: stretch;
  }

  .cardio-duration-input {
    width: 100%;
  }

  .meal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
