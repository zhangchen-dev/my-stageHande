import fs from 'fs-extra'
import path from 'path'

const BASE_DIR = process.cwd()
export const PATHS = {
  LOGS: path.join(BASE_DIR, 'logs'),
  SCREENSHOTS: path.join(BASE_DIR, 'public/screenshots'),
  CACHE: path.join(BASE_DIR, '.stagehand-cache'),
}

/**
 * 初始化基础输出目录
 */
export function initDirectories() {
  Object.values(PATHS).forEach((dir) => fs.ensureDirSync(dir))
}

/**
 * 初始化自定义截图输出目录（如果指定了的话）
 * @param customDir 自定义截图目录路径（绝对路径）
 * @returns 实际使用的截图目录路径
 */
export function initCustomScreenshotDir(customDir?: string): string {
  if (customDir) {
    fs.ensureDirSync(customDir)
    return customDir
  }
  fs.ensureDirSync(PATHS.SCREENSHOTS)
  return PATHS.SCREENSHOTS
}