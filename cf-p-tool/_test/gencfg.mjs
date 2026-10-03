import fs from "node:fs";
const code = fs.readFileSync("D:/桌面/节点-edit/cf-p-tool/index.html","utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
const els = new Map();
const mk = id => ({id,value:"",textContent:"",innerHTML:"",checked:false,disabled:false,dataset:{},style:{},classList:{add(){},remove(){}},addEventListener(){},focus(){},scrollIntoView(){},open:false});
const get = id => { if(!els.has(id)) els.set(id,mk(id)); return els.get(id); };
const document = { getElementById:get, querySelector:()=>({value:"list",checked:true,click(){}}), querySelectorAll:()=>[], createElement:()=>mk("d") };
const api = new Function("document","navigator","console","atob","btoa",
  code + ";return {genMain,generateClashConfig,parseNode};")(document,{},console,globalThis.atob,globalThis.btoa);
const cases = [
  "vless://uuid-1111@1.2.3.4:443?encryption=none&security=tls&sni=a.example.com&type=ws&host=a.example.com&path=%2Fabc%3Fed%3D2048#WS%E8%8A%82%E7%82%B9",
  "trojan://pass%40word@5.6.7.8:8443?security=tls&sni=b.example.com&type=ws&host=b.example.com&path=%2Ftrojan#TJ",
  "vless://uuid-3333@[2001:db8::1]:443?encryption=none&security=tls&type=xhttp&path=%2Fx&mode=stream-one&sni=c.example.com#XHTTP",
];
get("nodes").value = cases.join("\n");
get("plist").value = "11.1.1.1:443\n11.2.2.2:8443 #HK";
get("nameTpl").value = "{name}-{r}-{i}";
get("existMode").value = "keep";
get("xhttpMode").value = "keep";
get("wk").value = "";
api.genMain();
api.generateClashConfig();
fs.writeFileSync(process.argv[2], get("ocf1").value, "utf8");
console.log("写出配置，长度", get("ocf1").value.length);
console.log(get("clashFullStat").innerHTML.replace(/<[^>]+>/g,""));
