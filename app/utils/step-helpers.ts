import { ElementSelector } from '@/types'

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function cleanSelector(selector?: ElementSelector): ElementSelector {
  if (!selector) return {}
  const cleaned: ElementSelector = {}
  const keys = Object.keys(selector) as (keyof ElementSelector)[]
  for (const key of keys) {
    const val = selector[key]
    if (val !== undefined && val !== null && val !== '') {
      cleaned[key] = val
    }
  }
  return cleaned
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
