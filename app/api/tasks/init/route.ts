/**
 * @file route.ts
 * @description 初始化预设任务 API - 将预设任务文件导入到用户的 IndexedDB 中
 * @module 任务管理 API / 预设任务初始化
 * 
 * 路由：
 * - POST /api/tasks/init  初始化预设任务到数据库
 * 
 * 功能：
 * - 从 public/preset-tasks/ 目录读取预配置的测试任务
 * - 支持多版本预设任务（按优先级自动选择最新版本）
 * - 返回导入的任务列表供前端保存到 IndexedDB
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
    const presetPath = getAvailablePresetPath()
    
    if (!presetPath) {
      return NextResponse.json({
        error: '未找到预设任务文件',
        hint: '请在 public/preset-tasks/ 目录下添加预设任务 JSON 文件',
        expectedFiles: PRESET_FILES
      }, { status: 404 })
    }

    console.log(`[InitAPI] 使用预设任务文件: ${path.basename(presetPath)}`)

    const fileContent = fs.readFileSync(presetPath, 'utf-8')
    let presetTasks: any[]

    try {
      const parsed = JSON.parse(fileContent)
      presetTasks = Array.isArray(parsed) ? parsed : [parsed]
    } catch (parseError) {
      console.error('[InitAPI] JSON 解析失败:', parseError)
      return NextResponse.json({
        error: '预设任务文件格式错误',
        details: (parseError as Error).message,
        file: presetPath
      }, { status: 500 })
    }

    // 为每个预设任务生成唯一 ID 和时间戳
    const tasksWithIds = presetTasks.map((task, index) => ({
      ...task,
      id: task.id || `preset_${Date.now()}_${index}`,
      status: 'draft',
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [...(task.tags || []), 'preset', 'demo']
    }))

    console.log(`[InitAPI] 成功加载 ${tasksWithIds.length} 个预设任务`)

    return NextResponse.json({
      success: true,
      tasks: tasksWithIds,
      sourceFile: path.basename(presetPath),
      message: `成功加载 ${tasksWithIds.length} 个预设任务`
    })

  } catch (error) {
    console.error('[InitAPI] 初始化失败:', error)
    return NextResponse.json({
      error: '初始化预设任务失败',
      details: (error as Error).message
    }, { status: 500 })
  }
}

// GET - 获取可用的预设任务列表（不导入，仅查看）
export async function GET() {
  try {
    const availableFiles: string[] = []
    
    for (const filename of PRESET_FILES) {
      const filePath = path.join(PRESET_TASKS_DIR, filename)
      if (fs.existsSync(filePath)) {
        availableFiles.push(filename)
      }
    }

    return NextResponse.json({
      availableFiles,
      totalFiles: availableFiles.length,
      directory: PRESET_TASKS_DIR
    })
  } catch (error) {
    return NextResponse.json({
      error: '获取预设任务列表失败',
      details: (error as Error).message
    }, { status: 500 })
  }
}
