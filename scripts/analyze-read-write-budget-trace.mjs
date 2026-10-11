import fs from 'node:fs';
import path from 'node:path';

const ABSOLUTE_TRACE_PATH = process.argv[2];

if (!ABSOLUTE_TRACE_PATH || !path.isAbsolute(ABSOLUTE_TRACE_PATH)) {
  console.error(
    `用法: node scripts/analyze-read-write-budget-trace.mjs <绝对trace路径>\n` +
      `错误: trace 路径必须是绝对路径（当前输入: ${ABSOLUTE_TRACE_PATH ?? ''}）`
  );
  process.exit(1);
}

if (!fs.existsSync(ABSOLUTE_TRACE_PATH)) {
  console.error(`错误: trace 文件不存在: ${ABSOLUTE_TRACE_PATH}`);
  process.exit(1);
}

const trace = JSON.parse(fs.readFileSync(ABSOLUTE_TRACE_PATH, 'utf8'));
const events = Array.isArray(trace.events) ? trace.events : [];
const payloads = trace.payloads;
const payloadOf = (event) => {
  const refs = Array.isArray(event?.payloadRefs) ? event.payloadRefs : [];
  if (!payloads || refs.length === 0) return null;
  const values = refs.map((ref) => payloads[ref]).filter((value) => value !== undefined);
  return values.length === 0 ? null : values.length === 1 ? values[0] : values;
};
const parseDetail = (event) => {
  if (typeof event?.detail !== 'string') return null;
  try {
    return JSON.parse(event.detail);
  } catch {
    return null;
  }
};

const toolNameOf = (event) => {
  if (typeof event?.label !== 'string') return null;
  const match = event.label.match(/(?:工具调用(?:完成|失败)?[:：]\s*|工具调用[:：]\s*)([A-Za-z0-9_.-]+)/);
  return match ? match[1] : null;
};

const classifyTool = (name) => {
  if (typeof name !== 'string') return 'unknown';
  if (name === 'editor.write' || name === 'write') return 'write';
  if (
    name.includes('read') ||
    name.includes('search') ||
    name.includes('locate') ||
    name.includes('document_map') ||
    name.includes('get_state')
  ) {
    return 'read';
  }
  return 'other';
};

const readEvents = [];
const writeEvents = [];
const otherToolEvents = [];

for (const event of events) {
  const name = toolNameOf(event);
  if (!name) continue;
  const kind = classifyTool(name);
  if (kind === 'write') writeEvents.push(event);
  else if (kind === 'read') readEvents.push(event);
  else if (kind === 'other') otherToolEvents.push(event);
}

const status = (event) => (event?.type === 'tool-call' && event.label.includes('完成')) ? 'success' : 'failed';

const successfulWrites = writeEvents.filter((event) => status(event) === 'success');
const failedWrites = writeEvents.filter((event) => status(event) === 'failed');
const batchSucceededEvents = events.filter((event) => event.type === 'edit-task-batch-succeeded');
const batchStartedEvents = events.filter((event) => event.type === 'edit-task-batch-started');
const batchPlannedEvents = events.filter((event) => event.type === 'edit-task-batch-planned');
const interactiveEvents = events.filter((event) => event.type === 'agent-interactive_response');
const convergenceEvents = events.filter((event) => event.type === 'tool-convergence-started');
const longRequestEvents = events.filter((event) => event.type === 'long-request-in-progress');
const agentToolEvents = events.filter((event) => event.type === 'agent-tool');
const stateHistory = Array.isArray(trace.stateHistory) ? trace.stateHistory : [];

const summary = {
  tracePath: ABSOLUTE_TRACE_PATH,
  traceSizeBytes: fs.statSync(ABSOLUTE_TRACE_PATH).size,
  schemaVersion: trace.schemaVersion,
  traceStatus: trace.status,
  eventCount: events.length,
  payloadCount: Object.keys(payloads ?? {}).length,
  apiCallIndexCount: Array.isArray(trace.apiCalls) ? trace.apiCalls.length : 0,
  physicalRequestCount: longRequestEvents.length,
  toolCallCount: readEvents.length + writeEvents.length + otherToolEvents.length,
  readCallCount: readEvents.length,
  writeCallCount: writeEvents.length,
  otherToolCallCount: otherToolEvents.length,
  successfulWriteCount: successfulWrites.length,
  failedWriteCount: failedWrites.length,
  agentToolCount: agentToolEvents.length,
  batchPlannedCount: batchPlannedEvents.length,
  batchStartedCount: batchStartedEvents.length,
  batchSucceededCount: batchSucceededEvents.length,
  interactiveResponseCount: interactiveEvents.length,
  convergenceRequestCount: convergenceEvents.length,
  stateHistoryCount: stateHistory.length,
  terminalState: trace.status,
  readToolBreakdown: Object.fromEntries(
    Object.entries(
      readEvents.reduce((acc, event) => {
        const name = toolNameOf(event);
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  ),
  writeToolBreakdown: Object.fromEntries(
    Object.entries(
      writeEvents.reduce((acc, event) => {
        const name = toolNameOf(event);
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  ),
  otherToolBreakdown: Object.fromEntries(
    Object.entries(
      otherToolEvents.reduce((acc, event) => {
        const name = toolNameOf(event);
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  ),
};

console.log(JSON.stringify(summary, null, 2));
