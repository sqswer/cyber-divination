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
 *  ★ 免费 / 开源模型参考示例见 llm.config.free-example.json（如 OpenRouter
 *    的 :free 档、硅基流动、或把 deepseek-v4-flash 这类开源权重自建端点）。
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
    temperature: Number(process.env.LLM_TEMPERATURE || file.temperature || 0.7),
    // 置 1 时，请求里带上 enable_thinking:false，让推理模型干脆别产出思考过程。
    // 只有明确支持该参数的服务端才建议开启（不支持的会忽略或报错），默认关闭。
    disableThinking: String(process.env.LLM_DISABLE_THINKING || file.disableThinking || '') === '1',
    // 置 1 时把思考过程也一并发给前端（仅供排查问题，默认关闭）
    showThinking: String(process.env.LLM_SHOW_THINKING || file.showThinking || '') === '1',
    /* 生成长度上限。推理模型会先烧掉大量 token 思考，若上限太低就可能「思考没完
     * 就被截断」，正文一个字都吐不出来，前端便显示「模型未返回内容」。
     * 故这里给一个足够宽裕的默认值，可按服务商额度调整。 */
    maxTokens: Number(process.env.LLM_MAX_TOKENS || file.maxTokens || 4096)
  };
}

const SYSTEM_PROMPT = [
  '你是「赛博卜卦」的解卦顾问，熟悉《周易》的象、数与历代传注。',
  '你的职责：依据给定的卦象资料，结合提问者所问之事，给出独立、审慎、有针对性的分析。',
  '表达要求：说人话。像一位有阅历的长辈当面聊天，平实、有分寸，不掉书袋。',
  '尽量不用「当位、承乘、相应、得中」这类术语；非用不可时必须立刻用大白话解释一句。',
  '不要复述你的思考过程，直接给结论和理由；不故弄玄虚，不宿命论断，不替提问者做决定。',
  '语言：简体中文，篇幅宁短勿长。'
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
    // 未配置密钥：仅回传提示词概览（不暴露完整 prompt，界面仅可查看、不可复制）
    return sendJSON(res, 200, {
      ok: false,
      reason: 'not_configured',
      message: '尚未配置大模型密钥。下方仅展示提示词概览；在项目根目录建 llm.config.json 填好 base / key / model 后重启服务，即可自动接入。',
      prompt: Divine.previewPrompt(result, question)
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  /* ── SSE 保活（这是「模型未返回内容」的真正解药）─────────────────────
   * 推理模型（DeepSeek-R1 等）会先花十几秒到几十秒「思考」，这段时间产品上
   * 不展示思考过程，于是服务端对浏览器长时间一个字节都不写。线上一旦经过
   * 反向代理 / CDN（Bonto、Nginx、Cloudflare 等），空闲连接会被 idle timeout
   * 直接掐断 —— 前端读到 done 而 acc 为空，就显示「模型未返回内容」。
   * 本地直连没有网关，所以怎么测都正常，线上必现。
   *
   * 对策：建连后立刻发首帧，并每 10 秒写一行 SSE 注释（": ping"）。注释行
   * 是 SSE 规范的合法内容、前端会自动忽略，但足以让所有中间网关认为连接活跃。 */
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) return;
    try { res.write(': ping\n\n'); } catch (e) { /* 连接已断，交由 close 处理 */ }
  }, 10000);
  const stopBeat = () => { alive = false; clearInterval(heartbeat); };
  res.on('close', stopBeat);

  // 建连首帧：让前端立刻知道通道已开（同时把首字节尽早送出网关）
  sse(res, { ok: true, phase: 'connected' });

  const sendError = (msg) => { stopBeat(); sse(res, { ok: false, error: msg }); res.end(); };

  /* 推理模型（DeepSeek-R1、Qwen-QwQ、各类 -thinking/-reasoning 等）默认把结论
   * 也放进 reasoning_content。尝试关掉思考以缩短等待：不同服务商的参数位置不一
   * 致 —— 有的读顶层 enable_thinking（硅基流动 Qwen3 系列），有的读
   * chat_template_kwargs.enable_thinking（vLLM / 部分自建端点），故两处都写，
   * 不认识的服务端会直接忽略。
   * ★ 注意：对 DeepSeek-R1 这类「纯推理」模型，思考是模型固有行为，两个参数都
   *   关不掉（实测硅基流动 R1-Qwen3-8B 仍产出数百帧 reasoning）。所以真正保证
   *   可用性的是上面的心跳保活 + 下面的进度帧，而不是这个开关。 */
  var thinkingOff = cfg.disableThinking;
  if (!thinkingOff && /r1|qwq|reasoning|thinking|deepseek-reasoner|o1|o3/i.test(cfg.model || '')) {
    thinkingOff = true;
  }

  let upstream;
  try {
    upstream = await fetch(cfg.base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      // 上游若长时间无响应则主动放弃，避免请求永久悬挂
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify(Object.assign({
        model: cfg.model,
        stream: true,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      }, thinkingOff
        ? { enable_thinking: false, chat_template_kwargs: { enable_thinking: false } }
        : {}))
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
  let finished = false;
  let gotContent = false;
  let sawReasoning = false;
  let reasoningBuf = '';
  let finishReason = '';
  let lastBeat = Date.now();

  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.indexOf('data:') !== 0) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') { finished = true; break; }
          try {
            const json = JSON.parse(payload);
            /* 容错提取正文与思考：兼容 OpenAI 标准（choices[0].delta.content）、
             * 部分类 OpenAI 端点（choices[0].delta.message.content / 顶层
             * content·text·delta），以及 reasoning_content 的各种落点。
             * 只要模型真吐了字，就不再误判为「未返回内容」。 */
            const c = json.choices && json.choices[0];
            const d = c && c.delta;
            const m = (c && c.message) || (d && d.message);
            const content =
              (d && typeof d.content === 'string' ? d.content : '') ||
              (m && typeof m.content === 'string' ? m.content : '') ||
              (typeof json.content === 'string' ? json.content : '') ||
              (typeof json.text === 'string' ? json.text : '') ||
              (typeof json.delta === 'string' ? json.delta : '');
            const reason =
              (d && typeof d.reasoning_content === 'string' ? d.reasoning_content : '') ||
              (d && typeof d.reasoning === 'string' ? d.reasoning : '') ||
              (m && typeof m.reasoning_content === 'string' ? m.reasoning_content : '') ||
              (typeof json.reasoning_content === 'string' ? json.reasoning_content : '');
            if (c && c.finish_reason) finishReason = c.finish_reason;
            if (reason) {
              sawReasoning = true;
              reasoningBuf += reason;
              if (cfg.showThinking) {
                sse(res, { ok: true, delta: reason });
              } else {
                /* 思考过程不外发，但要让前端知道「模型正在动」：每 1.5 秒下发一个
                 * 只含字数的进度帧。既给用户实时反馈（避免以为卡死），也和上面的
                 * 心跳一起把连接喂活，防止网关掐断。不含任何思考内容。 */
                const now = Date.now();
                if (now - lastBeat > 1500) {
                  lastBeat = now;
                  sse(res, { ok: true, phase: 'thinking', chars: reasoningBuf.length });
                }
              }
            }
            if (content) {
              sse(res, { ok: true, delta: content });
              gotContent = true;
            }
          } catch (e) { /* 忽略无法解析的片段 */ }
      }
      if (finished) break;
    }
  } catch (e) {
    return sendError('读取大模型响应失败：' + e.message);
  }

  // 一个字都没吐出来 —— 兜底处理，不让前端干巴巴显示「未返回内容」
  if (!gotContent) {
    if (sawReasoning && reasoningBuf) {
      /* 推理模型把话都说在思考里、没吐正式答案。最常见的原因是 max_tokens 被
       * 思考吃满（finish_reason=length）。此时把推演过程整理后下发，至少让用户
       * 看到实质内容，而不是一句"未返回内容"。 */
      sse(res, {
        ok: true,
        notice: finishReason === 'length'
          ? '（模型思考过长、正式结论被长度限制截断，以下为其推演过程）'
          : '（模型未给出正式结论，以下为其推演过程）'
      });
      sse(res, { ok: true, delta: reasoningBuf });
      gotContent = true;
    } else {
      sse(res, {
        ok: false,
        notice: finishReason === 'length'
          ? '模型输出被长度限制截断，未能给出结论。可调高 llm.config.json 的 maxTokens 后重试。'
          : '模型未返回内容，请点「重新分析」再试一次。'
      });
    }
  }

  stopBeat();
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
