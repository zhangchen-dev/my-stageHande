import { ElementSelector } from '@/types'

export function buildQuerySelector(selector: ElementSelector): string | null {
  if (selector.id) {
    return `#${CSS.escape(selector.id)}`
  }
  if (selector.testId) {
    return `[data-testid="${selector.testId}"]`
  }
  if (selector.classPrefix) {
    return `[class^="${selector.classPrefix}"]`
  }
  if (selector.css) {
    return selector.css
  }
  if (selector.className) {
    return `.${selector.className.split(' ').filter(c => c).map(c => CSS.escape(c)).join('.')}`
  }
  if (selector.name) {
    return `[name="${selector.name}"]`
  }
  return null
}

function buildTextSelector(selector: ElementSelector): string | null {
  if (selector.text) {
    return `xpath=//*[text()='${selector.text.replace(/'/g, "\\'")}']`
  }
  if (selector.containsText) {
    return `xpath=//*[contains(text(), '${selector.containsText.replace(/'/g, "\\'")}')]`
  }
  return null
}

export function buildSelectorString(selector: ElementSelector): string | null {
  const cssSelector = buildQuerySelector(selector)
  if (cssSelector) return cssSelector

  const textSelector = buildTextSelector(selector)
  if (textSelector) return textSelector

  if (selector.xpath) return selector.xpath

  return null
}
