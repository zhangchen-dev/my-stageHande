/**
 * 自动化测试脚本
 * 用于执行 demo-test.json 任务并监控日志
 */

const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('========================================');
  console.log('开始执行自动化测试');
  console.log('========================================\n');

  // 1. 读取测试任务
  const taskPath = path.join(__dirname, 'demo-test.json');
  const steps = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

  console.log(`✅ 已加载测试任务，共 ${steps.length} 个步骤\n`);

  // 2. 创建任务对象
  const task = {
    id: `auto_test_${Date.now()}`,
    name: '自动化测试 - 发票录入演示',
    steps: steps,
    useHeadful: true,
    strategy: 'auto'
  };

  console.log(`任务ID: ${task.id}`);
  console.log(`任务名称: ${task.name}\n`);

  // 3. 调用 API 执行任务
  console.log('正在提交任务到 /api/test...\n');

  try {
    const response = await fetch('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('✅ 任务已提交，开始接收执行日志...\n');
    console.log('========================================');
    console.log('执行日志');
    console.log('========================================\n');

    // 4. 处理 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let logCount = 0;
    let errorCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const logEntry = JSON.parse(line.substring(6));
            logCount++;

            // 输出日志
            const timestamp = new Date().toLocaleTimeString();
            const level = logEntry.level || 'info';
            const message = logEntry.message || '';

            const levelEmoji = {
              'info': 'ℹ️',
              'success': '✅',
              'error': '❌',
              'warning': '⚠️'
            };

            console.log(`[${timestamp}] ${levelEmoji[level] || ''} ${message}`);

            if (level === 'error') {
              errorCount++;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
    console.log(`总日志数: ${logCount}`);
    console.log(`错误数: ${errorCount}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
    console.error(error.stack);
  }
}

// 执行测试
runTest().catch(console.error);
