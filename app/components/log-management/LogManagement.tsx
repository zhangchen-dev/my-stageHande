'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Space, DatePicker, Modal, Typography, Tag, Empty, message, Input, Popconfirm, Spin } from 'antd'
import { DeleteOutlined, EyeOutlined, SearchOutlined, ClearOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Text, Paragraph } = Typography
const { RangePicker } = DatePicker

interface LogEntry {
  timestamp: string
  level: string
  message: string
  details?: any
}

interface ExecutionLog {
  id: string
  taskId: string
  taskName: string
  status: 'running' | 'success' | 'error' | 'aborted'
  startTime: string
  endTime?: string
  duration?: number
  stepsCount: number
  successSteps: number
  logs: LogEntry[]
  createdAt: string
}

interface LogManagementProps {
  visible: boolean
  onClose: () => void
}

export default function LogManagement({ visible, onClose }: LogManagementProps) {
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<ExecutionLog[]>([])
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [searchText, setSearchText] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.set('startDate', dateRange[0].startOf('day').toISOString())
        params.set('endDate', dateRange[1].endOf('day').toISOString())
      }

      const response = await fetch(`/api/logs?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setLogs(data.logs)
      } else {
        message.error(data.error || '加载日志失败')
        setLogs([])
      }
    } catch (error) {
      console.error('加载日志失败:', error)
      message.error('加载日志失败')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    if (visible) {
      loadLogs()
    }
  }, [visible, loadLogs])

  useEffect(() => {
    let result = [...logs]

    if (searchText) {
      const search = searchText.toLowerCase()
      result = result.filter(log => 
        log.taskName.toLowerCase().includes(search) ||
        log.taskId.toLowerCase().includes(search) ||
        log.status.toLowerCase().includes(search)
      )
    }

    setFilteredLogs(result)
  }, [logs, searchText])

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/logs?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      
      if (data.success) {
        message.success('日志已删除')
        loadLogs()
      } else {
        message.error(data.error || '删除失败')
      }
    } catch (error) {
      console.error('删除日志失败:', error)
      message.error('删除日志失败')
    }
  }

  const handleClearAll = async () => {
    try {
      const response = await fetch('/api/logs?clearAll=true', { method: 'DELETE' })
      const data = await response.json()
      
      if (data.success) {
        message.success('所有日志已清除')
        setLogs([])
        setFilteredLogs([])
      } else {
        message.error(data.error || '清除失败')
      }
    } catch (error) {
      console.error('清除日志失败:', error)
      message.error('清除日志失败')
    }
  }

  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      running: 'processing',
      success: 'success',
      error: 'error',
      aborted: 'warning',
    }
    const labels: Record<string, string> = {
      running: '运行中',
      success: '成功',
      error: '失败',
      aborted: '已终止',
    }
    return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      ellipsis: true,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '任务ID',
      dataIndex: 'taskId',
      key: 'taskId',
      width: 120,
      ellipsis: true,
      render: (text: string) => <Text copyable style={{ fontSize: 12 }}>{text.slice(0, 12)}...</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 100,
      render: (_: any, record: ExecutionLog) => 
        record.duration ? `${Math.round(record.duration / 1000)}s` : '-',
    },
    {
      title: '步骤',
      key: 'steps',
      width: 100,
      render: (_: any, record: ExecutionLog) => 
        `${record.successSteps}/${record.stepsCount}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: ExecutionLog) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => setSelectedLog(record)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定要删除这条日志吗？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Modal
      title="执行日志管理"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      styles={{ body: { padding: '24px' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input
            placeholder="搜索任务名称/ID/状态"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
            placeholder={['开始日期', '结束日期']}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={loadLogs}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            icon={<ClearOutlined />}
            onClick={() => {
              setDateRange(null)
              setSearchText('')
            }}
          >
            清除筛选
          </Button>
          <Popconfirm
            title="确定要清除所有日志吗？此操作不可恢复！"
            onConfirm={handleClearAll}
          >
            <Button danger>清除全部</Button>
          </Popconfirm>
        </div>

        <Card size="small">
          <Spin spinning={loading}>
            <Table
              columns={columns}
              dataSource={filteredLogs}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showTotal: (total) => `共 ${total} 条日志`,
                showSizeChanger: true,
              }}
              locale={{ emptyText: <Empty description="暂无执行日志" /> }}
            />
          </Spin>
        </Card>
      </div>

      <Modal
        title={`日志详情 - ${selectedLog?.taskName || ''}`}
        open={!!selectedLog}
        onCancel={() => setSelectedLog(null)}
        footer={null}
        width={800}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <Card size="small" title="基本信息">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                <div><Text strong>任务ID：</Text><Text copyable>{selectedLog.taskId}</Text></div>
                <div><Text strong>状态：</Text>{getStatusTag(selectedLog.status)}</div>
                <div><Text strong>开始时间：</Text>{dayjs(selectedLog.startTime).format('YYYY-MM-DD HH:mm:ss')}</div>
                {selectedLog.endTime && (
                  <div><Text strong>结束时间：</Text>{dayjs(selectedLog.endTime).format('YYYY-MM-DD HH:mm:ss')}</div>
                )}
                {selectedLog.duration && (
                  <div><Text strong>总耗时：</Text>{Math.round(selectedLog.duration / 1000)} 秒</div>
                )}
                <div><Text strong>步骤统计：</Text>{selectedLog.successSteps}/{selectedLog.stepsCount} 成功</div>
              </div>
            </Card>

            <Card size="small" title={`执行日志 (${selectedLog.logs.length})`}>
              <div style={{ maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
                {selectedLog.logs.map((log, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '4px 8px',
                      borderBottom: '1px solid #f0f0f0',
                      background: log.level === 'error' ? '#fff2f0' : 
                                 log.level === 'warning' ? '#fffbe6' :
                                 log.level === 'success' ? '#f6ffed' : 'transparent',
                    }}
                  >
                    <span style={{ color: '#999', marginRight: 8 }}>
                      [{dayjs(log.timestamp).format('HH:mm:ss')}]
                    </span>
                    <Tag 
                      color={
                        log.level === 'error' ? 'red' :
                        log.level === 'warning' ? 'orange' :
                        log.level === 'success' ? 'green' : 'blue'
                      }
                      style={{ fontSize: 11, marginRight: 8 }}
                    >
                      {log.level.toUpperCase()}
                    </Tag>
                    <span>{log.message}</span>
                    {log.details && (
                      <pre style={{ margin: '4px 0 0 0', color: '#666', fontSize: 11 }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </Modal>
    </Modal>
  )
}
