/**
 * 导入任务 API
 * 支持直接导入 JSON 格式的测试步骤，自动创建任务
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
          step
        }, { status: 400 })
      }
    }

    const now = new Date().toISOString()
    const taskName = name || `导入任务_${now.replace(/[:.]/g, '-')}`
    const taskId = generateId()

    const task: TestTask = {
      id: taskId,
      name: taskName,
      description: description || `从 JSON 导入，包含 ${steps.length} 个步骤`,
      steps: steps as TestStep[],
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      tags: ['导入', '自动创建'],
    }

    console.log(`[导入] 成功创建任务: ${taskName}`)
    console.log(`[导入] 任务ID: ${taskId}`)
    console.log(`[导入] 步骤数: ${steps.length}`)

    return NextResponse.json({
      success: true,
      task,
      autoRun: autoRun === true,
      message: `成功导入任务 "${taskName}"，共 ${steps.length} 个步骤`
    }, { status: 201 })

  } catch (error) {
    console.error('[导入] 解析失败:', error)
    return NextResponse.json({
      error: 'JSON 解析失败',
      details: (error as Error).message,
      hint: '请确保上传的是有效的 JSON 文件'
    }, { status: 400 })
  }
}
