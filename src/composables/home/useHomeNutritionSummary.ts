import { computed } from 'vue'
import type { ComputedRef } from 'vue'

import type { MealType, WorkoutSession } from '@/types/workout'

const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner']

const mealLabels: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

// Derives nutrition aggregates for the selected session to keep the component lean.
export const useHomeNutritionSummary = (sessionForSelectedDate: ComputedRef<WorkoutSession | null>) => {
  const nutritionForSelectedDate = computed(() => sessionForSelectedDate.value?.nutrition ?? null)

  const mealTotalsForSelectedDate = computed<Record<MealType, number>>(() => {
    const totals: Record<MealType, number> = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
    }
    const nutrition = nutritionForSelectedDate.value
    if (!nutrition) {
      return totals
    }
    for (const mealType of mealTypes) {
      totals[mealType] = nutrition.meals[mealType].reduce((sum, item) => sum + item.calories, 0)
    }
    return totals
  })

  const totalCaloriesForSelectedDate = computed(() =>
    mealTypes.reduce((sum, mealType) => sum + mealTotalsForSelectedDate.value[mealType], 0),
  )

  const waterIntakeForSelectedDate = computed(() => nutritionForSelectedDate.value?.waterIntakeMl ?? 0)

  const mealsForSelectedDate = computed(() =>
    mealTypes.map((mealType) => ({
      mealType,
      label: mealLabels[mealType],
      items: nutritionForSelectedDate.value?.meals[mealType] ?? [],
      calories: mealTotalsForSelectedDate.value[mealType],
    })),
  )

  const hasNutritionForSelectedDate = computed(() => {
    const nutrition = nutritionForSelectedDate.value
    if (!nutrition) {
      return false
    }
    if (nutrition.waterIntakeMl > 0) {
      return true
    }
    return mealTypes.some((mealType) => nutrition.meals[mealType].length > 0)
  })

  return {
    hasNutritionForSelectedDate,
    mealLabels,
    mealTotalsForSelectedDate,
    mealTypes,
    mealsForSelectedDate,
    nutritionForSelectedDate,
    totalCaloriesForSelectedDate,
    waterIntakeForSelectedDate,
  }
}
