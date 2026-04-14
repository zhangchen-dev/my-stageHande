'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Layout,
  Button,
  Form,
  Input,
  Select,
  Card,
  Typography,
  Divider,
  Space,
  message,
  Switch,
  Modal,
  Table,
  Tag,
  Tooltip,
  Empty,
  Dropdown,
  Popconfirm,
  Badge,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  FolderOpenOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  HistoryOutlined,
  SettingOutlined,
  CopyOutlined,
  MoreOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useDatabase } from '@/hooks/useDatabase'
import { 
  TestStep, 
  TestTask, 
  LogEntry, 
  TestStepType, 
  ElementSelector, 
  ExecutionStrategy,
  TestResult,
  ExecutionRecord,
  StepExecutionRecord,
  TaskStatus,
} from '@/types'

const { Header, Content, Sider } = Layout
const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

// 表单值类型
interface FormValues {
  type: TestStepType
  description: string
  selector?: ElementSelector
  strategy?: ExecutionStrategy
  value?: string
}

interface SelectorFormValues {
  id?: string
  className?: string
  text?: string
  containsText?: string
  css?: string
  xpath?: string
  name?: string
  testId?: string
}

// 步骤类型选项
const STEP_TYPES: { value: TestStepType; label: string; icon: string }[] = [
  { value: 'goto', label: '访问页面', icon: '🌐' },
  { value: 'click', label: '点击元素', icon: '🖱️' },
  { value: 'fill', label: '填写表单', icon: '⌨️' },
  { value: 'hover', label: '悬停元素', icon: '👆' },
  { value: 'screenshot', label: '截图', icon: '📸' },
  { value: 'wait', label: '等待', icon: '⏱️' },
  { value: 'scroll', label: '滚动', icon: '📜' },
  { value: 'js', label: 'JS执行', icon: '💻' },
  { value: 'clear', label: '清除状态', icon: '🗑️' },
  { value: 'followGuide', label: '跟随指引', icon: '🎯' },
]

// 策略选项
const STRATEGIES: { value: ExecutionStrategy; label: string; desc: string }[] = [
  { value: 'selector', label: '精确选择器', desc: '使用 id/class/xpath 等精确匹配' },
  { value: 'ai', label: 'AI 识别', desc: '使用 AI 模型智能识别元素' },
  { value: 'auto', label: '自动选择', desc: '优先选择器，失败后尝试 AI（推荐）' },
]

// 状态颜色映射
const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  ready: 'processing',
  running: 'processing',
  completed: 'success',
  failed: 'error',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
}

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
    exportTask,
    exportAllTasks,
  } = useDatabase()

  // 当前状态
  const [selectedTask, setSelectedTask] = useState<TestTask | null>(null)
  const [steps, setSteps] = useState<TestStep[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [useHeadful, setUseHeadful] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [defaultStrategy, setDefaultStrategy] = useState<ExecutionStrategy>('auto')
  const [activeTab, setActiveTab] = useState<'steps' | 'results' | 'history'>('steps')
  
  // 导入单个预设任务（使用 useDatabase 的 importTasks 方法）
  const importPresetTask = useCallback(async (task: TestTask) => {
    try {
      const imported = await importTasks(JSON.stringify(task))
      message.success(`已导入任务：${imported[0]?.name || task.name}`)
      return imported[0]
    } catch (error) {
      message.error('导入预设任务失败')
      throw error
    }
  }, [importTasks])

  // 初始化所有预设任务到 IndexDB
  const initAllPresetTasks = useCallback(async () => {
    try {
      // 从 API 获取预设任务
      const response = await fetch('/api/tasks/init', { method: 'POST' })
      if (!response.ok) throw new Error('获取预设任务失败')
      
      const data = await response.json()
      const tasksToImport: TestTask[] = data.tasks
      
      if (tasksToImport.length > 0) {
        const imported = await importTasks(JSON.stringify(tasksToImport))
        message.success(`成功初始化 ${imported.length} 个预设任务到数据库！`)
      }
    } catch (error) {
      console.error('初始化预设任务失败:', error)
      message.error('初始化失败，请重试')
    }
  }, [importTasks])

  // 加载预设任务列表
  const [presetTasks, setPresetTasks] = useState<TestTask[]>([])
  
  // 支持的预设任务文件列表（按优先级）
  const PRESET_FILES = [
    '/preset-tasks/demo-invoice-task-v5.json',  // 最新优化版
    '/preset-tasks/demo-invoice-task.json',     // 原版
  ]
  
  const loadPresetTasks = useCallback(async () => {
    for (const fileUrl of PRESET_FILES) {
      try {
        const response = await fetch(fileUrl)
        if (response.ok) {
          const data = await response.json()
          const tasks = Array.isArray(data) ? data : [data]
          setPresetTasks(tasks)
          console.log(`[loadPresetTasks] 加载预设任务成功: ${fileUrl} (${tasks.length}个)`)
          return
        }
      } catch (error) {
        continue
      }
    }
    console.warn('[loadPresetTasks] 所有预设任务文件均加载失败')
  }, [])

  useEffect(() => {
    loadPresetTasks()
  }, [loadPresetTasks])

  // 编辑相关状态
  const [editForm] = Form.useForm()
  const [form] = Form.useForm()
  const [selectorForm] = Form.useForm()
  
  // 模态框状态
  const [showSelectorModal, setShowSelectorModal] = useState(false)
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null)
  
  // refs
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // 自动滚动日志
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 清理 EventSource
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // 选择任务时加载步骤
  useEffect(() => {
    if (selectedTask) {
      setSteps(selectedTask.steps || [])
    } else {
      setSteps([])
    }
  }, [selectedTask])

  // 创建新任务
  const handleCreateTask = async (values: { name: string; description?: string }) => {
    try {
      const newTask = await createTask(values.name, values.description)
      setSelectedTask(newTask)
      setShowNewTaskModal(false)
      message.success('任务创建成功')
    } catch (error) {
      message.error('创建任务失败')
    }
  }

  // 选择任务
  const handleSelectTask = (task: TestTask) => {
    setSelectedTask(task)
    setLogs([])
    setActiveTab('steps')
  }

  // 添加步骤
  const addStep = (values: FormValues) => {
    if (!selectedTask) {
      message.warning('请先创建或选择一个任务')
      return
    }

    const newStep: TestStep = {
      id: `step_${Date.now()}`,
      type: values.type,
      description: values.description,
      value: values.value,
      selector: values.selector,
      strategy: values.strategy,
    }
    
    const updatedSteps = [...steps, newStep]
    setSteps(updatedSteps)
    
    // 更新任务
    const updatedTask = { ...selectedTask, steps: updatedSteps }
    updateTask(updatedTask)
    setSelectedTask(updatedTask)
    
    form.resetFields()
  }

  // 删除步骤
  const removeStep = (id: string) => {
    const updatedSteps = steps.filter(s => s.id !== id)
    setSteps(updatedSteps)
    
    if (selectedTask) {
      const updatedTask = { ...selectedTask, steps: updatedSteps }
      updateTask(updatedTask)
      setSelectedTask(updatedTask)
    }
    
    if (editingStepId === id) {
      setEditingStepId(null)
    }
  }

  // 开始编辑步骤
  const startEditStep = (step: TestStep) => {
    setEditingStepId(step.id)
    editForm.setFieldsValue({
      type: step.type,
      description: step.description,
      value: step.value || undefined,
      strategy: step.strategy || defaultStrategy,
    })
    selectorForm.setFieldsValue(step.selector || {})
  }

  // 保存编辑的步骤
  const saveEditedStep = (values: FormValues) => {
    if (!editingStepId || !selectedTask) return

    const updatedSteps = steps.map(step => {
      if (step.id === editingStepId) {
        return {
          ...step,
          type: values.type,
          description: values.description,
          value: values.value,
          selector: values.selector,
          strategy: values.strategy,
        }
      }
      return step
    })

    setSteps(updatedSteps)
    const updatedTask = { ...selectedTask, steps: updatedSteps }
    updateTask(updatedTask)
    setSelectedTask(updatedTask)
    setEditingStepId(null)
    editForm.resetFields()
    selectorForm.resetFields()
  }

  // 取消编辑
  const cancelEdit = () => {
    setEditingStepId(null)
    editForm.resetFields()
    selectorForm.resetFields()
  }

  // 执行测试
  const startTest = async () => {
    if (!selectedTask || steps.length === 0) {
      message.warning('请先选择任务并添加步骤')
      return
    }

    setIsRunning(true)
    setLogs([])
    
    // 更新任务状态
    const runningTask = { ...selectedTask, status: 'running' as const }
    updateTask(runningTask)
    setSelectedTask(runningTask)

    const testId = `test_${Date.now()}`

    try {
      const response = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps,
          useHeadful,
          strategy: defaultStrategy,
        }),
      })

      if (!response.body) {
        throw new Error('无法获取响应流')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      // 收集执行记录
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
              
              // 解析详细执行记录
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
              
              // 检测结束
              if (log.message.includes('完成') || log.level === 'error') {
                // 保存执行结果
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
                  screenshots: executionRecords
                    .filter(r => r.screenshot)
                    .map(r => r.screenshot as string),
                }
                saveResult(result)
                
                // 更新任务状态
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
    } catch (error) {
      console.error('测试执行失败', error)
      message.error('测试执行失败')
    }

    setIsRunning(false)
  }

  // 导入步骤
  const handleImport = async (file: File) => {
    try {
      const content = await file.text()
      const importedSteps: TestStep[] = JSON.parse(content)
      
      if (!Array.isArray(importedSteps) || importedSteps.length === 0) {
        throw new Error('无效的步骤数据格式')
      }

      // 重新生成 ID
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
    } catch (error) {
      message.error('导入失败：文件格式不正确或数据损坏')
    }
  }

  // 导出步骤
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

  // 查看执行结果
  const handleViewResult = (result: TestResult) => {
    setSelectedResult(result)
    setShowResultModal(true)
  }

  // 获取步骤类型标签
  const getStepTypeLabel = (type: TestStepType) => {
    const found = STEP_TYPES.find(t => t.value === type)
    return found ? `${found.icon} ${found.label}` : type
  }

  // 任务列表列定义
  const taskColumns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: TestTask) => (
        <Space>
          <Text strong>{name}</Text>
          {record.description && (
            <Tooltip title={record.description}>
              <InfoCircleOutlined style={{ color: '#999' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '步骤数',
      dataIndex: 'steps',
      key: 'steps',
      width: 80,
      render: (steps: TestStep[]) => steps?.length || 0,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>
          {STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: '最近结果',
      key: 'latestResult',
      width: 100,
      render: (_: unknown, record: TestTask) => {
        const result = getLatestResult(record.id)
        if (!result) return <Text type="secondary">无</Text>
        return (
          <Tag color={result.status === 'success' ? 'success' : 'error'}>
            {result.status === 'success' ? '通过' : '失败'}
          </Tag>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: TestTask) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<PlayCircleOutlined />}
            onClick={() => handleSelectTask(record)}
            disabled={record.status === 'running'}
          >
            选择
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => {
              const result = getLatestResult(record.id)
              if (result) handleViewResult(result)
              else message.info('暂无执行结果')
            }}
          >
            历史
          </Button>
          <Popconfirm
            title="确定删除此任务？"
            onConfirm={() => deleteTask(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 任务统计
  const taskStats = {
    total: tasks.length,
    draft: tasks.filter(t => t.status === 'draft').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 头部 */}
      <Header style={{ 
        background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)', 
        padding: '0 24px', 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          🤖 Stagehand 企业级自动化测试平台
        </Title>
        <Space>
          <Button 
            icon={<PlusOutlined />} 
            type="primary"
            onClick={() => setShowNewTaskModal(true)}
          >
            新建任务
          </Button>
          <Dropdown
            menu={{
              items: presetTasks.map((task, index) => ({
                key: task.id,
                label: (
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{task.name}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>{task.description}</div>
                  </div>
                ),
                onClick: () => importPresetTask(task),
              })),
            }}
            trigger={['click']}
          >
            <Button icon={<RocketOutlined />}>
              导入预设任务
            </Button>
          </Dropdown>
          <Button 
            icon={<FolderOpenOutlined />}
            onClick={initAllPresetTasks}
            type="primary"
            style={{ background: '#722ed1' }}
          >
            初始化全部任务到数据库
          </Button>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={() => {
              const dataStr = exportAllTasks()
              const blob = new Blob([dataStr], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `all-tasks-${new Date().toISOString().split('T')[0]}.json`
              link.click()
            }}
            disabled={tasks.length === 0}
          >
            导出全部
          </Button>
        </Space>
      </Header>

      <Layout>
        {/* 左侧任务列表 */}
        <Sider width={400} style={{ background: '#fff', padding: '16px', borderRight: '1px solid #f0f0f0' }}>
          {/* 统计卡片 */}
          <Row gutter={8} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card size="small">
                <Statistic 
                  title="总任务" 
                  value={taskStats.total} 
                  prefix={<FolderOpenOutlined />}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic 
                  title="已完成" 
                  value={taskStats.completed} 
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* 任务列表 */}
          <Title level={5}>测试任务列表</Title>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}>加载中...</div>
          ) : tasks.length === 0 ? (
            <Empty 
              description="暂无任务" 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={() => setShowNewTaskModal(true)}>
                创建第一个任务
              </Button>
            </Empty>
          ) : (
            <Table
              dataSource={tasks}
              columns={taskColumns}
              rowKey="id"
              size="small"
              pagination={false}
              rowClassName={(record) => 
                selectedTask?.id === record.id ? 'ant-table-row-selected' : ''
              }
              style={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}
            />
          )}
        </Sider>

        {/* 中间步骤配置 */}
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
              {/* 标签页 */}
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
                  {/* 配置区域 */}
                  <div style={{ 
                    padding: 16, 
                    background: '#fafafa', 
                    borderRadius: 8, 
                    marginBottom: 16 
                  }}>
                    {/* 浏览器和策略配置 */}
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={12}>
                        <Space>
                          <Text>浏览器:</Text>
                          <Switch 
                            checked={useHeadful} 
                            onChange={setUseHeadful}
                            checkedChildren="有头"
                            unCheckedChildren="无头"
                          />
                        </Space>
                      </Col>
                      <Col span={12}>
                        <Space>
                          <Text>执行策略:</Text>
                          <Select 
                            value={defaultStrategy} 
                            onChange={setDefaultStrategy}
                            style={{ width: 150 }}
                          >
                            {STRATEGIES.map(s => (
                              <Option key={s.value} value={s.value}>
                                {s.label}
                              </Option>
                            ))}
                          </Select>
                        </Space>
                      </Col>
                    </Row>

                    <Divider style={{ margin: '12px 0' }} />

                    {/* 编辑表单 */}
                    {editingStepId ? (
                      <Form form={editForm} layout="vertical" onFinish={saveEditedStep}>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name="type" label="操作类型" rules={[{ required: true }]}>
                              <Select placeholder="选择操作">
                                {STEP_TYPES.map(t => (
                                  <Option key={t.value} value={t.value}>{t.label}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={16}>
                            <Form.Item 
                              name="description" 
                              label="操作描述" 
                              rules={[{ required: true }]}
                            >
                              <Input placeholder="描述要执行的操作" />
                            </Form.Item>
                          </Col>
                        </Row>
                        
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="value" label="值 (URL/输入内容)">
                              <Input placeholder="根据操作类型填写" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="strategy" label="执行策略">
                              <Select>
                                {STRATEGIES.map(s => (
                                  <Option key={s.value} value={s.value}>{s.label}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>

                        <Space>
                          <Button type="primary" icon={<SaveOutlined />} htmlType="submit">
                            保存
                          </Button>
                          <Button icon={<CloseOutlined />} onClick={cancelEdit}>
                            取消
                          </Button>
                        </Space>
                      </Form>
                    ) : (
                      <Form form={form} layout="vertical" onFinish={addStep}>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name="type" label="操作类型" rules={[{ required: true }]}>
                              <Select placeholder="选择操作">
                                {STEP_TYPES.map(t => (
                                  <Option key={t.value} value={t.value}>{t.label}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={16}>
                            <Form.Item 
                              name="description" 
                              label="操作描述 (AI 识别依据)" 
                              rules={[{ required: true }]}
                            >
                              <Input placeholder="描述要执行的操作，越精准越好" />
                            </Form.Item>
                          </Col>
                        </Row>
                        
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="value" label="值 (URL/输入内容/等待毫秒)">
                              <Input placeholder="根据操作类型填写" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="strategy" label="执行策略">
                              <Select defaultValue="auto">
                                {STRATEGIES.map(s => (
                                  <Option key={s.value} value={s.value}>{s.label}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>

                        <Button type="dashed" icon={<PlusOutlined />} htmlType="submit" block>
                          添加步骤
                        </Button>
                      </Form>
                    )}
                  </div>

                  {/* 步骤列表 */}
                  <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    {steps.length === 0 ? (
                      <Empty description="暂无步骤，请添加测试步骤" />
                    ) : (
                      steps.map((item, index) => (
                        <Card
                          key={item.id}
                          size="small"
                          style={{ 
                            marginBottom: 8,
                            borderLeft: `3px solid ${
                              item.type === 'goto' ? '#1890ff' :
                              item.type === 'click' ? '#52c41a' :
                              item.type === 'fill' ? '#faad14' : '#999'
                            }`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space>
                              <Text type="secondary">{index + 1}.</Text>
                              <Tag>{getStepTypeLabel(item.type)}</Tag>
                              <Text>{item.description}</Text>
                              {item.value && (
                                <Text type="secondary">→ {item.value}</Text>
                              )}
                              {item.selector && (
                                <Tag color="purple">选择器</Tag>
                              )}
                            </Space>
                            <Space>
                              <Tooltip title="编辑">
                                <Button 
                                  type="text" 
                                  size="small" 
                                  icon={<EditOutlined />}
                                  onClick={() => startEditStep(item)}
                                  disabled={isRunning}
                                />
                              </Tooltip>
                              <Tooltip title="删除">
                                <Button 
                                  type="text" 
                                  size="small" 
                                  danger 
                                  icon={<DeleteOutlined />}
                                  onClick={() => removeStep(item.id)}
                                  disabled={isRunning}
                                />
                              </Tooltip>
                            </Space>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>

                  {/* 导入导出 */}
                  <Divider />
                  <Space>
                    <Button 
                      icon={<DownloadOutlined />} 
                      onClick={handleExport}
                      disabled={steps.length === 0}
                    >
                      导出步骤
                    </Button>
                    <UploadOutlined>
                      <label style={{ marginLeft: 8, cursor: 'pointer' }}>
                        <input
                          type="file"
                          accept=".json"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleImport(file)
                          }}
                        />
                        <Button icon={<UploadOutlined />}>
                          导入步骤
                        </Button>
                      </label>
                    </UploadOutlined>
                  </Space>
                </>
              )}

              {activeTab === 'results' && (
                <div>
                  {(() => {
                    const taskResults = results.get(selectedTask.id) || []
                    return taskResults.length === 0 ? (
                      <Empty description="暂无执行结果" />
                    ) : (
                      taskResults.map(result => (
                        <Card
                          key={result.id}
                          size="small"
                          style={{ marginBottom: 8 }}
                          onClick={() => handleViewResult(result)}
                        >
                          <Space>
                            <Tag color={result.status === 'success' ? 'success' : 'error'}>
                              {result.status === 'success' ? '通过' : '失败'}
                            </Tag>
                            <Text>
                              {new Date(result.executedAt).toLocaleString()}
                            </Text>
                            <Text type="secondary">
                              {result.passedSteps}/{result.totalSteps} 步骤
                            </Text>
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
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="请从左侧选择一个任务或创建新任务"
              >
                <Button type="primary" onClick={() => setShowNewTaskModal(true)}>
                  创建新任务
                </Button>
              </Empty>
            </Card>
          )}
        </Content>

        {/* 右侧日志 */}
        <Sider width={450} style={{ background: '#fff', padding: '16px', borderLeft: '1px solid #f0f0f0' }}>
          <Card 
            title={
              <Space>
                <ThunderboltOutlined />
                <span>执行日志</span>
                {isRunning && <Badge status="processing" text="运行中" />}
              </Space>
            }
            extra={
              logs.length > 0 && (
                <Button 
                  type="text" 
                  size="small"
                  onClick={() => setLogs([])}
                >
                  清空
                </Button>
              )
            }
          >
            <div
              style={{
                height: 'calc(100vh - 200px)',
                overflowY: 'auto',
                background: '#1e1e1e',
                padding: '16px',
                borderRadius: '8px',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '13px',
              }}
            >
              {logs.length === 0 ? (
                <Text type="secondary" style={{ fontFamily: 'inherit' }}>
                  等待开始测试...
                </Text>
              ) : (
                logs.map((log, index) => (
                  <div key={index} style={{ marginBottom: '8px' }}>
                    <Text type="secondary" style={{ marginRight: '8px', fontFamily: 'inherit' }}>
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </Text>
                    {log.level === 'info' && <InfoCircleOutlined style={{ color: '#1890ff', marginRight: '4px' }} />}
                    {log.level === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: '4px' }} />}
                    {log.level === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: '4px' }} />}
                    <Text
                      style={{
                        color: log.level === 'success' ? '#52c41a' : 
                               log.level === 'error' ? '#ff4d4f' : '#fff',
                        fontFamily: 'inherit',
                      }}
                    >
                      {log.message}
                    </Text>
                    {log.screenshot && (
                      <div style={{ marginTop: '8px' }}>
                        <img 
                          src={log.screenshot} 
                          alt="截图" 
                          style={{ 
                            maxWidth: '100%', 
                            borderRadius: '4px',
                            border: '1px solid #333',
                          }} 
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </Card>
        </Sider>
      </Layout>

      {/* 新建任务模态框 */}
      <Modal
        title="创建新测试任务"
        open={showNewTaskModal}
        onCancel={() => setShowNewTaskModal(false)}
        footer={null}
      >
        <Form onFinish={handleCreateTask} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="例如：百度搜索测试" />
          </Form.Item>
          <Form.Item name="description" label="任务描述（可选）">
            <TextArea rows={3} placeholder="描述此测试任务的用途..." />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setShowNewTaskModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 执行结果详情模态框 */}
      <Modal
        title="执行结果详情"
        open={showResultModal}
        onCancel={() => setShowResultModal(false)}
        footer={null}
        width={800}
      >
        {selectedResult && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic 
                  title="状态" 
                  value={selectedResult.status === 'success' ? '通过' : '失败'}
                  valueStyle={{ color: selectedResult.status === 'success' ? '#52c41a' : '#ff4d4f' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="执行时间" 
                  value={new Date(selectedResult.executedAt).toLocaleString()} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="通过率" 
                  value={`${Math.round(selectedResult.passedSteps / selectedResult.totalSteps * 100)}%`} 
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="步骤数" 
                  value={`${selectedResult.passedSteps}/${selectedResult.totalSteps}`} 
                />
              </Col>
            </Row>

            <Divider>执行记录</Divider>
            
            {selectedResult.executionRecords?.map((record, index) => (
              <Card key={record.id} size="small" style={{ marginBottom: 8 }}>
                <Space>
                  {record.status === 'success' ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <Text>{record.message}</Text>
                </Space>
                {record.screenshot && (
                  <div style={{ marginTop: 8 }}>
                    <img 
                      src={record.screenshot} 
                      alt="步骤截图" 
                      style={{ maxWidth: '100%', borderRadius: 4 }} 
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Modal>
    </Layout>
  )
}
