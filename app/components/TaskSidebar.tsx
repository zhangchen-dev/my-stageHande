'use client'

import {
  Button,
  Card,
  Typography,
  Space,
  message,
  Table,
  Tag,
  Tooltip,
  Empty,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Dropdown,
} from 'antd'
import {
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  FolderOpenOutlined,
  RocketOutlined,
  HistoryOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { TestTask, TestResult } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/app/constants'

const { Text } = Typography

interface TaskSidebarProps {
  tasks: TestTask[]
  selectedTask: TestTask | null
  isLoading: boolean
  isRunning: boolean
  results: Map<string, TestResult[]>
  presetTasks: TestTask[]
  onSelectTask: (task: TestTask) => void
  onDeleteTask: (id: string) => void
  onSaveAsTemplate: (task: TestTask) => void
  onViewResult: (result: TestResult) => void
  onImportPresetTask: (task: TestTask) => void
  onInitAllPresetTasks: () => void
  onShowNewTaskModal: () => void
  onExportAllTasks: () => void
  getLatestResult: (taskId: string) => TestResult | null
}

export default function TaskSidebar({
  tasks,
  selectedTask,
  isLoading,
  isRunning,
  results,
  presetTasks,
  onSelectTask,
  onDeleteTask,
  onSaveAsTemplate,
  onViewResult,
  onImportPresetTask,
  onInitAllPresetTasks,
  onShowNewTaskModal,
  onExportAllTasks,
  getLatestResult,
}: TaskSidebarProps) {
  const taskStats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }

  const taskColumns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      ellipsis: { showTitle: false },
      render: (name: string, record: TestTask) => (
        <Tooltip placement="topLeft" title={name}>
          <Space size={4}>
            <Text strong style={{ cursor: 'pointer' }}>{name}</Text>
            {record.description && (
              <Tooltip title={record.description}>
                <InfoCircleOutlined style={{ color: '#999', fontSize: 12 }} />
              </Tooltip>
            )}
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '步骤',
      dataIndex: 'steps',
      key: 'steps',
      width: 50,
      align: 'center' as const,
      render: (steps: TestTask['steps']) => steps?.length || 0,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 100,
      ellipsis: { showTitle: false },
      render: (tags: string[]) => {
        if (!tags || tags.length === 0) return <Text type="secondary">-</Text>
        const display = tags.slice(0, 2).map((tag, i) => <Tag key={i} style={{ marginRight: 2 }}>{tag}</Tag>)
        const rest = tags.length > 2 ? (
          <Tooltip title={tags.slice(2).join(', ')}>
            <Tag>+{tags.length - 2}</Tag>
          </Tooltip>
        ) : null
        return <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>{display}{rest}</div>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      align: 'center' as const,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>
          {STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: TestTask) => (
        <Space size={2}>
          <Tooltip title="选中并编辑">
            <Button
              type={selectedTask?.id === record.id ? 'primary' : 'link'}
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={(e) => { e.stopPropagation(); onSelectTask(record) }}
              disabled={record.status === 'running'}
            />
          </Tooltip>
          <Tooltip title="执行结果">
            <Button
              type="link"
              size="small"
              icon={<HistoryOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                const result = getLatestResult(record.id)
                if (result) onViewResult(result)
                else message.info('暂无执行结果')
              }}
            />
          </Tooltip>
          <Tooltip title="保存为模板">
            <Button
              type="link"
              size="small"
              icon={<SaveOutlined />}
              onClick={(e) => { e.stopPropagation(); onSaveAsTemplate(record) }}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除此任务？"
            onConfirm={() => onDeleteTask(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ background: '#fff', padding: '16px', borderRight: '1px solid #f0f0f0', height: '100%', overflowY: 'auto' }}>
      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <Statistic title="总任务" value={taskStats.total} prefix={<FolderOpenOutlined />} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <Statistic title="已完成" value={taskStats.completed} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong>测试任务列表</Text>
        <Space size={4}>
          <Button size="small" icon={<PlusOutlined />} type="primary" onClick={onShowNewTaskModal}>
            新建
          </Button>
          <Dropdown
            menu={{
              items: presetTasks.map((task) => ({
                key: task.id,
                label: (
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{task.name}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>{task.description}</div>
                  </div>
                ),
                onClick: () => onImportPresetTask(task),
              })),
            }}
            trigger={['click']}
          >
            <Button size="small" icon={<RocketOutlined />}>预设</Button>
          </Dropdown>
          <Button size="small" icon={<FolderOpenOutlined />} onClick={onInitAllPresetTasks}>
            初始化
          </Button>
          <Button size="small" onClick={onExportAllTasks} disabled={tasks.length === 0}>
            导出
          </Button>
        </Space>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>加载中...</div>
      ) : tasks.length === 0 ? (
        <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" onClick={onShowNewTaskModal}>创建第一个任务</Button>
        </Empty>
      ) : (
        <Table
          dataSource={tasks}
          columns={taskColumns}
          rowKey="id"
          size="small"
          pagination={false}
          onRow={(record) => ({
            onClick: () => onSelectTask(record),
            style: {
              cursor: 'pointer',
              background: selectedTask?.id === record.id ? '#e6f7ff' : undefined,
            },
          })}
          scroll={{ y: 'calc(100vh - 320px)' }}
        />
      )}
    </div>
  )
}
