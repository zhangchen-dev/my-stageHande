# 多任务并行执行方案

> 创建时间：2026-04-28
> 状态：待确认

## 📋 需求分析

用户需要同时运行多个测试任务，且不影响现有功能。

### 当前架构限制

1. **前端限制**：
   - `runningTaskId` 状态只允许一个任务运行
   - `if (runningTaskId)` 检查阻止多任务启动
   - 日志面板只能显示一个任务的日志

2. **后端限制**：
   - `POST /api/test` 每次创建一个 Stagehand 实例
   - `task-manager.ts` 已支持多任务管理（Map 结构）
   - 但 API 设计为单任务请求

### 现有优势

- `task-manager.ts` 已使用 `Map<string, RunningTask>` 结构，天然支持多任务
- 每个任务有独立的 `testId`，可以独立中止
- SSE 流式响应支持实时日志推送

---

## 🎯 方案设计

### 核心思路

**不修改现有 API，新增批量执行 API**，保持向后兼容。

### 架构变更

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (page.tsx)                       │
├─────────────────────────────────────────────────────────────┤
│  现有功能：单任务执行 (保持不变)                               │
│  新增功能：多任务并行执行                                     │
│    - runningTasks: Map<taskId, TaskStatus>                  │
│    - selectedTaskId: 当前查看日志的任务                       │
│    - maxConcurrency: 最大并发数 (默认 3)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API 层 (新增)                           │
├─────────────────────────────────────────────────────────────┤
│  POST /api/test/batch      批量启动任务                      │
│  GET  /api/test/batch      获取所有运行中任务                 │
│  PUT  /api/test/batch      批量终止任务                      │
│                                                             │
│  现有 API (保持不变)：                                        │
│  POST /api/test            单任务执行                        │
│  GET  /api/test            查询是否有运行中任务               │
│  PUT  /api/test            终止单个任务                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   任务调度器 (新增)                          │
│                lib/task-scheduler.ts                        │
├─────────────────────────────────────────────────────────────┤
│  - 管理任务队列                                              │
│  - 控制并发数                                                │
│  - 分配浏览器实例                                            │
│  - 监控任务状态                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   任务管理器 (现有)                          │
│                  lib/task-manager.ts                        │
├─────────────────────────────────────────────────────────────┤
│  - 已支持多任务存储 (Map 结构)                                │
│  - 任务注册/注销/中止                                        │
│  - 无需修改                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 文件变更清单

### 新增文件

| 文件路径 | 功能说明 |
|---------|---------|
| `app/api/test/batch/route.ts` | 批量任务执行 API |
| `app/api/logs/batch/route.ts` | 批量任务日志查询 API |
| `lib/task-scheduler.ts` | 任务调度器（并发控制） |
| `types/batch-task.ts` | 批量任务类型定义 |
| `app/components/batch-task-panel/BatchTaskPanel.tsx` | 批量任务控制面板 |
| `app/components/batch-log-viewer/BatchLogViewer.tsx` | 批量任务日志查看组件 |

### 修改文件

| 文件路径 | 变更说明 |
|---------|---------|
| `app/page.tsx` | 添加多任务状态管理和 UI |
| `types/index.ts` | 导出批量任务类型 |
| `app/components/log-panel/LogPanel.tsx` | 支持多任务日志切换 |
| `hooks/useDatabase.ts` | 新增批量日志存储功能（IndexedDB 版本升级） |

---

## 🔧 详细实现步骤

### 步骤 1: 创建类型定义

**文件**: `types/batch-task.ts`

```typescript
/**
 * @file batch-task.ts
 * @description 批量任务执行相关类型定义
 */

export interface BatchTaskStatus {
  taskId: string
  testId: string
  taskName: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'aborted'
  progress: number
  startTime: string
  endTime?: string
  error?: string
}

export interface BatchExecuteRequest {
  taskIds: string[]
  maxConcurrency?: number
  useHeadful?: boolean
  strategy?: ExecutionStrategy
}

export interface BatchExecuteResponse {
  batchId: string
  tasks: BatchTaskStatus[]
}

export interface BatchTaskProgress {
  batchId: string
  tasks: BatchTaskStatus[]
  completedCount: number
  totalCount: number
  status: 'running' | 'completed' | 'partial' | 'failed'
}
```

### 步骤 2: 创建任务调度器

**文件**: `lib/task-scheduler.ts`

核心功能：
- 任务队列管理
- 并发控制（信号量机制）
- 任务状态追踪
- 浏览器实例池管理

```typescript
/**
 * @file task-scheduler.ts
 * @description 任务调度器 - 管理多任务并行执行
 */

export class TaskScheduler {
  private maxConcurrency: number
  private runningCount: number = 0
  private taskQueue: QueuedTask[] = []
  private activeTasks: Map<string, ActiveTask> = new Map()
  
  constructor(maxConcurrency: number = 3) {
    this.maxConcurrency = maxConcurrency
  }
  
  async scheduleTask(task: TaskConfig): Promise<void> {
    // 加入队列或直接执行
  }
  
  private async executeTask(task: QueuedTask): Promise<void> {
    // 执行单个任务
  }
  
  async abortTask(taskId: string): Promise<void> {
    // 中止任务
  }
  
  getTaskStatus(taskId: string): TaskStatus | undefined {
    // 获取任务状态
  }
  
  getAllActiveTasks(): ActiveTask[] {
    // 获取所有运行中任务
  }
}
```

### 步骤 3: 创建批量执行 API

**文件**: `app/api/test/batch/route.ts`

```typescript
/**
 * @file route.ts
 * @description 批量任务执行 API
 * 
 * 路由：
 * - POST /api/test/batch   启动批量任务执行
 * - GET  /api/test/batch   获取批量任务状态
 * - PUT  /api/test/batch   终止批量任务
 */

export async function POST(req: NextRequest) {
  // 1. 解析请求参数
  // 2. 创建批量任务 ID
  // 3. 初始化任务调度器
  // 4. 返回 SSE 流
}

export async function GET(req: NextRequest) {
  // 返回所有运行中任务的状态
}

export async function PUT(req: NextRequest) {
  // 批量终止任务
}
```

### 步骤 4: 修改前端页面

**文件**: `app/page.tsx`

主要变更：

#### 1. 状态管理变更

```typescript
// 现有状态（保持不变）
const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
const [logs, setLogs] = useState<LogEntry[]>([])

// 新增状态（多任务支持）
const [runningTasks, setRunningTasks] = useState<Map<string, RunningTaskInfo>>(new Map())
const [taskLogs, setTaskLogs] = useState<Map<string, LogEntry[]>>(new Map())
const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
const [maxConcurrency, setMaxConcurrency] = useState<number>(3)

interface RunningTaskInfo {
  taskId: string
  testId: string
  taskName: string
  status: 'running' | 'success' | 'failed' | 'aborted'
  progress: number
  startTime: string
  abortController: AbortController
}
```

#### 2. 日志管理函数

```typescript
// 添加日志到指定任务
const addLogToTask = useCallback((taskId: string, log: LogEntry) => {
  setTaskLogs(prev => {
    const newMap = new Map(prev)
    const taskLogs = newMap.get(taskId) || []
    newMap.set(taskId, [...taskLogs, log])
    return newMap
  })
}, [])

// 清空指定任务的日志
const clearTaskLogs = useCallback((taskId: string) => {
  setTaskLogs(prev => {
    const newMap = new Map(prev)
    newMap.set(taskId, [])
    return newMap
  })
}, [])

// 获取当前活动任务的日志
const activeTaskLogs = useMemo(() => {
  if (!activeTaskId) return []
  return taskLogs.get(activeTaskId) || []
}, [activeTaskId, taskLogs])
```

#### 3. UI 变更

- 任务卡片支持多选（Checkbox）
- 新增"批量执行"按钮
- 新增"全部终止"按钮
- 日志面板使用 Tab 切换（多任务时）

#### 4. 功能变更

- `startTest()` 支持并行调用，每个任务独立管理日志
- `stopTest()` 支持停止单个或全部任务
- 日志实时推送到对应任务的日志数组

### 步骤 5: 更新日志面板

**文件**: `app/components/log-panel/LogPanel.tsx`

新增功能：
- **Tab 切换模式**：每个任务一个独立的 Tab 页签
- 任务状态指示器（运行中/成功/失败）
- 单任务日志独立显示，不混合
- 支持自动切换到最新活动的任务 Tab

---

## 🎨 UI 设计

### 任务列表变更

```
┌─────────────────────────────────────────────────────────────┐
│  任务列表 (5)                    [批量执行] [全部终止]        │
├─────────────────────────────────────────────────────────────┤
│  ☑️ 任务 A  [运行中] ████████░░ 80%                          │
│  ☑️ 任务 B  [运行中] ██████░░░░ 60%                          │
│  ☐ 任务 C  [就绪]                                            │
│  ☐ 任务 D  [就绪]                                            │
│  ☐ 任务 E  [已完成]                                          │
└─────────────────────────────────────────────────────────────┘
```

### 日志面板变更（Tab 切换模式）

```
┌─────────────────────────────────────────────────────────────┐
│  执行日志                                                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ 任务 A 🟢   │ │ 任务 B 🟡   │ │ 任务 C ⚪   │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
├─────────────────────────────────────────────────────────────┤
│  🚀 测试任务启动，共 10 个步骤                               │
│  ✅ 步骤 1: 打开页面 (耗时: 2.3s)                            │
│  ✅ 步骤 2: 点击登录 (耗时: 1.5s)                            │
│  ⏳ 步骤 3: 填写表单 (执行中...)                             │
│  ...                                                        │
│                                                             │
│  [清空日志]                              [导出日志]          │
└─────────────────────────────────────────────────────────────┘

Tab 状态指示器：
  🟢 运行中（绿色圆点）
  ✅ 成功（绿色勾）
  ❌ 失败（红色叉）
  ⚪ 未开始/等待中（灰色圆点）
  ⏹️ 已中止（黄色方块）
```

### Tab 切换交互说明

1. **自动切换**：
   - 新任务启动时，自动创建对应 Tab
   - 默认切换到最新启动的任务 Tab
   - 可配置是否自动切换（用户偏好）

2. **Tab 显示**：
   - Tab 标题显示任务名称
   - Tab 右侧显示状态图标
   - 运行中的 Tab 有动态效果（闪烁/进度条）

3. **日志隔离**：
   - 每个 Tab 只显示该任务的日志
   - 日志不混合，清晰独立
   - 支持单个 Tab 清空日志

4. **任务完成**：
   - 任务完成后 Tab 保留，状态图标更新
   - 支持查看历史执行日志
   - 可手动关闭已完成的 Tab

---

## ⚙️ 配置选项

### 并发控制

```typescript
// 默认配置
const DEFAULT_MAX_CONCURRENCY = 3

// 环境变量配置
const MAX_CONCURRENCY = parseInt(process.env.MAX_TASK_CONCURRENCY || '3', 10)
```

### 资源限制

```typescript
// 浏览器实例限制
const MAX_BROWSER_INSTANCES = 5

// 内存监控
const MEMORY_THRESHOLD = 0.8 // 80% 内存使用率时暂停新任务
```

---

## 🔄 向后兼容性

### 现有功能保持不变

1. **单任务执行**：
   - `POST /api/test` API 保持不变
   - 前端单任务执行流程不变
   - 不使用批量执行时，行为与之前完全一致

2. **任务管理**：
   - `task-manager.ts` 无需修改
   - 现有的任务中止、状态查询功能正常

3. **日志系统**：
   - 现有日志格式不变
   - 新增 `taskId` 前缀用于区分多任务

### 迁移路径

```typescript
// 检测是否启用多任务模式
const isBatchMode = taskIds.length > 1

if (isBatchMode) {
  // 使用新的批量执行 API
  await fetch('/api/test/batch', { ... })
} else {
  // 使用现有的单任务 API
  await fetch('/api/test', { ... })
}
```

---

## 📊 性能考虑

### 资源消耗

| 并发数 | 内存占用 | CPU 占用 | 推荐场景 |
|-------|---------|---------|---------|
| 1 | ~200MB | 低 | 调试、单任务 |
| 3 | ~600MB | 中 | 日常使用 |
| 5 | ~1GB | 高 | 性能测试 |

### 优化策略

1. **延迟启动**：任务之间间隔 2-3 秒启动，避免资源竞争
2. **内存监控**：超过阈值时暂停新任务启动
3. **优先级队列**：支持任务优先级排序

---

## ✅ 实施计划

### 阶段 1: 基础架构（预计 2-3 小时）

- [ ] 创建类型定义文件 `types/batch-task.ts`
- [ ] 创建任务调度器 `lib/task-scheduler.ts`
- [ ] 创建批量执行 API `app/api/test/batch/route.ts`
- [ ] 创建日志查询 API `app/api/logs/batch/route.ts`

### 阶段 2: 日志存储功能（预计 1-2 小时）

- [ ] 升级 IndexedDB 版本，新增 `batchLogs` 存储表
- [ ] 实现批量执行日志收集逻辑
- [ ] 实现日志保存和查询功能
- [ ] 创建日志查看组件 `BatchLogViewer.tsx`

### 阶段 3: 前端集成（预计 2-3 小时）

- [ ] 修改 page.tsx 状态管理
- [ ] 创建批量任务控制面板组件
- [ ] 更新日志面板支持多任务
- [ ] 添加批量执行 UI 交互

### 阶段 4: 测试与优化（预计 1-2 小时）

- [ ] 功能测试（单任务、多任务并行）
- [ ] 日志记录和查询测试
- [ ] 性能测试（并发控制）
- [ ] 边界情况处理

---

## 🚨 风险与应对

### 风险 1: 资源耗尽

**应对**：
- 限制最大并发数
- 内存监控和自动降级
- 任务队列机制

### 风险 2: 日志混乱

**应对**：
- 每条日志添加任务 ID 前缀
- 支持按任务过滤日志
- 时间戳排序

### 风险 3: 浏览器实例泄漏

**应对**：
- 任务完成/失败时强制清理
- 超时自动关闭机制
- 定期健康检查

---

## 📝 批量执行日志记录功能

### 需求说明

在批量执行多个任务时，每个任务的执行日志需要独立记录和保存，支持后续查看和分析。

### 日志存储设计

#### 数据结构

```typescript
/**
 * @file batch-task.ts
 * @description 批量任务执行日志类型定义
 */

export interface BatchExecutionLog {
  id: string                    // 批次日志 ID
  batchId: string               // 批次 ID
  taskId: string                // 任务 ID
  taskName: string              // 任务名称
  testId: string                // 测试执行 ID
  startTime: string             // 开始时间
  endTime?: string              // 结束时间
  duration?: number             // 执行时长（毫秒）
  status: 'running' | 'success' | 'error' | 'aborted'
  logs: LogEntry[]              // 日志条目数组
  stepsCount: number            // 总步骤数
  successSteps: number          // 成功步骤数
  failedSteps: number           // 失败步骤数
  createdAt: string             // 创建时间
}

export interface BatchExecutionSummary {
  batchId: string
  startTime: string
  endTime?: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  abortedTasks: number
  taskLogs: BatchExecutionLog[]
}
```

#### 存储方案

**方案 A: IndexedDB 存储（推荐）**

复用现有的 IndexedDB 存储，新增 `batchLogs` 存储表：

```typescript
// 数据库版本升级
const DB_VERSION = 3  // 从 2 升级到 3

// 新增存储表
const BATCH_LOGS_STORE = 'batchLogs'

// 存储结构
interface BatchLogStore {
  id: string           // 主键
  batchId: string      // 索引，用于查询批次
  taskId: string       // 索引，用于查询任务
  testId: string       // 索引，用于查询测试执行
  ...BatchExecutionLog
}
```

**方案 B: 文件系统存储**

将日志保存到服务器文件系统：

```
logs/
  batch_2026-04-28_001/
    task_A_2026-04-28_10-30-00.json
    task_B_2026-04-28_10-30-05.json
    summary.json
```

### 日志收集流程

```
┌─────────────────────────────────────────────────────────────┐
│                    批量任务执行流程                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 启动批量任务                                            │
│     └─> 创建 batchId                                        │
│     └─> 初始化 BatchExecutionLog[]                          │
│                                                             │
│  2. 并行执行任务                                            │
│     └─> 每个任务独立的日志收集器                             │
│     └─> 实时推送日志到前端 (SSE)                             │
│     └─> 同时保存到内存中的日志对象                           │
│                                                             │
│  3. 任务完成/失败                                           │
│     └─> 保存单个任务的日志到数据库                           │
│     └─> 更新批次汇总状态                                     │
│                                                             │
│  4. 批次完成                                                │
│     └─> 保存批次汇总日志                                     │
│     └─> 清理内存中的临时数据                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 实现细节

#### 步骤 1: 扩展任务调度器

**文件**: `lib/task-scheduler.ts`

```typescript
export class TaskScheduler {
  private batchLogs: Map<string, BatchExecutionLog> = new Map()
  
  /**
   * 记录任务日志
   */
  private addTaskLog(testId: string, log: LogEntry): void {
    const batchLog = this.batchLogs.get(testId)
    if (batchLog) {
      batchLog.logs.push(log)
    }
  }
  
  /**
   * 保存任务日志到数据库
   */
  private async saveTaskLog(testId: string): Promise<void> {
    const batchLog = this.batchLogs.get(testId)
    if (!batchLog) return
    
    batchLog.endTime = new Date().toISOString()
    batchLog.duration = new Date(batchLog.endTime).getTime() - 
                        new Date(batchLog.startTime).getTime()
    
    // 调用 API 保存日志
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchLog),
    })
  }
  
  /**
   * 获取批次所有任务的日志
   */
  getBatchLogs(batchId: string): BatchExecutionLog[] {
    return Array.from(this.batchLogs.values())
      .filter(log => log.batchId === batchId)
  }
}
```

#### 步骤 2: 扩展批量执行 API

**文件**: `app/api/test/batch/route.ts`

```typescript
export async function POST(req: NextRequest) {
  const { taskIds, maxConcurrency, useHeadful, strategy } = await req.json()
  const batchId = `batch_${Date.now()}`
  
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const scheduler = new TaskScheduler(maxConcurrency || 3)
      
      // 初始化所有任务的日志对象
      for (const taskId of taskIds) {
        const testId = `test_${taskId}_${Date.now()}`
        scheduler.initTaskLog(batchId, taskId, testId, taskName)
      }
      
      // 执行任务并收集日志
      const sendLog = (testId: string, log: LogEntry) => {
        scheduler.addTaskLog(testId, log)
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ testId, ...log })}\n\n`
        ))
      }
      
      // 并行执行任务
      await scheduler.executeBatch(taskIds, sendLog)
      
      // 保存所有任务日志
      await scheduler.saveAllLogs()
      
      controller.close()
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

#### 步骤 3: 新增日志查询 API

**文件**: `app/api/logs/batch/route.ts`

```typescript
/**
 * @file route.ts
 * @description 批量任务日志查询 API
 */

export async function GET(req: NextRequest) {
  const { batchId, taskId } = req.nextUrl.searchParams
  
  if (batchId) {
    // 获取批次下所有任务的日志
    const logs = await getBatchLogs(batchId)
    return NextResponse.json({ logs })
  }
  
  if (taskId) {
    // 获取指定任务的所有执行日志
    const logs = await getTaskLogs(taskId)
    return NextResponse.json({ logs })
  }
  
  return NextResponse.json({ error: '缺少参数' }, { status: 400 })
}
```

#### 步骤 4: 前端日志管理界面

**文件**: `app/components/log-panel/LogPanel.tsx`（修改现有组件）

```tsx
/**
 * @file LogPanel.tsx
 * @description 日志面板组件 - 支持 Tab 切换多任务日志
 */

import { Tabs, Badge, Button, Empty } from 'antd'

interface LogPanelProps {
  taskLogs: Map<string, TaskLogInfo>  // 任务ID -> 日志信息
  activeTaskId: string | null
  onTabChange: (taskId: string) => void
  onClearLog: (taskId: string) => void
  isRunning: boolean
}

export function LogPanel({ 
  taskLogs, 
  activeTaskId, 
  onTabChange, 
  onClearLog,
  isRunning 
}: LogPanelProps) {
  // 生成 Tab 项
  const tabItems = Array.from(taskLogs.entries()).map(([taskId, info]) => ({
    key: taskId,
    label: (
      <span>
        {info.taskName}
        <StatusIcon status={info.status} />
      </span>
    ),
    children: (
      <div className="log-content">
        <LogList logs={info.logs} />
        <div className="log-actions">
          <Button onClick={() => onClearLog(taskId)}>清空日志</Button>
          <Button onClick={() => exportLog(taskId, info)}>导出日志</Button>
        </div>
      </div>
    ),
  }))

  // 单任务模式：不显示 Tab，直接显示日志
  if (taskLogs.size <= 1) {
    const firstLog = Array.from(taskLogs.values())[0]
    return (
      <div className="log-panel single-task">
        <LogList logs={firstLog?.logs || []} />
      </div>
    )
  }

  // 多任务模式：显示 Tab 切换
  return (
    <div className="log-panel multi-task">
      <Tabs
        activeKey={activeTaskId || undefined}
        onChange={onTabChange}
        items={tabItems}
        tabBarExtraContent={
          <span className="task-count">
            共 {taskLogs.size} 个任务
          </span>
        }
      />
    </div>
  )
}

// 状态图标组件
function StatusIcon({ status }: { status: TaskStatus }) {
  const iconMap = {
    running: <Badge status="processing" />,
    success: <Badge status="success" />,
    failed: <Badge status="error" />,
    aborted: <Badge status="warning" />,
    pending: <Badge status="default" />,
  }
  return iconMap[status] || null
}
```

**文件**: `app/components/batch-log-viewer/BatchLogViewer.tsx`（历史日志查看）

```tsx
/**
 * @file BatchLogViewer.tsx
 * @description 批量任务历史日志查看组件 - Tab 切换模式
 */

export function BatchLogViewer({ batchId }: { batchId: string }) {
  const [logs, setLogs] = useState<BatchExecutionLog[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  
  // 加载批次日志
  useEffect(() => {
    fetch(`/api/logs/batch?batchId=${batchId}`)
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs)
        // 默认选中第一个任务
        if (data.logs.length > 0) {
          setActiveTaskId(data.logs[0].taskId)
        }
      })
  }, [batchId])
  
  // 转换为 Map 结构
  const taskLogsMap = useMemo(() => {
    const map = new Map()
    logs.forEach(log => {
      map.set(log.taskId, {
        taskName: log.taskName,
        status: log.status,
        logs: log.logs,
      })
    })
    return map
  }, [logs])
  
  return (
    <div className="batch-log-viewer">
      {/* 批次统计 */}
      <BatchSummary logs={logs} />
      
      {/* Tab 切换日志 */}
      <LogPanel
        taskLogs={taskLogsMap}
        activeTaskId={activeTaskId}
        onTabChange={setActiveTaskId}
        onClearLog={(taskId) => {
          // 清空指定任务的日志
        }}
        isRunning={false}
      />
    </div>
  )
}
```

### 日志存储时机

| 事件 | 操作 |
|-----|------|
| 任务启动 | 创建 `BatchExecutionLog` 对象 |
| 步骤完成 | 添加日志条目到内存 |
| 任务完成 | 保存日志到数据库 |
| 任务失败 | 保存日志到数据库（含错误信息） |
| 任务中止 | 保存日志到数据库（标记为 aborted） |
| 批次完成 | 保存批次汇总日志 |

### 日志查询功能

#### API 接口

```
GET /api/logs/batch?batchId=xxx     获取批次下所有任务日志
GET /api/logs/batch?taskId=xxx      获取指定任务的所有执行日志
GET /api/logs/batch?testId=xxx      获取单次执行的详细日志
```

#### 前端入口

1. **任务列表页**：点击任务的"查看日志"按钮
2. **日志管理页**：按批次/任务筛选查看
3. **执行结果弹窗**：显示该次执行的日志

### 日志清理策略

```typescript
// 自动清理 30 天前的日志
const LOG_RETENTION_DAYS = 30

// 清理函数
async function cleanupOldLogs(): Promise<void> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS)
  
  // 删除过期日志
  await deleteLogsBefore(cutoffDate.toISOString())
}

// 定时执行（每天凌晨 2 点）
schedule.scheduleJob('0 2 * * *', cleanupOldLogs)
```

---

## 📝 总结

本方案通过新增批量执行 API 和任务调度器，实现了多任务并行执行功能，同时保持现有单任务执行功能完全不变。主要优势：

1. ✅ **向后兼容**：不修改现有 API，新增功能独立
2. ✅ **资源可控**：并发控制、内存监控
3. ✅ **易于使用**：UI 直观，支持批量选择
4. ✅ **可扩展**：支持优先级队列、延迟启动等高级功能
5. ✅ **日志完整**：每个任务的执行日志独立记录和保存，支持后续查看分析
