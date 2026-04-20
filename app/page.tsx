'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Layout, Button, Space, Card, Typography, Tag, message, Modal, Empty, Spin, Badge, Progress, Alert } from 'antd'
import {
  PlayCircleOutlined,
  StopOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
  ClearOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useDatabase } from '@/hooks/useDatabase'
import {
  TestTask,
  LogEntry,
  ExecutionStrategy,
  TestResult,
} from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/app/constants'
import { convertWorkflowConfigToSteps } from '@/app/utils/workflow-converter'
import TaskCard from '@/app/components/task-card/TaskCard'
import LogPanel from '@/app/components/log-panel/LogPanel'
import ResultModal from '@/app/components/result-modal/ResultModal'
import NewTaskModal from '@/app/components/new-task-modal/NewTaskModal'
import LogManagement from '@/app/components/log-management/LogManagement'
import { logStorage } from '@/lib/log-storage'

const { Header, Content, Sider } = Layout
const { Title } = Typography

const PRESET_FILES = [
  '/preset-tasks/demo-invoice-task-v5.json',
  '/preset-tasks/demo-invoice-task.json',
]

export default function HomePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const runTaskId = searchParams.get('run')
  const workflowConfigStr = searchParams.get('workflowConfig')

  const {
    tasks,
    results,
    isLoading: isDbLoading,
    createTask,
    updateTask,
    deleteTask,
    saveResult,
    getLatestResult,
    importTasks,
    exportAllTasks,
    loadTasks,
  } = useDatabase()

  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [terminatedTaskId, setTerminatedTaskId] = useState<string | null>(null)
  const [currentTestId, setCurrentTestId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [useHeadful, setUseHeadful] = useState(false)
  const [defaultStrategy, setDefaultStrategy] = useState<ExecutionStrategy>('auto')
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null)
  const [taskTemplates, setTaskTemplates] = useState<TestTask[]>([])
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [showLogManagement, setShowLogManagement] = useState(false)

  const taskRef = useRef<TestTask | null>(null)
  const isStartingRef = useRef(false)
  const isStoppedRef = useRef(false)
  const initDoneRef = useRef(false)

  useEffect(() => {
    const runWorkflowTask = async () => {
      if (!initDoneRef.current || !runTaskId || runningTaskId || isStartingRef.current) return

      const task = tasks.find(t => t.id === runTaskId)
      if (!task && !workflowConfigStr) {
        message.error('未找到任务')
        return
      }

      try {
        let taskToRun = task

        if (workflowConfigStr) {
          try {
            console.log('[执行] 使用URL传递的工作流配置')
            const workflowConfig = JSON.parse(workflowConfigStr)
            
            taskToRun = {
              id: runTaskId,
              name: task?.name || '工作流任务',
              description: `工作流执行 - ${new Date().toLocaleString()}`,
              steps: convertWorkflowConfigToSteps(workflowConfig),
              status: 'running' as any,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              type: 'workflow' as any,
              workflowConfig,
            } as any;
          } catch (parseError) {
            console.error('[执行] 解析URL配置失败:', parseError)
            message.error('工作流配置格式错误')
            return
          }
        } else if (task && ((task as any).type === 'workflow' || (task as any).workflowConfig)) {
          console.log('[执行] 从数据库读取工作流配置')
          const db = await (window as any).indexedDB.open('StagehandTestDB', 2)
          const result = await new Promise((resolve, reject) => {
            db.onsuccess = () => {
              const store = db.result.transaction('tasks', 'readonly').objectStore('tasks')
              const request = store.get(runTaskId)
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            }
            db.onerror = () => reject(db.error)
          })

          const taskData = result as any
          if (taskData?.workflowConfig) {
            const workflowConfig = taskData.workflowConfig
            taskToRun = {
              ...task,
              steps: convertWorkflowConfigToSteps(workflowConfig),
            }
          }
        }

        if (!taskToRun || !taskToRun.steps || taskToRun.steps.length === 0) {
          message.warning('任务没有配置步骤，请先编辑任务添加步骤')
          return
        }

        console.log(`[执行] 开始执行任务: ${taskToRun.name}, 步骤数: ${taskToRun.steps.length}`)
        
        taskRef.current = taskToRun
        startTest(taskToRun)
      } catch (error) {
        console.error('加载工作流配置失败:', error)
        message.error('加载工作流配置失败')
      }
    }

    runWorkflowTask()
  }, [runTaskId, tasks, initDoneRef.current, workflowConfigStr])

  useEffect(() => {
    const initApp = async () => {
      try {
        await loadPresetTasks()
        loadTaskTemplates()
        
        const runningTasks = tasks.filter(t => t.status === 'running')
        for (const task of runningTasks) {
          console.log(`[初始化] 重置未完成的任务: ${task.name}`)
          try {
            await updateTask({ ...task, status: 'ready' })
          } catch (e) {
            console.error('[初始化] 重置任务失败:', e)
          }
        }
        
        if (runningTasks.length > 0) {
          message.info('已重置未完成的任务为就绪状态')
        }
        
        initDoneRef.current = true
        setIsInitialized(true)
      } catch (error) {
        console.error('初始化失败:', error)
        initDoneRef.current = true
        setIsInitialized(true)
      }
    }

    if (!isInitialized && !isDbLoading) {
      initApp()
    }
  }, [isDbLoading])

  const loadPresetTasks = useCallback(async () => {
    for (const fileUrl of PRESET_FILES) {
      try {
        const response = await fetch(fileUrl)
        if (response.ok) {
          return true
        }
      } catch { continue }
    }
    return false
  }, [])

  const loadTaskTemplates = useCallback(() => {
    try {
      const templates = JSON.parse(localStorage.getItem('taskTemplates') || '[]')
      setTaskTemplates(templates)
    } catch {
      setTaskTemplates([])
    }
  }, [])

  const initAllPresetTasks = useCallback(async () => {
    try {
      Modal.confirm({
        title: '初始化预设任务',
        content: '确定要初始化预设任务吗？这可能会添加示例任务到您的任务列表中。',
        okText: '确定',
        cancelText: '取消',
        onOk: async () => {
          try {
            const response = await fetch('/api/tasks/init', { method: 'POST' })
            if (!response.ok) throw new Error('获取预设任务失败')
            const data = await response.json()
            const tasksToImport: TestTask[] = data.tasks
            if (tasksToImport.length > 0) {
              const imported = await importTasks(JSON.stringify(tasksToImport))
              message.success(`成功初始化 ${imported.length} 个预设任务！`)
            } else {
              message.info('没有可用的预设任务')
            }
          } catch {
            message.error('初始化失败，请重试')
          }
        },
      })
    } catch {
      message.error('操作失败，请重试')
    }
  }, [importTasks])

  const handleImportJsonTask = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.multiple = false

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        console.log('[导入] 原始文件内容长度:', text.length)
        console.log('[导入] 文件名:', file.name)

        const data = JSON.parse(text)
        console.log('[导入] 解析后的数据类型:', typeof data)
        console.log('[导入] 是否为数组:', Array.isArray(data))

        let tasksToImport: Array<{
          name: string
          description?: string
          steps: TestStep[]
          workflowConfig?: any
        }> = []

        if (Array.isArray(data)) {
          console.log('[导入] 检测到数组格式，元素数量:', data.length)

          if (data.length === 0) {
            message.warning('文件内容为空')
            return
          }

          const firstItem = data[0]
          console.log('[导入] 第一个元素结构:', Object.keys(firstItem))

          // 判断是任务数组还是步骤数组
          const isTaskArray = firstItem && (
            (firstItem as any).name ||
            (firstItem as any).workflowConfig ||
            ((firstItem as any).steps && Array.isArray((firstItem as any).steps))
          )

          const isStepArray = firstItem &&
            (firstItem as TestStep).id &&
            (firstItem as TestStep).type &&
            (firstItem as TestStep).description &&
            !(firstItem as any).name

          console.log('[导入] isTaskArray:', isTaskArray)
          console.log('[导入] isStepArray:', isStepArray)

          if (isTaskArray) {
            console.log('[导入] ✅ 检测到任务数组格式，将导入所有任务')

            for (const task of data) {
              let steps: TestStep[] = []

              if ((task as any).workflowConfig) {
                console.log(`[导入] 发现工作流任务: ${(task as any).name}`)
                try {
                  steps = convertWorkflowConfigToSteps((task as any).workflowConfig)
                  console.log(`[导入] 工作流转换成功，步骤数: ${steps.length}`)
                } catch (convertError) {
                  console.error('[导入] 工作流转换失败:', convertError)
                  steps = (task as any).steps || []
                }
              } else if ((task as any).steps && Array.isArray((task as any).steps)) {
                steps = (task as any).steps
              }

              tasksToImport.push({
                name: (task as any).name || '未命名任务',
                description: (task as any).description,
                steps,
                workflowConfig: (task as any).workflowConfig,
              })
            }
          } else if (isStepArray) {
            console.log('[导入] ✅ 检测到步骤数组格式，将创建单个任务')
            tasksToImport.push({
              name: file.name.replace('.json', ''),
              description: `从 ${file.name} 导入`,
              steps: data as TestStep[],
            })
          } else {
            console.error('[导入] ❌ 无法识别的数组格式')
            message.error('JSON 格式不正确：无法识别数据结构')
            return
          }
        } else if (data.steps && Array.isArray(data.steps)) {
          console.log('[导入] ✅ 检测到单个任务对象格式')
          tasksToImport.push({
            name: data.name || file.name.replace('.json', ''),
            description: data.description,
            steps: data.steps,
            workflowConfig: data.workflowConfig,
          })
        } else {
          console.error('[导入] ❌ 无法识别的JSON格式')
          message.error('JSON 格式不正确：支持任务数组、步骤数组或单个任务对象')
          return
        }

        console.log('[导入] 准备导入任务数:', tasksToImport.length)
        console.log('[导入] 任务详情:')
        tasksToImport.forEach((task, index) => {
          console.log(`  [${index + 1}] ${task.name} - ${task.steps.length}个步骤`)
          if (task.workflowConfig) {
            console.log(`       [工作流模式] 节点数: ${task.workflowConfig.nodes?.length || 0}`)
          }
        })

        if (tasksToImport.length === 0) {
          message.warning('没有找到可导入的任务或步骤')
          return
        }

        const importedTasks: TestTask[] = []

        for (const taskData of tasksToImport) {
          console.log(`[导入] 正在创建任务: ${taskData.name} (${taskData.steps.length}个步骤)`)

          const newTask = await createTask(
            taskData.name,
            taskData.description,
            taskData.steps,
            ['导入', 'JSON', ...(taskData.workflowConfig ? ['工作流'] : [])]
          )

          if (newTask) {
            console.log(`[导入] ✅ 任务创建成功: ${newTask.id}`)

            if (taskData.workflowConfig) {
              try {
                const updatedTask = { ...newTask, workflowConfig: taskData.workflowConfig, type: 'workflow' }
                await updateTask(updatedTask)
                console.log('[导入] ✅ 工作流配置已保存')
                importedTasks.push(updatedTask)
              } catch (saveError) {
                console.warn('[导入] 保存工作流配置失败，使用基本任务', saveError)
                importedTasks.push(newTask)
              }
            } else {
              importedTasks.push(newTask)
            }
          }
        }

        if (importedTasks.length > 0) {
          const totalSteps = importedTasks.reduce((sum, t) => sum + (t.steps?.length || 0), 0)
          message.success(`✅ 成功导入 ${importedTasks.length} 个任务，共 ${totalSteps} 个步骤`)

          if (importedTasks.length === 1) {
            Modal.confirm({
              title: '导入成功',
              content: `已成功导入 "${importedTasks[0].name}" 任务（${importedTasks[0].steps?.length || 0}个步骤）。是否立即执行？`,
              okText: '立即执行',
              cancelText: '稍后执行',
              onOk: () => {
                console.log('[导入] 用户选择立即执行')
                setTimeout(() => startTest(importedTasks[0]), 500)
              },
            })
          } else {
            Modal.confirm({
              title: '批量导入成功',
              content: `已成功导入 ${importedTasks.length} 个任务。是否执行第一个任务 "${importedTasks[0].name}"？`,
              okText: '执行第一个',
              cancelText: '稍后手动执行',
              onOk: () => {
                setTimeout(() => startTest(importedTasks[0]), 500)
              },
            })
          }
        }
      } catch (error) {
        console.error('[导入] 解析失败:', error)
        console.error('[导入] 错误堆栈:', (error as Error)?.stack)
        message.error(`导入失败: ${(error as Error).message}`)
      }
    }

    input.click()
  }, [createTask, updateTask])

  const saveTaskAsTemplate = useCallback((task: TestTask) => {
    try {
      const template = {
        ...task,
        id: `template_${Date.now()}`,
        name: `${task.name} (模板)`,
        status: 'draft' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const templates = JSON.parse(localStorage.getItem('taskTemplates') || '[]')
      templates.push(template)
      localStorage.setItem('taskTemplates', JSON.stringify(templates))
      loadTaskTemplates()
      message.success('任务已保存为模板')
    } catch {
      message.error('保存模板失败')
    }
  }, [loadTaskTemplates])

  const deleteTemplate = useCallback((templateId: string) => {
    const templates = JSON.parse(localStorage.getItem('taskTemplates') || '[]')
    const updated = templates.filter((t: TestTask) => t.id !== templateId)
    localStorage.setItem('taskTemplates', JSON.stringify(updated))
    loadTaskTemplates()
    message.success('模板已删除')
  }, [loadTaskTemplates])

  const saveExecutionLog = async (taskId: string, taskName: string, status: 'success' | 'error' | 'aborted', startTime: string) => {
    try {
      const executionLog = {
        id: `log_${Date.now()}`,
        taskId,
        taskName,
        startTime,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(startTime).getTime(),
        status,
        logs: logs,
        stepsCount: logs.filter(l => l.stepId).length,
        successSteps: logs.filter(l => l.level === 'success').length,
        failedSteps: logs.filter(l => l.level === 'error').length,
        createdAt: new Date().toISOString(),
      }
      
      await logStorage.saveLog(executionLog)
      console.log('[日志] 执行日志已保存:', executionLog.id)
    } catch (error) {
      console.error('[日志] 保存执行日志失败:', error)
    }
  }

  const startTest = async (task: TestTask) => {
    let taskToRun = task
    if (((task as any).type === 'workflow' || (task as any).workflowConfig)) {
      const workflowConfig = (task as any).workflowConfig
      if (workflowConfig?.nodes?.length > 0) {
        console.log(`[startTest] 执行工作流任务: ${task.name}, 节点数: ${workflowConfig.nodes.length}`)
        taskToRun = {
          ...task,
          steps: convertWorkflowConfigToSteps(workflowConfig),
        }
      }
    }

    if (!taskToRun || !taskToRun.steps || taskToRun.steps.length === 0) {
      message.warning('任务没有配置步骤，请先编辑任务添加步骤')
      return
    }

    if (runningTaskId) {
      message.warning('已有任务正在执行中，请先终止当前任务')
      return
    }

    isStartingRef.current = true
    isStoppedRef.current = false
    setRunningTaskId(taskToRun.id)
    taskRef.current = taskToRun
    setLogs([])
    
    const startTime = new Date().toISOString()
    const testId = `test_${Date.now()}`
    setCurrentTestId(testId)

    try {
      await updateTask({ ...taskToRun, status: 'running' as const })
    } catch (error) {
      message.error('更新任务状态失败')
      setRunningTaskId(null)
      isStartingRef.current = false
      return
    }

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          steps: taskToRun.steps, 
          useHeadful, 
          strategy: defaultStrategy,
          testId
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) throw new Error('无法获取响应流')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const log = JSON.parse(line.slice(6)) as LogEntry
              
              if (!isStoppedRef.current) {
                setLogs(prev => [...prev, log])
              }

              if (log.message.includes('测试完成') || log.message.includes('测试失败') || log.message.includes('测试异常')) {
                const failedSteps = (log.details?.failedSteps as number) || 0
                const passedSteps = (log.details?.passedSteps as number) || 0
                const isSuccess = log.level === 'success' && failedSteps === 0
                
                const result: TestResult = {
                  id: `result_${Date.now()}`,
                  taskId: taskToRun.id,
                  taskName: taskToRun.name,
                  status: isSuccess ? 'success' : 'failed',
                  executedAt: new Date().toISOString(),
                  duration: (log.details?.totalDuration as number) || 0,
                  totalSteps: taskToRun.steps.length,
                  passedSteps,
                  failedSteps,
                  skippedSteps: 0,
                  executionRecords: [],
                  screenshots: [],
                }
                
                await saveResult(result)
                
                let finalStatus: 'completed' | 'failed' = isSuccess ? 'completed' : 'failed'
                if (log.message.includes('测试异常') || failedSteps > 0) {
                  finalStatus = 'failed'
                }
                
                await updateTask({ ...taskToRun, status: finalStatus })
              }
            } catch (e) {
              console.error('解析日志失败:', e)
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('[执行] 错误:', error)
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[执行] 任务被中止')
      } else {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        
        if (!isStoppedRef.current) {
          const finalLog: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `💥 测试异常终止: ${errorMessage}`,
            details: { 
              error: error instanceof Error ? error.stack : undefined,
            },
          }
          setLogs(prev => [...prev, finalLog])
          
          message.error('测试执行失败: ' + errorMessage)
          
          if (taskRef.current) {
            await updateTask({ ...taskRef.current, status: 'failed' }).catch(e => {
              console.error('[执行] 更新失败状态出错:', e)
            })
          }
        }
      }
    } finally {
      if (!isStoppedRef.current) {
        const finalTask = taskRef.current
        const isFailed = logs.some(l => l.level === 'error')
        
        if (finalTask) {
          saveExecutionLog(
            finalTask.id, 
            finalTask.name, 
            isFailed ? 'error' : 'success', 
            startTime
          ).catch(e => console.error('[日志] 保存失败:', e))
        }
        
        setRunningTaskId(null)
        setAbortController(null)
        setCurrentTestId(null)
        taskRef.current = null
        isStartingRef.current = false
      }
    }
  }

  const stopTest = useCallback(async () => {
    if (!abortController || !currentTestId) {
      message.warning('没有正在执行的任务')
      return
    }
    
    console.log('[终止] 开始终止任务...')
    
    const currentTaskId = runningTaskId
    const currentTask = taskRef.current
    const testIdToAbort = currentTestId
    const controllerToAbort = abortController
    
    isStoppedRef.current = true
    
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level: 'warning',
      message: `⚹️ 正在终止任务执行...`,
      details: { 
        action: 'user_terminate',
        taskId: currentTaskId,
        testId: testIdToAbort,
      },
    }])
    
    setRunningTaskId(null)
    setAbortController(null)
    setCurrentTestId(null)
    
    if (currentTaskId) {
      setTerminatedTaskId(currentTaskId)
    }
    
    taskRef.current = null
    isStartingRef.current = false
    
    controllerToAbort.abort()
    
    fetch('/api/test', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        testId: testIdToAbort, 
        reason: '用户终止' 
      }),
    }).then(response => {
      if (response.ok) {
        console.log('[终止] 后端终止信号已发送')
      }
    }).catch(e => {
      console.warn('[终止] 发送终止信号失败:', e)
    })
    
    if (currentTask) {
      try {
        await updateTask({ ...currentTask, status: 'ready' })
        console.log('[终止] 数据库状态已更新为 ready')
      } catch (e) {
        console.error('[终止] 更新任务状态失败:', e)
      }
      
      saveExecutionLog(
        currentTask.id,
        currentTask.name,
        'aborted',
        new Date(Date.now() - 10000).toISOString()
      ).catch(e => console.error('[日志] 保存失败:', e))
      
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'warning',
        message: `✅ 任务已成功终止`,
        details: { 
          totalSteps: currentTask.steps.length,
          taskId: currentTaskId,
        },
      }])
      
      message.success('任务已终止')
      
      setTimeout(() => {
        setTerminatedTaskId(null)
      }, 3000)
    }
  }, [abortController, runningTaskId, currentTestId, updateTask])

  const handleViewResult = (result: TestResult) => {
    setSelectedResult(result)
    setShowResultModal(true)
  }

  const handleExportAllTasks = () => {
    if (tasks.length === 0) {
      message.warning('没有可导出的任务')
      return
    }
    
    try {
      const dataStr = exportAllTasks()
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `all-tasks-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (runningTaskId === taskId) {
      message.warning('无法删除正在执行的任务，请先终止执行')
      return
    }

    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个任务吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteTask(taskId)
          message.success('任务已删除')
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  const runningTask = runningTaskId ? tasks.find(t => t.id === runningTaskId) : null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Space>
          <Title level={3} style={{ color: 'white', margin: 0 }}>
            🤖 Stagehand 自动化测试平台
          </Title>
          {runningTask && (
            <Badge status="processing" text={<span style={{ color: '#fff' }}>执行中: {runningTask.name}</span>} />
          )}
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowNewTaskModal(true)}
            disabled={!!runningTaskId}
          >
            新建任务
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={handleImportJsonTask}
            disabled={!!runningTaskId}
          >
            导入JSON
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={initAllPresetTasks}
            disabled={!!runningTaskId}
          >
            初始化预设
          </Button>
          <Button
            icon={<ExportOutlined />}
            onClick={handleExportAllTasks}
            disabled={tasks.length === 0 || !!runningTaskId}
          >
            导出全部
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => window.location.reload()}
            disabled={!!runningTaskId}
          >
            刷新
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={() => setShowLogManagement(true)}
          >
            日志管理
          </Button>
        </Space>
      </Header>

      <Layout>
        <Content style={{ padding: '24px', background: '#f5f5f5' }}>
          {runningTask && (
            <Alert
              message={`正在执行任务: ${runningTask.name}`}
              description="任务执行期间，部分操作将被禁用。请在任务列表中点击终止按钮停止执行。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          
          <Card 
            title={
              <Space>
                <FileTextOutlined />
                <span>任务列表 ({tasks.length})</span>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            {isDbLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" tip="加载中..." />
              </div>
            ) : tasks.length === 0 ? (
              <Empty description="暂无任务，请创建新任务或初始化预设任务">
                <Space>
                  <Button type="primary" onClick={() => setShowNewTaskModal(true)}>
                    创建新任务
                  </Button>
                  <Button onClick={initAllPresetTasks}>
                    初始化预设任务
                  </Button>
                </Space>
              </Empty>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
                gap: 16,
                maxHeight: 'calc(100vh - 300px)',
                overflowY: 'auto',
                padding: 4,
              }}>
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isRunning={runningTaskId === task.id}
                    isTerminated={terminatedTaskId === task.id}
                    latestResult={getLatestResult(task.id)}
                    onRun={() => startTest(task)}
                    onStop={stopTest}
                    onEdit={() => {
                      const params = new URLSearchParams()
                      params.set('taskId', task.id)
                      router.push(`/workflow?${params.toString()}`)
                    }}
                    onDelete={() => handleDeleteTask(task.id)}
                    onViewResult={handleViewResult}
                    onSaveAsTemplate={() => saveTaskAsTemplate(task)}
                    isDisabled={!!runningTaskId && runningTaskId !== task.id}
                  />
                ))}
              </div>
            )}
          </Card>
        </Content>

        <Sider width={450} style={{ background: '#fff', padding: '16px', borderLeft: '1px solid #f0f0f0' }}>
          <LogPanel 
            logs={logs} 
            isRunning={!!runningTaskId} 
            onClear={() => setLogs([])}
            taskName={runningTask?.name}
          />
        </Sider>
      </Layout>

      <NewTaskModal
        open={showNewTaskModal}
        taskTemplates={taskTemplates}
        onClose={() => setShowNewTaskModal(false)}
        onCreateTask={async (name, description, steps, tags) => {
          const newTask = await createTask(name, description, steps, tags)
          return newTask
        }}
        onTaskCreated={(task) => {
          setShowNewTaskModal(false)
          const params = new URLSearchParams()
          params.set('taskId', task.id)
          router.push(`/workflow?${params.toString()}`)
        }}
        onDeleteTemplate={deleteTemplate}
      />

      <ResultModal
        open={showResultModal}
        result={selectedResult}
        onClose={() => setShowResultModal(false)}
      />
      
      <LogManagement
        visible={showLogManagement}
        onClose={() => setShowLogManagement(false)}
      />
    </Layout>
  )
}
