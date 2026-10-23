/******************************
 * QX 持久化数据探针（只为验证一件事：rewrite 脚本能不能读写 $prefs）
 *
 * 用法：把重写规则临时指向本文件（url script-request-header），
 *       然后刷一下蛙趣兼职，看 QX 日志里的 [prefs探针] 行。
 *
 * 判读：
 *   [prefs探针] 读：…  → 说明能读
 *   [prefs探针] 写回读=… → 说明能写
 *   抛错 / 无输出        → 说明这个 QX 版本在 rewrite 上下文里不给 $prefs
 ******************************/

(function () {
  var out = [];
  try {
    var keys = ['MT_LAST_TOKEN', 'MT_QL_HOST', 'MT_STATE', 'mt_last_sync', 'MT_SKIP_DONE'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = null;
      try { v = $prefs.valueForKey(k); } catch (e) { out.push(k + '=抛错'); continue; }
      out.push(k + '=' + (v === null || v === undefined || v === '' ? '(空)' : '有(' + String(v).length + ')'));
    }
    console.log('[prefs探针] 读：' + out.join(' | '));
  } catch (e) {
    console.log('[prefs探针] ❌ 读 $prefs 整体失败：' + (e && e.message ? e.message : e));
  }

  try {
    var stamp = 'probe@' + new Date().getTime();
    $prefs.setValueForKey(stamp, 'MT_PREFS_PROBE');
    var back = $prefs.valueForKey('MT_PREFS_PROBE');
    console.log('[prefs探针] 写回读=' + (back === stamp ? '一致 ✅（' + stamp + '）' : '不一致 ❌（写入 ' + stamp + '，读回 ' + back + '）'));
  } catch (e) {
    console.log('[prefs探针] ❌ 写 $prefs 失败：' + (e && e.message ? e.message : e));
  }

  console.log('[prefs探针] typeof $prefs=' + (typeof $prefs) +
    '  typeof $task=' + (typeof $task) +
    '  typeof $notify=' + (typeof $notify) +
    '  typeof $done=' + (typeof $done));
  $done({});
})();
