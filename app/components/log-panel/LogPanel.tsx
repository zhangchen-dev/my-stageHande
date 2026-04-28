'use client'

import { useRef, useEffect, useMemo } from 'react'
import { Card, Typography, Badge, Button, Space, Alert, Tabs } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  StopOutlined,
  ClearOutlined,
} from '@ant-design/icons'
import { LogEntry, TaskLogInfo, BatchTaskStatusType } from '@/types'

const { Text } = Typography

interface LogPanelProps {
  logs: LogEntry[]
  isRunning: boolean
  onClear: () => void
  onStop?: () => void
  taskName?: string
  taskLogs?: Map<string, TaskLogInfo>
  activeTaskId?: string | null
  onTabChange?: (taskId: string) => void
  onClearTaskLog?: (taskId: string) => void
}

function StatusBadge({ status }: { status: BatchTaskStatusType }) {
  const statusMap: Record<BatchTaskStatusType, { status: 'success' | 'processing' | 'error' | 'warning' | 'default'; text: string }> = {
    running: { status: 'processing', text: '运行中' },
    success: { status: 'success', text: '成功' },
    failed: { status: 'error', text: '失败' },
    aborted: { status: 'warning', text: '已中止' },
    pending: { status: 'default', text: '等待中' },
  }
  const config = statusMap[status] || statusMap.pending
  return <Badge status={config.status} />
}

export default function LogPanel({
  logs,
  isRunning,
  onClear,
  onStop,
  taskName,
  taskLogs,
  activeTaskId,
  onTabChange,
  onClearTaskLog,
}: LogPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const hasMultipleTasks = taskLogs && taskLogs.size > 1

  const renderLogList = (logList: LogEntry[]) => (
    <div
      style={{
        height: hasMultipleTasks ? 'calc(100vh - 340px)' : 'calc(100vh - 280px)',
        overflowY: 'auto',
        background: '#1e1e1e',
        padding: '16px',
        borderRadius: '8px',
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '13px',
      }}
    >
      {logList.length === 0 ? (
        <Text type="secondary" style={{ fontFamily: 'inherit' }}>
          {isRunning ? '等待执行...' : '选择一个任务开始执行，或编辑任务配置步骤'}
        </Text>
      ) : (
        logList.map((log, index) => (
          <div key={index} style={{ marginBottom: '8px' }}>
            <Text type="secondary" style={{ marginRight: '8px', fontFamily: 'inherit' }}>
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </Text>
            {log.level === 'info' && <InfoCircleOutlined style={{ color: '#1890ff', marginRight: '4px' }} />}
            {log.level === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: '4px' }} />}
            {log.level === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: '4px' }} />}
            <Text
              style={{
                color: log.level === 'success' ? '#52c41a' : log.level === 'error' ? '#ff4d4f' : '#fff',
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
                  style={{ maxWidth: '100%', borderRadius: '4px', border: '1px solid #333' }}
                />
              </div>
            )}
          </div>
        ))
      )}
      <div ref={logsEndRef} />
    </div>
  )

  if (hasMultipleTasks && taskLogs) {
    const tabItems = Array.from(taskLogs.entries()).map(([taskId, info]) => ({
      key: taskId,
      label: (
        <span>
          {info.taskName}
          <span style={{ marginLeft: 6 }}>
            <StatusBadge status={info.status} />
          </span>
        </span>
      ),
      children: (
        <div>
          {renderLogList(info.logs)}
          {onClearTaskLog && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={() => onClearTaskLog(taskId)}
              >
                清空该任务日志
              </Button>
            </div>
          )}
        </div>
      ),
    }))

    return (
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <span>执行日志</span>
            {isRunning && <Badge status="processing" text="运行中" />}
          </Space>
        }
        extra={
          <Space>
            {isRunning && onStop && (
              <Button
                type="primary"
                danger
                size="small"
                icon={<StopOutlined />}
                onClick={onStop}
              >
                终止全部
              </Button>
            )}
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={onClear}
            >
              清空全部
            </Button>
          </Space>
        }
        style={{ height: '100%' }}
      >
        <Tabs
          activeKey={activeTaskId || undefined}
          onChange={onTabChange}
          items={tabItems}
          tabBarExtraContent={
            <Text type="secondary">共 {taskLogs.size} 个任务</Text>
          }
        />
      </Card>
    )
  }

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          <span>执行日志</span>
          {isRunning && <Badge status="processing" text="运行中" />}
        </Space>
      }
      extra={
        <Space>
          {isRunning && onStop && (
            <Button
              type="primary"
              danger
              size="small"
              icon={<StopOutlined />}
              onClick={onStop}
            >
              终止执行
            </Button>
          )}
          {logs.length > 0 && (
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={onClear}
            >
              清空
            </Button>
          )}
        </Space>
      }
      style={{ height: '100%' }}
    >
      {isRunning && taskName && (
        <Alert
          message={`正在执行: ${taskName}`}
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      {renderLogList(logs)}
    </Card>
  )
}
