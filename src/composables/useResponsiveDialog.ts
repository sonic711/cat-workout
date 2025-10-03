import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface ResponsiveDialogOptions {
  desktopWidth?: number
  desktopTop?: string
  mobileBreakpoint?: number
  mobileHorizontalPadding?: number
  mobileTop?: string
}

const DEFAULT_OPTIONS: Required<ResponsiveDialogOptions> = {
  desktopWidth: 720,
  desktopTop: '15vh',
  mobileBreakpoint: 768,
  mobileHorizontalPadding: 24,
  mobileTop: '5vh',
}

export const useResponsiveDialog = (options: ResponsiveDialogOptions = {}) => {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  const viewportWidth = ref(
    typeof window !== 'undefined' ? window.innerWidth : merged.desktopWidth,
  )

  const handleResize = () => {
    if (typeof window === 'undefined') {
      return
    }
    viewportWidth.value = window.innerWidth
  }

  onMounted(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
  })

  const isMobile = computed(() => viewportWidth.value <= merged.mobileBreakpoint)

  const dialogWidth = computed(() => {
    if (!isMobile.value) {
      return `${merged.desktopWidth}px`
    }
    const availableWidth = Math.max(viewportWidth.value - merged.mobileHorizontalPadding, 280)
    const width = Math.min(availableWidth, merged.desktopWidth)
    return `${Math.max(width, 280)}px`
  })

  const dialogTop = computed(() => (isMobile.value ? merged.mobileTop : merged.desktopTop))

  return {
    dialogTop,
    dialogWidth,
    isMobile,
    viewportWidth,
  }
}

export type UseResponsiveDialogReturn = ReturnType<typeof useResponsiveDialog>
