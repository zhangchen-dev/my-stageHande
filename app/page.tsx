'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Layout, Button, Space, Card, Typography, Tag, message, Form } from 'antd'
import {
  PlayCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useDatabase } from '@/hooks/useDatabase'
import {
  TestStep,
  TestTask,
  LogEntry,
  ExecutionStrategy,
  TestResult,
  ExecutionRecord,
  StepExecutionRecord,
  TaskStatus,
} from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/app/constants'
import { cleanSelector } from '@/app/utils/step-helpers'
import { FormValues } from '@/app/components/StepEditor'
import TaskSidebar from '@/app/components/TaskSidebar'
import StepEditor from '@/app/components/StepEditor'
import StepList from '@/app/components/StepList'
import LogPanel from '@/app/components/LogPanel'
import ResultModal from '@/app/components/ResultModal'
import NewTaskModal from '@/app/components/NewTaskModal'

const { Header, Content, Sider } = Layout
const { Title, Text } = Typography

const PRESET_FILES = [
  '/preset-tasks/demo-invoice-task-v5.json',
  '/preset-tasks/demo-invoice-task.json',
]

export default function TestConsole() {
  const {
    tasks,
    results,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    saveResult,
    getLatestResult,
    importTasks,
    exportAllTasks,
  } = useDatabase()

  const [selectedTask, setSelectedTask] = useState<TestTask | null>(null)
  const [steps, setSteps] = useState<TestStep[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [useHeadful, setUseHeadful] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [editingStepData, setEditingStepData] = useState<any>(null)
  const [defaultStrategy, setDefaultStrategy] = useState<ExecutionStrategy>('auto')
  const [activeTab, setActiveTab] = useState<'steps' | 'results'>('steps')

  const [editForm] = Form.useForm<FormValues>()
  const [addForm] = Form.useForm<FormValues>()

  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null)

  const [presetTasks, setPresetTasks] = useState<TestTask[]>([])
  const [taskTemplates, setTaskTemplates] = useState<TestTask[]>([])

  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [])

  useEffect(() => {
    if (selectedTask) {
      setSteps(selectedTask.steps || [])
    } else {
      setSteps([])
    }
  }, [selectedTask])

  useEffect(() => {
    if (editingStepId && editingStepData) {
      setTimeout(() => {
        editForm.setFieldsValue(editingStepData)
      }, 0)
    }
  }, [editingStepId, editingStepData, editForm])

  const loadPresetTasks = useCallback(async () => {
    for (const fileUrl of PRESET_FILES) {
      try {
        const response = await fetch(fileUrl)
        if (response.ok) {
          const data = await response.json()
          const tasks = Array.isArray(data) ? data : [data]
          setPresetTasks(tasks)
          return
        }
      } catch { continue }
    }
  }, [])

  const loadTaskTemplates = useCallback(() => {
    try {
      const templates = JSON.parse(localStorage.getItem('taskTemplates') || '[]')
      setTaskTemplates(templates)
    } catch {
      setTaskTemplates([])
    }
  }, [])

  useEffect(() => {
    loadPresetTasks()
    loadTaskTemplates()
  }, [loadPresetTasks, loadTaskTemplates])

  const importPresetTask = useCallback(async (task: TestTask) => {
    try {
      const imported = await importTasks(JSON.stringify(task))
      message.success(`已导入任务：${imported[0]?.name || task.name}`)
    } catch {
      message.error('导入预设任务失败')
    }
  }, [importTasks])

  const initAllPresetTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/tasks/init', { method: 'POST' })
      if (!response.ok) throw new Error('获取预设任务失败')
      const data = await response.json()
      const tasksToImport: TestTask[] = data.tasks
      if (tasksToImport.length > 0) {
        const imported = await importTasks(JSON.stringify(tasksToImport))
        message.success(`成功初始化 ${imported.length} 个预设任务到数据库！`)
      }
    } catch {
      message.error('初始化失败，请重试')
    }
  }, [importTasks])

  const saveTaskAsTemplate = useCallback((task: TestTask) => {
    try {
      const template = {
        ...task,
        id: `template_${Date.now()}`,
        name: `${task.name} (模板)`,
        status: 'draft',
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

  const handleSelectTask = (task: TestTask) => {
    setSelectedTask(task)
    setLogs([])
    setActiveTab('steps')
    setEditingStepId(null)
    setEditingStepData(null)
  }

  const addStep = (values: FormValues) => {
    if (!selectedTask) {
      message.warning('请先创建或选择一个任务')
      return
    }

    let newStep: TestStep
    if (values.type === 'condition') {
      newStep = {
        id: `step_${Date.now()}`,
        type: 'condition',
        description: values.description,
        condition: values.condition || {
          type: 'elementExists' as const,
          selector: cleanSelector(values.selector),
          value: values.value,
        },
        thenSteps: [],
        elseSteps: undefined,
      } as any
    } else {
      newStep = {
        id: `step_${Date.now()}`,
        type: values.type,
        description: values.description,
        value: values.value || undefined,
        selector: cleanSelector(values.selector),
        strategy: defaultStrategy,
      }
    }

    const updatedSteps = [...steps, newStep]
    setSteps(updatedSteps)
    const updatedTask = { ...selectedTask, steps: updatedSteps }
    updateTask(updatedTask)
    setSelectedTask(updatedTask)
  }

  const removeStep = (id: string) => {
    const updatedSteps = steps.filter(s => s.id !== id)
    setSteps(updatedSteps)
    if (selectedTask) {
      const updatedTask = { ...selectedTask, steps: updatedSteps }
      updateTask(updatedTask)
      setSelectedTask(updatedTask)
    }
    if (editingStepId === id) setEditingStepId(null)
  }

  const startEditStep = (step: TestStep) => {
    setEditingStepId(step.id)

    const formValues: any = {
      type: step.type,
      description: step.description,
      value: step.value || undefined,
      strategy: step.strategy || defaultStrategy,
    }

    if (step.selector) {
      formValues['selector.id'] = step.selector.id || undefined
      formValues['selector.className'] = step.selector.className || undefined
      formValues['selector.classPrefix'] = step.selector.classPrefix || undefined
      formValues['selector.text'] = step.selector.text || undefined
      formValues['selector.css'] = step.selector.css || undefined
      formValues['selector.xpath'] = step.selector.xpath || undefined
      formValues['selector.testId'] = step.selector.testId || undefined
      formValues['selector.name'] = step.selector.name || undefined
      formValues['selector.containsText'] = step.selector.containsText || undefined
    }

    if (step.type === 'condition') {
      const conditionStep = step as any
      formValues['condition.type'] = conditionStep.condition?.type || undefined
      formValues['conditionValue'] = conditionStep.condition?.value || undefined
      if (conditionStep.condition?.selector) {
        formValues['condition.selector.id'] = conditionStep.condition.selector.id || undefined
        formValues['condition.selector.className'] = conditionStep.condition.selector.className || undefined
        formValues['condition.selector.text'] = conditionStep.condition.selector.text || undefined
        formValues['condition.selector.css'] = conditionStep.condition.selector.css || undefined
        formValues['condition.selector.xpath'] = conditionStep.condition.selector.xpath || undefined
        formValues['condition.selector.testId'] = conditionStep.condition.selector.testId || undefined
      }
    }

    setEditingStepData(formValues)
  }

  const saveEditedStep = (values: FormValues) => {
    if (!editingStepId || !selectedTask) return

    const updatedSteps = steps.map(step => {
      if (step.id === editingStepId) {
        if (values.type === 'condition') {
          return {
            ...step,
            type: 'condition',
            description: values.description,
            condition: values.condition || {
              type: 'elementExists' as const,
              selector: cleanSelector(values.selector),
              value: values.value,
            },
          } as any
        } else {
          return {
            ...step,
            type: values.type,
            description: values.description,
            value: values.value || undefined,
            selector: cleanSelector(values.selector),
            strategy: defaultStrategy,
          }
        }
      }
      return step
    })

    setSteps(updatedSteps)
    const updatedTask = { ...selectedTask, steps: updatedSteps }
    updateTask(updatedTask)
    setSelectedTask(updatedTask)
    setEditingStepId(null)
    setEditingStepData(null)
    editForm.resetFields()
  }

  const cancelEdit = () => {
    setEditingStepId(null)
    setEditingStepData(null)
    editForm.resetFields()
  }

  const startTest = async () => {
    if (!selectedTask || steps.length === 0) {
      message.warning('请先选择任务并添加步骤')
      return
    }

    setIsRunning(true)
    setLogs([])

    const runningTask = { ...selectedTask, status: 'running' as const }
    updateTask(runningTask)
    setSelectedTask(runningTask)

    const testId = `test_${Date.now()}`

    try {
      const response = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, useHeadful, strategy: defaultStrategy }),
      })

      if (!response.body) throw new Error('无法获取响应流')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const executionRecords: StepExecutionRecord[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const log = JSON.parse(line.slice(6)) as LogEntry
              setLogs(prev => [...prev, log])

              if (log.details?.executionRecords) {
                for (const record of log.details.executionRecords as ExecutionRecord[]) {
                  executionRecords.push({
                    stepId: record.stepId,
                    stepType: 'click',
                    description: record.message.replace(/^(成功|失败): /, ''),
                    strategy: 'auto',
                    status: record.status === 'success' ? 'success' : 'failed',
                    screenshot: record.screenshot,
                    aiConfidence: record.aiConfidence,
                    selectorUsed: record.selectorUsed,
                  })
                }
              }

              if (log.message.includes('完成') || log.level === 'error') {
                const result: TestResult = {
                  id: `result_${Date.now()}`,
                  taskId: selectedTask.id,
                  taskName: selectedTask.name,
                  status: log.level === 'error' ? 'failed' : 'success',
                  executedAt: new Date().toISOString(),
                  duration: 0,
                  totalSteps: steps.length,
                  passedSteps: executionRecords.filter(r => r.status === 'success').length,
                  failedSteps: executionRecords.filter(r => r.status === 'failed').length,
                  skippedSteps: 0,
                  executionRecords: executionRecords.map(r => ({
                    id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    stepId: r.stepId,
                    timestamp: new Date().toISOString(),
                    status: r.status === 'success' ? 'success' : 'failed',
                    message: r.description,
                    screenshot: r.screenshot,
                    selectorUsed: r.selectorUsed,
                    aiConfidence: r.aiConfidence,
                  })),
                  screenshots: executionRecords.filter(r => r.screenshot).map(r => r.screenshot as string),
                }
                saveResult(result)

                const finalTask: TestTask = {
                  ...selectedTask,
                  status: (log.level === 'error' ? 'failed' : 'completed') as TaskStatus,
                }
                updateTask(finalTask)
                setSelectedTask(finalTask)
              }
            } catch (e) {
              console.error('解析日志失败:', e)
            }
          }
        }
      }
    } catch {
      message.error('测试执行失败')
    }

    setIsRunning(false)
  }

  const handleImport = async (file: File) => {
    try {
      const content = await file.text()
      const importedSteps: TestStep[] = JSON.parse(content)
      if (!Array.isArray(importedSteps) || importedSteps.length === 0) throw new Error('无效格式')

      const newSteps = importedSteps.map(step => ({
        ...step,
        id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      }))

      if (selectedTask) {
        const updatedSteps = [...steps, ...newSteps]
        setSteps(updatedSteps)
        const updatedTask = { ...selectedTask, steps: updatedSteps }
        updateTask(updatedTask)
        setSelectedTask(updatedTask)
      } else {
        setSteps(newSteps)
      }
      message.success(`成功导入 ${newSteps.length} 个步骤`)
    } catch {
      message.error('导入失败：文件格式不正确或数据损坏')
    }
  }

  const handleExport = () => {
    if (steps.length === 0) {
      message.warning('没有可导出的步骤')
      return
    }
    const dataStr = JSON.stringify(steps, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `steps-${selectedTask?.name || 'test'}-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    message.success('步骤导出成功')
  }

  const handleExportAllTasks = () => {
    const dataStr = exportAllTasks()
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `all-tasks-${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }

  const handleViewResult = (result: TestResult) => {
    setSelectedResult(result)
    setShowResultModal(true)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          🤖 Stagehand 自动化测试平台
        </Title>
      </Header>

      <Layout>
        <Sider width={400} style={{ height: 'calc(100vh - 64px)' }}>
          <TaskSidebar
            tasks={tasks}
            selectedTask={selectedTask}
            isLoading={isLoading}
            isRunning={isRunning}
            results={results}
            presetTasks={presetTasks}
            onSelectTask={handleSelectTask}
            onDeleteTask={deleteTask}
            onSaveAsTemplate={saveTaskAsTemplate}
            onViewResult={handleViewResult}
            onImportPresetTask={importPresetTask}
            onInitAllPresetTasks={initAllPresetTasks}
            onShowNewTaskModal={() => setShowNewTaskModal(true)}
            onExportAllTasks={handleExportAllTasks}
            getLatestResult={getLatestResult}
          />
        </Sider>

        <Content style={{ padding: '24px', background: '#f5f5f5', minWidth: 500 }}>
          {selectedTask ? (
            <Card
              title={
                <Space>
                  <FileTextOutlined />
                  <span>当前任务: {selectedTask.name}</span>
                  <Tag color={STATUS_COLORS[selectedTask.status]}>
                    {STATUS_LABELS[selectedTask.status]}
                  </Tag>
                </Space>
              }
              extra={
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={isRunning}
                  onClick={startTest}
                  disabled={steps.length === 0}
                >
                  {isRunning ? '执行中...' : '开始测试'}
                </Button>
              }
            >
              <Space style={{ marginBottom: 16 }}>
                <Button
                  type={activeTab === 'steps' ? 'primary' : 'default'}
                  onClick={() => setActiveTab('steps')}
                >
                  步骤配置 ({steps.length})
                </Button>
                <Button
                  type={activeTab === 'results' ? 'primary' : 'default'}
                  onClick={() => setActiveTab('results')}
                >
                  执行结果
                </Button>
              </Space>

              {activeTab === 'steps' && (
                <>
                  <StepEditor
                    editingStepId={editingStepId}
                    defaultStrategy={defaultStrategy}
                    useHeadful={useHeadful}
                    editForm={editForm}
                    addForm={addForm}
                    onAddStep={addStep}
                    onSaveEditedStep={saveEditedStep}
                    onCancelEdit={cancelEdit}
                    onStrategyChange={setDefaultStrategy}
                    onHeadfulChange={setUseHeadful}
                  />
                  <StepList
                    steps={steps}
                    isRunning={isRunning}
                    onEditStep={startEditStep}
                    onRemoveStep={removeStep}
                    onExport={handleExport}
                    onImport={handleImport}
                  />
                </>
              )}

              {activeTab === 'results' && (
                <div>
                  {(() => {
                    const taskResults = results.get(selectedTask.id) || []
                    return taskResults.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无执行结果</div>
                    ) : (
                      taskResults.map(result => (
                        <Card
                          key={result.id}
                          size="small"
                          style={{ marginBottom: 8, cursor: 'pointer' }}
                          onClick={() => handleViewResult(result)}
                        >
                          <Space>
                            <Tag color={result.status === 'success' ? 'success' : 'error'}>
                              {result.status === 'success' ? '通过' : '失败'}
                            </Tag>
                            <Text>{new Date(result.executedAt).toLocaleString()}</Text>
                            <Text type="secondary">{result.passedSteps}/{result.totalSteps} 步骤</Text>
                          </Space>
                        </Card>
                      ))
                    )
                  })()}
                </div>
              )}
            </Card>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Text type="secondary" style={{ fontSize: 16 }}>请从左侧选择一个任务或创建新任务</Text>
                <br />
                <Button type="primary" style={{ marginTop: 16 }} onClick={() => setShowNewTaskModal(true)}>
                  创建新任务
                </Button>
              </div>
            </Card>
          )}
        </Content>

        <Sider width={450} style={{ background: '#fff', padding: '16px', borderLeft: '1px solid #f0f0f0' }}>
          <LogPanel logs={logs} isRunning={isRunning} onClear={() => setLogs([])} />
        </Sider>
      </Layout>

      <NewTaskModal
        open={showNewTaskModal}
        taskTemplates={taskTemplates}
        onClose={() => setShowNewTaskModal(false)}
        onCreateTask={createTask}
        onTaskCreated={(task) => {
          setSelectedTask(task)
          setShowNewTaskModal(false)
          message.success('任务创建成功')
        }}
        onDeleteTemplate={deleteTemplate}
      />

      <ResultModal
        open={showResultModal}
        result={selectedResult}
        onClose={() => setShowResultModal(false)}
      />
    </Layout>
  )
}
