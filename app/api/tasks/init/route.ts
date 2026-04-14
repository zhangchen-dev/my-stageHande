/**
 * 初始化预设任务到 IndexDB
 * POST /api/tasks/init
 * 将预设任务文件导入到用户的 IndexDB 中
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// 预设任务目录
const PRESET_TASKS_DIR = path.join(process.cwd(), 'public', 'preset-tasks')

// 支持的预设任务文件（按优先级排序，v6 为最新完整测试版）
const PRESET_FILES = [
  'demo-invoice-task-v6.json',  // 最新版：完整演示页面测试任务（含自定义截图输出目录）
  'demo-invoice-task-v5.json',  // 优化版：支持 iframe + 高亮检测 + 防死循环
  'demo-invoice-task.json',     // 原版：基本功能
]

/**
 * 获取可用的预设任务文件路径
 */
function getAvailablePresetPath(): string | null {
  for (const filename of PRESET_FILES) {
    const filePath = path.join(PRESET_TASKS_DIR, filename)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    // 查找可用的预设任务文件
    const presetPath = getAvailablePresetPath()
    
    if (!presetPath) {
      return NextResponse.json({ 
        error: '预设任务文件不存在',
        availableFiles: PRESET_FILES,
      }, { status: 404 })
    }

    const fileContent = fs.readFileSync(presetPath, 'utf-8')
    const presetTasks = JSON.parse(fileContent)

    if (!Array.isArray(presetTasks) || presetTasks.length === 0) {
      return NextResponse.json({ error: '预设任务数据格式错误' }, { status: 400 })
    }

    // 返回预设任务数据供前端导入
    return NextResponse.json({
      success: true,
      tasks: presetTasks,
      count: presetTasks.length,
      sourceFile: path.basename(presetPath),
      message: `成功读取 ${presetTasks.length} 个预设任务 (来源: ${path.basename(presetPath)})`,
    })

  } catch (error) {
    console.error('初始化预设任务失败:', error)
    return NextResponse.json({
      error: '初始化失败',
      details: (error as Error).message,
    }, { status: 500 })
  }
}

// GET - 获取预设任务列表（不导入）
export async function GET() {
  try {
    const presetPath = getAvailablePresetPath()
    
    if (!presetPath) {
      return NextResponse.json({ 
        error: '预设任务文件不存在',
        available: false,
        availableFiles: PRESET_FILES,
      }, { status: 404 })
    }

    const fileContent = fs.readFileSync(presetPath, 'utf-8')
    const presetTasks = JSON.parse(fileContent)

    // 只返回任务摘要信息，不返回完整步骤
    const taskSummaries = Array.isArray(presetTasks) ? presetTasks.map(task => ({
      id: task.id,
      name: task.name,
      description: task.description,
      tags: task.tags || [],
      stepCount: task.steps?.length || 0,
      status: task.status || 'draft',
    })) : []

    return NextResponse.json({
      available: true,
      sourceFile: path.basename(presetPath),
      count: taskSummaries.length,
      tasks: taskSummaries,
    })

  } catch (error) {
    return NextResponse.json({
      error: '获取预设任务列表失败',
      details: (error as Error).message,
    }, { status: 500 })
  }
}
