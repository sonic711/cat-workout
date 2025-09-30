<script setup lang="ts">
import { computed, ref } from 'vue'

const selectedDate = ref(new Date())
const formattedSelectedDate = computed(() => selectedDate.value.toLocaleDateString())
</script>

<template>
  <el-container class="home-layout">
    <el-header class="home-header">
      <h1>健身日誌月曆</h1>
      <p>快速概覽每一天的訓練安排，並為選定日期管理日誌內容。</p>
    </el-header>
    <el-main>
      <el-row :gutter="16">
        <el-col :xs="24" :lg="14">
          <el-card class="calendar-card">
            <template #header>
              <div class="card-header">
                <span>月曆檢視</span>
              </div>
            </template>
            <el-calendar v-model="selectedDate" />
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="10">
          <el-card class="detail-card">
            <template #header>
              <div class="card-header">
                <span>選取日期：{{ formattedSelectedDate }}</span>
              </div>
            </template>
            <el-empty
              description="尚未建立訓練紀錄"
              class="detail-placeholder"
            />
            <p class="next-step-hint">
              下一步將在此區域顯示訓練動作、身體部位與個人化摘要。
            </p>
          </el-card>
        </el-col>
      </el-row>
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
  padding: 2rem 1.5rem;
  background: linear-gradient(135deg, #f4f7ff 0%, #dce6ff 100%);
}

.home-header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: #1f2933;
}

.home-header p {
  margin: 0;
  color: #3e4c59;
}

.calendar-card,
.detail-card {
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
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
  .home-header {
    padding: 1.5rem 1rem;
  }
}
</style>
