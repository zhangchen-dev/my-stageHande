/**
 * @file route.ts
 * @description 导入任务 API - 支持导入 JSON 格式的测试步骤并自动创建任务
 * @module 任务管理 API / 导入功能
 * 
 * 路由：
 * - POST /api/tasks/import  导入 JSON 格式的测试任务
 * 
 * 请求体格式：
 * {
 *   "steps": [...],        // 必填：测试步骤数组
 *   "name": "任务名称",    // 可选：任务名称（默认"导入的任务"）
 *   "description": "...",  // 可选：任务描述
 *   "autoRun": false       // 可选：是否自动执行
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { TestStep, TestTask } from '@/types'

export const dynamic = 'force-dynamic'

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { steps, name, description, autoRun } = body

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ 
        error: '必须提供有效的步骤数组',
        hint: '格式: { "steps": [...], "name": "任务名称" }'
      }, { status: 400 })
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as TestStep
      if (!step.id || !step.type || !step.description) {
        return NextResponse.json({
          error: `步骤 ${i + 1} 缺少必要字段 (id, type, description)`,
          stepIndex: i,
          stepData: step
        }, { status: 400 })
      }
    }

    const taskName = name || `导入的任务_${new Date().toLocaleString()}`
    
    const newTask: TestTask = {
      id: generateId(),
      name: taskName,
      description: description || `从 JSON 导入，包含 ${steps.length} 个步骤`,
      steps: steps,
      status: autoRun ? 'ready' : 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['imported', 'json']
    }

    console.log(`[ImportAPI] 导入任务: ${taskName}, 步骤数: ${steps.length}`)

    return NextResponse.json({
      success: true,
      task: newTask,
      message: `成功导入任务 "${taskName}"，共 ${steps.length} 个步骤`
    }, { status: 201 })

  } catch (error) {
    console.error('[ImportAPI] 导入失败:', error)
    return NextResponse.json({
      error: '导入任务失败',
      details: (error as Error).message,
      hint: '请检查 JSON 格式是否正确'
    }, { status: 500 })
  }
}
