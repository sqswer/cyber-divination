/* ==========================================================================
 * 赛博卜卦 · 起卦引擎（Node 与浏览器共用）
 * --------------------------------------------------------------------------
 * 起卦法：三枚铜钱法（六爻正宗之一）
 *   每爻掷三枚铜钱，一次成一爻，自下而上共六次成卦。
 *   铜钱记分：背（阳）= 3 分，字（阴）= 2 分，三枚相加：
 *     6 = 老阴（阴爻 · 动爻，阴极生阳，变而为阳）
 *     7 = 少阳（阳爻 · 静爻）
 *     8 = 少阴（阴爻 · 静爻）
 *     9 = 老阳（阳爻 · 动爻，阳极生阴，变而为阴）
 *   概率：老阴 1/8 ｜ 少阳 3/8 ｜ 少阴 3/8 ｜ 老阳 1/8 —— 与古法相符。
 *
 * 断卦例法（依朱熹《易学启蒙》）：
 *   0 动爻 → 本卦卦辞          1 动爻 → 本卦动爻爻辞
 *   2 动爻 → 本卦两爻辞（上爻为主） 3 动爻 → 本卦卦辞为主，参变卦卦辞
 *   4 动爻 → 变卦两静爻辞（下爻为主）5 动爻 → 变卦唯一静爻辞
 *   6 动爻 → 变卦卦辞（乾坤用九 / 用六）
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./hexagrams-data.js'));
  } else {
    root.Divine = factory(root.YI);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (YI) {
  'use strict';

  /* 掷一爻：返回 6 / 7 / 8 / 9 —— 严格按三枚铜钱的概率分布 */
  function tossYao(rand) {
    var r = rand || Math.random;
    var sum = 0;
    for (var i = 0; i < 3; i++) {
      // 背(阳)记 3，字(阴)记 2，正反各 1/2
      sum += r() < 0.5 ? 3 : 2;
    }
    return sum; // 6 / 7 / 8 / 9
  }

  /* 起一卦：自下而上六爻 */
  function tossHexagram(rand) {
    var tosses = [];
    for (var i = 0; i < 6; i++) tosses.push(tossYao(rand));
    return tosses;
  }

  /* 由六次掷钱结果推导完整卦象结构 */
  function buildResult(tosses) {
    // 本卦阴阳（自下而上，1=阳 0=阴）
    var benLines = tosses.map(function (t) { return (t === 7 || t === 9) ? 1 : 0; });
    // 动爻位置（老阴 6 / 老阳 9 为动爻）
    var moving = [];
    tosses.forEach(function (t, i) { if (t === 6 || t === 9) moving.push(i); });
    // 变卦：动爻阴阳互变
    var bianLines = benLines.map(function (v, i) {
      return moving.indexOf(i) >= 0 ? (v === 1 ? 0 : 1) : v;
    });

    var ben = YI.byLines(benLines);
    var bian = moving.length ? YI.byLines(bianLines) : null;
    var hu = YI.nuclear(benLines);

    return {
      tosses: tosses,          // 6/7/8/9，自下而上
      benLines: benLines,
      bianLines: moving.length ? bianLines : null,
      moving: moving,          // 动爻索引（0=初爻 … 5=上爻）
      ben: ben,
      bian: bian,
      hu: hu
    };
  }

  /* 动爻 / 静爻的中文叫法 */
  var YAO_POS_NAME = ['初', '二', '三', '四', '五', '上'];

  function yaoLabel(hex, idx) {
    if (!hex) return '';
    var y = hex.yaos[idx];
    return YAO_POS_NAME[idx] + '爻（' + y.name + '）';
  }

  /* 依《易学启蒙》定出「主断」对象 */
  function judgeRule(res) {
    var m = res.moving.length;
    switch (m) {
      case 0:
        return { text: '六爻皆静，无动爻', focus: '以【本卦 · ' + res.ben.name + '卦】卦辞为主断。', useBiangua: false };
      case 1:
        return { text: '一个动爻：' + yaoLabel(res.ben, res.moving[0]), focus: '以【本卦 · ' + res.ben.name + '卦】' + yaoLabel(res.ben, res.moving[0]) + '爻辞为主断。', useBiangua: false };
      case 2:
        return { text: '两个动爻：' + yaoLabel(res.ben, res.moving[0]) + '、' + yaoLabel(res.ben, res.moving[1]),
                 focus: '以【本卦 · ' + res.ben.name + '卦】两动爻爻辞合参，' + yaoLabel(res.ben, res.moving[1]) + '为主。', useBiangua: false };
      case 3:
        return { text: '三个动爻', focus: '以【本卦 · ' + res.ben.name + '卦】卦辞为主，参【变卦 · ' + (res.bian ? res.bian.name : '—') + '卦】卦辞。', useBiangua: true };
      case 4: {
        var still = [0, 1, 2, 3, 4, 5].filter(function (i) { return res.moving.indexOf(i) < 0; });
        return { text: '四个动爻，静爻为 ' + yaoLabel(res.ben, still[0]) + '、' + yaoLabel(res.ben, still[1]),
                 focus: '以【变卦 · ' + (res.bian ? res.bian.name : '—') + '卦】两静爻爻辞为主，' + yaoLabel(res.bian, still[0]) + '为主。', useBiangua: true };
      }
      case 5: {
        var still5 = [0, 1, 2, 3, 4, 5].filter(function (i) { return res.moving.indexOf(i) < 0; })[0];
        return { text: '五个动爻，静爻为 ' + yaoLabel(res.ben, still5),
                 focus: '以【变卦 · ' + (res.bian ? res.bian.name : '—') + '卦】' + yaoLabel(res.bian, still5) + '爻辞为主断。', useBiangua: true };
      }
      default:
        return { text: '六爻皆动', focus: '以【变卦 · ' + (res.bian ? res.bian.name : '—') + '卦】卦辞为主断' +
                 (res.ben.name === '乾' ? '（乾卦六爻皆动，另参「用九：见群龙无首，吉」）' :
                  res.ben.name === '坤' ? '（坤卦六爻皆动，另参「用六：利永贞」）' : '') + '。', useBiangua: true };
    }
  }

  /* 把结果整理成便于展示 / 便于喂给大模型的纯文本 */
  function toText(res, question) {
    var L = [];
    L.push('【所问之事】' + (question && question.trim() ? question.trim() : '（未填写，只作通论）'));
    L.push('');
    L.push('【本卦】第 ' + res.ben.n + ' 卦 · ' + res.ben.full + '（' + res.ben.upNature + '上' + res.ben.downNature + '下）');
    L.push('　卦辞：' + res.ben.guaci);
    L.push('　曾仕强卦辞精解：' + res.ben.guaciJie);
    L.push('　曾仕强卦理：' + res.ben.li);

    if (res.bian) {
      L.push('');
      L.push('【变卦】第 ' + res.bian.n + ' 卦 · ' + res.bian.full + '（' + res.bian.upNature + '上' + res.bian.downNature + '下）');
      L.push('　卦辞：' + res.bian.guaci);
      L.push('　曾仕强卦辞精解：' + res.bian.guaciJie);
      L.push('　曾仕强卦理：' + res.bian.li);
    }
    if (res.hu) {
      L.push('');
      L.push('【互卦】第 ' + res.hu.n + ' 卦 · ' + res.hu.full + '（' + res.hu.upNature + '上' + res.hu.downNature + '下）');
      L.push('　卦理：' + res.hu.li);
    }

    L.push('');
    L.push('【六爻详解】（自下而上，★ 为动爻）');
    res.ben.yaos.forEach(function (y, i) {
      var isM = res.moving.indexOf(i) >= 0;
      var coin = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' }[res.tosses[i]];
      L.push('　' + (isM ? '★ ' : '　') + YAO_POS_NAME[i] + '爻 ' + y.name + '（' + coin + '）：' + y.ci);
      L.push('　　曾仕强精解：' + y.jie);
    });

    var rule = judgeRule(res);
    L.push('');
    L.push('【断卦例法】' + rule.text + ' —— ' + rule.focus);

    return L.join('\n');
  }

  /* 构造喂给外部大模型的 Prompt */
  function buildPrompt(res, question) {
    return [
      '你是「赛博卜卦」的解卦顾问。请严格依据下面提供的《易经》卦象资料与曾仕强先生的解读，',
      '结合提问者所问之事，做一次独立、审慎、有针对性的分析。',
      '',
      '## 输出要求',
      '1. 先用不超过 80 字给出【一句话总断】，直接回应所问之事的吉凶与走向。',
      '2. 【卦象透视】：说明本卦、（若有）变卦与互卦合起来呈现出怎样的处境，动爻落在哪一阶段。',
      '3. 【曾仕强视角】：援引下方资料中的卦理与爻辞精解，讲清「此刻该守还是该进、该显还是该藏」。',
      '4. 【行动建议】：给出 3 条具体、可执行、贴合所问之事的建议，按优先级排列。',
      '5. 【风险提示】：点出最需要避免的一两个坑。',
      '6. 结尾附一句提醒：卦者，时也；知进退存亡而不失其正，方为善用易者。并注明内容仅供文化参考，不构成重大决策依据。',
      '',
      '## 风格',
      '平实、有分寸、不故弄玄虚、不迷信宿命；允许有温度，但避免空话套话。',
      '',
      '## 卦象资料',
      toText(res, question),
      '',
      '## 请开始解卦'
    ].join('\n');
  }

  return {
    tossYao: tossYao,
    tossHexagram: tossHexagram,
    buildResult: buildResult,
    judgeRule: judgeRule,
    toText: toText,
    buildPrompt: buildPrompt,
    YAO_POS_NAME: YAO_POS_NAME
  };
});
