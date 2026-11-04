/* playtest.js — cổng G2/G3 cho Rumba bằng Chrome headless (DevTools Protocol).
   Bơm chạm/kéo thật vào bàn cờ. Chạy: node test/playtest.js [url]
   Ảnh chụp: /tmp/rumba-*.png */
'use strict';
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
// ws: thử gói cài riêng trước, rồi tới node_modules của platform (khi game nằm
// trong repo games/). Clone lẻ mà thiếu cả hai thì nói rõ phải làm gì.
let WebSocket;
for (const p of ['ws', '../../node_modules/ws', require('node:path').join(require('node:os').homedir(), 'goterm-workspace/games/node_modules/ws')]) {
  try { WebSocket = require(p); break; } catch (e) { /* thử tiếp */ }
}
if (!WebSocket) {
  console.error('Thiếu gói "ws" (chỉ harness cần, game thì không).\n  npm i --no-save ws');
  process.exit(2);
}

const SRV_PORT = 8700 + Math.floor(Math.random() * 90);
const URL = process.argv[2] || `http://127.0.0.1:${SRV_PORT}/?debug=1`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// CDP port is picked by Chrome itself (--remote-debugging-port=0, read back from
// DevToolsActivePort): a fixed port let a concurrent harness (Castle Busters also
// used 9334) attach to this Chrome and navigate it away mid-run.
let PORT = 0;
const VW = 390, VH = 844, VDPR = 3;      // iPhone 14 Pro — viewport mục tiêu của skill

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function gate(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + (detail ? ' — ' + detail : ''));
}

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.waits = new Map(); this.events = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws.on('open', res); this.ws.on('error', rej);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.id && this.waits.has(m.id)) { this.waits.get(m.id)(m); this.waits.delete(m.id); }
        else if (m.method) this.events.push(m);
      });
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waits.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async evaluate(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async tap(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, pointerType: 'touch' });
    }
    await sleep(60);
  }
  async drag(x0, y0, x1, y1, steps) {
    steps = steps || 8;
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, pointerType: 'touch' });
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', button: 'left', buttons: 1, pointerType: 'touch',
        x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps
      });
      await sleep(20);
    }
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1, pointerType: 'touch' });
    await sleep(80);
  }
  async shot(path) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
    return path;
  }
}

const center = (sel, i) => `(() => { const r = document.querySelectorAll('${sel}')[${i || 0}].getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;

(async function main() {
  const srv = process.argv[2] ? null : spawn(process.execPath, [require('node:path').join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(SRV_PORT) }, stdio: 'ignore' });
  const profile = fs.mkdtempSync('/tmp/rumba-chrome-');
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--mute-audio', `--window-size=${VW},${VH}`, 'about:blank'
  ], { stdio: 'ignore' });

  let cdp;
  const q = (expr) => cdp.evaluate(expr);
  // wait until the board stops moving (the SDK injects UI after load and shifts the layout)
  const settle = async () => {
    let last = '', same = 0;
    for (let k = 0; k < 60 && same < 4; k++) {
      const cur = await q(`JSON.stringify(document.getElementById('board').getBoundingClientRect())`);
      same = cur === last ? same + 1 : 0; last = cur; await sleep(150);
    }
  };
  const tapSel = async (sel, i) => { const p = await q(center(sel, i)); await cdp.tap(p.x, p.y); await sleep(120); };
  const S = () => q('(() => { const s = window.__rumba.state; return { N: s.N, diff: s.diff, mode: s.mode, board: Array.from(s.board), cells: Array.from(s.puz.cells), sol: Array.from(s.puz.solution), given: Array.from(s.given), hints: s.hints, done: s.done, seed: s.seed, shareText: s.shareText || "" }; })()');

  try {
    await sleep(400);
    for (let i = 0; i < 60 && !PORT; i++) { try { PORT = +fs.readFileSync(require('node:path').join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(200); } }
    if (!PORT) throw new Error('Chrome did not write DevToolsActivePort');
    for (let i = 0; i < 60; i++) { try { await getJSON('/json/version'); break; } catch (e) { await sleep(200); } }
    const page = (await getJSON('/json/list')).find((t) => t.type === 'page');
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    for (const m of ['Page.enable', 'Runtime.enable', 'Log.enable']) await cdp.send(m);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: VDPR, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    await cdp.send('Page.navigate', { url: URL });
    await sleep(1500);
    await q(`(navigator.share = undefined, window.__copied = '', navigator.clipboard && (navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }), 0)`);

    console.log('\n── G2: BOOT ' + '─'.repeat(40));
    const errs = cdp.events.filter((e) => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && e.params.entry.source !== 'network') || e.method === 'Runtime.exceptionThrown');
    gate('0 lỗi JS', errs.length === 0, errs.length ? JSON.stringify(errs.slice(0, 2)).slice(0, 400) : 'sạch');
    await q(`document.getElementById('help').classList.remove('show'), 0`);
    await settle();
    let s = await S();
    const tiles = await q(`document.querySelectorAll('#board .tile').length`);
    gate('bàn cờ dựng đủ ô', tiles === s.N * s.N, `${s.N}×${s.N} = ${tiles}`);
    const fit = await q(`({ sw: document.documentElement.scrollWidth, iw: innerWidth })`);
    gate('không tràn ngang ở 390×844', fit.sw <= fit.iw + 1, `${fit.sw} ≤ ${fit.iw}`);
    await cdp.shot('/tmp/rumba-start.png');

    console.log('\n── G3: CHƠI ĐƯỢC ' + '─'.repeat(34));
    const free = s.board.findIndex((v) => v === -1);
    const seq = [];
    for (let k = 0; k < 3; k++) { await tapSel('#board .tile', free); seq.push((await S()).board[free]); }
    gate('chạm xoay vòng mặt trời → mặt trăng → trống', seq.join() === '0,1,-1', seq.join(' → '));

    // P4: gợi ý 2 bước
    await tapSel('#hintBtn');
    let s1 = await S();
    const marks = await q(`({ t: document.querySelectorAll('#board .tile.hinttarget').length, s: document.querySelectorAll('#board .tile.hintsrc').length, txt: document.getElementById('hintLine').textContent })`);
    gate('gợi ý lần 1: tô ô + lý do, chưa điền', s1.board.join() === s.board.join() && marks.t === 1 && marks.txt.length > 10 && s1.hints === 1, `${marks.t} ô đích, ${marks.s} ô nguồn — ${marks.txt.slice(0, 70)}`);
    await cdp.shot('/tmp/rumba-hint.png');
    await tapSel('#hintBtn');
    let s2 = await S();
    const filled = s2.board.filter((v, i) => v !== s1.board[i]).length;
    gate('gợi ý lần 2: điền ô đó, không tính thêm gợi ý', filled === 1 && s2.hints === 1, `${filled} ô, hints=${s2.hints}`);

    // P2: daily luôn là 6×6 Vừa dù chọn 8×8 Khó
    await tapSel('#sizeSeg button[data-size="8"]'); await tapSel('#diffSeg button[data-diff="hard"]');
    s = await S();
    gate('chế độ tự do theo lựa chọn 8×8 Khó', s.N === 8 && s.diff === 'hard' && s.mode === 'free');
    // P1: 8×8 Khó giải trọn chỉ bằng gợi ý (không đoán)
    let guard = 0;
    while (!s.done && guard++ < 400) { await q('(window.__rumba.hint(), 0)'); s = await S(); }
    gate('8×8 Khó giải trọn bằng chuỗi gợi ý logic', s.done && s.N === 8, guard + ' lần bấm');
    await q(`document.getElementById('overlay').classList.remove('show'), 0`);

    await tapSel('#dailyBtn'); await settle();
    s = await S();
    const seedDaily = s.seed;
    gate('daily = 6×6 Vừa dù đang chọn 8×8 Khó', s.mode === 'daily' && s.N === 6 && s.diff === 'medium');
    await tapSel('#sizeSeg button[data-size="8"]'); await tapSel('#dailyBtn'); await settle();
    s = await S();
    gate('daily cùng một đề trong ngày', s.seed === seedDaily && s.N === 6);

    // Giải daily bằng chạm thật → màn thắng có 🔥 + chia sẻ
    for (let i = 0; i < s.N * s.N; i++) {
      if (s.given[i]) continue;
      const want = s.sol[i];
      while ((await S()).board[i] !== want) await tapSel('#board .tile', i);
    }
    await sleep(600);
    s = await S();
    const win = await q(`({ show: document.getElementById('overlay').classList.contains('show'), streak: document.getElementById('winStreak').textContent })`);
    gate('giải daily → màn thắng', s.done && win.show);
    gate('màn thắng hiện chuỗi 🔥1', win.streak === '🔥1', win.streak);
    await cdp.shot('/tmp/rumba-win.png');
    await tapSel('#winShare'); await sleep(200);
    const copied = await q('window.__copied');
    gate('nút Chia sẻ chép dòng kết quả', /^Rumba \d\d\/\d\d · 6×6 · \d+:\d\d · 0 gợi ý 🔥1 https:\/\/rumba\.bomclaw\.org$/.test(copied), copied);
    gate('dòng chia sẻ không chứa bàn cờ', !/[☀🌙⬛⬜🟨]|\n/u.test(copied));
    const streak3 = await q(`(() => { const d = new Date(), o = {}; for (let k = 0; k < 3; k++) { const x = new Date(d); x.setDate(d.getDate() - k); o[x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')] = 60; } return window.__rumba.streakOf(o); })()`);
    gate('streak đếm ngày liên tiếp', streak3 === 3, String(streak3));
  } catch (e) {
    let where = ''; try { where = await q('location.href'); } catch (x) {}
    const nav = cdp ? cdp.events.filter((m) => /frameNavigated|Inspector|targetCrashed|loadEventFired/.test(m.method)).map((m) => m.method + (m.params.frame ? ' ' + m.params.frame.url : '')) : [];
    gate('harness chạy hết', false, e.message.split('\n')[0] + ' @ ' + where + ' events: ' + nav.join(' | '));
  } finally {
    try { chrome.kill(); } catch (e) {}
    if (srv) try { srv.kill(); } catch (e) {}
    const bad = results.filter((r) => !r.ok);
    console.log('\n' + (results.length - bad.length) + '/' + results.length + ' cổng đạt');
    process.exit(bad.length ? 1 : 0);
  }
})();
