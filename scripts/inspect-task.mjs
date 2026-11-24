#!/usr/bin/env node

/**
 * 头歌实训数据的离线检查工具。需要 Node.js；只读取命令行参数或本地 JSON 文件，
 * 不连接头歌、不保存代码、不触发评测。运行 `node inspect-task.mjs --help` 看用法。
 *
 * paths：将已取得的 challenge.path 按全角分号「；」拆成文件路径数组。
 *   可直接传字符串，也可传含 challenge.path 的关卡 JSON。
 *   这是已观察到的前端解析规则；真正的本关编辑范围仍以页面下拉菜单为准。
 *
 * feedback：汇总已有的 game_status 风格 JSON。文件须在顶层、data 或 content 中
 *   含 test_sets[]；每项可有 input、output/expected_output、actual_output、result。
 *   输出 observed 计数、各测试集状态，以及预期/实际文本的首个差异位置。
 *   `--base64` 仅在确认这些字段由接口编码时使用；普通短文本也可能碰巧符合
 *   Base64 格式，不能凭脚本检测结果推断接口一定采用了编码。
 *   firstDifference.index 从 0 开始，line/column 从 1 开始；缺少结果字段时
 *   status 为 unknown。脚本汇总不能代替页面上的最终通关状态。
 */
import { readFileSync } from 'node:fs';

function usage(exitCode = 0) {
  const message = `用法：
  node inspect-task.mjs paths "src/A.java；src/B.jsp；"
  node inspect-task.mjs paths --json task-response.json
  node inspect-task.mjs feedback game-status.json [--base64]

paths 输出 JSON 路径数组；--json 文件需含 challenge.path。
feedback 输出测试集汇总和首个文本差异；JSON 需含 test_sets[]。
仅在已确认接口字段经过 Base64 编码时添加 --base64。
本脚本只处理已有数据，不访问或提交头歌作业。`;
  (exitCode === 0 ? console.log : console.error)(message);
  process.exitCode = exitCode;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

/** 复现已核验前端对 challenge.path 的拆分，不额外猜测文件。 */
function taskPaths(value) {
  if (typeof value !== 'string') {
    throw new TypeError('challenge.path must be a string');
  }
  // Matches the observed frontend rule: the separator is U+FF1B, not ';'.
  return value.split('；').filter(Boolean);
}

function statusOf(value) {
  if (value === true || value === 1 || value === 'true' || value === '1') return 'passed';
  if (value === false || value === 0 || value === 'false' || value === '0') return 'failed';
  return 'unknown';
}

function decodeIfBase64(value, enabled) {
  if (!enabled || typeof value !== 'string') return value;
  const compact = value.replace(/\s/g, '');
  if (!compact || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return value;
  const standard = compact.replace(/-/g, '+').replace(/_/g, '/');
  if (standard.length % 4 === 1) return value;
  const bytes = Buffer.from(standard, 'base64');
  const canonical = bytes.toString('base64').replace(/=+$/, '');
  if (canonical !== standard.replace(/=+$/, '')) return value;
  const decoded = bytes.toString('utf8');
  if (decoded.includes('\uFFFD')) return value;
  return decoded;
}

/** 返回首个字符差异；行列号便于回到评测反馈中定位。 */
function firstDifference(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return null;
  let index = 0;
  while (index < expected.length && index < actual.length && expected[index] === actual[index]) index++;
  if (index === expected.length && index === actual.length) return null;
  const before = expected.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  return {
    index,
    line,
    column,
    expectedNear: expected.slice(Math.max(0, index - 30), index + 80),
    actualNear: actual.slice(Math.max(0, index - 30), index + 80),
  };
}

/** 兼容已记录的三种 test_sets 容器形状，保留原始反馈字段。 */
function feedback(response, decodeBase64) {
  const payload = [response, response?.data, response?.content]
    .find((item) => item && Array.isArray(item.test_sets));
  if (!payload) throw new TypeError('JSON must contain test_sets[] at top level, data, or content');

  const cases = payload.test_sets.map((item, index) => {
    const input = decodeIfBase64(item.input, decodeBase64);
    const expected = decodeIfBase64(item.output ?? item.expected_output, decodeBase64);
    const actual = decodeIfBase64(item.actual_output, decodeBase64);
    return {
      testSet: index + 1,
      status: statusOf(item.result ?? item.passed),
      input,
      expected,
      actual,
      firstDifference: firstDifference(expected, actual),
    };
  });

  return {
    runningCodeStatus: payload.running_code_status ?? null,
    runningCodeMessage: payload.running_code_message ?? null,
    reportedErrorCount: payload.sets_error_count ?? null,
    compileOutput: payload.last_compile_output ?? null,
    observed: {
      total: cases.length,
      passed: cases.filter((item) => item.status === 'passed').length,
      failed: cases.filter((item) => item.status === 'failed').length,
      unknown: cases.filter((item) => item.status === 'unknown').length,
    },
    cases,
  };
}

try {
  const [command, argument, option] = process.argv.slice(2);
  if ((command === '--help' || command === '-h') && !argument) {
    usage();
  } else if (command === 'paths' && argument === '--json' && option) {
    const response = readJson(option);
    const path = response.challenge?.path ?? response.data?.challenge?.path;
    console.log(JSON.stringify(taskPaths(path), null, 2));
  } else if (command === 'paths' && argument && !option) {
    console.log(JSON.stringify(taskPaths(argument), null, 2));
  } else if (command === 'feedback' && argument && (!option || option === '--base64')) {
    console.log(JSON.stringify(feedback(readJson(argument), option === '--base64'), null, 2));
  } else {
    usage(2);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
