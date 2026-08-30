/* Node 侧桥接：加载浏览器版 hexagrams.js 并导出其中的 YI 对象
 * 这样「六十四卦数据」在前后端只维护一份，避免两处不同步。 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'hexagrams.js'), 'utf8');
// 用参数遮蔽 globalThis，让 IIFE 把 YI 挂到我们传入的普通对象上
const load = new Function('globalThis', 'window', src + '\nreturn globalThis.YI;');
const YI = load({}, undefined);

module.exports = YI;
