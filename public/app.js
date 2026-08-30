/* ==========================================================================
 * 赛博卜卦 · 前端交互
 * ========================================================================== */
(function () {
  'use strict';

  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var POS_NAME = ['初', '二', '三', '四', '五', '上'];
  var COIN_NAME = { 6: '老阴 · 动', 7: '少阳 · 静', 8: '少阴 · 静', 9: '老阳 · 动' };

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

  /* 一卦的完整详解块 */
  function guaBlock(hex, title, note) {
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
          '<div class="gua-jie">曾仕强精解：' + esc(hex.guaciJie) + '</div>' +
        '</div>' +
        '<div class="gua-sec">' +
          '<h4>卦 理 · 曾仕强《易经的智慧》</h4>' +
          '<div class="gua-li">' + esc(hex.li) + '</div>' +
        '</div>' +
      '</div>';
  }

  /* ───────────────────────────────────────────── 起卦 */
  function cast(tosses) {
    var btn = $('#castBtn');
    var coins = $('#coins');
    var question = $('#question').value.trim();

    btn.disabled = true;
    coins.classList.add('on');

    var payload = { question: question };
    if (tosses) payload.tosses = tosses;

    // 最短动画时长，避免一闪而过没有仪式感
    var started = Date.now();
    fetch('/api/divine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var wait = Math.max(0, 900 - (Date.now() - started));
        setTimeout(function () {
          coins.classList.remove('on');
          btn.disabled = false;
          if (!data.ok) { toast('起卦失败，请重试'); return; }
          render(data);
        }, wait);
      })
      .catch(function () {
        coins.classList.remove('on');
        btn.disabled = false;
        // 接口不可用时，用本地引擎兜底（纯静态部署也能用）
        var r = window.Divine.buildResult(tosses || window.Divine.tossHexagram());
        render({ ok: true, question: question, result: {
          tosses: r.tosses, benLines: r.benLines, bianLines: r.bianLines,
          moving: r.moving, judge: window.Divine.judgeRule(r),
          ben: r.ben, bian: r.bian, hu: r.hu
        }});
        toast('离线模式：已用本地引擎起卦');
      });
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

    // 本卦详解
    $('#benPanel').innerHTML =
      '<div class="panel-head"><h2>本卦详解</h2>' +
      '<span class="panel-sub">' + esc(r.ben.full) + '</span></div>' +
      guaBlock(r.ben, '本卦', '主断所依');

    // 六爻详解
    var yl = '';
    r.ben.yaos.forEach(function (y, i) {
      var isM = r.moving.indexOf(i) >= 0;
      yl += '<li class="yao-item' + (isM ? ' is-moving' : '') + '" style="animation-delay:' + (i * 0.05).toFixed(2) + 's">' +
              '<div class="yao-side">' +
                '<span class="yao-badge">' + POS_NAME[i] + '爻 · ' + esc(y.name) + '</span>' +
                '<span class="yao-coin">' + COIN_NAME[r.tosses[i]] + '</span>' +
              '</div>' +
              '<div class="yao-main">' +
                '<div class="ci">' + esc(y.ci) + '</div>' +
                '<div class="jie">曾仕强精解：' + esc(y.jie) + '</div>' +
              '</div>' +
            '</li>';
    });
    $('#yaoList').innerHTML = yl;

    // 变卦详解
    if (r.bian) {
      $('#bianPanel').hidden = false;
      $('#bianPanel').innerHTML =
        '<div class="panel-head"><h2>变卦详解</h2>' +
        '<span class="panel-sub">' + esc(r.bian.full) + '　由 ' + r.moving.length + ' 个动爻变来</span></div>' +
        guaBlock(r.bian, '变卦', '趋势所往');
    } else {
      $('#bianPanel').hidden = true;
    }

    // 互卦详解
    if (r.hu) {
      $('#huPanel').hidden = false;
      $('#huPanel').innerHTML =
        '<div class="panel-head"><h2>互卦详解</h2>' +
        '<span class="panel-sub">' + esc(r.hu.full) + '　二三四爻为下卦、三四五爻为上卦</span></div>' +
        guaBlock(r.hu, '互卦', '过程内情');
    } else {
      $('#huPanel').hidden = true;
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

  function updatePromptBox() {
    var p = currentPrompt();
    if (!p) { $('#promptBox').hidden = true; return; }
    $('#promptBox').hidden = false;
    $('#promptText').textContent = p;
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
            if (j.prompt) $('#promptText').textContent = j.prompt;
            $('#promptBox').hidden = false;
            $('#promptBox').open = true;
            txt.innerHTML = esc(j.message || '尚未配置大模型。') +
              '<br><br><span style="color:var(--dim);font-size:12.5px">' +
              '已展开下方提示词，可一键复制；或在项目根目录建 llm.config.json 填好 base / key / model 后重启服务，即可自动接入。</span>';
          });
        }

        // 已配置 → SSE 流式
        var reader = resp.body.getReader();
        var dec = new TextDecoder('utf-8');
        var buf = '';
        var acc = '';

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
                if (j.error) { acc += '\n\n【出错】' + j.error; }
                else if (j.delta) { acc += j.delta; }
                else if (j.done) { /* 结束 */ }
              } catch (e) { /* 忽略坏帧 */ }
            });
            txt.innerHTML = esc(acc) + '<span class="caret"></span>';
            out.scrollTop = out.scrollHeight;
            return pump();
          });
        }

        function finish() {
          txt.textContent = acc || '（模型未返回内容）';
          state.aiBusy = false;
          btn.disabled = false;
          btn.querySelector('.btn-label').textContent = '重新分析';
        }

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
        guaBlock(g, '', '') +
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

    $('#copyPromptBtn').addEventListener('click', function () {
      var p = $('#promptText').textContent || currentPrompt();
      if (!p) { toast('请先起卦'); return; }
      copy(p);
    });

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

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('提示词已复制'); })
        .catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('提示词已复制'); }
    catch (e) { toast('复制失败，请手动选取'); }
    ta.remove();
  }

  /* ───────────────────────────────────────────── 启动 */
  document.addEventListener('DOMContentLoaded', function () {
    buildGrid('');
    buildManual();
    bind();
  });
})();
