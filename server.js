/* ==========================================================================
 * 赛博卜卦 · 零依赖 Node 服务
 * --------------------------------------------------------------------------
 *   GET  /                     静态页面
 *   GET  /api/hexagrams        六十四卦速查列表
 *   POST /api/divine           起卦（三枚铜钱法，自下而上六爻）
 *   GET  /api/ai/status        大模型接口是否已配置
 *   POST /api/ai/interpret     AI 解卦（SSE 流式），未配置时回传完整 prompt
 *
 * 大模型配置（任选其一）：
 *   1) 环境变量：LLM_API_BASE / LLM_API_KEY / LLM_MODEL / LLM_TEMPERATURE
 *   2) 同目录 llm.config.json：{ "base":"https://api.deepseek.com/v1",
 *        "key":"sk-xxx", "model":"deepseek-chat", "temperature":0.7 }
 *  兼容任何 OpenAI /chat/completions 协议的服务端（DeepSeek、通义、Kimi、
 *  Moonshot、本地 Ollama/vLLM 等），换 base 与 model 即可。
 * ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const Divine = require('./public/divine.js');
const YI = require('./public/hexagrams-data.js');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------------------------------------------------------------- 配置 */
function loadLLMConfig() {
  let file = {};
  const cfgPath = path.join(__dirname, 'llm.config.json');
  if (fs.existsSync(cfgPath)) {
    try { file = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { file = {}; }
  }
  return {
    base: (process.env.LLM_API_BASE || file.base || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    key: process.env.LLM_API_KEY || file.key || '',
    model: process.env.LLM_MODEL || file.model || 'deepseek-chat',
    temperature: Number(process.env.LLM_TEMPERATURE || file.temperature || 0.7)
  };
}

const SYSTEM_PROMPT = [
  '你是「赛博卜卦」的解卦顾问，深通《易经》象数理与曾仕强先生的讲学脉络。',
  '你的职责：依据给定的卦象资料与曾仕强解读，结合提问者所问之事，给出独立、审慎、有针对性的分析。',
  '原则：不故弄玄虚、不语怪力乱神、不替提问者做决定；强调「时也、位也」，强调人的主观能动。',
  '语言：简体中文，平实有分寸，允许有温度，避免空话套话。'
].join('');

/* ---------------------------------------------------------------- 工具 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJSON(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const max = limitBytes || 1 << 20;
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

/* SSE 写出一行 */
function sse(res, obj) {
  res.write('data: ' + JSON.stringify(obj) + '\n\n');
}

/* ---------------------------------------------------------------- 静态 */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/favicon.svg') rel = '/favicon.svg';

  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(target, (err, buf) => {
    if (err) {
      // 单页回退：未知路径一律给 index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(idx);
      });
      return;
    }
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

/* ------------------------------------------------------- 起卦结果封装 */
function packResult(res) {
  return {
    tosses: res.tosses,
    benLines: res.benLines,
    bianLines: res.bianLines,
    moving: res.moving,
    judge: Divine.judgeRule(res),
    ben: res.ben,
    bian: res.bian,
    hu: res.hu
  };
}

/* ------------------------------------------------------- AI 解卦（流式） */
async function aiInterpret(req, res, body) {
  const cfg = loadLLMConfig();
  const question = (body.question || '').slice(0, 500);

  let result;
  if (Array.isArray(body.tosses) && body.tosses.length === 6 &&
      body.tosses.every((t) => [6, 7, 8, 9].indexOf(t) >= 0)) {
    result = Divine.buildResult(body.tosses);
  } else {
    result = Divine.buildResult(Divine.tossHexagram());
  }

  const prompt = Divine.buildPrompt(result, question);

  if (!cfg.key) {
    // 未配置密钥：把组装好的 prompt 回传，前端可一键复制去任何大模型里用
    return sendJSON(res, 200, {
      ok: false,
      reason: 'not_configured',
      message: '尚未配置大模型密钥。下方的提示词已按本卦完整组装好，复制后粘贴到任意大模型对话中即可得到定制解读。',
      prompt: prompt
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendError = (msg) => { sse(res, { ok: false, error: msg }); res.end(); };

  let upstream;
  try {
    upstream = await fetch(cfg.base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        temperature: cfg.temperature,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      })
    });
  } catch (e) {
    return sendError('无法连接大模型服务：' + e.message);
  }

  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try { detail = await upstream.text(); } catch (e) { /* ignore */ }
    return sendError('大模型返回错误 ' + upstream.status + '：' + detail.slice(0, 300));
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.indexOf('data:') !== 0) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') { sse(res, { ok: true, done: true }); res.end(); return; }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          if (delta && delta.content) sse(res, { ok: true, delta: delta.content });
        } catch (e) { /* 忽略无法解析的片段 */ }
      }
    }
  } catch (e) {
    return sendError('读取大模型响应失败：' + e.message);
  }
  sse(res, { ok: true, done: true });
  res.end();
}

/* ---------------------------------------------------------------- 路由 */
const server = http.createServer(async (req, res) => {
  // URL 为 Node 全局（WHATWG），直接使用即可
  const p = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).pathname;

  if (req.method === 'GET' && p === '/api/hexagrams') {
    return sendJSON(res, 200, YI.HEXAGRAMS.map((g) => ({
      n: g.n, name: g.name, full: g.full,
      up: g.up, down: g.down,
      upNature: g.upNature, downNature: g.downNature,
      lines: g.lines,
      guaci: g.guaci, guaciJie: g.guaciJie, li: g.li
    })));
  }

  if (req.method === 'GET' && p === '/api/ai/status') {
    const cfg = loadLLMConfig();
    return sendJSON(res, 200, {
      configured: !!cfg.key,
      base: cfg.base,
      model: cfg.model
    });
  }

  if (req.method === 'POST' && p === '/api/divine') {
    let body = {};
    try { body = await readBody(req); } catch (e) { /* 允许空体 */ }
    const tosses = (Array.isArray(body.tosses) && body.tosses.length === 6 &&
      body.tosses.every((t) => [6, 7, 8, 9].indexOf(t) >= 0))
      ? body.tosses
      : Divine.tossHexagram();
    const r = Divine.buildResult(tosses);
    return sendJSON(res, 200, {
      ok: true,
      question: (body.question || '').slice(0, 500),
      result: packResult(r),
      text: Divine.toText(r, body.question)
    });
  }

  if (req.method === 'POST' && p === '/api/ai/interpret') {
    let body = {};
    try { body = await readBody(req); } catch (e) {
      return sendJSON(res, 400, { ok: false, error: '请求体解析失败' });
    }
    return aiInterpret(req, res, body);
  }

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);

  sendJSON(res, 405, { ok: false, error: 'method not allowed' });
});

server.listen(PORT, HOST, () => {
  const cfg = loadLLMConfig();
  console.log('');
  console.log('  ██ 赛博卜卦 · Cyber Divination');
  console.log('  ──────────────────────────────────────────');
  console.log('  本地访问： http://localhost:' + PORT);
  console.log('  六十四卦： ' + YI.HEXAGRAMS.length + ' 卦已载入');
  console.log('  大模型接口：' + (cfg.key
    ? '已配置（' + cfg.model + ' @ ' + cfg.base + '）'
    : '未配置 —— 将回传提示词供手动复制'));
  console.log('  ──────────────────────────────────────────');
  console.log('');
});
