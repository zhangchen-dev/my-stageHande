'use client'

import { Modal, Row, Col, Statistic, Divider, Card, Space, Typography } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { TestResult } from '@/types'

const { Text } = Typography

interface ResultModalProps {
  open: boolean
  result: TestResult | null
  onClose: () => void
}

export default function ResultModal({ open, result, onClose }: ResultModalProps) {
  return (
    <Modal title="执行结果详情" open={open} onCancel={onClose} footer={null} width={800}>
      {result && (
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic
                title="状态"
                value={result.status === 'success' ? '通过' : '失败'}
                valueStyle={{ color: result.status === 'success' ? '#52c41a' : '#ff4d4f' }}
              />
            </Col>
            <Col span={6}>
              <Statistic title="执行时间" value={new Date(result.executedAt).toLocaleString()} />
            </Col>
            <Col span={6}>
              <Statistic
                title="通过率"
                value={`${Math.round((result.passedSteps / result.totalSteps) * 100)}%`}
              />
            </Col>
            <Col span={6}>
              <Statistic title="步骤数" value={`${result.passedSteps}/${result.totalSteps}`} />
            </Col>
          </Row>

          <Divider>执行记录</Divider>

          {result.executionRecords?.map((record) => (
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
                  <img src={record.screenshot} alt="步骤截图" style={{ maxWidth: '100%', borderRadius: 4 }} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </Modal>
  )
}
