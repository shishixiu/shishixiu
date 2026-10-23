/******************************
 * 美团 Token 捕获 → 青龙 config.sh（QuantumultX 重写脚本）
 *
 * 触发：QX [rewrite_local] 的 `url script-request-header`（只读请求头，不改请求）
 * 动作：从 header / Cookie / URL query 里抽 mtToken（及 uuid），
 *       与 $prefs 里上次同步的值比对，变了才推到青龙 config.sh。
 * 放行：任何分支都必须 $done({})，否则请求会挂住。
 *
 * ⚠ 同步核心与 `mt_ql_config_sync.js` 同源（QX 不支持 require，只能内联）。
 *   改一处必须同步改另一处，否则两条路会跑出不同行为。
 *
 * 首次使用：在 BoxJS 面板里填青龙地址 / Client ID / Client Secret（或自己存进 $prefs）：
 *   $prefs.setValueForKey(JSON.stringify({
 *     QL_HOST:'http://<你的青龙地址>:5700',
 *     QL_CLIENT_ID:'xxx', QL_CLIENT_SECRET:'xxx'
 *   }), 'mt_ql_cfg');
 *
 * Node 自测（模拟 QX 环境）：
 *   node mt_qx_token_capture.js --selftest
 ******************************/

/**
 * ★ 只处理这个板块的请求（蛙趣兼职）。
 *   实测（2026-10-23 HAR）：蛙趣兼职走 `freelance.meituan.com/api/freelance/*`，
 *   token 在 header `token`（152）+ Cookie `token`/`mt_c_token`，
 *   unionid 在 Cookie `_lxsdk_unoinid`/`_lxsdk_dpid`，uuid 在 header `csecuuid`。
 *   改板块只改这一条；$prefs 里给 ALLOW 也能覆盖。
 */
var DEFAULT_ALLOW = '^https?://freelance\\.meituan\\.com/api/freelance/';

var CFG = {
  QL_HOST: '',
  QL_CLIENT_ID: '',
  QL_CLIENT_SECRET: '',
  FILE: 'config.sh',
  DRY_RUN: false,
  MIN_LEN: 10000,
  MAX_DELTA: 400,
  /**
   * ★ 不做「已同步就跳过」——每次抓到都同步一遍（值相同只是一次覆盖，无坏处）。
   *   只保留两个纯工程性保护：
   *   · INFLIGHT_SEC：同一批并发请求（页面会同时发好几条 /api/freelance）只放一个实例进流程，
   *     防止多个实例同时整文件读写 224KB。
   *   · FAIL_BACKOFF：失败后 60s 内不重试，避免异常时狂打青龙。
   */
  INFLIGHT_SEC: 10,
  FAIL_BACKOFF: 60,
  /** 通知里显示完整 token/unionid（默认 false = 只显示指纹，防锁屏泄露） */
  NOTIFY_FULL: false,
  /** 是否弹系统通知（false 则只写日志，不打扰） */
  NOTIFY: true,
  ALLOW: DEFAULT_ALLOW
};

var PREF_CFG = 'mt_ql_cfg';
var PREF_LAST = 'mt_last_sync';   // {tok: 指纹, ts: 秒, ok: 上次结果} —— 仅用于并发保护/失败退避
var PREF_NICK = 'mt_nick';        // {fp, nick, ts} —— 昵称按 token 指纹缓存
// BoxJS 面板字段（值与 boxjs.json 里的 settings[].id 一一对应）
var BJ = {
  HOST: 'MT_QL_HOST',
  ID: 'MT_QL_CLIENT_ID',
  SECRET: 'MT_QL_CLIENT_SECRET',
  FILE: 'MT_QL_FILE',
  NOTIFY: 'MT_NOTIFY',
  NOTIFY_FULL: 'MT_NOTIFY_FULL',
  ALLOW: 'MT_ALLOW',
  TOKEN: 'MT_LAST_TOKEN',
  UNIONID: 'MT_LAST_UNIONID',
  USERID: 'MT_LAST_USERID',
  NICK: 'MT_LAST_NICK',
  RESULT: 'MT_LAST_RESULT',
  TS: 'MT_LAST_TS',
  STATE: 'MT_STATE'
};

// ───────────────────────── 基础
function isNode() {
  return typeof module !== 'undefined' && !!module.exports && typeof process !== 'undefined';
}
function nowStr() {
  return fmtTs(Math.floor(Date.now() / 1000));
}
/** 本地时间格式化（不要用 toISOString，那是 UTC，会差 8 小时） */
function fmtTs(sec) {
  var d = new Date(sec * 1000);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function log() {
  var a = [].slice.call(arguments).join(' ');
  console.log('[' + nowStr() + '] ' + a);
}
/** 掩码：只留前 8 + 后 4，不带长度（长度异常另有 ⚠ 警告单独报） */
function mask(v) {
  if (!v) return '(空)';
  v = String(v);
  if (v.length <= 12) return v.slice(0, 4) + '…';
  return v.slice(0, 8) + '…' + v.slice(-4);
}
function jparse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}
/** BoxJS 的 boolean 可能落成 true/false，也可能落成 "true"/"false"/1/0 */
function isTrue(v) {
  if (v === null || v === undefined || v === '') return false;
  return !(v === false || v === 'false' || v === '0' || v === 0);
}

// ───────────────────────── HTTP 抽象
function request(opt) {
  if (isNode()) return nodeRequest(opt);
  return new Promise(function (resolve, reject) {
    $task.fetch({
      url: opt.url,
      method: opt.method || 'GET',
      headers: opt.headers || {},
      body: opt.body
    }).then(function (r) {
      resolve({ status: r.statusCode, body: r.body });
    }, function (e) { reject(e); });
  });
}

function nodeRequest(opt) {
  return new Promise(function (resolve, reject) {
    var u = new URL(opt.url);
    var mod = u.protocol === 'https:' ? require('https') : require('http');
    var body = opt.body;
    var headers = Object.assign({}, opt.headers || {});
    if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    var r = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opt.method || 'GET',
      headers: headers
    }, function (res) {
      var buf = [];
      res.on('data', function (c) { buf.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: Buffer.concat(buf).toString('utf8') });
      });
    });
    r.on('error', reject);
    r.setTimeout(30000, function () { r.destroy(new Error('timeout 30s')); });
    if (body) r.write(body);
    r.end();
  });
}

// ───────────────────────── 青龙 API
function qlBase() {
  var h = CFG.QL_HOST;
  return h.charAt(h.length - 1) === '/' ? h.slice(0, -1) : h;
}

async function qlToken() {
  var url = qlBase() + '/open/auth/token?client_id=' + encodeURIComponent(CFG.QL_CLIENT_ID) +
    '&client_secret=' + encodeURIComponent(CFG.QL_CLIENT_SECRET);
  var r = await request({ url: url, method: 'GET' });
  var j = jparse(r.body);
  if (!j || j.code !== 200 || !j.data || !j.data.token) {
    throw new Error('取青龙 token 失败：HTTP ' + r.status + ' / ' + String(r.body).slice(0, 160));
  }
  log('青龙 token 获取成功 ' + mask(j.data.token));
  return j.data.token;
}

async function qlGetFile(tok, name) {
  var url = qlBase() + '/open/configs/detail?path=' + encodeURIComponent(name);
  var r = await request({ url: url, method: 'GET', headers: { Authorization: 'Bearer ' + tok } });
  var j = jparse(r.body);
  if (!j || j.code !== 200 || typeof j.data !== 'string') {
    throw new Error('读取 ' + name + ' 失败：HTTP ' + r.status + ' / ' + String(r.body).slice(0, 160));
  }
  return j.data;
}

async function qlSaveFile(tok, name, content) {
  var r = await request({
    url: qlBase() + '/open/configs/save',
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, content: content })
  });
  var j = jparse(r.body);
  if (!j || j.code !== 200) {
    throw new Error('保存 ' + name + ' 失败：HTTP ' + r.status + ' / ' + String(r.body).slice(0, 200));
  }
  return true;
}

// ───────────────────────── 行级替换
function escShell(v) {
  return "'" + String(v).replace(/'/g, "'\\''") + "'";
}

/**
 * found = 命中行数（含值已相同的行）；hits = 真正变化的行。
 * 值已相同 ⇒ found>0 且 hits=[] ⇒ 幂等，绝不追加。
 */
function patchVar(text, key, value) {
  var eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  var lines = text.split(/\r?\n/);
  var re = new RegExp('^([ \\t]*(?:export[ \\t]+)?' + key + '[ \\t]*=)(.*)$');
  var hits = [];
  var found = 0;
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(re);
    if (!m) continue;
    found++;
    var nv = m[1] + escShell(value);
    if (lines[i] === nv) continue;
    hits.push({ no: i + 1, old: lines[i], new: nv });
    lines[i] = nv;
  }
  return { text: lines.join(eol), hits: hits, found: found, eol: eol };
}

function appendVar(text, key, value) {
  var eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  var t = text;
  if (t.charAt(t.length - 1) !== '\n') t += eol;
  var line = 'export ' + key + '=' + escShell(value);
  return { text: t + line + eol, hits: [{ no: t.split(/\r?\n/).length, old: '(不存在)', new: line }] };
}

function lineDiff(a, b) {
  var la = a.split(/\r?\n/), lb = b.split(/\r?\n/);
  // ★ 末尾空元素（文件以换行结尾时 split 会多出一个 '') 不代表内容差异，
  //   两侧都去掉，否则「追加 N 行」会被算成 N+1 处变化，写前不变量会误判。
  if (la.length && la[la.length - 1] === '') la.pop();
  if (lb.length && lb[lb.length - 1] === '') lb.pop();
  var out = [];
  var n = Math.max(la.length, lb.length);
  for (var i = 0; i < n; i++) {
    if (la[i] !== lb[i]) out.push({ no: i + 1, before: la[i], after: lb[i] });
  }
  return out;
}

function extractVal(line) {
  if (!line) return '';
  var m = String(line).match(/=\s*'([\s\S]*)'\s*$/);
  return m ? m[1] : String(line).replace(/^[^=]*=/, '');
}

// ───────────────────────── 主流程：写 config.sh
async function syncMT(creds) {
  creds = creds || {};
  var token = creds.token || CFG.MT_TOKEN;
  var unionid = creds.unionid || CFG.MT_UNIONID || '';
  var uuid = creds.uuid || CFG.MT_UUID || '';
  var dry = creds.dryRun === undefined ? CFG.DRY_RUN : !!creds.dryRun;

  if (!CFG.QL_HOST || !CFG.QL_CLIENT_ID || !CFG.QL_CLIENT_SECRET) {
    throw new Error('缺青龙三要素：请在 BoxJS 面板填「青龙地址 / Client ID / Client Secret」');
  }
  if (!token) throw new Error('缺 MT_TOKEN');

  if (!unionid && uuid) {
    var u = String(uuid);
    if (/^0{13}/.test(u) && u.length > 13) {
      unionid = u.slice(13).toLowerCase();
      log('unionid 由 uuid 反推：' + mask(unionid));
    }
  }
  if (!unionid) throw new Error('缺 MT_UNIONID（也没拿到可反推的 uuid）');

  if (token.length !== 152) log('⚠ MT_TOKEN 长度 ' + token.length + '（历史值恒为 152），确认没抓错字段');
  if (!/^[0-9a-f]{51}$/.test(unionid)) log('⚠ MT_UNIONID 非 51 位小写 hex：' + mask(unionid));

  var tok = await qlToken();
  var origin = await qlGetFile(tok, CFG.FILE);
  log('读到 ' + CFG.FILE + '：' + origin.length + ' 字节');

  if (origin.length < CFG.MIN_LEN) {
    throw new Error('⛔ 原文仅 ' + origin.length + ' 字节（< ' + CFG.MIN_LEN + '）⇒ 疑似读取异常，中止，未写入');
  }

  var cur = origin;
  var hits = [];
  var targets = [['MT_TOKEN', token], ['MT_UNIONID', unionid]];
  for (var i = 0; i < targets.length; i++) {
    var k = targets[i][0], v = targets[i][1];
    var p = patchVar(cur, k, v);
    if (p.found === 0) {
      var ap = appendVar(cur, k, v);
      log('  ' + k + ' 在文件中不存在 ⇒ 追加到末尾');
      p = { text: ap.text, hits: [{ no: ap.hits[0].no, old: '(不存在)', new: ap.hits[0].new }], found: 0 };
    }
    cur = p.text;
    for (var h = 0; h < p.hits.length; h++) {
      hits.push({ key: k, no: p.hits[h].no, old: p.hits[h].old, new: p.hits[h].new });
    }
  }

  if (hits.length === 0) {
    log('✅ 值已与 config.sh 一致，无需写入（幂等跳过）');
    return { ok: true, changed: false, rolledBack: false, detail: '无变化' };
  }

  var delta = Math.abs(cur.length - origin.length);
  if (delta > CFG.MAX_DELTA) {
    throw new Error('⛔ 补丁后长度变化 ' + delta + ' 字节（> ' + CFG.MAX_DELTA + '）⇒ 中止，未写入');
  }

  // ★★ 写入前不变量：除目标行外，任何一行都不许变。
  //   并发/读到半截文件时这里会立刻炸出来，而不是把坏内容写回去。
  var pre = lineDiff(origin, cur);
  if (pre.length !== hits.length) {
    throw new Error('⛔ 补丁波及 ' + pre.length + ' 行（预期 ' + hits.length + ' 行）⇒ 中止，未写入。'
      + '多半是读取到不完整内容或并发写入，请重试');
  }

  log('待写入 ' + hits.length + ' 处：');
  for (var j = 0; j < hits.length; j++) {
    log('  L' + hits[j].no + ' ' + hits[j].key + '：' + mask(extractVal(hits[j].old)) +
      ' → ' + mask(extractVal(hits[j].new)));
  }

  if (dry) {
    log('🔍 --dry-run：未写入。');
    return { ok: true, changed: true, rolledBack: false, detail: 'dry-run', hits: hits };
  }

  await qlSaveFile(tok, CFG.FILE, cur);
  log('已提交保存，回读校验…');

  var back = await qlGetFile(tok, CFG.FILE);
  if (back !== cur) {
    log('❌ 回读与提交内容不一致 ⇒ 立即回滚');
    var d = lineDiff(cur, back);
    for (var q = 0; q < Math.min(d.length, 5); q++) {
      log('  L' + d[q].no + ' 期望=' + String(d[q].before).slice(0, 60) +
        ' 实际=' + String(d[q].after).slice(0, 60));
    }
    await qlSaveFile(tok, CFG.FILE, origin);
    var back2 = await qlGetFile(tok, CFG.FILE);
    var ok2 = back2 === origin;
    log(ok2 ? '✅ 已回滚到原文（逐字节一致）' : '⛔ 回滚后仍不一致！请手工用备份恢复');
    return { ok: false, changed: true, rolledBack: true, detail: ok2 ? '已回滚' : '回滚失败' };
  }

  var dd = lineDiff(origin, back);
  if (dd.length !== hits.length) {
    log('⚠ 变化行数 ' + dd.length + ' ≠ 预期 ' + hits.length + '，请人工复核');
  } else {
    log('✅ 写入成功，仅 ' + dd.length + ' 行变化，逐字节校验通过');
  }
  return { ok: true, changed: true, rolledBack: false, detail: '已写入 ' + dd.length + ' 行' };
}

// ───────────────────────── 抓 token（纯函数，可单测）
var TOKEN_RE = /^Ag[A-Za-z0-9_\-]{120,200}$/;

/**
 * 从 QX 的 $request（{url, headers}）里抽凭证。
 * 返回 {token, tokenSrc, unionid, unionidSrc, uuid, uuidSrc, userid}
 *
 * 优先级（按 2026-10-23 蛙趣兼职 HAR 实测的字段位置）：
 *   token   : header `token` → Cookie `token`/`mt_c_token`/`mc_token` → query
 *   unionid : Cookie `_lxsdk_unoinid` → Cookie `_lxsdk_dpid` → 由 uuid 反推
 *   uuid    : header `csecuuid` → Cookie `uuid`/`_utm_content`
 *   userid  : header `csecuserid`（仅用于日志核对）
 */
function captureFromRequest(req) {
  var out = { token: null, tokenSrc: null, unionid: null, unionidSrc: null, uuid: null, uuidSrc: null, userid: null };
  if (!req) return out;
  var h = req.headers || {};
  var low = {};
  for (var k in h) { if (Object.prototype.hasOwnProperty.call(h, k)) low[String(k).toLowerCase()] = h[k]; }

  var cands = [];
  // ① header（App 主用；蛙趣兼职用 token，其它域常用 mtToken）
  ['token', 'mttoken', 'mt-token'].forEach(function (name) {
    if (low[name]) cands.push({ src: 'header:' + name, v: String(low[name]) });
  });

  // ② Cookie
  var ck = low['cookie'] || '';
  var ckGet = function (name) {
    var m = ck.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };
  if (ck) {
    ['token', 'mt_c_token', 'mc_token'].forEach(function (name) {
      var v = ckGet(name);
      if (v) cands.push({ src: 'cookie:' + name, v: v });
    });
    // ★ 直出 unionid，比从 uuid 反推更稳
    ['_lxsdk_unoinid', '_lxsdk_dpid'].forEach(function (name) {
      var v = ckGet(name);
      if (v && /^[0-9a-f]{51}$/i.test(v)) { out.unionid = v.toLowerCase(); out.unionidSrc = 'cookie:' + name; }
    });
    ['uuid', '_utm_content', '_lxsdk'].forEach(function (name) {
      var v = ckGet(name);
      if (v && /^0{13}[0-9A-Fa-f]{40,}$/.test(v) && !out.uuid) { out.uuid = v; out.uuidSrc = 'cookie:' + name; }
    });
  }

  // ③ URL query
  var qi = req.url ? req.url.indexOf('?') : -1;
  if (qi >= 0) {
    var qs = req.url.slice(qi + 1);
    ['mtToken', 'token', 'mt_token'].forEach(function (name) {
      var m = qs.match(new RegExp('(?:^|&)' + name + '=([^&]+)'));
      if (m) cands.push({ src: 'query:' + name, v: decodeURIComponent(m[1]) });
    });
  }

  // ④ uuid / userid 兜底（header）
  if (!out.uuid && low['csecuuid'] && /^0{13}/.test(String(low['csecuuid']))) {
    out.uuid = String(low['csecuuid']); out.uuidSrc = 'header:csecuuid';
  }
  if (low['csecuserid'] && /^\d{6,}$/.test(String(low['csecuserid']))) {
    out.userid = String(low['csecuserid']);
  }

  for (var i = 0; i < cands.length; i++) {
    var v = String(cands[i].v).trim().replace(/^Bearer\s+/i, '');
    if (TOKEN_RE.test(v)) { out.token = v; out.tokenSrc = cands[i].src; break; }
  }
  return out;
}

function tokFp(t) {
  return t ? t.slice(0, 16) + t.slice(-8) : '';
}

/**
 * 用 token 换昵称（PHX SSO）。★ 只用于「通知里显示是哪个号」，不参与同步逻辑。
 * 结果按 token 指纹缓存到 $prefs，同一 token 只请求一次。
 * 失败返回 null（通知回落到 userid）。
 */
async function fetchNick(token, fp) {
  var j = jparse(prefsGet(PREF_NICK) || '');
  if (j && j.fp === fp) {
    if (j.nick) return j.nick;
    // 负缓存：失败过就 1 小时内不再重试，避免每次抓取都多打一次 SSO
    if (Math.floor(Date.now() / 1000) - (Number(j.ts) || 0) < 3600) return null;
  }
  try {
    var r = await request({
      url: 'https://api-phx.meituan.com/user/api/v1/sso',
      method: 'POST',
      headers: { Cookie: 'token=' + token, 'Content-Type': 'application/json' },
      body: '{}'
    });
    var d = jparse(r.body);
    // 注意：SSO 用 status 字段，不是 code
    var nick = d && d.data && d.data.nickName;
    if (nick) {
      prefsSet(PREF_NICK, JSON.stringify({ fp: fp, nick: nick, ts: Math.floor(Date.now() / 1000) }));
      return nick;
    }
    log('⚠ 取昵称失败：SSO 无 nickName（HTTP ' + r.status + '）');
  } catch (e) {
    log('⚠ 取昵称异常：' + (e && e.message ? e.message : e));
  }
  prefsSet(PREF_NICK, JSON.stringify({ fp: fp, nick: null, ts: Math.floor(Date.now() / 1000) }));
  return null;
}

// ───────────────────────── 配置装载
function prefsGet(k) {
  if (typeof $prefs === 'undefined') return null;
  return $prefs.valueForKey(k);
}
function prefsSet(k, v) {
  if (typeof $prefs === 'undefined') return;
  $prefs.setValueForKey(v, k);
}

function loadCfg() {
  // ① BoxJS 面板（每个 setting 的 id 就是一个 $prefs 键）
  var bjHost = prefsGet(BJ.HOST), bjId = prefsGet(BJ.ID), bjSec = prefsGet(BJ.SECRET);
  if (bjHost) CFG.QL_HOST = String(bjHost).trim();
  if (bjId) CFG.QL_CLIENT_ID = String(bjId).trim();
  if (bjSec) CFG.QL_CLIENT_SECRET = String(bjSec).trim();
  var bjAllow = prefsGet(BJ.ALLOW);
  if (bjAllow) CFG.ALLOW = String(bjAllow).trim();
  var bjFile = prefsGet(BJ.FILE);
  if (bjFile) CFG.FILE = String(bjFile).trim();
  var bjNotify = prefsGet(BJ.NOTIFY);
  if (bjNotify !== null && bjNotify !== undefined && bjNotify !== '') {
    CFG.NOTIFY = isTrue(bjNotify);
  }
  var bjFull = prefsGet(BJ.NOTIFY_FULL);
  if (bjFull !== null && bjFull !== undefined && bjFull !== '') {
    CFG.NOTIFY_FULL = isTrue(bjFull);
  }
  if (bjHost || bjId || bjSec) CFG._SRC = 'BoxJS 面板';

  // ② 旧的单键 JSON 兜底（不装 BoxJS 时用）
  var raw = prefsGet(PREF_CFG);
  if (raw) {
    var j = jparse(raw);
    if (j) {
      CFG.QL_HOST = CFG.QL_HOST || j.QL_HOST || j.host || '';
      CFG.QL_CLIENT_ID = CFG.QL_CLIENT_ID || j.QL_CLIENT_ID || j.client_id || '';
      CFG.QL_CLIENT_SECRET = CFG.QL_CLIENT_SECRET || j.QL_CLIENT_SECRET || j.client_secret || '';
      CFG.FILE = j.FILE || CFG.FILE;
      if (j.ALLOW) CFG.ALLOW = j.ALLOW;
    } else {
      log('⚠ $prefs["' + PREF_CFG + '"] 不是合法 JSON');
    }
  }

  // ③ Node 环境变量
  if (isNode()) {
    CFG.QL_HOST = process.env.QL_HOST || CFG.QL_HOST;
    CFG.QL_CLIENT_ID = process.env.QL_CLIENT_ID || CFG.QL_CLIENT_ID;
    CFG.QL_CLIENT_SECRET = process.env.QL_CLIENT_SECRET || CFG.QL_CLIENT_SECRET;
    CFG.FILE = process.env.QL_FILE || CFG.FILE;
  }
}

/** 懒装载：onRequest 自己保证配置就绪，不依赖调用方先跑 main() */
var CFG_LOADED = false;
function ensureCfg() {
  if (!CFG_LOADED) { loadCfg(); CFG_LOADED = true; }
}

/** 把「去重依据」的真实状态写到面板（依据 = 持久化的 MT_LAST_TOKEN） */
function saveState() {
  try {
    var saved = prefsGet(BJ.TOKEN);
    var j = jparse(prefsGet(PREF_LAST) || '');
    var when = (j && j.ts) ? '｜' + fmtTs(Number(j.ts)) : '';
    if (saved) {
      prefsSet(BJ.STATE, '已同步 ' + mask(saved) + when + '（删掉上面 token 即重置）');
    } else {
      prefsSet(BJ.STATE, '无已同步记录（下次抓取会处理）');
    }
  } catch (e) { /* ignore */ }
}

/** 把「抓到的数据」写回 BoxJS 面板。
 *  ★★ 只有同步**成功**才写 MT_LAST_TOKEN —— 因为它现在是去重的唯一依据：
 *     删掉它（或改掉）就等于重置，下次抓取必然重新处理。
 */
function saveDisplay(c, nick, detail, ok) {
  try {
    if (ok && c && c.token) {
      prefsSet(BJ.TOKEN, c.token);
      prefsSet(BJ.UNIONID, c.unionid || '');
      prefsSet(BJ.USERID, c.userid || '');
      prefsSet(BJ.NICK, nick || '');
    }
    prefsSet(BJ.RESULT, detail || '');
    prefsSet(BJ.TS, nowStr());
    saveState();
  } catch (e) { /* 面板写入失败不影响同步 */ }
}

/**
 * ★ 不做「已同步就跳过」：每次抓到都同步一遍（值相同只是一次覆盖，无坏处）。
 *   这里只剩两个纯工程保护，都不改变"每次都处理"的语义：
 *   · INFLIGHT_SEC：同一批并发请求（页面同时发好几条 /api/freelance）只放一个实例进去，
 *     防止多个实例同时整文件读写 224KB。
 *   · FAIL_BACKOFF：失败后 60s 内不重试，避免异常时狂打青龙。
 * 返回 null = 放行；否则返回跳过原因字符串。
 */
function skipReason(fp) {
  var j = jparse(prefsGet(PREF_LAST) || '');
  if (!j || j.tok !== fp) return null;
  var age = Math.floor(Date.now() / 1000) - (Number(j.ts) || 0);
  if (j.ok === false && age < CFG.FAIL_BACKOFF) return 'fail:' + (CFG.FAIL_BACKOFF - age);
  if (age < CFG.INFLIGHT_SEC) return 'inflight:' + (CFG.INFLIGHT_SEC - age);
  return null;
}
function markTry(fp, ok) {
  prefsSet(PREF_LAST, JSON.stringify({ tok: fp, ts: Math.floor(Date.now() / 1000), ok: !!ok }));
}

// ───────────────────────── QX 入口
async function onRequest(req) {
  ensureCfg();   // ★ 保证 ALLOW / 青龙三要素已从 BoxJS 面板装载（直接调 onRequest 时也成立）

  // ★ 入口心跳：只要这行出现，就说明「脚本确实被执行了」
  if (req && req.url) log('[入口] ' + String(req.url).slice(0, 60));

  // ★ 白名单：只处理目标板块。即便模块规则写宽了，这里也会把别的页面挡掉。
  var allowRe;
  try {
    allowRe = new RegExp(CFG.ALLOW);
  } catch (e) {
    log('⚠ MT_ALLOW 不是合法正则（' + CFG.ALLOW + '），回落默认规则');
    allowRe = new RegExp(DEFAULT_ALLOW);
  }
  if (!req || !req.url || !allowRe.test(req.url)) {
    if (req && req.url) log('未命中抓取范围，跳过：' + String(req.url).slice(0, 70));
    return { hit: false, skip: 'not-target' };
  }
  var c = captureFromRequest(req);
  if (!c.token) return { hit: false, skip: 'no-token' };   // 没 token，立刻放行

  var fp = tokFp(c.token);
  // ★ 只做并发/失败保护，不做「已同步就跳过」
  var why = skipReason(fp);
  if (why) {
    log('跳过（' + why + '）');
    return { hit: true, skipped: true, reason: why };
  }
  // ★★★ 先占位再干活：QX 对同一批并发请求各起一个实例，先 mark 才能让后面的实例看到
  markTry(fp, false);

  log('命中 ' + c.tokenSrc + ' → ' + mask(c.token) + '（配置来源：' + (CFG._SRC || '默认') + '）' +
    (c.userid ? '，userid=' + c.userid : '') +
    (c.unionid ? '，unionid=' + mask(c.unionid) + '(' + c.unionidSrc + ')' :
      (c.uuid ? '，uuid=' + mask(c.uuid) + '(' + c.uuidSrc + ')' : '')));

  // 昵称只用于通知展示（缓存，一 token 一次）
  var nick = await fetchNick(c.token, fp);
  if (nick) log('账号昵称：' + nick);

  try {
    var r = await syncMT({ token: c.token, unionid: c.unionid, uuid: c.uuid });
    markTry(fp, r.ok);
    saveDisplay(c, nick, r.detail, r.ok);
    // ★ 每次真正执行都弹（含「无变化」）；值相同也只是多覆盖一次，没有坏处
    notify(r.ok ? '✅ ' + r.detail : '❌ ' + r.detail, notifyBody(c, r.detail, nick));
    return { hit: true, result: r };
  } catch (e) {
    markTry(fp, false);
    var msg = e && e.message ? e.message : String(e);
    log('❌ ' + msg);
    saveDisplay(c, nick, '失败：' + msg, false);
    notify('❌ 失败', notifyBody(c, msg, nick));
    return { hit: true, error: msg };
  }
}

function notify(sub, body) {
  if (!CFG.NOTIFY) return;
  if (typeof $notify === 'undefined') return;
  $notify('美团', sub, body);
}

/** 通知正文：哪个号（昵称优先，取不到回落 userid）+ 凭证 + 结果 */
function notifyBody(c, detail, nick) {
  var full = CFG.NOTIFY_FULL;
  var p = [];
  if (nick) p.push(nick);
  else if (c.userid) p.push('userid=' + c.userid);
  if (c.unionid) p.push('unionid=' + (full ? c.unionid : c.unionid.slice(0, 8) + '…'));
  else if (c.uuid) p.push('uuid=' + (full ? c.uuid : '…' + String(c.uuid).slice(-8)));
  p.push('token=' + (full ? c.token : mask(c.token)));
  p.push(detail || '');
  return p.join(' · ');
}

// ───────────────────────── 自测（Node）
async function selftest() {
  // 合成一个形状合法的 token / unionid / uuid / userid，不把真实凭证写进源码
  var TK = 'Ag' + new Array(151).join('x');
  var UN = new Array(52).join('a');                                   // 51 个 a（合法小写 hex 形状）
  var UU = '0000000000000' + UN.toUpperCase();                        // 13 个 0 + 51 位 = 64，且可由 uuid 反推
  var WQ = 'https://freelance.meituan.com/api/freelance/homepage/query?csecpkgname=com.meituan.imeituan';

  var cases = [
    ['蛙趣 header token + cookie unionid/uuid',
      { url: WQ, headers: { token: TK, csecuuid: UU, csecuserid: '1000000000', Cookie: 'token=' + TK + '; _lxsdk_unoinid=' + UN + '; uuid=' + UU } },
      function (r) { return r.token === TK && r.unionid === UN && r.uuid === UU && r.userid === '1000000000'; }],
    ['蛙趣 只有 header token（无 cookie）',
      { url: WQ, headers: { token: TK } },
      function (r) { return r.token === TK && !r.unionid && !r.uuid; }],
    ['蛙趣 token 只在 Cookie',
      { url: WQ, headers: { Cookie: 'mt_c_token=' + TK + '; _lxsdk_dpid=' + UN } },
      function (r) { return r.token === TK && r.unionid === UN; }],
    ['无 token（应放行）',
      { url: WQ, headers: { 'User-Agent': 'MApi 1.1 (mtscope 12.66.402)' } },
      function (r) { return !r.token; }],
    ['短串不是 token',
      { url: WQ, headers: { token: 'AgG8short' } },
      function (r) { return !r.token; }]
  ];
  var pass = 0;
  cases.forEach(function (c) {
    var r = captureFromRequest(c[1]);
    var ok = c[2](r);
    if (ok) pass++;
    log((ok ? '✅ ' : '❌ ') + c[0] + ' → token=' + (r.token ? mask(r.token) : 'null') +
      ' unionid=' + (r.unionid ? mask(r.unionid) : 'null') + '(' + r.unionidSrc + ')' +
      ' uuid=' + (r.uuid ? '有' : 'null'));
  });

  // 白名单：目标板块内命中，板块外一律不命中
  var re = new RegExp(CFG.ALLOW);
  var allowCases = [
    [WQ, true],
    ['https://freelance.meituan.com/api/freelance/market/checkin/status?x=1', true],
    ['https://freelance.meituan.com/api/other/query', false],
    ['https://lx0.meituan.com/api/freelance/homepage/query', false],
    ['https://www.meituan.com/api/compass/login/query', false]
  ];
  allowCases.forEach(function (a) {
    var ok = re.test(a[0]) === a[1];
    if (ok) pass++;
    log((ok ? '✅ ' : '❌ ') + '白名单 ' + (a[1] ? '放行' : '拦截') + '：' + a[0].slice(0, 62));
  });

  var total = cases.length + allowCases.length;
  log('自测 ' + pass + '/' + total + ' 通过');
  return pass === total;
}

// ───────────────────────── 入口
(function main() {
  var argv = isNode() && typeof process !== 'undefined' ? process.argv : [];
  if (isNode() && argv.indexOf('--selftest') >= 0) {
    selftest().then(function (ok) { process.exit(ok ? 0 : 1); });
    return;
  }
  // QX：被 rewrite 调用时 $request 一定存在
  if (typeof $request !== 'undefined' && $request) {
    loadCfg();
    onRequest($request).then(function () {
      $done({});                                  // 只读放行，绝不改请求
    }).catch(function (e) {
      // ★ 绝不能静默吞异常：否则「什么都没打」会被误判成「脚本没触发」
      log('❌ 脚本异常：' + (e && e.message ? e.message : String(e)));
      $done({});
    });
    return;
  }
  // Node 直接跑：等价于只做一次「从 env 取 token 同步」
  if (isNode() && require.main === module) {
    loadCfg();
    CFG.MT_TOKEN = process.env.MT_TOKEN || CFG.MT_TOKEN;
    CFG.MT_UNIONID = process.env.MT_UNIONID || CFG.MT_UNIONID;
    CFG.MT_UUID = process.env.MT_UUID || CFG.MT_UUID;
    if (argv.indexOf('--dry-run') >= 0) CFG.DRY_RUN = true;
    syncMT({}).then(function (r) {
      log('结果：' + r.detail);
      process.exit(r.ok ? 0 : 1);
    }).catch(function (e) {
      log('❌ ' + (e && e.message ? e.message : e));
      process.exit(1);
    });
  }
})();

if (isNode()) {
  module.exports = {
    captureFromRequest: captureFromRequest,
    syncMT: syncMT,
    onRequest: onRequest,
    CFG: CFG,
    selftest: selftest
  };
}
