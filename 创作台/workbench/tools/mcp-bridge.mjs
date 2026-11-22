#!/usr/bin/env node
// 给 Claude Code 用的工具桥（MCP，走标准输入输出）。
// Claude Code 跑助手任务时把它当 MCP 服务器拉起来；它不自己干活，只把工具调用转给工作台，
// 由工作台在这一轮任务里执行（这样改动照样存历史版本、能撤销，进度照样显示在界面上）。
// 环境变量：WB_URL 工作台地址，WB_TOKEN 工作台令牌，WB_PROJECT 项目 id，WB_RUN 这一轮的密钥。
const { WB_URL, WB_TOKEN, WB_PROJECT, WB_RUN } = process.env;
const call = async body => {
  const r = await fetch(`${WB_URL}/api/projects/${encodeURIComponent(WB_PROJECT)}/studio/agent-tool`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wb-token': WB_TOKEN }, body: JSON.stringify({ ...body, key: WB_RUN }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `工作台返回 ${r.status}`);
  return j;
};
const out = msg => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle(m) {
  const { id, method, params } = m;
  if (id === undefined) return;                       // 通知，不用回
  try {
    if (method === 'initialize') return out({ id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'xiaoyi-workbench', version: '1.0.0' } } });
    if (method === 'ping') return out({ id, result: {} });
    if (method === 'tools/list') { const j = await call({ list: true }); return out({ id, result: { tools: j.tools } }); }
    if (method === 'tools/call') {
      const j = await call({ name: params?.name, input: params?.arguments || {} });
      return out({ id, result: { content: j.content, ...(j.is_error ? { isError: true } : {}) } });
    }
    out({ id, error: { code: -32601, message: '不支持：' + method } });
  } catch (e) {
    if (method === 'tools/call') return out({ id, result: { content: [{ type: 'text', text: e.message }], isError: true } });
    out({ id, error: { code: -32000, message: e.message } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    handle(m);
  }
});
process.stdin.on('end', () => process.exit(0));
