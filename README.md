# Stagehand 企业级自动化测试平台

基于 AI 的下一代浏览器自动化测试平台，支持多策略执行、任务管理和执行结果追踪。

## 核心功能

### 1. 多策略元素定位

系统支持三种执行策略，适用于不同场景：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **精确选择器** | 使用 id、class、xpath、css 等精确匹配 | 稳定元素、有良好测试属性的页面 |
| **AI 识别** | 使用 Qwen3-VL 模型智能识别 | 动态内容、无稳定选择器的页面 |
| **自动选择** | 优先选择器，失败后尝试 AI | 通用场景（推荐） |

### 2. 元素选择器配置

每个测试步骤可以配置以下选择器：

```typescript
interface ElementSelector {
  id?: string          // #my-element
  className?: string    // .button.primary
  text?: string        // 精确文本匹配
  containsText?: string // 包含文本
  css?: string         // 自定义 CSS
  xpath?: string        // XPath 表达式
  name?: string        // name 属性
  testId?: string      // data-testid
}
```

### 3. IndexedDB 本地存储

- 测试任务保存在浏览器 IndexedDB
- 支持导出/导入 JSON
- 设计为可替换存储后端（已实现 LocalStorage 适配器）

### 4. 执行结果记录

每次测试执行都会记录：
- 步骤执行状态（成功/失败）
- 执行耗时
- 截图记录
- AI 置信度（AI 模式）
- 实际使用的选择器

## 项目结构

```
my-stageHande/
├── app/
│   ├── api/
│   │   ├── tasks/route.ts    # 任务管理 API
│   │   └── test/route.ts      # 测试执行 API
│   ├── page.tsx               # 主界面
│   └── layout.tsx             # 布局组件
├── hooks/
│   └── useDatabase.ts         # IndexedDB 钩子
├── lib/
│   ├── db.ts                  # 数据库抽象层
│   └── executor.ts            # 执行引擎
├── types/
│   └── index.ts               # TypeScript 类型定义
└── utils/
    ├── file.ts                # 文件路径管理
    └── logger.ts              # 日志系统
```

## 支持的操作类型

| 类型 | 图标 | 说明 |
|------|------|------|
| `goto` | 🌐 | 访问指定 URL |
| `click` | 🖱️ | 点击页面元素 |
| `fill` | ⌨️ | 填写表单输入 |
| `hover` | 👆 | 鼠标悬停 |
| `screenshot` | 📸 | 页面截图 |
| `wait` | ⏱️ | 等待指定时间 |
| `scroll` | 📜 | 页面滚动 |

## 使用说明

### 1. 创建测试任务

1. 点击右上角「新建任务」
2. 输入任务名称和描述
3. 从左侧任务列表选择该任务

### 2. 添加测试步骤

1. 选择操作类型（goto/click/fill 等）
2. 填写操作描述（AI 识别依据）
3. 可选：配置元素选择器
4. 可选：设置执行策略
5. 点击「添加步骤」

### 3. 配置执行策略

在步骤配置区域可设置默认策略：
- **精确选择器**：直接使用配置的选择器
- **AI 识别**：使用 AI 模型定位元素
- **自动选择**：先尝试选择器，失败后使用 AI

### 4. 运行测试

1. 点击「开始测试」
2. 观察右侧实时日志
3. 查看执行结果详情

### 5. 管理任务

- **导入/导出**：支持 JSON 格式
- **查看历史**：查看每次执行的结果
- **删除任务**：移除不需要的任务

## 扩展数据库适配器

项目使用适配器模式，支持轻松切换存储后端：

```typescript
// 使用 IndexedDB（默认）
import { db } from '@/lib/db'
db.useIndexedDB()

// 切换到 LocalStorage
db.useLocalStorage()

// 自定义适配器
db.set(myCustomAdapter)
```

## 环境变量

```bash
# SiliconFlow API（主要 AI 服务）
SILICONFLOW_API_KEY=your_api_key

# OpenAI API（备选）
OPENAI_API_KEY=your_api_key
```

## 技术栈

- **框架**: Next.js 16
- **UI**: Ant Design 6 + Tailwind CSS
- **自动化**: Stagehand 3 + Playwright
- **AI 模型**: Qwen/Qwen3-VL-32B-Instruct
- **存储**: IndexedDB（浏览器本地）
- **日志**: Winston
