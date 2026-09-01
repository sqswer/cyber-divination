/* ==========================================================================
 * 赛博卜卦 · 前端交互
 * ========================================================================== */
(function () {
  'use strict';

  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var POS_NAME = ['初', '二', '三', '四', '五', '上'];
  var COIN_NAME = { 6: '老阴 · 动', 7: '少阳 · 静', 8: '少阴 · 静', 9: '老阳 · 动' };

  /* 把逐爻详解（yao-yi.js）合并进六十四卦数据，使前后端共用同一份 */
  function mergeYi() {
    if (!window.YAO_YI) return;
    (window.YI.HEXAGRAMS || []).forEach(function (g) {
      var m = window.YAO_YI[String(g.n)];
      if (!m) return;
      g.yaos.forEach(function (y) { if (m[y.name]) y.yi = m[y.name]; });
    });
  }
  mergeYi();

  var state = {
    result: null,     // 当前卦象结果
    question: '',
    aiBusy: false
  };

  /* ───────────────────────────────────────────── 小工具 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 把大模型的输出做个轻量排版：【小标题】提为标题，数字条目成列表，
   * 其余成段。不做完整 Markdown，只为读起来清爽。 */
  function renderAI(s) {
    var html = '';
    var inList = false;
    function closeList() { if (inList) { html += '</div>'; inList = false; } }

    /* 渲染单块：识别【小标题】或 # 号 Markdown 标题、数字/符号列表、普通段落 */
    function emit(b) {
      b = b.trim();
      if (!b) return;
      var h = b.match(/^(?:#+\s*)?【\s*([^】]{1,20})\s*】\s*(.*)$/);
      if (h) {
        closeList();
        html += '<div class="ai-h">' + esc(h[1]) + '</div>';
        if (h[2]) html += '<div class="ai-p">' + esc(h[2]) + '</div>';
        return;
      }
      if (/^\d+\s*[\.、]/.test(b) || /^[-•·]\s*/.test(b)) {
        if (!inList) { html += '<div class="ai-ul">'; inList = true; }
        html += '<div class="ai-li">' + esc(b.replace(/^[-•·]\s*/, '')) + '</div>';
        return;
      }
      closeList();
      html += '<div class="ai-p">' + esc(b) + '</div>';
    }

    String(s == null ? '' : s).split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) { closeList(); return; }
      /* 模型常把多个「### 【小标题】…」挤在同一行，按 ### 边界切开成独立块 */
      var blocks = line.split(/(?=###\s)/).filter(function (x) { return x.trim(); });
      if (blocks.length > 1) blocks.forEach(emit);
      else emit(line);
    });
    closeList();
    return html;
  }

  function toast(msg) {
    var old = $('.toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  /* 渲染六爻卦画（lines 自下而上，1=阳 0=阴） */
  function hexFigure(lines, moving, delayBase) {
    var h = '<div class="hex-figure">';
    for (var i = 0; i < 6; i++) {
      var isM = moving && moving.indexOf(i) >= 0;
      var yang = lines[i] === 1;
      var delay = ((delayBase || 0) + i * 0.06).toFixed(2);
      h += '<div class="yao-bar ' + (yang ? 'yang' : 'yin') + (isM ? ' moving' : '') +
           '" style="animation-delay:' + delay + 's">' +
           '<span></span>' + (yang ? '' : '<span></span>') + '</div>';
    }
    return h + '</div>';
  }

  /* 一卦的完整详解块：卦辞 + 精解 + 大象传 + 卦理 */
  function guaBlock(hex, note) {
    if (!hex) return '';
    return '' +
      '<div class="gua-block">' +
        '<div class="gua-title">' +
          '<span class="n">第 ' + hex.n + ' 卦</span>' +
          '<span class="nm">' + esc(hex.name) + '卦</span>' +
          '<span class="sy">' + esc(hex.full) + '　' + esc(hex.upNature) + '上' + esc(hex.downNature) + '下' +
          (note ? '　·　' + esc(note) : '') + '</span>' +
        '</div>' +
        '<div class="gua-sec">' +
          '<h4>卦 辞</h4>' +
          '<div class="gua-ci">' + esc(hex.guaci) + '</div>' +
          '<div class="gua-jie">卦辞精解：' + esc(hex.guaciJie) + '</div>' +
          '<div class="gua-daxiang">大象传：' + esc(hex.daxiang) + '</div>' +
        '</div>' +
        '<div class="gua-sec">' +
          '<h4>卦 理</h4>' +
          '<div class="gua-li">' + esc(hex.li) + '</div>' +
        '</div>' +
      '</div>';
  }

  /* 掷钱明细：六爻各掷三枚铜钱的正反、记分与爻性（自下而上，即掷钱先后） */
  function coinDetailHtml(r) {
    var rows = r.tosses.map(function (t, i) {
      var faces = window.Divine.coinFaces(t, t * 7919 + i * 104729 + 13);
      var isM = (t === 6 || t === 9);
      return '<div class="cd-row' + (isM ? ' is-mv' : '') + '">' +
               '<span class="cd-pos">' + POS_NAME[i] + '爻</span>' +
               '<span class="cd-coins">' + faces.map(function (f) {
                 return '<i class="cd-coin ' + (f.yang ? 'back' : 'word') + '">' + f.face + '</i>';
               }).join('') + '</span>' +
               '<span class="cd-math">' +
                 faces.map(function (f) { return f.point; }).join(' + ') +
                 ' = <b>' + t + '</b>' +
               '</span>' +
               '<span class="cd-name">' + COIN_NAME[t] + '</span>' +
               '<span class="cd-mark">' + (isM ? '动' : '静') + '</span>' +
             '</div>';
    }).join('');

    return '<div class="cd-row cd-head">' +
             '<span>爻位</span><span>三枚铜钱</span><span>记分</span><span>爻性</span><span>动静</span>' +
           '</div>' + rows +
      '<p class="cd-tip">按掷钱先后自下而上：先得初爻，最后得上爻。' +
      '背（有图纹的一面）记 3 分，字（有字面）记 2 分，三枚相加得 6 / 7 / 8 / 9 —— ' +
      '6 为老阴、9 为老阳，物极必反，是为动爻；7 为少阳、8 为少阴，安静不动。</p>';
  }

  /* 本次掷钱记录：六爻各掷三枚，常驻结果页顶部，随时回看
   * 自下而上排列（初爻在下、上爻在顶），与卦画方向一致。 */
  function tossRecordHtml(r) {
    var rows = r.tosses.map(function (t, i) {
      var faces = window.Divine.coinFaces(t, t * 7919 + i * 104729 + 13);
      var isM = (t === 6 || t === 9);
      return '<div class="tr-row' + (isM ? ' is-mv' : '') + '">' +
               '<span class="tr-pos">' + POS_NAME[i] + '爻</span>' +
               '<span class="tr-coins">' + faces.map(function (f) {
                 return '<i class="tr-coin ' + (f.yang ? 'back' : 'word') + '">' + f.face + '</i>';
               }).join('') + '</span>' +
               '<span class="tr-math">' +
                 faces.map(function (f) { return f.point; }).join('+') +
                 '=<b>' + t + '</b></span>' +
               '<span class="tr-name">' + COIN_NAME[t] + '</span>' +
             '</div>';
    }).reverse().join('');
    return rows;
  }

  /* ───────────────────────────────────────────── 起卦
   * 每爻分两步：先摇三枚铜钱，再落定记分，最后爻条浮现。
   * 六爻走完约 3.9 秒，保留「掷钱成卦」的仪式感。 */
  var TOSS_MS = 650;   // 铜钱翻转时间（放慢，便于看清每一次掷的结果）
  var HOLD_MS = 720;   // 落定后停留时间

  function cast(tosses) {
    var btn = $('#castBtn');
    var coins = $('#coins');
    var stage = $('#castStage');
    var question = $('#question').value.trim();

    btn.disabled = true;
    coins.classList.add('on');
    stage.hidden = false;
    $('#result').hidden = true;
    resetStage();

    var payload = { question: question };
    if (tosses) payload.tosses = tosses;

    fetch('/api/divine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) { finishCast(btn, coins, stage); toast('起卦失败，请重试'); return; }
        playToss(data.result, function () {
          finishCast(btn, coins, stage);
          render(data);
        });
      })
      .catch(function () {
        // 接口不可用时，用本地引擎兜底（纯静态部署也能用）
        var r = window.Divine.buildResult(tosses || window.Divine.tossHexagram());
        var packed = {
          ok: true, question: question,
          result: {
            tosses: r.tosses, benLines: r.benLines, bianLines: r.bianLines,
            moving: r.moving, judge: window.Divine.judgeRule(r),
            ben: r.ben, bian: r.bian, hu: r.hu
          }
        };
        playToss(packed.result, function () {
          finishCast(btn, coins, stage);
          render(packed);
          toast('离线模式：已用本地引擎起卦');
        });
      });
  }

  var COIN_NOTE = {
    6: '三枚皆字 · 阴极生阳，动而变阳',
    7: '一背两字 · 阳爻安静不动',
    8: '两背一字 · 阴爻安静不动',
    9: '三枚皆背 · 阳极生阴，动而变阴'
  };

  /* 设置铜钱托盘：faces 为空表示正在翻转 */
  function setCoins(faces, flipping) {
    $$('#coinTray .ct-coin').forEach(function (c, k) {
      var faceEl = c.querySelector('.ct-face');
      var tagEl = c.querySelector('.ct-tag');
      if (flipping || !faces) {
        c.className = 'ct-coin rolling';
        faceEl.textContent = '☯';
        tagEl.textContent = '摇';
      } else {
        var f = faces[k];
        c.className = 'ct-coin ' + (f.yang ? 'is-back' : 'is-word') + ' settle';
        faceEl.textContent = f.face;
        tagEl.textContent = f.point + ' 分';
      }
    });
  }

  function resetStage() {
    var box = $('#castPending');
    box.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var d = document.createElement('div');
      d.className = 'seed';
      box.appendChild(d);
    }
    $('#stageText').innerHTML = '';
    $('#coinMath').innerHTML = '<span class="dim">背记 3 分 · 字记 2 分</span>';
    $('#stageStep').textContent = '准备';
    $('#stagePos').textContent = '静心默想所问之事';
    setCoins(null, true);
  }

  /* 逐爻掷钱：摇 → 落定 → 记分成爻 */
  function playToss(res, done) {
    var seeds = $$('#castPending .seed');
    var i = 0;

    function roll() {
      if (i >= 6) { settleAll(); return; }

      $('#stageStep').textContent = '第 ' + (i + 1) + ' / 6 爻';
      $('#stagePos').textContent = POS_NAME[i] + '爻';
      setCoins(null, true);
      $('#coinMath').innerHTML = '<span class="dim">三枚在手，摇之……</span>';
      $('#stageText').innerHTML = '';

      setTimeout(function () { land(i++); }, TOSS_MS);
    }

    function land(idx) {
      var t = res.tosses[idx];
      // 种子化：同一爻每次展示的正反次序稳定，不会来回跳
      var faces = window.Divine.coinFaces(t, t * 7919 + idx * 104729 + 13);
      var isM = (t === 6 || t === 9);

      setCoins(faces, false);
      $('#coinMath').innerHTML =
        faces.map(function (f) {
          return '<b class="' + (f.yang ? 'm-yang' : 'm-yin') + '">' + f.face + ' ' + f.point + '</b>';
        }).join('<i class="m-op">+</i>') +
        '<i class="m-op">=</i><b class="m-sum' + (isM ? ' is-mv' : '') + '">' + t + '</b>';

      $('#stageText').innerHTML =
        '<b class="' + (isM ? 'is-mv' : '') + '">' + COIN_NAME[t] + '</b>' +
        '<span class="dim">　' + COIN_NOTE[t] + '</span>';

      seeds[idx].className = 'seed ' + ((t === 7 || t === 9) ? 'yang' : 'yin') + (isM ? ' mv' : '') + ' pop';

      setTimeout(roll, HOLD_MS);
    }

    function settleAll() {
      $('#stageStep').textContent = '六爻已成';
      $('#stagePos').textContent = '成卦';
      $('#coinMath').innerHTML = '<span class="dim">自下而上 · 初爻在下，上爻在顶</span>';
      $('#stageText').innerHTML = '正在排卦……';
      setTimeout(done, 520);
    }

    roll();
  }

  function finishCast(btn, coins, stage) {
    coins.classList.remove('on');
    stage.hidden = true;
    btn.disabled = false;
  }

  /* ───────────────────────────────────────────── 渲染结果 */
  function render(data) {
    var r = data.result;
    state.result = r;
    state.question = data.question || $('#question').value.trim();

    $('#result').hidden = false;

    // 元信息
    $('#resultMeta').textContent = r.moving.length
      ? '动爻 ' + r.moving.length + ' 个'
      : '六爻皆静';

    // 三宫卦象
    var tri = '';
    tri += '<div class="tri-card is-ben">' +
             '<span class="tri-tag">本 卦</span>' +
             '<div class="tri-name">' + esc(r.ben.name) + '卦</div>' +
             '<div class="tri-full">' + esc(r.ben.full) + '</div>' +
             hexFigure(r.benLines, r.moving, 0) +
             '<div class="tri-note">现状 · 来龙去脉</div>' +
           '</div>';

    if (r.bian) {
      var bianMoving = r.moving.map(function (i) { return i; }); // 变卦中动爻位置同样标记
      tri += '<div class="tri-card is-bian">' +
               '<span class="tri-tag">变 卦</span>' +
               '<div class="tri-name">' + esc(r.bian.name) + '卦</div>' +
               '<div class="tri-full">' + esc(r.bian.full) + '</div>' +
               hexFigure(r.bianLines, bianMoving, 0.15) +
               '<div class="tri-note">趋势 · 事之将往</div>' +
             '</div>';
    } else {
      tri += '<div class="tri-card">' +
               '<span class="tri-tag" style="color:var(--dim)">变 卦</span>' +
               '<div class="tri-name" style="color:var(--dim)">无</div>' +
               '<div class="tri-full">六爻皆静，不变</div>' +
               '<div style="height:88px"></div>' +
               '<div class="tri-note">静观其变</div>' +
             '</div>';
    }

    if (r.hu) {
      tri += '<div class="tri-card is-hu">' +
               '<span class="tri-tag">互 卦</span>' +
               '<div class="tri-name">' + esc(r.hu.name) + '卦</div>' +
               '<div class="tri-full">' + esc(r.hu.full) + '</div>' +
               hexFigure(r.hu.lines, [], 0.3) +
               '<div class="tri-note">内情 · 过程隐微</div>' +
             '</div>';
    }
    $('#trigrams').innerHTML = tri;

    // 断卦例法
    $('#judgeRule').innerHTML =
      '<div><b>' + esc(r.judge.text) + '</b></div><div>' + esc(r.judge.focus) + '</div>';

    // 简要总结：白话，先给结论（不堆术语）
    var sum = window.Divine.plainSummary(r);
    $('#sumHead').textContent = sum.head;
    $('#summary').innerHTML = sum.html;

    // 掷钱明细：六爻各掷三枚的正反与记分
    $('#coinDetailBody').innerHTML = coinDetailHtml(r);

    // 本次掷钱记录：常驻可见，随时回看每一爻的三枚铜钱与记分
    $('#tossRecord').innerHTML = tossRecordHtml(r);

    // 每次起卦都把折叠区收回去，保持结果页干净（六爻详解仍独立成块、默认折叠）
    $('#deepPanel').open = false;
    $('#coinDetail').open = false;
    $('#yaoFold').open = false;

    // 为何变卦（本卦 / 变卦的来由，讲清「不是因为不当位」）
    $('#whyBian').innerHTML =
      '<h4>' + (r.moving.length ? '本次为何会有变卦' : '本次为何没有变卦') + '</h4>' +
      '<div>' + esc(window.Divine.explainMoving(r)) + '</div>';

    // 三卦关系：本卦 → 变卦 → 互卦 的来龙去脉
    $('#relation').innerHTML = window.Divine.relationInfo(r).html;

    // 本卦详解
    $('#benSub').textContent = r.ben.full;
    $('#benPanel').innerHTML = guaBlock(r.ben, '主断所依');

    // 六爻详解：爻辞 / 小象传 / 爻位 / 精解
    var yl = '';
    r.ben.yaos.forEach(function (y, i) {
      var isM = r.moving.indexOf(i) >= 0;
      yl += '<li class="yao-item' + (isM ? ' is-moving' : '') + '" style="animation-delay:' + (i * 0.05).toFixed(2) + 's">' +
              '<div class="yao-side">' +
                '<span class="yao-badge">' + POS_NAME[i] + '爻 · ' + esc(y.name) + '</span>' +
                '<span class="yao-coin">' + COIN_NAME[r.tosses[i]] + '</span>' +
              '</div>' +
              '<div class="yao-main"><div class="yao-body">' +
                '<div class="yao-row r-ci">'    + '<span class="k">爻辞</span>'   + '<span class="v">' + esc(y.ci)    + '</span></div>' +
                '<div class="yao-row r-xiang">' + '<span class="k">小象传</span>' + '<span class="v">' + esc(y.xiang) + '</span></div>' +
                '<div class="yao-row r-wei">'   + '<span class="k">爻位</span>'   + '<span class="v">' + esc(y.wei)   + '</span></div>' +
                '<div class="yao-row r-jie">'   + '<span class="k">精解</span>'   + '<span class="v">' + esc(y.jie)   + '</span></div>' +
                (y.yi ? '<div class="yao-row r-yi">' + '<span class="k">详解</span>' + '<span class="v">' + esc(y.yi) + '</span></div>' : '') +
              '</div></div>' +
            '</li>';
    });
    $('#yaoList').innerHTML = yl;

    // 变卦详解
    if (r.bian) {
      $('#bianFold').hidden = false;
      $('#bianSub').textContent = r.bian.full + '　由 ' + r.moving.length + ' 个动爻变来';
      $('#bianPanel').innerHTML = guaBlock(r.bian, '趋势所往');
    } else {
      $('#bianFold').hidden = true;
    }

    // 互卦详解
    if (r.hu) {
      $('#huFold').hidden = false;
      $('#huSub').textContent = r.hu.full + '　二三四爻为下卦、三四五爻为上卦';
      $('#huPanel').innerHTML = guaBlock(r.hu, '过程内情');
    } else {
      $('#huFold').hidden = true;
    }

    // 重置 AI 面板
    $('#aiOutput').hidden = true;
    $('#aiText').innerHTML = '';
    $('#aiBtn').disabled = false;
    $('#aiBtn').querySelector('.btn-label').textContent = '结合所问之事 · 独立分析';

    updatePromptBox();

    // 平滑滚到结果
    setTimeout(function () {
      $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  /* ───────────────────────────────────────────── 提示词 */
  function currentPrompt() {
    if (!state.result) return '';
    return window.Divine.buildPrompt({
      tosses: state.result.tosses,
      benLines: state.result.benLines,
      bianLines: state.result.bianLines,
      moving: state.result.moving,
      ben: state.result.ben,
      bian: state.result.bian,
      hu: state.result.hu
    }, state.question);
  }

  /* 只展示提示词的一小部分预览（约前 11 行 / 300 字），剩余以省略号收起。
   * 提示词含占位与结构，按需求仅可查看、不允许复制。 */
  var PROMPT_PREVIEW_LINES = 11;
  var PROMPT_PREVIEW_CHARS = 300;
  function previewPrompt(p) {
    var lines = p.split('\n');
    var head = lines.slice(0, PROMPT_PREVIEW_LINES).join('\n');
    if (head.length > PROMPT_PREVIEW_CHARS) head = head.slice(0, PROMPT_PREVIEW_CHARS);
    var omitted = lines.length - PROMPT_PREVIEW_LINES;
    var more = '';
    if (omitted > 0 || head.length < p.length) {
      more = '\n\n……（以下内容已隐藏，仅供概览，不可复制）';
    }
    return head + more;
  }

  function updatePromptBox() {
    var p = currentPrompt();
    if (!p) { $('#promptBox').hidden = true; return; }
    $('#promptBox').hidden = false;
    $('#promptText').textContent = previewPrompt(p);
  }

  /* ───────────────────────────────────────────── AI 解卦 */
  function aiInterpret() {
    if (!state.result || state.aiBusy) return;

    var btn = $('#aiBtn');
    var out = $('#aiOutput');
    var txt = $('#aiText');

    state.aiBusy = true;
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = '正在解卦…';
    out.hidden = false;
    txt.innerHTML = '<span class="caret"></span>';

    fetch('/api/ai/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: state.question,
        tosses: state.result.tosses
      })
    })
      .then(function (resp) {
        var ct = resp.headers.get('Content-Type') || '';

        // 未配置密钥 → 回传提示词（application/json）
        if (ct.indexOf('application/json') >= 0) {
          return resp.json().then(function (j) {
            // 后端已返回预览（仅概览，不含完整 prompt）
            if (j.prompt) $('#promptText').textContent = j.prompt;
            $('#promptBox').hidden = false;
            $('#promptBox').open = true;
            txt.innerHTML = esc(j.message || '尚未配置大模型。') +
              '<br><br><span style="color:var(--dim);font-size:12.5px">' +
              '下方仅展示提示词概览，内容不可复制；在项目根目录建 llm.config.json 填好 base / key / model 后重启服务，即可自动接入。</span>';
          });
        }

        // 已配置 → SSE 流式（后端只下发正式回答，思考过程已过滤）
        var reader = resp.body.getReader();
        var dec = new TextDecoder('utf-8');
        var buf = '';
        var acc = '';
        var started = false;
        var notice = '';

        function paint() {
          if (!started) {
            txt.innerHTML = '<div class="ai-thinking"><i></i><i></i><i></i>' +
                            '正在揣摩卦象，请稍候……</div>';
            return;
          }
          txt.innerHTML = renderAI(acc) + '<span class="caret"></span>';
          out.scrollTop = out.scrollHeight;
        }

        function pump() {
          return reader.read().then(function (step) {
            if (step.done) { finish(); return; }
            buf += dec.decode(step.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop() || '';
            lines.forEach(function (line) {
              var t = line.trim();
              if (t.indexOf('data:') !== 0) return;
              var payload = t.slice(5).trim();
              if (!payload) return;
              try {
                var j = JSON.parse(payload);
                if (j.error)       { acc += '\n\n【出错】' + j.error; started = true; }
                else if (j.notice) { notice = j.notice; }
                else if (j.delta)  { acc += j.delta; started = true; }
                else if (j.done)   { /* 结束帧 */ }
              } catch (e) { /* 忽略坏帧 */ }
            });
            paint();
            return pump();
          });
        }

        function finish() {
          if (!acc) {
            txt.innerHTML = '<div class="ai-empty">' +
              esc(notice || '模型未返回内容，请点「重新分析」再试一次。') + '</div>';
          } else {
            txt.innerHTML = renderAI(acc);
          }
          state.aiBusy = false;
          btn.disabled = false;
          btn.querySelector('.btn-label').textContent = '重新分析';
        }

        paint();  // 先亮出「正在揣摩」，首个字到达后自动换成正文
        return pump();
      })
      .catch(function (e) {
        txt.innerHTML = '<span style="color:var(--rose)">解卦失败：' + esc(e.message) + '</span>' +
          '<br><br><span style="color:var(--dim);font-size:12.5px">可复制下方提示词，手动粘贴到任意大模型中使用。</span>';
        $('#promptBox').hidden = false;
      })
      .then(function () {
        if (state.aiBusy) {
          state.aiBusy = false;
          btn.disabled = false;
          btn.querySelector('.btn-label').textContent = '结合所问之事 · 独立分析';
        }
      });
  }

  /* ───────────────────────────────────────────── 卦象分享卡
   * 纯前端 canvas 生成，零后端。卡片含：三宫卦象（本/变/互）、卦名、
   * 一句话总结、站点链接。可下载图片，也可复制图片到剪贴板。 */
  function miniHex(ctx, x, y, lines, moving, w, h) {
    // lines 自下而上；y 为底边
    var n = lines.length;
    var gap = 4;
    var barH = Math.min(h / (n + (n - 1) * (gap / h)), 9);
    for (var i = 0; i < n; i++) {
      var yang = lines[i] === 1;
      var isM = moving && moving.indexOf(i) >= 0;
      var by = y - (i + 1) * barH - i * gap;
      if (yang) {
        ctx.fillStyle = isM ? '#ff7eb0' : '#5fe0ff';
        ctx.fillRect(x, by, w, barH);
      } else {
        var half = (w - 6) / 2;
        ctx.fillStyle = isM ? '#ff7eb0' : '#5fe0ff';
        ctx.fillRect(x, by, half, barH);
        ctx.fillRect(x + half + 6, by, half, barH);
      }
    }
  }

  function buildShareCard() {
    var r = state.result;
    if (!r) return;

    var SITE = '赛博卜卦 · Cyber Divination';
    var W = 720, H = 960;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    // 背景
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070b14');
    g.addColorStop(0.55, '#0a0f1c');
    g.addColorStop(1, '#06090f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 霓虹边
    ctx.strokeStyle = 'rgba(0,229,255,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf7ff';
    ctx.font = '700 34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('☯  ' + SITE, W / 2, 74);
    ctx.fillStyle = '#9fb0cc';
    ctx.font = '400 15px "PingFang SC",sans-serif';
    ctx.fillText('三枚铜钱起六爻 · 卦辞 · 大象传 · 爻位参详', W / 2, 102);

    // 三宫卦象
    var cards = [
      { tag: '本 卦', hex: r.ben, lines: r.benLines, mv: r.moving, color: '#00e5ff' },
      r.bian ? { tag: '变 卦', hex: r.bian, lines: r.bianLines, mv: r.moving, color: '#ff4d8d' } : null,
      r.hu ? { tag: '互 卦', hex: r.hu, lines: r.hu.lines, mv: [], color: '#e9c46a' } : null
    ].filter(Boolean);

    var cw = 200, gap = 20;
    var totalW = cards.length * cw + (cards.length - 1) * gap;
    var startX = (W - totalW) / 2;
    var cardY = 140, cardH = 300;

    cards.forEach(function (c, k) {
      var cx = startX + k * (cw + gap);
      // 卡片底
      ctx.fillStyle = 'rgba(18,27,45,.6)';
      roundRect(ctx, cx, cardY, cw, cardH, 12); ctx.fill();
      ctx.strokeStyle = c.color + '66';
      ctx.lineWidth = 1.5;
      roundRect(ctx, cx, cardY, cw, cardH, 12); ctx.stroke();

      // 标签
      ctx.fillStyle = c.color;
      ctx.font = '600 14px "PingFang SC",sans-serif';
      ctx.fillText(c.tag, cx + cw / 2, cardY + 30);

      // 卦名
      ctx.fillStyle = '#eaf7ff';
      ctx.font = '700 24px "PingFang SC",sans-serif';
      ctx.fillText(c.hex.name + '卦', cx + cw / 2, cardY + 64);
      ctx.fillStyle = '#6b7c99';
      ctx.font = '400 12px "PingFang SC",sans-serif';
      ctx.fillText(c.hex.full, cx + cw / 2, cardY + 86);

      // 卦画
      miniHex(ctx, cx + cw / 2 - 48, cardY + cardH - 30, c.lines, c.mv, 96, 150);
    });

    // 一句话总结
    var sum = window.Divine.plainSummary(r);
    ctx.textAlign = 'left';
    var sy = cardY + cardH + 50;
    ctx.fillStyle = '#00e5ff';
    ctx.font = '600 15px "PingFang SC",sans-serif';
    ctx.fillText('一句话记住', 60, sy);
    ctx.fillStyle = '#dbe6f6';
    ctx.font = '400 19px "PingFang SC",sans-serif';
    wrapText(ctx, lastSentence(sum.text), 60, sy + 34, W - 120, 30);

    // 断卦例法提示（自行计算，避免依赖 state.result.judge 是否附加）
    var judge = (r.judge && r.judge.text) ? r.judge : window.Divine.judgeRule(r);
    var ry = sy + 110;
    ctx.fillStyle = '#e9c46a';
    ctx.font = '600 15px "PingFang SC",sans-serif';
    ctx.fillText('主断', 60, ry);
    ctx.fillStyle = '#dbe6f6';
    ctx.font = '400 16px "PingFang SC",sans-serif';
    wrapText(ctx, judge.text + ' —— ' + judge.focus, 60, ry + 32, W - 120, 26);

    // 页脚
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b7c99';
    ctx.font = '400 13px "PingFang SC",sans-serif';
    ctx.fillText('卦者，时也。内容仅供文化参考，不作重大决策依据。', W / 2, H - 44);
    ctx.fillStyle = '#4c5a72';
    ctx.fillText('扫码或访问「赛博卜卦」亲自起一卦', W / 2, H - 24);

    // 下载 / 复制
    showShareDialog(cv);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function lastSentence(text) {
    // plainSummary 最后一节是「一句话记住」，取该节正文
    var m = String(text || '').match(/【一句话记住】(.*)$/s);
    return m ? m[1].trim() : (text || '').slice(-60);
  }

  function wrapText(ctx, text, x, y, maxW, lh) {
    text = String(text || '');
    var line = '', yy = y;
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy); line = text[i]; yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  function showShareDialog(cv) {
    var url = cv.toDataURL('image/png');
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal share-modal">' +
        '<button class="close" aria-label="关闭">×</button>' +
        '<h3 class="share-title">卦象分享卡</h3>' +
        '<img class="share-img" src="' + url + '" alt="卦象分享卡">' +
        '<div class="share-actions">' +
          '<a class="btn btn-primary" id="shareDl" download="赛博卜卦-卦象卡.png" href="' + url + '">下载图片</a>' +
          '<button class="btn btn-ghost" id="shareCp">复制图片</button>' +
        '</div>' +
        '<p class="share-tip">长按图片也可保存 · 纯前端生成，不上传任何数据</p>' +
      '</div>';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.classList.contains('close')) mask.remove();
    });
    document.body.appendChild(mask);

    mask.querySelector('#shareCp').addEventListener('click', function () {
      cv.toBlob(function (blob) {
        if (!blob) { toast('当前环境不支持复制图片'); return; }
        if (navigator.clipboard && navigator.clipboard.write) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(function () { toast('已复制图片，去粘贴分享吧'); })
            .catch(function () { toast('复制失败，请改用「下载图片」'); });
        } else {
          toast('当前环境不支持复制图片，请下载');
        }
      }, 'image/png');
    });
  }

  /* ───────────────────────────────────────────── 手动选爻 */
  var manualVals = [7, 7, 7, 7, 7, 7]; // 默认六爻皆少阳

  function buildManual() {
    var h = '';
    for (var i = 0; i < 6; i++) {
      h += '<div class="manual-row"><span class="pos">' + POS_NAME[i] + '爻</span><span class="seg">';
      [6, 7, 8, 9].forEach(function (v) {
        var on = manualVals[i] === v;
        var mv = (v === 6 || v === 9);
        h += '<button data-i="' + i + '" data-v="' + v + '"' +
             ' class="' + (on ? 'on' : '') + (mv ? ' moving' : '') + '">' +
             (v === 6 ? '老阴' : v === 7 ? '少阳' : v === 8 ? '少阴' : '老阳') + '</button>';
      });
      h += '</span></div>';
    }
    $('#manualYaos').innerHTML = h;
    $$('#manualYaos .seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        manualVals[+b.dataset.i] = +b.dataset.v;
        buildManual();
      });
    });
  }

  /* ───────────────────────────────────────────── 六十四卦速查 */
  function buildGrid(keyword) {
    var kw = (keyword || '').trim();
    var list = window.YI.HEXAGRAMS.filter(function (g) {
      if (!kw) return true;
      return (g.name + g.full + g.upNature + g.downNature + g.guaciJie).indexOf(kw) >= 0;
    });

    $('#hexGrid').innerHTML = list.map(function (g) {
      var fig = g.lines.map(function (v) {
        return '<i class="' + (v === 1 ? 'yang' : 'yin') + '"></i>';
      }).join('');
      return '<div class="hex-cell" data-n="' + g.n + '" title="' + esc(g.full) + '">' +
               '<div class="hx-n">' + g.n + '</div>' +
               '<div class="hx-name">' + esc(g.name) + '</div>' +
               '<div class="hx-full">' + esc(g.full) + '</div>' +
               '<div class="hx-fig">' + fig + '</div>' +
             '</div>';
    }).join('');

    $$('#hexGrid .hex-cell').forEach(function (c) {
      c.addEventListener('click', function () {
        openHex(+c.dataset.n);
      });
    });
  }

  function openHex(n) {
    var g = window.YI.HEXAGRAMS.filter(function (x) { return x.n === n; })[0];
    if (!g) return;
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal">' +
        '<button class="close" aria-label="关闭">×</button>' +
        hexFigure(g.lines, [], 0) +
        guaBlock(g, '') +
      '</div>';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.classList.contains('close')) mask.remove();
    });
    document.body.appendChild(mask);
  }

  /* ───────────────────────────────────────────── 绑定 */
  function bind() {
    $('#castBtn').addEventListener('click', function () { cast(null); });

    $('#manualBtn').addEventListener('click', function () {
      var m = $('#manual');
      m.hidden = !m.hidden;
      if (!m.hidden) buildManual();
    });

    $('#manualCastBtn').addEventListener('click', function () {
      cast(manualVals.slice());
    });

    $('#aiBtn').addEventListener('click', aiInterpret);

    $('#shareBtn').addEventListener('click', buildShareCard);

    $('#recastBtn').addEventListener('click', function () {
      cast(null);
    });

    $('#question').addEventListener('input', function () {
      if (state.result) {
        state.question = this.value.trim();
        updatePromptBox();
      }
    });

    $('#hexSearch').addEventListener('input', function () {
      buildGrid(this.value);
    });

    /* 提示词仅可查看、禁止复制：拦截右键菜单与复制快捷键（仅作用于提示词区） */
    var blockCopy = function (e) { e.preventDefault(); return false; };
    var promptBox = $('#promptBox');
    if (promptBox) {
      promptBox.addEventListener('contextmenu', blockCopy);
      promptBox.addEventListener('copy', blockCopy);
      promptBox.addEventListener('cut', blockCopy);
      promptBox.addEventListener('selectstart', function (e) {
        // 允许摘要(summary)正常选中，但正文预览不可选
        if (e.target && e.target.id === 'promptText') e.preventDefault();
      });
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
          if (promptBox.contains(document.activeElement) ||
              (window.getSelection() && promptBox.contains(window.getSelection().anchorNode))) {
            e.preventDefault();
          }
        }
      });
    }

    // 检查大模型接口状态
    fetch('/api/ai/status')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        $('#aiStatus').textContent = s.configured
          ? '已接入 ' + s.model
          : '未配置 · 将回传提示词';
        $('#aiStatus').style.color = s.configured ? 'var(--jade)' : 'var(--dim)';
      })
      .catch(function () {
        $('#aiStatus').textContent = '后端未启动 · 仍可起卦';
      });
  }

  /* ───────────────────────────────────────────── 启动 */
  document.addEventListener('DOMContentLoaded', function () {
    buildGrid('');
    buildManual();
    bind();
  });
})();
