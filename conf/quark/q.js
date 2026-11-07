const u=($request&&$request.url)||'';
if(!/queryPlanList/.test(u)){$done({});}else{
let b=($response&&$response.body)||'';
if(!b||b.indexOf('planList')<0){$done({});}else{
b=b.replace(/"canDraw"\s*:\s*false/g,'"canDraw":true');
b=b.replace(/"limitCode"\s*:\s*"[^"]*"/g,'"limitCode":""');
b=b.replace(/"assigned"\s*:\s*\d+/g,'"assigned":0');
$done({body:b});}}
