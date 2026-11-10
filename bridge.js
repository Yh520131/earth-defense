/* ============================================================
   地球保卫战 · 战役模式桥接脚本
   1) 右上角 ⚙️ 设置按钮（= 暂停），面板里：继续 / 重新开始 / 返回大地图
   2) 通关后在胜利面板里追加「进入下一关」
   3) 胜负上报 + localStorage 存档 + iframe 通信

   只有带 ?from=map 时才生效，单独打开关卡文件不受影响。
   ============================================================ */
window.__campaignBridge = 1;

(function () {
  'use strict';

  if (location.search.indexOf('from=map') < 0) return;

  var KEY = 'earthDefense.campaign.v1';
  var MAX_LEVELS = 13;

  var m = /(\d+)game\.html/i.exec(location.pathname);
  var levelId = m ? parseInt(m[1], 10) : -1;
  var inFrame = (window.self !== window.top);

  var paused = false;
  var resultReported = false;

  function readSave() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeSave(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function post(msg) {
    try { if (inFrame) parent.postMessage(msg, '*'); } catch (e) {}
  }
  function starsFor(lives) {
    if (lives >= 18) return 3;
    if (lives >= 15) return 2;
    if (lives > 0) return 1;
    return 0;
  }
  function getGame() {
    try { return (typeof game !== 'undefined' && game) ? game : null; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------
  //  样式
  // ---------------------------------------------------------------
  var style = document.createElement('style');
  style.textContent = [
    '#campGear{position:fixed;top:10px;right:10px;z-index:9998;width:38px;height:38px;border-radius:10px;',
    'display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;cursor:pointer;',
    'background:rgba(10,20,14,.80);border:1px solid rgba(255,212,59,.30);',
    'box-shadow:0 4px 16px rgba(0,0,0,.45);backdrop-filter:blur(6px);',
    'transition:transform .15s,border-color .15s;user-select:none;-webkit-user-select:none}',

    '#campGear:hover{transform:scale(1.07);border-color:rgba(255,212,59,.72);',
    'box-shadow:0 6px 22px rgba(255,196,60,.28)}',

    '#campPanel{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;',
    'background:rgba(3,8,6,.62);backdrop-filter:blur(3px)}',

    '#campPanel.show{display:flex}',

    '.camp-card{width:min(330px,86vw);padding:22px 20px 18px;text-align:center;border-radius:16px;',
    'background:linear-gradient(160deg,rgba(16,32,24,.98),rgba(8,16,12,.98));',
    'border:1px solid rgba(255,212,59,.32);',
    'box-shadow:0 24px 70px rgba(0,0,0,.72);',
    'animation:campPop .2s ease}',

    '@keyframes campPop{0%{transform:scale(.93);opacity:.4}100%{transform:scale(1);opacity:1}}',

    '.camp-title{font-size:20px;font-weight:bold;color:#f4f7ee;letter-spacing:4px;margin-bottom:6px}',

    '.camp-sub{font-size:11px;color:rgba(190,210,190,.55);letter-spacing:1px;',
    'margin-bottom:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

    '.camp-btn{display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:11px 0;',
    'border-radius:10px;font-family:inherit;font-size:14px;letter-spacing:2px;cursor:pointer;',
    'transition:all .15s;background:rgba(255,255,255,.05);',
    'border:1px solid rgba(255,255,255,.14);color:#dbe8db}',

    '.camp-btn:hover{background:rgba(255,255,255,.10);color:#fff}',

    '.camp-btn.primary{background:linear-gradient(135deg,#57b45f,#2f7a38);',
    'border-color:rgba(120,255,140,.35);color:#fff;font-weight:bold}',

    '.camp-btn.primary:hover{transform:translateY(-1px)}',

    '.camp-btn.danger{border-color:rgba(255,120,120,.40);color:#ffb3b3}',

    '.camp-btn.danger:hover{background:rgba(255,80,80,.14)}',

    /* 给设置按钮腾出右上角 */
    '.hint-bar{right:56px !important}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  // ---------------------------------------------------------------
  //  右上角设置按钮 + 面板
  // ---------------------------------------------------------------
  var title = (document.title || '')
    .replace(/^地球保卫战\s*[-·—]\s*/, '')
    .replace(/\s*\[测试版\]\s*$/, '');

  var gear = document.createElement('div');
  gear.id = 'campGear';
  gear.textContent = '⚙️';
  gear.title = '设置 / 暂停';
  gear.addEventListener('click', function (e) {
    e.stopPropagation();
    openPanel();
  });

  var panel = document.createElement('div');
  panel.id = 'campPanel';
  panel.innerHTML =
    '<div class="camp-card">' +
      '<div class="camp-title">暂 停</div>' +
      '<div class="camp-sub">' + title + '</div>' +
      '<button class="camp-btn primary" data-act="resume">继续游戏</button>' +
      '<button class="camp-btn" data-act="restart">重新开始</button>' +
      '<button class="camp-btn danger" data-act="map">返回大地图</button>' +
    '</div>';

  panel.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.camp-btn') : null;
    if (!btn) {
      if (e.target === panel) closePanel();
      return;
    }
    var act = btn.getAttribute('data-act');
    if (act === 'resume') closePanel();
    else if (act === 'restart') restartLevel();
    else if (act === 'map') backToMap();
  });

  function mount() {
    if (!document.body) { setTimeout(mount, 50); return; }
    document.body.appendChild(gear);
    document.body.appendChild(panel);
  }
  mount();

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && paused) closePanel();
  });

  function openPanel() {
    paused = true;
    panel.classList.add('show');
  }
  function closePanel() {
    paused = false;
    panel.classList.remove('show');
  }

  function restartLevel() {
    closePanel();
    var g = getGame();
    if (g && typeof g.restart === 'function') {
      g.restart();
    } else {
      location.reload();
    }
  }

  // 大地图会告诉我们它在哪（levels/../index.html 或 index.html）
  var bm = /[?&]back=([^&]+)/.exec(location.search);
  var BACK = bm ? decodeURIComponent(bm[1]) : '../index.html';

  function levelLink(id) {
    return id + 'game.html?from=map&back=' + encodeURIComponent(BACK);
  }

  function backToMap() {
    if (inFrame) post({ __src: 'earthDefense', type: 'exit' });
    else location.href = BACK + '?back=1';
  }

  function goNext() {
    if (levelId >= MAX_LEVELS - 1) { backToMap(); return; }
    if (inFrame) post({ __src: 'earthDefense', type: 'next', id: levelId, next: levelId + 1 });
    else location.href = levelLink(levelId + 1);
  }

  // ---------------------------------------------------------------
  //  暂停：包一层 game.update
  // ---------------------------------------------------------------
  function hookGame() {
    var g = getGame();
    if (!g) return null;
    if (!g.__campHooked && typeof g.update === 'function') {
      var orig = g.update;
      g.update = function (dt) {
        if (paused) return;
        return orig.call(this, dt);
      };
      g.__campHooked = true;
    }
    return g;
  }

  // ---------------------------------------------------------------
  //  胜利面板里追加「进入下一关」
  // ---------------------------------------------------------------
  var nextBtn = null;

  function injectNextBtn() {
    if (nextBtn) return;
    var box = document.querySelector('#victoryOverlay .victory-box') ||
              document.querySelector('.victory-box');
    if (!box) return;

    var isLast = (levelId >= MAX_LEVELS - 1);
    nextBtn = document.createElement('button');
    nextBtn.className = 'victory-btn';
    nextBtn.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:12px;';
    nextBtn.textContent = isLast ? '🏆 返回大地图' : '➡ 进入下一关';
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isLast) backToMap();
      else goNext();
    });
    box.appendChild(nextBtn);
  }

  // ---------------------------------------------------------------
  //  胜负上报
  // ---------------------------------------------------------------
  function report(win, g) {
    var st = starsFor(g.lives);
    var s = readSave();
    s.v = 1;
    s.stars = s.stars || {};
    if (win) {
      s.cleared = Math.max(s.cleared || 0, Math.min(MAX_LEVELS, levelId + 1));
      s.stars[levelId] = Math.max(s.stars[levelId] || 0, st);
    } else {
      s.cleared = Math.max(0, s.cleared || 0);
    }
    s.lastPlayed = levelId;
    writeSave(s);

    post({
      __src: 'earthDefense',
      type: 'result',
      id: levelId,
      win: !!win,
      stars: st,
      lives: g.lives,
      wave: g.wave
    });

    if (win) injectNextBtn();
  }

  // 先尝试注入（胜利面板是静态的，提前挂上更稳）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNextBtn);
  } else {
    injectNextBtn();
  }
  setTimeout(injectNextBtn, 800);

  setInterval(function () {
    var g = hookGame();
    if (!g) return;
    var ended = !!(g.gameWon || g.gameOver);
    if (!ended && resultReported) resultReported = false;
    if (ended && !resultReported) {
      resultReported = true;
      report(!!g.gameWon, g);
    }
  }, 400);
})();
