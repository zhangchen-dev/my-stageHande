/**
 * 任务管理 API
 * 提供任务的增删改查接口
 * 注意：由于 IndexedDB 是客户端存储，实际操作在前端进行
 * 此 API 主要用于服务端初始化和备份同步
 */

import { NextRequest, NextResponse } from 'next/server'
import { TestTask, TestResult } from '@/types'

export const dynamic = 'force-dynamic'

// 模拟服务端存储（实际项目中可连接真实数据库）
let tasks: TestTask[] = []
let results: TestResult[] = []

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// GET - 获取所有任务列表
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const taskId = searchParams.get('taskId')
  const resultsOnly = searchParams.get('results') === 'true'
  
  if (resultsOnly && taskId) {
    // 获取指定任务的执行结果
    const taskResults = results.filter(r => r.taskId === taskId)
    return NextResponse.json({ results: taskResults })
  }
  
  if (taskId) {
    // 获取指定任务详情
    const task = tasks.find(t => t.id === taskId)
    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    }
    return NextResponse.json({ task })
  }
  
  // 返回所有任务
  return NextResponse.json({
    tasks,
    total: tasks.length,
  })
}

// POST - 创建新任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, steps, tags } = body
    
    if (!name) {
      return NextResponse.json({ error: '任务名称不能为空' }, { status: 400 })
    }
    
    const now = new Date().toISOString()
    const task: TestTask = {
      id: generateId(),
      name,
      description: description || '',
      steps: steps || [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      tags: tags || [],
    }
    
    tasks.push(task)
    
    return NextResponse.json({
      success: true,
      task,
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      error: '创建任务失败',
      details: (error as Error).message,
    }, { status: 500 })
  }
}

// PUT - 更新任务
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, description, steps, status, tags } = body
    
    const taskIndex = tasks.findIndex(t => t.id === id)
    if (taskIndex === -1) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    }
    
    tasks[taskIndex] = {
      ...tasks[taskIndex],
      name: name ?? tasks[taskIndex].name,
      description: description ?? tasks[taskIndex].description,
      steps: steps ?? tasks[taskIndex].steps,
      status: status ?? tasks[taskIndex].status,
      tags: tags ?? tasks[taskIndex].tags,
      updatedAt: new Date().toISOString(),
    }
    
    return NextResponse.json({
      success: true,
      task: tasks[taskIndex],
    })
  } catch (error) {
    return NextResponse.json({
      error: '更新任务失败',
      details: (error as Error).message,
    }, { status: 500 })
  }
}

// DELETE - 删除任务
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const taskId = searchParams.get('id')
  
  if (!taskId) {
    return NextResponse.json({ error: '任务ID不能为空' }, { status: 400 })
  }
  
  const taskIndex = tasks.findIndex(t => t.id === taskId)
  if (taskIndex === -1) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  }
  
  tasks.splice(taskIndex, 1)
  
  // 同时删除该任务的执行结果
  results = results.filter(r => r.taskId !== taskId)
  
  return NextResponse.json({ success: true })
}
