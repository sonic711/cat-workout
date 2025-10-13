import { computed, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useHomeCalendar } from '@/composables/home/useHomeCalendar'
import type { CalendarDaySummary, WorkoutSession } from '@/types/workout'

describe('useHomeCalendar', () => {
  const createCalendar = () => {
    const calendarSummaryByDate = ref<Record<string, CalendarDaySummary>>({})

    const sessionByDate = computed(() => (date: string): WorkoutSession | null => {
      void date
      return null
    })

    const sessionDates = computed(() => Object.keys(calendarSummaryByDate.value))

    const hydrateFromPersistence = vi.fn().mockResolvedValue(null)

    const calendar = useHomeCalendar({
      calendarSummaryByDate,
      sessionByDate,
      sessionDates,
      hydrateFromPersistence,
    })

    return {
      calendar,
      calendarSummaryByDate,
      hydrateFromPersistence,
    }
  }

  it('returns all body parts for a given day and syncs selection state', async () => {
    const targetKey = '2024-12-01'
    const { calendar, calendarSummaryByDate } = createCalendar()

    calendarSummaryByDate.value[targetKey] = {
      date: targetKey,
      bodyParts: ['胸', '背', '腿'],
      totalCalories: 0,
      isCoachSession: false,
      hasSession: true,
    } as CalendarDaySummary

    calendar.selectedDate.value = new Date(`${targetKey}T00:00:00`)
    await nextTick()

    expect(calendar.bodyPartsForDay(targetKey)).toEqual(['胸', '背', '腿'])
    expect(calendar.selectedBodyParts.value).toEqual(['胸', '背', '腿'])
  })

  it('falls back to empty array when no summary exists', () => {
    const { calendar } = createCalendar()

    expect(calendar.bodyPartsForDay('1999-01-01')).toEqual([])
  })

  it('scrolls detail section immediately when clicking the currently selected date', async () => {
    const targetKey = '2024-12-02'
    const { calendar } = createCalendar()

    calendar.selectedDate.value = new Date(`${targetKey}T00:00:00`)
    const scrollSpy = vi.fn()

    calendar.detailSectionRef.value = {
      scrollIntoView: scrollSpy,
    } as unknown as HTMLElement

    calendar.handleCalendarDateClick(targetKey)
    await nextTick()

    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it('scrolls detail section after selecting a different date', async () => {
    const initialKey = '2024-12-01'
    const targetKey = '2024-12-05'
    const { calendar } = createCalendar()

    calendar.selectedDate.value = new Date(`${initialKey}T00:00:00`)

    const scrollSpy = vi.fn()
    calendar.detailSectionRef.value = {
      scrollIntoView: scrollSpy,
    } as unknown as HTMLElement

    calendar.handleCalendarDateClick(targetKey)
    calendar.selectedDate.value = new Date(`${targetKey}T00:00:00`)

    await nextTick()
    await nextTick()

    expect(calendar.selectedDateKey.value).toBe(targetKey)
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it('surfaced summary retains coach session flag for the selected date', async () => {
    const targetKey = '2024-12-09'
    const { calendar, calendarSummaryByDate } = createCalendar()

    calendarSummaryByDate.value[targetKey] = {
      date: targetKey,
      bodyParts: ['胸'],
      totalCalories: 500,
      isCoachSession: true,
      hasSession: true,
    } as CalendarDaySummary

    calendar.selectedDate.value = new Date(`${targetKey}T00:00:00`)
    await nextTick()

    expect(calendar.selectedSummary.value?.isCoachSession).toBe(true)
  })

  it('hydrates from persistence and resets date', async () => {
    const { calendar, hydrateFromPersistence } = createCalendar()

    vi.useFakeTimers()
    const fakeNow = new Date(Date.UTC(2024, 0, 5))
    vi.setSystemTime(fakeNow)
    await calendar.ensureHydrated()

    expect(hydrateFromPersistence).toHaveBeenCalled()
    expect(calendar.selectedDate.value.getTime()).toBe(fakeNow.getTime())

    vi.useRealTimers()
  })
})
