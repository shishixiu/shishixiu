/*
 * 夸克兑换页 —— queryPlanList 响应改写（Quantumult X / Surge 通用）
 *
 * 用法：把本文件放到可访问的 URL（Gist / 自建），在 conf 里引用：
 *   ^https?:\/\/coral2\.quark\.cn\/quark\/welfare\/v3\/queryPlanList url script-response-body <本文件URL>
 *
 * 相比 response-body 正则替换，脚本版更稳：
 *   - 能处理 JSON 里有无空格两种序列化
 *   - 能打印命中情况（QX 日志里能看到）
 */

const url = ($request && $request.url) || '';

if (!/queryPlanList/.test(url)) {
  $done({});
} else {
  let body = ($response && $response.body) || '';
  if (!body || body.indexOf('planList') < 0) {
    console.log('[quark-stock] 未命中 planList，body 长度=' + body.length);
    $done({});
  } else {
    let n = 0;

    // canDraw -> true
    body = body.replace(/"canDraw"\s*:\s*false/g, () => { n++; return '"canDraw":true'; });

    // limitCode 清空
    body = body.replace(/"limitCode"\s*:\s*"[^"]*"/g, () => { n++; return '"limitCode":""'; });

    // assigned 归零
    body = body.replace(/"assigned"\s*:\s*\d+/g, () => { n++; return '"assigned":0'; });

    console.log('[quark-stock] 改写 ' + n + ' 处');
    $done({ body });
  }
}
