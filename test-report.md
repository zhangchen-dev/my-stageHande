# 测试执行报告

## 测试任务信息
- **任务名称**: 发票录入演示测试（通用版）
- **执行时间**: 2026-04-12 19:56
- **测试URL**: https://xft.cmbchina.com/omsapp/#/xft-demo?democode=input_invoice

## 执行步骤记录

### 步骤1: 打开页面
- **状态**: ✅ 成功
- **页面标题**: 薪福通 → 招商银行薪福通_一站式人财事数字开放平台
- **截图**: screenshot-01-initial-state.png

### 步骤2: 等待5秒让页面完全加载
- **状态**: ✅ 完成
- **等待时间**: 5秒

### 步骤3: 查找并点击"开始演示"按钮
- **状态**: ⚠️ 页面已自动进入演示模式
- **说明**: 使用带token的URL访问时，页面自动进入了"正在演示"模式
- **截图**: screenshot-03-demo-started.png

### 步骤4: 检查"收起演示地图"按钮
- **状态**: ❌ 按钮未出现
- **检查方法**: document.body.innerText.includes('收起演示地图')
- **结果**: false

### 步骤5: 按指引流程点击
- **状态**: ✅ 部分成功
- **操作**: 点击了第一个演示指引 "一键获取数电票原件，实现发票合规管理"
- **结果**: 页面显示了演示步骤指引
  - 步骤1: 完成取票服务授权
  - 步骤2: 完成一键取票
- **截图**: screenshot-04-after-click-step1.png

### 步骤6: 继续执行演示流程
- **状态**: ⚠️ 遇到技术限制
- **操作**: 尝试点击iframe中的"一键取票"菜单
- **错误**: `<div class="DemoDetail_iframeContainer__3qZ1N">…</div>` intercepts pointer events
- **说明**: 演示指引容器覆盖了iframe，无法直接点击iframe内的元素
- **截图**: screenshot-05-iframe-blocked.png

## 问题分析

### 页面结构问题
演示页面使用了多层容器嵌套结构：
1. 外部演示容器 (DemoDetail_iframeContainer__)
2. 演示指引层
3. iframe 内容层

当演示指引层展开时，会覆盖iframe，导致无法直接操作iframe内的元素。

### 技术限制
- Playwright 无法点击被覆盖的iframe元素
- 可能需要使用 force click 或先隐藏覆盖层

## 测试结论

| 步骤 | 状态 | 说明 |
|------|------|------|
| 打开页面 | ✅ | 成功 |
| 等待加载 | ✅ | 完成 |
| 点击开始演示 | ⚠️ | 自动进入演示模式 |
| 收起演示地图 | ❌ | 未出现 |
| 执行演示指引 | ⚠️ | 部分成功 |

## 建议

1. **测试脚本优化**: 对于iframe内元素的测试，建议使用iframe上下文切换
2. **元素定位**: 需要考虑演示层的遮挡问题
3. **截图保存**: 所有关键步骤的截图已保存到项目根目录

## 截图列表
- screenshot-01-initial-state.png - 初始页面状态
- screenshot-02-before-reload.png - 刷新前状态
- screenshot-03-demo-started.png - 演示开始状态
- screenshot-04-after-click-step1.png - 点击第一步指引后
- screenshot-05-iframe-blocked.png - iframe元素被遮挡
