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

  /* 由一爻的数值反推三枚铜钱的正反与记分
   *   背（阳）记 3 分，字（阴）记 2 分，三枚相加即该爻之数：
   *     6 = 字字字(2+2+2) ｜ 7 = 一背两字(3+2+2)
   *     8 = 两背一字(3+3+2) ｜ 9 = 背背背(3+3+3)
   *   7 / 8 时三枚的先后次序本无所谓，这里用种子化的伪随机打乱，
   *   既贴近真实掷钱的手感，又保证同一爻每次展示的结果稳定。 */
  function coinFaces(t, seed) {
    var s = (seed == null ? Math.floor(Math.random() * 2147483647) : seed) % 2147483647;
    var r = function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

    var points = (t === 6) ? [2, 2, 2]
               : (t === 9) ? [3, 3, 3]
               : (t === 7) ? [3, 2, 2]
               :             [3, 3, 2];

    for (var i = points.length - 1; i > 0; i--) {        // Fisher–Yates 洗牌
      var j = Math.floor(r() * (i + 1));
      var tmp = points[i]; points[i] = points[j]; points[j] = tmp;
    }
    return points.map(function (p) {
      return { point: p, face: p === 3 ? '背' : '字', yang: p === 3 };
    });
  }

  /* 取一段文字的开头若干句（按中文句读切分），用于拼白话摘要 */
  function firstSentences(s, n, max) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var arr = s.match(/[^。！？]*[。！？]|[^。！？]+/g) || [s];
    var out = arr.slice(0, n).join('');
    if (max && out.length > max) out = out.slice(0, max).replace(/[，、；]$/, '') + '…';
    return out;
  }

  /* 去掉句尾标点，避免嵌进「」或再补句号时出现「……。」、」。。」这类叠点 */
  function trimPunct(s) {
    return String(s == null ? '' : s).trim().replace(/[。！？，、；]+$/, '');
  }

  /* 把四字格要义包成「」，供白话摘要引用 */
  function quote(s) {
    var t = trimPunct(s);
    return t ? '「' + t + '」' : '';
  }

  /* ── 白话总结：先给结论、说人话，不堆术语 ──────────────────
   * 结果区顶部那一段。刻意避开「当位 / 承乘 / 相应」这类行话，
   * 只讲三件事：眼下什么处境、事情往哪走、内里还有什么隐情。 */
  function plainSummary(res) {
    var b = res.ben, v = res.bian, h = res.hu;
    var items = [];

    var qb = quote(b.guaciJie);
    var qv = v ? quote(v.guaciJie) : '';
    var qh = h ? quote(h.guaciJie) : '';

    items.push({
      label: '眼下的处境',
      text: '这一卦是【' + b.full + '】' + (qb ? '，要义就在' + qb + '——' : '。') +
            firstSentences(b.li, 2, 120)
    });

    if (v) {
      items.push({
        label: '事情往哪走',
        text: '这次掷出 ' + res.moving.length + ' 个动爻，说明局面正在起变化，不会一直停在原处。' +
              '大的方向，是从【' + b.full + '】慢慢走到【' + v.full + '】' +
              (qv ? '，往后的关键在' + qv : '') +
              '。说白了：' + firstSentences(v.li, 1, 72)
      });
    } else {
      items.push({
        label: '事情往哪走',
        text: '这次六爻都是静爻，一个动爻也没有，说明眼下局面比较稳，暂时看不出大的转折。' +
              '这种时候不必急着求变，把手上的事做扎实、把本卦的意思守住，比另起炉灶更妥当。'
      });
    }

    if (h) {
      items.push({
        label: '内里的隐情',
        text: '台面底下还有一层，看互卦【' + h.full + '】' +
              (qh ? '：' + qh + '——' : '。') +
              firstSentences(h.li, 1, 84)
      });
    }

    items.push({
      label: '一句话记住',
      text: (trimPunct(b.guaciJie) ? trimPunct(b.guaciJie) + '——' : '') +
            '卦只是帮你看清处境，主意还得你自己拿。'
    });

    return {
      head: b.full + (v ? '　→　' + v.full : '　·　六爻皆静'),
      items: items,
      html: items.map(function (it) {
        return '<div class="sum-item">' +
                 '<div class="sum-l">' + esc4(it.label) + '</div>' +
                 '<div class="sum-t">' + esc4(it.text) + '</div>' +
               '</div>';
      }).join(''),
      text: items.map(function (it) { return '【' + it.label + '】' + it.text; }).join('\n')
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

  /* 解释「为什么会变卦」—— 这是最容易被误解的一环
   * 要点：变卦由「掷出老阴 6 / 老阳 9」引起，与当位与否【没有】因果关系。 */
  function explainMoving(res) {
    if (!res.moving.length) {
      return '本次六爻皆静（六爻都是少阳或少阴，没有掷出老阴或老阳），因此不产生变卦，只看本卦即可。';
    }
    var names = res.moving.map(function (i) {
      return YAO_POS_NAME[i] + '爻（' + res.ben.yaos[i].name + '）';
    }).join('、');
    var detail = res.moving.map(function (i) {
      var t = res.tosses[i];
      return YAO_POS_NAME[i] + '爻掷得' +
             (t === 9 ? '老阳 9，阳极生阴，阳转而为阴' : '老阴 6，阴极生阳，阴转而为阳');
    }).join('；');
    return '变卦【不是】因为某爻「不当位」才产生，而是因为掷出了老阴（6）或老阳（9）——' +
           '物极必反，阳极生阴、阴极生阳，这样的爻称为动爻，动则生变。' +
           '本次共 ' + res.moving.length + ' 个动爻：' + names + '。' +
           '逐一来说是：' + detail + '。' +
           '把这些动爻的阴阳翻转后，即由【' + res.ben.name + '卦】变为【' + res.bian.name + '卦】。' +
           '要注意的是，「当位 / 不当位」是另一套体系，只用来辅助判断一爻的吉凶，并不决定这个爻会不会变——' +
           '一个当位的爻照样可能掷成老阳而发动，一个不当位的爻也完全可能掷成少阴而安静不动。';
  }

  /* 本卦 / 变卦 / 互卦 三者之间的关系（既给前端 HTML，也给大模型纯文本） */
  function esc4(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function relationInfo(res) {
    var b = res.ben, v = res.bian, h = res.hu;

    // 由三爻阴阳（自下而上）反查八卦名
    function tg(arr) {
      var code = arr.join('');
      for (var k in YI.TRIGRAMS) {
        if ((YI.TRIGRAMS[k] || []).join('') === code) return k;
      }
      return '';
    }

    var blocks = [];
    var text = [];

    // —— 本卦与变卦（本之卦）——
    if (v) {
      var flips = res.moving.map(function (i) {
        var fromY = res.benLines[i] === 1, toY = res.bianLines[i] === 1;
        var dir = fromY ? '阳化为阴' : '阴化为阳';
        var cause = res.tosses[i] === 9 ? '掷得老阳 9（阳极生阴）' : '掷得老阴 6（阴极生阳）';
        return '第 ' + YAO_POS_NAME[i] + ' 爻（' + res.ben.yaos[i].name + '）由' + dir + '（' + cause + '）';
      }).join('；');

      var benBian = '本卦是「体」，看事情的初始与现状；变卦是「用」，看事情的归宿与趋势。' +
        '本次共有 ' + res.moving.length + ' 个动爻，正是局势流转的枢纽：' + flips + '。' +
        '把这些动爻翻转，便由【' + b.full + '】变为【' + v.full + '】——' +
        '整件事的走向，便是从「' + b.full + '」的处境，逐渐推移到「' + v.full + '」的处境。';
      blocks.push({ title: '本卦 → 变卦（本之卦）', body: benBian });
      text.push('【本卦与变卦的关系】' + benBian);
    } else {
      var nb = '六爻皆静，没有出现动爻，因此不生成变卦。这意味着当前处境相对稳定，本卦即定局，' +
        '重在持守本卦之意、静观其变，不必急于求变。此时只看本卦即可。';
      blocks.push({ title: '本卦 → 变卦', body: nb });
      text.push('【本卦与变卦的关系】' + nb);
    }

    // —— 本卦与互卦（互体）——
    if (h) {
      var lower = [res.benLines[1], res.benLines[2], res.benLines[3]]; // 二、三、四爻 = 互卦下卦
      var upper = [res.benLines[2], res.benLines[3], res.benLines[4]]; // 三、四、五爻 = 互卦上卦
      var ln = tg(lower), un = tg(upper);
      var benHu = '互卦由本卦中间四爻叠成：取第二、三、四爻为下卦（' + ln + '），第三、四、五爻为上卦（' + un + '），合成【' + h.full + '】。' +
        '本卦看的是事情的「面」（显在的处境），互卦看的是事情的「底」（隐微的过程与内情）。' +
        '本卦像台面上的戏，互卦像幕后的因果——往往正是互卦所揭示的内在矛盾或潜流，推动着事情由本卦走向变卦。';
      blocks.push({ title: '本卦 → 互卦（互体）', body: benHu });
      text.push('【本卦与互卦的关系】' + benHu);
    }

    // —— 三卦合参 ——
    var summary = '合起来看：以本卦【' + b.full + '】为起点（现状 · 来龙），互卦【' + (h ? h.full : '—') + '】为过程（内情 · 隐微），' +
      (v ? '变卦【' + v.full + '】为归宿（趋势 · 去脉）' : '本卦即定局，无变卦') +
      '。三者一脉相承，正构成这件事的「来龙—去脉」。';
    blocks.push({ title: '三卦合参', body: summary });
    text.push(summary);

    return {
      html: blocks.map(function (bk) {
        return '<div class="rel-item"><div class="rel-h">' + esc4(bk.title) + '</div><div class="rel-b">' + esc4(bk.body) + '</div></div>';
      }).join(''),
      text: text.join('\n')
    };
  }

  /* 把结果整理成便于展示 / 便于喂给大模型的纯文本 */
  function toText(res, question) {
    var L = [];
    L.push('【所问之事】' + (question && question.trim() ? question.trim() : '（未填写，只作通论）'));
    L.push('');
    L.push('【本卦】第 ' + res.ben.n + ' 卦 · ' + res.ben.full + '（' + res.ben.upNature + '上' + res.ben.downNature + '下）');
    L.push('　卦辞：' + res.ben.guaci);
    L.push('　卦辞精解：' + res.ben.guaciJie);
    L.push('　大象传：' + res.ben.daxiang);
    L.push('　卦理：' + res.ben.li);

    if (res.bian) {
      L.push('');
      L.push('【变卦】第 ' + res.bian.n + ' 卦 · ' + res.bian.full + '（' + res.bian.upNature + '上' + res.bian.downNature + '下）');
      L.push('　卦辞：' + res.bian.guaci);
      L.push('　卦辞精解：' + res.bian.guaciJie);
      L.push('　大象传：' + res.bian.daxiang);
      L.push('　卦理：' + res.bian.li);
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
      L.push('　' + (isM ? '★ ' : '　') + YAO_POS_NAME[i] + '爻 ' + y.name +
             '（' + coin + (isM ? '，动爻' : '') + '）');
      L.push('　　爻辞：' + y.ci);
      L.push('　　小象传：' + y.xiang);
      L.push('　　爻位：' + y.wei);
      L.push('　　精解：' + y.jie);
      if (y.yi) L.push('　　详解：' + y.yi);
    });

    L.push('');
    L.push('【为何变卦】' + explainMoving(res));

    var rel = relationInfo(res);
    L.push('');
    L.push('【三卦关系】');
    L.push(rel.text);

    var rule = judgeRule(res);
    L.push('');
    L.push('【断卦例法】' + rule.text + ' —— ' + rule.focus);

    return L.join('\n');
  }

  /* 构造喂给外部大模型的 Prompt */
  function buildPrompt(res, question) {
    return [
      '你是「赛博卜卦」的解卦顾问，深通《周易》的象、数、理与历代传注。',
      '请严格依据下面提供的卦象资料（卦辞、大象传、小象传、爻辞、爻位分析），',
      '结合提问者所问之事，做一次独立、审慎、有针对性的分析。',
      '',
      '## 必须先厘清的两个概念（不可混淆）',
      '- 变卦：只因掷出老阴(6)或老阳(9)「物极必反」而产生，与当位与否无关。',
      '- 当位 / 不当位：是另一套判断吉凶的参考体系，不决定爻会不会变。',
      '解卦时不要把两者混为一谈，更不要说成「因为不当位所以变了卦」。',
      '',
      '## 输出要求（务必照此分段）',
      '1. 【一句话总断】：先用一句不超过 40 字的话，直接回应所问之事——是宜进还是宜守、大致什么走向。放在最前面。',
      '2. 【说人话】：用大白话把这一卦讲清楚：现在是个什么处境、卡在哪里、为什么会这样。',
      '   写完这一段，读者应该不看任何注解也能懂。',
      '3. 【卦象透视】：再说本卦、（若有）变卦与互卦合起来呈现出什么画面，动爻落在哪个阶段。',
      '4. 【该怎么做】：给 3 条具体、可执行、贴着所问之事的建议，按优先级排列，每条一句话说清「做什么」。',
      '5. 【留个心眼】：点出最需要避开的一两个坑。',
      '6. 结尾一句提醒：卦只是帮你看清处境，主意还得自己拿；内容仅供文化参考，不构成重大决策依据。',
      '7. 排版：每个【小标题】单独成一段（以小标题开头，不要加 # 号等 Markdown 标记），不要多个分点挤在同一行。',
      '',
      '## 语言风格（很重要）',
      '- 说人话，像一位长辈当面跟你聊，不端着、不掉书袋。',
      '- 尽量少用「当位、承乘、相应、得中」这类术语；非用不可时，必须用括号立刻用大白话解释一句。',
      '- 不要大段引用或逐句翻译文言原文；要用，也只挑一两句，并且立刻翻译成白话。',
      '- 不故弄玄虚、不宿命论断、不复述你的思考过程，直接给结论和理由。',
      '- 全文控制在 600 字以内，宁短勿长。',
      '',
      '## 卦象资料',
      toText(res, question),
      '',
      '## 请开始解卦'
    ].join('\n');
  }

  /* 仅取提示词开头一小部分（约前 11 行 / 300 字）作为概览，剩余隐藏。
   * 与前端 app.js 的 previewPrompt 同源：界面只可查看概览、不可复制全文。 */
  var PROMPT_PREVIEW_LINES = 11;
  var PROMPT_PREVIEW_CHARS = 300;
  function previewPrompt(res, question) {
    var p = buildPrompt(res, question);
    var lines = p.split('\n');
    var head = lines.slice(0, PROMPT_PREVIEW_LINES).join('\n');
    if (head.length > PROMPT_PREVIEW_CHARS) head = head.slice(0, PROMPT_PREVIEW_CHARS);
    var omitted = lines.length - PROMPT_PREVIEW_LINES;
    var more = '';
    if (omitted > 0 || head.length < p.length) {
      more = '\n\n……（以下卦象资料与要求已隐藏，仅供概览，不可复制）';
    }
    return head + more;
  }

  return {
    tossYao: tossYao,
    tossHexagram: tossHexagram,
    buildResult: buildResult,
    coinFaces: coinFaces,
    plainSummary: plainSummary,
    judgeRule: judgeRule,
    explainMoving: explainMoving,
    relationInfo: relationInfo,
    toText: toText,
    buildPrompt: buildPrompt,
    previewPrompt: previewPrompt,
    YAO_POS_NAME: YAO_POS_NAME
  };
});
