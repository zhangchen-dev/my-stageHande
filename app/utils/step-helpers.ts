import { ElementSelector } from '@/types'

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function cleanSelector(selector?: ElementSelector): ElementSelector | undefined {
  if (!selector) return undefined
  const cleaned: ElementSelector = {}
  let hasValue = false
  const keys = Object.keys(selector) as (keyof ElementSelector)[]
  for (const key of keys) {
    const val = selector[key]
    if (val !== undefined && val !== null && val !== '') {
      cleaned[key] = val
      hasValue = true
    }
  }
  return hasValue ? cleaned : undefined
}

export function cleanCondition(condition: any, value?: string): any {
  if (!condition || !condition.type) return undefined
  const cleaned: any = {
    type: condition.type,
    selector: cleanSelector(condition.selector),
  }
  if (value) cleaned.value = value
  return cleaned
}
