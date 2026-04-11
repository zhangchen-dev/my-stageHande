'use client'

import { useState, useRef, useEffect } from 'react'
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
  Upload as AntUpload,
  UploadFile,
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
} from '@ant-design/icons'
import { TestStep, LogEntry, TestStepType } from '@/types'

// 添加类型定义
interface FormValues {
  type: TestStepType;
  description: string;
  selector?: string;
  value?: string;
}

const { Header, Content, Sider } = Layout
const { Title, Text } = Typography
const { Option } = Select

export default function TestConsole() {
  const [steps, setSteps] = useState<TestStep[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [useHeadful, setUseHeadful] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [editForm] = Form.useForm()
  const [form] = Form.useForm()
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // 自动滚动日志到底部
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

  // 添加测试步骤
  const addStep = (values: FormValues) => {
    const newStep: TestStep = {
      id: Date.now().toString(),
      type: values.type,
      description: values.description,
      value: values.value,
      selector: values.selector,
    }
    setSteps([...steps, newStep])
    form.resetFields()
  }

  // 删除步骤
  const removeStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id))
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
      selector: step.selector || undefined,
      value: step.value || undefined,
    })
  }

  // 保存编辑的步骤
  const saveEditedStep = (values: FormValues) => {
    if (!editingStepId) return
    
    setSteps(steps.map(step => 
      step.id === editingStepId 
        ? { ...step, ...values }
        : step
    ))
    setEditingStepId(null)
    editForm.resetFields()
  }

  // 取消编辑
  const cancelEdit = () => {
    setEditingStepId(null)
    editForm.resetFields()
  }

  // 导出步骤为JSON
  const exportSteps = () => {
    if (steps.length === 0) {
      message.warning('没有可导出的步骤')
      return
    }
    
    const dataStr = JSON.stringify(steps, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `test-steps-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    message.success('步骤已导出成功！')
  }

  // 开始执行测试
  const startTest = async () => {
    if (steps.length === 0) return
    setIsRunning(true)
    setLogs([])

    // 1. 发送 POST 请求初始化测试，包含有头浏览器配置
    const response = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        steps,
        useHeadful, // 传递有头浏览器配置
      }),
    })

    if (!response.body) return

    // 2. 用 ReadableStream 接收 SSE 日志（兼容性更好）
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n').filter((line) => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const log = JSON.parse(line.slice(6)) as LogEntry
            setLogs((prev) => [...prev, log])
            
            // 检测结束
            if (log.message.includes('全部通过') || log.level === 'error') {
              setIsRunning(false)
            }
          }
        }
      }
    } catch (error) {
      console.error('日志接收失败', error)
      setIsRunning(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#001529', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
        <Title level={3} style={{ color: 'white', margin: 0, lineHeight: '64px' }}>
          🤖 Stagehand 企业级自动化测试平台
        </Title>
      </Header>

      <Layout>
        {/* 左侧：测试步骤配置 */}
        <Sider width={420} style={{ background: '#fff', padding: '20px', borderRight: '1px solid #f0f0f0' }}>
          <Title level={4}>
            {editingStepId ? '编辑测试步骤' : '1. 测试步骤编排'}
          </Title>
          
          {/* 有头浏览器配置 */}
          {!editingStepId && (
            <div style={{ marginBottom: '20px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <Space>
                <Switch 
                  checked={useHeadful} 
                  onChange={setUseHeadful}
                  checkedChildren="有头"
                  unCheckedChildren="无头"
                />
                <span>浏览器模式: {useHeadful ? '有头（显示浏览器）' : '无头（后台运行）'}</span>
              </Space>
              <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                启用有头模式可在测试时看到浏览器操作过程
              </Text>
            </div>
          )}
          
          {/* 编辑表单 */}
          {editingStepId ? (
            <Form form={editForm} layout="vertical" onFinish={saveEditedStep}>
              <Form.Item name="type" label="操作类型" rules={[{ required: true }]}>
                <Select placeholder="选择操作类型">
                  <Option value="goto">访问页面 (Goto)</Option>
                  <Option value="click">点击元素 (Click)</Option>
                  <Option value="fill">填写表单 (Fill)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="description"
                label="操作描述（AI 识别依据，越精准越好）"
                rules={[{ required: true }]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder="例如：点击页面右上角红色的「登录」按钮"
                />
              </Form.Item>

              <Form.Item name="selector" label="元素选择器（可选，稳定元素优先）">
                <Input placeholder="例如：#login-btn 或 .submit-button" />
              </Form.Item>

              <Form.Item name="value" label="值（URL / 输入内容）">
                <Input placeholder="例如：https://www.baidu.com 或 用户名" />
              </Form.Item>

              <Space>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit">
                  保存修改
                </Button>
                <Button icon={<CloseOutlined />} onClick={cancelEdit}>
                  取消
                </Button>
              </Space>
            </Form>
          ) : (
            /* 添加步骤表单 */
            <Form form={form} layout="vertical" onFinish={addStep}>
              <Form.Item name="type" label="操作类型" rules={[{ required: true }]}>
                <Select placeholder="选择操作类型">
                  <Option value="goto">访问页面 (Goto)</Option>
                  <Option value="click">点击元素 (Click)</Option>
                  <Option value="fill">填写表单 (Fill)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="description"
                label="操作描述（AI 识别依据，越精准越好）"
                rules={[{ required: true }]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder="例如：点击页面右上角红色的「登录」按钮"
                />
              </Form.Item>

              <Form.Item name="selector" label="元素选择器（可选，稳定元素优先）">
                <Input placeholder="例如：#login-btn 或 .submit-button" />
              </Form.Item>

              <Form.Item name="value" label="值（URL / 输入内容）">
                <Input placeholder="例如：https://www.baidu.com 或 用户名" />
              </Form.Item>

              <Button type="dashed" icon={<PlusOutlined />} htmlType="submit" block>
                添加步骤
              </Button>
            </Form>
          )}

          <Divider />

          {/* 步骤列表 */}
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {steps.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <Space>
                  <Text strong>[{item.type}]</Text>
                  <Text ellipsis style={{ maxWidth: 280 }}>
                    {item.description}
                  </Text>
                </Space>
                <Space>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => startEditStep(item)}
                    disabled={isRunning}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeStep(item.id)}
                    disabled={isRunning}
                  />
                </Space>
              </div>
            ))}
          </div>

          <Divider />

          {/* 导出/导入按钮 */}
          {!editingStepId && (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="default"
                icon={<DownloadOutlined />}
                block
                onClick={exportSteps}
                disabled={steps.length === 0}
              >
                导出步骤为JSON
              </Button>
              
              {/* 使用 Ant Design Upload 组件修复导入功能 */}
              <AntUpload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file: UploadFile) => {
                  if (file instanceof File) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const content = event.target?.result as string;
                        const importedSteps: TestStep[] = JSON.parse(content);
                        
                        if (!Array.isArray(importedSteps) || importedSteps.length === 0) {
                          throw new Error('无效的步骤数据格式');
                        }
                        
                        // 验证每个步骤是否符合TestStep结构
                        const validatedSteps = importedSteps.map(step => {
                          if (!step.id || !step.type || !step.description) {
                            throw new Error('步骤数据缺少必要字段');
                          }
                          return {
                            ...step,
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                          };
                        });
                        
                        setSteps(validatedSteps);
                        message.success(`成功导入 ${validatedSteps.length} 个步骤`);
                      } catch (error) {
                        console.error('导入步骤失败:', error);
                        message.error('导入失败：文件格式不正确或数据损坏');
                      }
                    };
                    reader.readAsText(file);
                  }
                  
                  // 阻止自动上传
                  return false;
                }}
              >
                <Button
                  type="default"
                  icon={<UploadOutlined />}
                  block
                  disabled={isRunning}
                >
                  导入步骤JSON
                </Button>
              </AntUpload>
            </Space>
          )}
        </Sider>

        {/* 右侧：实时日志与结果 */}
        <Content style={{ padding: '24px', background: '#f5f5f5' }}>
          <Card title="2. 执行日志与结果" style={{ height: '100%' }}>
            <div
              style={{
                height: '70vh',
                overflowY: 'auto',
                background: '#141414',
                padding: '20px',
                borderRadius: '8px',
                fontFamily: 'Consolas, Monaco, monospace',
              }}
            >
              {logs.length === 0 && (
                <Text type="secondary">等待开始测试，请先在左侧配置测试步骤...</Text>
              )}

              {logs.map((log, index) => (
                <div key={index} style={{ marginBottom: '12px' }}>
                  {/* 时间戳 */}
                  <Text type="secondary" style={{ fontSize: '12px', marginRight: '12px' }}>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </Text>

                  {/* 图标 */}
                  {log.level === 'info' && <InfoCircleOutlined style={{ color: '#1890ff', marginRight: '8px' }} />}
                  {log.level === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: '8px' }} />}
                  {log.level === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: '8px' }} />}

                  {/* 日志内容 */}
                  <Text
                    style={{
                      color:
                        log.level === 'success'
                          ? '#52c41a'
                          : log.level === 'error'
                          ? '#ff4d4f'
                          : '#ffffff',
                    }}
                  >
                    {log.message}
                  </Text>

                  {/* 失败截图 */}
                  {log.screenshot && (
                    <div style={{ marginTop: '12px', border: '1px solid #333', padding: '8px', display: 'inline-block' }}>
                      <img
                        src={log.screenshot}
                        alt="失败截图"
                        style={{ maxWidth: '400px', borderRadius: '4px' }}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}