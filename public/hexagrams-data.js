/* Node 侧桥接：加载浏览器版 hexagrams.js 并导出其中的 YI 对象
 * 这样「六十四卦数据」在前后端只维护一份，避免两处不同步。 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'hexagrams.js'), 'utf8');
// 用参数遮蔽 globalThis，让 IIFE 把 YI 挂到我们传入的普通对象上
const load = new Function('globalThis', 'window', src + '\nreturn globalThis.YI;');
const YI = load({}, undefined);

// 合并逐爻详解（yao-yi.js，可选）：让服务端也能把「详解」喂给大模型
try {
  const YAO_YI = require('./yao-yi.js');
  YI.HEXAGRAMS.forEach(function (g) {
    const m = YAO_YI[String(g.n)];
    if (!m) return;
    g.yaos.forEach(function (y) { if (m[y.name]) y.yi = m[y.name]; });
  });
} catch (e) { /* yao-yi.js 不存在时忽略 */ }

module.exports = YI;
