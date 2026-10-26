var PREF_CK = 'duck_ck';
var PREF_TS = 'duck_ck_ts';

function log(s) { console.log(String(s)); }

function prefsGet(k) {
  try { return $prefs.valueForKey(k); } catch (e) { return null; }
}

function prefsSet(k, v) {
  try { $prefs.setValueForKey(String(v), k); return true; } catch (e) { return false; }
}

function notify(title, body) {
  try { $notify(String(title), '', String(body)); } catch (e) { log('[通知失败] ' + e); }
}

function done() { if (typeof $done === 'function') $done(); }

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtTs(ms) {
  if (!ms) return '-';
  var t = new Date(Number(ms));
  return (t.getMonth() + 1) + '-' + pad2(t.getDate()) + ' ' +
         pad2(t.getHours()) + ':' + pad2(t.getMinutes());
}

function cookieVal(ck, name) {
  var parts = String(ck || '').split(';');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].replace(/^\s+/, '');
    var p = kv.indexOf('=');
    if (p > 0 && kv.slice(0, p) === name) return kv.slice(p + 1);
  }
  return '';
}

function cookieCount(ck) {
  var n = 0, parts = String(ck || '').split(';');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].indexOf('=') > 0) n++;
  }
  return n;
}

function pickHeader(h, name) {
  if (!h) return null;
  var low = String(name).toLowerCase();
  for (var k in h) {
    if (Object.prototype.hasOwnProperty.call(h, k) && String(k).toLowerCase() === low) return h[k];
  }
  return null;
}

function handleRewrite() {
  try {
    var ck = pickHeader($request.headers, 'cookie');
    if (!ck) {
      log('[抓取] 请求里没有 Cookie 头，跳过');
      return $done({});
    }
    ck = String(ck).replace(/^Cookie:\s*/i, '').trim();

    var st = cookieVal(ck, 'kuaishou.api_st');
    if (!st || st.length < 100) {
      log('[抓取] 无有效 kuaishou.api_st（len=' + (st ? st.length : 0) + '），跳过');
      return $done({});
    }

    var n = cookieCount(ck);
    var old = prefsGet(PREF_CK) || '';
    var changed = String(ck) !== String(old);

    prefsSet(PREF_CK, ck);
    prefsSet(PREF_TS, String(Date.now()));

    log('[抓取] Cookie ' + (changed ? '已更新' : '无变化') +
        ' 长度=' + ck.length + ' 项数=' + n);

    if (changed) {
      var tip = n >= 53 ? '' : '\n⚠ 项数 ' + n + ' < 53，duck_catch.js 查次数会失败（需 ≥53）';
      notify('🦆 抓鸭 Cookie 已保存',
        '长度 ' + ck.length + 'B｜' + n + ' 项｜' + fmtTs(Date.now()) + tip);
    }
  } catch (e) {
    log('[抓取] 异常: ' + e);
  }
  return $done({});
}

(function main() {
  try {
    if (typeof $request === 'undefined' || !$request) {
      log('[跳过] 非重写请求 —— 本脚本只负责抓 Cookie');
      return done();
    }
    return handleRewrite();
  } catch (e) {
    log('❌ 顶层异常: ' + e);
    done();
  }
})();
