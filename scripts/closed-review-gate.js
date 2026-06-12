#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const baselinePath = path.join(repoRoot, 'docs', 'superpowers', 'plans', 'unified-progress-baseline.md');
const versionPlanPath = path.join(repoRoot, 'docs', 'superpowers', 'plans', '2026-05-07-core-routing-version-plan.md');
const issueLogPath = path.join(repoRoot, 'docs', 'superpowers', 'plans', 'progress-issue-log.md');

function fail(message) {
  console.error(`closed-review-gate: ${message}`);
  process.exit(1);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file: ${path.relative(repoRoot, filePath)}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function getSection(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start < 0) {
    fail(`missing section: ${startHeading}`);
  }
  const end = text.indexOf(endHeading, start + startHeading.length);
  return end < 0 ? text.slice(start) : text.slice(start, end);
}

function parseTableRows(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !line.includes('---'))
    .slice(1)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

function extractDefaultVersionPointer(text, sourceName) {
  const match = text.match(/当前默认回到\s+(v\d+\.\d+\.\d+\s+[^。\n]+?)(?:推进)?[。；;]/);
  if (!match) {
    fail(`${sourceName} is missing the default version pointer`);
  }
  return match[1].replace(/推进$/, '').trim();
}

const baseline = readText(baselinePath);
const versionPlan = readText(versionPlanPath);
const issueLog = readText(issueLogPath);
const executionSection = getSection(baseline, '### 6. 近期执行顺序（排产抓手）', '### 7. 版本计划入口');
const rows = parseTableRows(executionSection);

if (rows.length < 10) {
  fail('recent execution order table is unexpectedly small');
}

const closedRows = rows.filter((row) => row[2] === 'closed');
if (closedRows.length < 6) {
  fail('closed review sample does not include enough closed rows');
}

const missingRegressionTrigger = closedRows.filter((row) => {
  const text = row.join(' ');
  return !/(若|再次|退化|重新前置|回归底线)/.test(text);
});

if (missingRegressionTrigger.length > 0) {
  fail(`closed rows missing regression trigger wording: ${missingRegressionTrigger.map((row) => row[1]).join(', ')}`);
}

if (!baseline.includes('已闭环事项复审校准') || !baseline.includes('避免历史 closed 结论与新入口稳定目标漂移')) {
  fail('baseline is missing closed review calibration governance wording');
}

if (!issueLog.includes('| PI-009 | 已闭环事项的文档结论与当前实现链路发生漂移 |')) {
  fail('issue log is missing PI-009 closed drift calibration record');
}

if (!issueLog.includes('不回退原结论') || !issueLog.includes('新增 `已闭环事项复审校准` 事项承接')) {
  fail('issue log is missing the closed-item calibration mechanism');
}

const requiredCrossLinks = [
  'docs/superpowers/plans/2026-05-07-core-routing-version-plan.md',
  'docs/superpowers/plans/progress-issue-log.md',
];

for (const link of requiredCrossLinks) {
  if (!baseline.includes(link)) {
    fail(`baseline is missing required cross-link: ${link}`);
  }
}

if (!versionPlan.includes('默认先看本文档版本路线，再回到统一进展基线确认状态')) {
  fail('version plan is missing the execution order rule');
}

const baselineDefaultPointer = extractDefaultVersionPointer(baseline, 'baseline');
const versionPlanDefaultPointer = extractDefaultVersionPointer(versionPlan, 'version plan');

if (baselineDefaultPointer !== versionPlanDefaultPointer) {
  fail(`default version pointers are not aligned: baseline="${baselineDefaultPointer}", version plan="${versionPlanDefaultPointer}"`);
}

if (!issueLog.includes('涉及统一进展入口结构、事项 / 特性状态口径、历史文档收编关系、职责边界漂移的问题，都必须记录到本文档')) {
  fail('issue log is missing governance drift recording rule');
}

console.log(`closed-review-gate: checked ${closedRows.length} closed execution-order rows and progress doc cross-links`);
