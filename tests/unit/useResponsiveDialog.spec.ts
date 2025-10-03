import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

import { useResponsiveDialog } from '@/composables/useResponsiveDialog'

describe('useResponsiveDialog', () => {
  const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    })
  }

  const mountHook = (options = {}) => {
    return mount(
      defineComponent({
        setup() {
          return useResponsiveDialog(options)
        },
        template: '<div></div>',
      }),
    )
  }

  afterEach(() => {
    setViewportWidth(1024)
  })

  it('returns desktop width by default when viewport is wide', async () => {
    setViewportWidth(1280)
    const wrapper = mountHook({ desktopWidth: 800 })

    await nextTick()

    expect(wrapper.vm.dialogWidth).toBe('800px')
    expect(wrapper.vm.dialogTop).toBe('15vh')
    expect(wrapper.vm.isMobile).toBe(false)
  })

  it('shrinks width and top when viewport is below the breakpoint', async () => {
    setViewportWidth(360)
    const wrapper = mountHook({ mobileHorizontalPadding: 16, mobileTop: '6vh' })

    await nextTick()

    expect(wrapper.vm.isMobile).toBe(true)
    expect(wrapper.vm.dialogTop).toBe('6vh')
    expect(wrapper.vm.dialogWidth).toBe('344px')
  })

  it('updates dimensions when viewport resizes', async () => {
    setViewportWidth(1024)
    const wrapper = mountHook({ desktopWidth: 700 })

    await nextTick()
    expect(wrapper.vm.dialogWidth).toBe('700px')

    setViewportWidth(400)
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    expect(wrapper.vm.isMobile).toBe(true)
    expect(wrapper.vm.dialogWidth).toBe('376px')
  })
})
