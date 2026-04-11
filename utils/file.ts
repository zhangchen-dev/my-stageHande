import fs from 'fs-extra'
import path from 'path'

const BASE_DIR = process.cwd()
export const PATHS = {
  LOGS: path.join(BASE_DIR, 'logs'),
  SCREENSHOTS: path.join(BASE_DIR, 'public/screenshots'),
  CACHE: path.join(BASE_DIR, '.stagehand-cache'),
}

export function initDirectories() {
  Object.values(PATHS).forEach((dir) => fs.ensureDirSync(dir))
}