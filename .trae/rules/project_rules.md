# 项目编码规范与规则

> 最后更新：2026-04-20

## 📋 文件命名规范

### 1. 基本原则
- ✅ **文件名必须具有具体含义**，避免使用 `index.ts`、`utils.ts`、`file.ts` 等模糊名称
- ✅ **文件名不能重复**，即使是不同目录下也要确保语义不冲突
- ✅ **使用文件夹/文件名的层级结构**，相同功能的文件放在同一目录
- ❌ **禁止**使用无意义的缩写或通用名称（如 `helper.ts`, `common.ts`）

### 2. 命名格式
```
✅ 正确示例：
  - types/task.ts          (测试任务类型定义)
  - types/log.ts           (日志类型定义)
  - lib/test-executor.ts   (测试执行器)
  - utils/file-utils.ts    (文件工具函数)
  - app/constants/test-constants.ts (测试常量)

❌ 错误示例：
  - types/index.ts         (太模糊)
  - utils/file.ts          (不够具体)
  - lib/executor.ts        (职责不清)
  - app/constants/index.ts (应该明确功能)
```

### 3. 目录组织原则
```
📁 功能模块化组织：
  app/
    api/
      tasks/
        list.ts        (任务列表 API)
        create.ts       (创建任务 API)
        import/
          handler.ts    (导入任务处理)
      test/
        execute.ts      (执行测试 API)
    components/
      workflow-editor/   (工作流编辑相关组件)
      node-config/       (节点配置组件)
    
❌ 避免：
  api/
    tasks/
      route.ts          (多个 route.ts 容易混淆)
      import/
        route.ts        (与上级同名)
```

## 📏 文件大小限制

### 代码行数规范
- **推荐范围**：每个文件 **200-400 行**
- **警告阈值**：超过 **500 行** 应考虑拆分
- **强制拆分**：超过 **600 行** 必须拆分

### 拆分策略
```typescript
// ❌ 大文件（600+ 行）
// file: components/WorkflowEditor.tsx (800行)

// ✅ 拆分为模块化文件
// file: components/workflow-editor/
//   - WorkflowEditor.tsx         (主组件，200行)
//   - WorkflowEditorHeader.tsx   (头部，150行)
//   - WorkflowEditorCanvas.tsx   (画布区域，250行)
//   - WorkflowEditorConfig.tsx   (配置面板，200行)
//   - hooks/useWorkflow.ts       (逻辑hooks，180行)
//   - types.ts                   (类型定义，80行)
```

## 📝 文件注释规范

### 1. 文件头注释（必须）
每个文件必须包含以下格式的文件头注释：

```typescript
/**
 * @file 文件名
 * @description 简要描述文件的功能和用途
 * @module 所属模块
 * @author 作者（可选）
 * @created 创建日期（可选）
 * 
 * 详细说明（可选）：
 * - 该文件的职责范围
 * - 主要导出的函数/组件/类型
 * - 与其他模块的关系
 */
```

### 2. 示例
```typescript
/**
 * @file test-executor.ts
 * @description 测试执行器主入口，协调测试流程的执行和管理
 * @module 执行引擎
 * 
 * 职责：
 * - 调用工作流引擎执行测试步骤
 * - 管理执行记录和结果
 * - 处理任务中止逻辑
 * 
 * 依赖：
 * - ./executor/workflow-engine (工作流引擎)
 * - ./task-manager (任务管理器)
 */
```

## 🎯 API 路由命名规范

### 规则
API 文件夹下的路由文件**不能全部命名为 `route.ts`**，应使用**语义化的文件名**：

```
✅ 正确结构：
  app/api/tasks/
    list.ts              GET    /api/tasks
    create.ts            POST   /api/tasks
    update.ts            PUT    /api/tasks/[id]
    delete.ts            DELETE /api/tasks/[id]
    import/
      handler.ts         POST   /api/tasks/import
    init/
      initialize.ts      POST   /api/tasks/init
  
❌ 错误结构：
  app/api/tasks/
    route.ts             (不明确是哪个操作)
    import/
      route.ts           (与父级重名)
    init/
      route.ts           (与父级重名)
```

## 🔄 代码复用与清理规范

### 1. 新增功能优先基于旧代码扩展
**强制要求**：在添加新功能前，必须先检查是否可以基于现有代码扩展：

```typescript
❌ 错误做法：
  // 发现需要工作流执行功能
  // 直接创建新文件 lib/workflow/engine.ts (556行)
  // 创建新文件 lib/workflow/executors.ts (556行)
  // 结果：项目存在两套独立的执行引擎，造成混乱

✅ 正确做法：
  // 1. 先搜索项目中是否已有类似功能
  // 2. 发现 lib/executor/workflow-engine.ts 已存在
  // 3. 检查其功能是否满足需求
  // 4. 如果满足，直接使用；如果不满足，扩展该文件
  // 5. 如果需要完全重写，先删除旧代码再创建新代码
```

### 2. 无用代码必须删除
**强制要求**：发现未使用的代码必须立即删除，不要保留"以防万一"：

```typescript
❌ 错误做法：
  // 发现 lib/workflow/engine.ts 未被使用
  // 想着"以后可能会用到"，保留文件
  // 结果：代码库越来越臃肿，维护成本增加

✅ 正确做法：
  // 1. 使用 Grep 工具搜索该文件是否被引用
  // 2. 确认未被引用后，立即删除
  // 3. 如果以后需要，可以从 Git 历史恢复
```

### 3. 避免重复实现
**强制要求**：同一功能只能有一套实现，禁止多套并存：

```
❌ 禁止：
  lib/executor/workflow-engine.ts    (实际使用的执行引擎)
  lib/workflow/engine.ts             (未使用的执行引擎)
  lib/workflow/executors.ts          (未使用的执行器)
  lib/workflow/resolvers.ts          (未使用的解析器)

✅ 正确：
  lib/executor.ts                    (执行器入口)
  lib/executor/workflow-engine.ts    (工作流引擎)
  lib/executor/step-executor.ts      (步骤执行器)
  lib/executor/action-executor.ts    (动作执行器)
  lib/workflow/types.ts              (仅保留类型定义)
```

### 4. 定期清理检查清单
在每次提交代码前，检查以下内容：

- [ ] 是否有未使用的函数？→ 删除
- [ ] 是否有未使用的类？→ 删除
- [ ] 是否有未使用的文件？→ 删除
- [ ] 是否有重复的功能实现？→ 保留一个，删除其他
- [ ] 是否有注释掉的代码？→ 删除（Git 会保留历史）
- [ ] 是否有 TODO 但长期未实现？→ 删除或立即实现

### 5. 代码清理工具使用
使用以下工具检查代码使用情况：

```bash
# 检查文件是否被引用
Grep pattern="from.*your-file-name"

# 检查函数是否被调用
Grep pattern="yourFunctionName"

# 检查类是否被实例化
Grep pattern="new YourClassName"
```

## 🔧 代码组织最佳实践

### 1. 类型定义分离
```
types/
  task.ts              (TestTask, TestStep 等核心类型)
  log.ts               (LogEntry 日志类型)
  execution-log.ts     (ExecutionLog 执行日志类型)
  index.ts             (统一导出入口)
```

### 2. 工具函数分类
```
utils/
  file-utils.ts        (文件系统操作)
  logger-utils.ts      (日志管理)
  date-utils.ts        (日期处理)  // 如果需要
  string-utils.ts      (字符串处理) // 如果需要
```

### 3. 组件按功能分组
```
components/
  workflow-editor/      (工作流编辑相关)
  node-config/          (节点配置相关)
  task-management/      (任务管理相关)
```

## ⚠️ 强制规则清单

在编写或修改代码时，**必须**检查：

- [ ] 文件名是否具有明确的语义？
- [ ] 是否存在同名的其他文件？
- [ ] 文件是否超过 500 行？如果是，考虑拆分
- [ ] 是否添加了文件头注释？
- [ ] API 路由文件是否使用了语义化命名？
- [ ] 相关功能的文件是否放在了同一目录？
- [ ] **新增功能前是否检查了现有代码？**
- [ ] **是否删除了所有未使用的代码？**
- [ ] **是否存在重复的功能实现？**

## 📚 参考资源

- Next.js App Router 文件约定
- TypeScript 最佳实践
- Clean Architecture 原则
- DRY 原则（Don't Repeat Yourself）
