'use client'

import { Modal, Form, Input, Select, Button, Space, Tabs, Empty, List, Typography, message } from 'antd'
import { TestTask, TestStep } from '@/types'
import { generateId } from '@/app/utils/step-helpers'

const { TextArea } = Input
const { Text } = Typography

interface NewTaskModalProps {
  open: boolean
  taskTemplates: TestTask[]
  onClose: () => void
  onCreateTask: (name: string, description?: string, steps?: TestStep[], tags?: string[]) => Promise<TestTask>
  onTaskCreated: (task: TestTask) => void
  onDeleteTemplate: (templateId: string) => void
}

export default function NewTaskModal({
  open,
  taskTemplates,
  onClose,
  onCreateTask,
  onTaskCreated,
  onDeleteTemplate,
}: NewTaskModalProps) {
  const [form] = Form.useForm()

  const handleCreate = async (values: { name: string; description?: string; tags?: string[] }) => {
    try {
      const task = await onCreateTask(values.name, values.description, undefined, values.tags)
      onTaskCreated(task)
      form.resetFields()
    } catch {
      message.error('创建任务失败')
    }
  }

  return (
    <Modal title="创建新测试任务" open={open} onCancel={onClose} footer={null} width={600}>
      <Tabs defaultActiveKey="new">
        <Tabs.TabPane tab="新建任务" key="new">
          <Form form={form} onFinish={handleCreate} layout="vertical">
            <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
              <Input placeholder="例如：百度搜索测试" />
            </Form.Item>
            <Form.Item name="description" label="任务描述（可选）">
              <TextArea rows={3} placeholder="描述此测试任务的用途..." />
            </Form.Item>
            <Form.Item name="tags" label="任务标签（可选）">
              <Select mode="tags" placeholder="请输入标签，按回车添加" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">创建</Button>
                <Button onClick={onClose}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Tabs.TabPane>
        <Tabs.TabPane tab="从模板创建" key="template">
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {taskTemplates.length === 0 ? (
              <Empty description="暂无保存的模板" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button type="primary" onClick={onClose}>先创建任务</Button>
              </Empty>
            ) : (
              <List
                itemLayout="horizontal"
                dataSource={taskTemplates}
                renderItem={(template) => (
                  <List.Item
                    actions={[
                      <Button
                        key="use"
                        type="primary"
                        size="small"
                        onClick={async () => {
                          const task = await onCreateTask(
                            `${template.name} (副本)`,
                            template.description,
                            template.steps,
                            template.tags,
                          )
                          onTaskCreated(task)
                        }}
                      >
                        使用模板
                      </Button>,
                      <Button key="delete" size="small" danger onClick={() => onDeleteTemplate(template.id)}>
                        删除模板
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={template.name}
                      description={
                        <div>
                          <div>{template.description || '无描述'}</div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            步骤数: {template.steps?.length || 0} | 创建时间: {new Date(template.createdAt).toLocaleString()}
                          </div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Modal>
  )
}
