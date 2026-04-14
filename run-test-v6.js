// 测试执行脚本 - 执行演示页面测试任务 v6
// 截图将保存到项目 public/screenshots 目录
const http = require('http');
const path = require('path');

const testData = {
  steps: [
    {
      id: "step_01_open_page",
      type: "goto",
      description: "打开发票录入演示页面（带Token）",
      value: "https://xft.cmbchina.com/omsapp/#/xft-demo?democode=input_invoice&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJTTTNXaXRoU00yIn0.eyJleHAiOjE3NTU1NzQ2ODksImlhdCI6MTc1NTU2Mzg4OSwidG9rZW5lIjoie1widXNlck5hbWVcIjpcIuW8o+S9s+eQqvwiLFwicGxhdGZvcm1Vc2VySWRcIjpcIjEwMDIyOTUxXCIsXCJzYXBJZFwiOlwiODAzODAwMzRcIixcIm9yZ2FuaXphdGlvblwiOlwi5oC76KGMLeS_oeaBryajgqcunY_hveuvguWZs-2L4bHl9a-sjOX5k6Hlj5fm4aHljaT1p5_miJzmjLzoq5Ttm6vmjaLmhaLmhaLqn5zmipTqr53kiJH0In0.RS3eXeSy4eqOeb3F_l6hrUK9hXUrM392M_GkUlehWvAU4gzEpuDH32bCHD9A39_twWFP-Wvmek2WJPfLU9x8Kw&xftToken=041C179428745A7D83B85035134D35585ACF8F0100EC7C56AFCA2D3CD8FF27D987D47878416B658048B94B5989240D8DCCFA5FD9592557B2AC2F0158B1DE4745F72965C7B521AAAEB5B61B829F9532ACCB79D15D10AE70AD3C2ED063B149624740770B2C4C8BEAA23B98E0F5C8012F675E763A485B814D75ABE1E4DF0ADB95B7C9A67EB4AE23FBC246C692A7307BA117A8F6214EC63E95B1C43CD289618F2CBAC00818B22A065C213D75A0E1EDADDA6D2FBE1C",
      strategy: "auto"
    },
    {
      id: "step_02_wait_load",
      type: "wait",
      description: "等待页面完全加载（含iframe）",
      value: "6000",
      strategy: "auto"
    },
    {
      id: "step_03_screenshot_initial",
      type: "screenshot",
      description: "截图: 初始页面状态",
      value: "01_initial_page",
      strategy: "auto"
    },
    {
      id: "step_04_click_start_demo",
      type: "js",
      description: "[关键]使用CSS选择器找到开始演示按钮并点击",
      strategy: "selector",
      selector: { classPrefix: "DemoMap_startBtn" }
    },
    {
      id: "step_05_wait_after_start",
      type: "wait",
      description: "等待引导系统初始化和动画完成",
      value: "5000",
      strategy: "auto"
    },
    {
      id: "step_06_check_popup",
      type: "click",
      description: "如有弹窗则关闭",
      strategy: "ai",
      selector: { containsText: "收起演示地图" }
    },
    {
      id: "step_07_verify_start",
      type: "js",
      description: "验证是否成功进入演示状态",
      strategy: "selector",
      selector: { classPrefix: "DemoMap_startBtn" }
    },
    {
      id: "step_08_wait_guide",
      type: "wait",
      description: "等待引导准备就绪",
      value: "3000",
      strategy: "auto"
    },
    {
      id: "step_09_screenshot_before",
      type: "screenshot",
      description: "截图: 引导开始前",
      value: "02_before_guide_loop",
      strategy: "auto"
    },
    {
      id: "step_10_followGuide_main",
      type: "followGuide",
      description: "[核心循环] 自动跟随所有指引气泡直到结束",
      maxWaitTime: 15000,
      tryActivateGuide: true,
      loop: true,
      maxLoopIterations: 50,
      strategy: "auto"
    },
    {
      id: "step_11_screenshot_final",
      type: "screenshot",
      description: "截图: 最终结果",
      value: "03_final_result_complete",
      strategy: "auto"
    },
    {
      id: "step_12_wait_stable",
      type: "wait",
      description: "等待结果稳定",
      value: "2000",
      strategy: "auto"
    },
    {
      id: "step_13_screenshot_confirm",
      type: "screenshot",
      description: "最终确认截图",
      value: "04_final_confirm",
      strategy: "auto"
    }
  ],
  useHeadful: true,
  continueOnError: true,
  // 截图输出到项目的 public/screenshots 目录
  screenshotOutputDir: path.join(__dirname, 'public', 'screenshots')
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/test',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  },
  timeout: 600000 // 10分钟超时
};

console.log('===========================================');
console.log('开始执行演示页面测试任务 (v6)');
console.log(`时间: ${new Date().toLocaleString()}`);
console.log(`步骤数: ${testData.steps.length}`);
console.log(`截图目录: ${testData.screenshotOutputDir}`);
console.log('===========================================\n');

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  console.log(`Content-Type: ${res.headers['content-type']}`);
  console.log('\n--- 测试日志流 ---\n');
  
  let data = '';
  res.on('data', (chunk) => {
    const chunkStr = chunk.toString();
    data += chunkStr;
    
    // 解析 SSE 数据
    const lines = chunkStr.split('\n').filter(line => line.startsWith('data:'));
    for (const line of lines) {
      try {
        const jsonStr = line.replace(/^data:\s*/, '');
        if (jsonStr.trim()) {
          const logEntry = JSON.parse(jsonStr);
          const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
          const levelIcon = {
            'info': '\u2139\uFE0F',
            'success': '\u2705',
            'error': '\u274C',
            'warning': '\u26A0\uFE0F'
          }[logEntry.level] || '\uD83D\uDCCC';
          
          console.log(`[${timestamp}] ${levelIcon} ${logEntry.message}`);
          
          if (logEntry.details) {
            const details = logEntry.details;
            if (details.duration) console.log(`   \u8017\u65F6: ${(details.duration / 1000).toFixed(1)}s`);
            if (details.totalIterations !== undefined) console.log(`   \u5FAA\u73AF\u8F6E\u6570: ${details.totalIterations}`);
            if (details.successCount !== undefined) console.log(`   \u6210\u529F: ${details.successCount}/${details.passedSteps || details.successCount}`);
            if (details.strategy) console.log(`   \u7B56\u7565: ${details.strategy}`);
            if (logEntry.screenshot) console.log(`   \u622A\u56FE: ${logEntry.screenshot}`);
          }
        }
      } catch (e) {
        // ignore parse errors
      }
    }
  });
  
  res.on('end', () => {
    console.log('\n--- \u6D4B\u8BD5\u5B8C\u6210 ---');
    console.log(`\u7ED3\u675F\u65F6\u95F4: ${new Date().toLocaleString()}\n`);
    
    try {
      const lastLine = data.split('\n').filter(l => l.startsWith('data:')).pop();
      if (lastLine) {
        const jsonStr = lastLine.replace(/^data:\s*/, '');
        if (jsonStr.trim()) {
          const finalLog = JSON.parse(jsonStr);
          if (finalLog.details?.executionRecords) {
            console.log('=== \u6700\u7EC8\u7EDF\u8BA1 ===');
            console.log(JSON.stringify(finalLog.details, null, 2));
          }
        }
      }
    } catch (e) {}
  });
});

req.on('error', (e) => {
  console.error(`\u8BF7\u6C42\u9519\u8BEF: ${e.message}`);
});

req.on('timeout', () => {
  console.error('\u8BF7\u6C42\u8D85\u65F6!');
  req.destroy();
});

req.write(postData);
req.end();

console.log('\u8BF7\u6C42\u5DF2\u53D1\u9001\uFF0C\u7B49\u5F85\u54CD\u5E94...\n');
