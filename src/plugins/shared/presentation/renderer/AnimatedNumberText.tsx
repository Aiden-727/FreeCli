import React from 'react'

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

export function AnimatedNumberText({
  value,
  formatter,
  fallback = '--',
  durationMs = 620,
  animate = true,
  className,
  as = 'span',
}: {
  value: number | null
  formatter: (value: number) => string
  fallback?: string
  durationMs?: number
  animate?: boolean
  className?: string
  as?: 'span' | 'strong'
}): React.JSX.Element {
  const [displayValue, setDisplayValue] = React.useState<number | null>(value)
  const [isAnimating, setIsAnimating] = React.useState(false)
  const frameRef = React.useRef<number | null>(null)
  const currentValueRef = React.useRef<number | null>(value)
  const isFirstRenderRef = React.useRef(true)

  React.useEffect(() => {
    currentValueRef.current = displayValue
  }, [displayValue])

  React.useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      setDisplayValue(value)
      currentValueRef.current = value
      return
    }

    if (
      value === null ||
      !Number.isFinite(value) ||
      !animate ||
      shouldReduceMotion() ||
      currentValueRef.current === null ||
      !Number.isFinite(currentValueRef.current)
    ) {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }

      setDisplayValue(value)
      currentValueRef.current = value
      setIsAnimating(false)
      return
    }

    const startValue = currentValueRef.current
    if (Math.abs(startValue - value) < 0.001) {
      setDisplayValue(value)
      currentValueRef.current = value
      setIsAnimating(false)
      return
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }

    setIsAnimating(true)
    const startTime = window.performance.now()

    const step = (timestamp: number) => {
      const elapsed = timestamp - startTime
      const progress = Math.min(1, elapsed / durationMs)
      const eased = easeOutCubic(progress)
      const nextValue = startValue + (value - startValue) * eased

      setDisplayValue(nextValue)
      currentValueRef.current = nextValue

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step)
        return
      }

      setDisplayValue(value)
      currentValueRef.current = value
      setIsAnimating(false)
      frameRef.current = null
    }

    frameRef.current = window.requestAnimationFrame(step)
  }, [animate, durationMs, value])

  const content =
    displayValue === null || !Number.isFinite(displayValue) ? fallback : formatter(displayValue)

  return React.createElement(
    as,
    {
      className,
      'data-animating': isAnimating ? 'true' : 'false',
    },
    content,
  )
}
