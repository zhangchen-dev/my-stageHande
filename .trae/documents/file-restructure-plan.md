# 文件结构重组计划

> 执行时间：2026-04-20
> 方案：使用 Next.js 路由组（Route Groups）分离前后端代码

---

## 📋 重组原则

### Next.js App Router 强制约定
以下文件**必须保留在原位置**，否则项目无法运行：

```
app/
  ├── layout.tsx           ← 根布局，必须在 app 目录下
  ├── globals.css          ← 全局样式，建议保留在 app 目录下
  └── api/                 ← API 路由，必须在 app 目录下
```

### 路由组特性
- 使用 `(groupName)` 格式创建路由组
- 路由组**不影响 URL 结构**
- 可以在路由组内组织代码，但 URL 保持不变

---

## 🎯 重组后的目录结构

```
my-stageHande/
  ├── app/
  │   ├── (web)/                    # 🌐 前端页面路由组
  │   │   ├── page.tsx             # 首页（URL: /）
  │   │   ├── layout.tsx           # 页面布局
  │   │   ├── workflow/
  │   │   │   └── page.tsx         # 工作流页面（URL: /workflow）
  │   │   ├── components/          # 前端组件
  │   │   │   ├── workflow-editor/
  │   │   │   ├── node-config/
  │   │   │   ├── task-card/
  │   │   │   └── execution-log/
  │   │   ├── utils/               # 前端工具函数
  │   │   │   ├── workflow-converter.ts
  │   │   │   └── indexeddb.ts
  │   │   └── constants/           # 前端常量
  │   │       └── test-constants.ts
  │   │
  │   ├── (api)/                    # 🔧 后端 API 路由组
  │   │   └── api/
  │   │       ├── test/
  │   │       │   └── route.ts      # 测试执行 API（URL: /api/test）
  │   │       └── tasks/
  │   │           ├── route.ts      # 任务 CRUD API（URL: /api/tasks）
  │   │           ├── import/
  │   │           │   └── route.ts  # 任务导入 API（URL: /api/tasks/import）
  │   │           └── init/
  │   │               └── route.ts  # 初始化 API（URL: /api/tasks/init）
  │   │
  │   ├── layout.tsx               # 根布局（必须保留）
  │   └── globals.css               # 全局样式（必须保留）
  │
  ├── lib/                          # 📚 共享库（前后端共用）
  │   ├── executor/                 # 测试执行引擎
  │   ├── workflow/                 # 工作流类型定义
  │   ├── task-manager.ts           # 任务管理器
  │   ├── log-storage.ts            # 日志存储
  │   └── executor.ts               # 执行器入口
  │
  ├── types/                        # 📝 类型定义（前后端共用）
  │   ├── task.ts
  │   ├── log.ts
  │   ├── execution-log.ts
  │   └── index.ts
  │
  ├── utils/                        # 🔧 工具函数（前后端共用）
  │   ├── file.ts
  │   └── logger.ts
  │
  ├── public/                       # 📦 静态资源
  │   ├── screenshots/
  │   ├── preset-tasks/
  │   └── samples/
  │
  └── .trae/                        # 📖 项目文档和规则
      ├── rules/
      └── documents/
```

---

## 🔄 文件移动清单

### 移动到 `(web)` 路由组

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `app/page.tsx` | `app/(web)/page.tsx` | 首页 |
| `app/workflow/page.tsx` | `app/(web)/workflow/page.tsx` | 工作流页面 |
| `app/components/*` | `app/(web)/components/*` | 所有前端组件 |
| `app/utils/*` | `app/(web)/utils/*` | 前端工具函数 |
| `app/constants/*` | `app/(web)/constants/*` | 前端常量 |

### 移动到 `(api)` 路由组

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `app/api/*` | `app/(api)/api/*` | 所有 API 路由 |

### 保留在 app 目录

| 文件 | 说明 |
|------|------|
| `app/layout.tsx` | 根布局，Next.js 强制要求 |
| `app/globals.css` | 全局样式 |

### 保留在根目录

| 目录 | 说明 |
|------|------|
| `lib/` | 共享库，前后端共用 |
| `types/` | 类型定义，前后端共用 |
| `utils/` | 工具函数，前后端共用 |
| `public/` | 静态资源 |

---

## ⚠️ 注意事项

1. **import 路径不需要修改**
   - 路由组不影响 import 路径
   - `@/components/*` 仍然有效
   - `@/lib/*` 仍然有效

2. **URL 结构保持不变**
   - 首页仍然是 `http://localhost:3000/`
   - 工作流页面仍然是 `http://localhost:3000/workflow`
   - API 路由仍然是 `http://localhost:3000/api/*`

3. **路由组的好处**
   - 代码组织更清晰
   - 前后端代码分离
   - 不影响 URL 结构
   - 符合 Next.js 最佳实践

---

## 📝 执行步骤

1. 创建 `(web)` 和 `(api)` 目录
2. 移动前端页面和组件到 `(web)`
3. 移动 API 路由到 `(api)`
4. 验证项目正常运行
5. 更新项目规则文档

---

**状态**: 📝 计划完成，等待执行
