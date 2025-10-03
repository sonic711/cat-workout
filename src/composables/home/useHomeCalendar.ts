import { computed, nextTick, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import type { CalendarDaySummary, HydrationPayload, WorkoutSession } from '@/types/workout'

interface UseHomeCalendarOptions {
  calendarSummaryByDate: Ref<Record<string, CalendarDaySummary>>
  sessionByDate: ComputedRef<(date: string) => WorkoutSession | null>
  sessionDates: ComputedRef<string[]>
  hydrateFromPersistence: () => Promise<HydrationPayload | null | undefined>
}

// Normalizes a JS Date into the YYYY-MM-DD key used across stores and persistence.
const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Centralizes calendar selection state, including scroll handling and hydration fallbacks.
export const useHomeCalendar = ({
  calendarSummaryByDate,
  sessionByDate,
  sessionDates,
  hydrateFromPersistence,
}: UseHomeCalendarOptions) => {
  const selectedDate = ref(new Date())
  const detailSectionRef = ref<HTMLElement | null>(null)
  const shouldScrollToDetail = ref(false)

  const selectedDateKey = computed(() => formatDateKey(selectedDate.value))
  const formattedSelectedDate = computed(() => selectedDate.value.toLocaleDateString())
  const selectedSummary = computed(() => calendarSummaryByDate.value[selectedDateKey.value])
  const selectedBodyParts = computed(() => selectedSummary.value?.bodyParts ?? [])

  const sessionForSelectedDate = computed(() => sessionByDate.value(selectedDateKey.value))

  const bodyPartsForDay = (dateKey: string) => calendarSummaryByDate.value[dateKey]?.bodyParts ?? []

  const scrollDetailIntoView = async () => {
    await nextTick()
    detailSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleCalendarDateClick = (dateKey: string) => {
    shouldScrollToDetail.value = true
    if (dateKey === selectedDateKey.value) {
      shouldScrollToDetail.value = false
      void scrollDetailIntoView()
    }
  }

  const selectDateKey = (dateKey: string) => {
    selectedDate.value = new Date(`${dateKey}T00:00:00`)
  }

  const resetSelection = () => {
    selectedDate.value = new Date()
  }

  // Re-hydrates workout data and ensures we land on a meaningful default date.
  const ensureHydrated = async () => {
    const hydration = await hydrateFromPersistence()

    const todayKey = formatDateKey(new Date())
    if (sessionByDate.value(todayKey)) {
      selectDateKey(todayKey)
      return
    }

    const fallbackDate = hydration?.sessions[0]?.date ?? sessionDates.value[0]
    if (fallbackDate) {
      selectDateKey(fallbackDate)
    }
  }

  // When the date changes via calendar interaction we smooth-scroll the detail panel into view.
  watch(selectedDate, async () => {
    if (!shouldScrollToDetail.value) {
      return
    }
    shouldScrollToDetail.value = false
    await scrollDetailIntoView()
  })

  return {
    bodyPartsForDay,
    detailSectionRef,
    ensureHydrated,
    formattedSelectedDate,
    handleCalendarDateClick,
    resetSelection,
    scrollDetailIntoView,
    selectedBodyParts,
    selectedDate,
    selectedDateKey,
    selectedSummary,
    sessionForSelectedDate,
    shouldScrollToDetail,
  }
}

export const homeCalendarUtils = {
  formatDateKey,
}
