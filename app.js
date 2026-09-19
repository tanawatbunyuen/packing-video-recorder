const $=id=>document.getElementById(id);let stream,recorder,chunks=[],active="",packer="",started=0,timer,root;
const DB="pack-v14",STORE="logs",HANDLES="handles",PREFS="prefs";
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}
function fmt(s){s=Math.floor(s);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}
function safe(s){return s.replace(/[^A-Za-z0-9ก-๙._-]+/g,"_").slice(0,100)}
function db(){return new Promise((ok,no)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{let d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id",autoIncrement:true});if(!d.objectStoreNames.contains(HANDLES))d.createObjectStore(HANDLES,{keyPath:"key"});if(!d.objectStoreNames.contains(PREFS))d.createObjectStore(PREFS,{keyPath:"key"})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function put(s,v,add=false){let d=await db();return new Promise((ok,no)=>{let t=d.transaction(s,"readwrite"),r=add?t.objectStore(s).add(v):t.objectStore(s).put(v);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function get(s,k){let d=await db();return new Promise((ok,no)=>{let r=d.transaction(s).objectStore(s).get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function all(){let d=await db();return new Promise((ok,no)=>{let r=d.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>no(r.error)})}
async function del(id){let d=await db();return new Promise((ok,no)=>{let t=d.transaction(STORE,"readwrite");t.objectStore(STORE).delete(id);t.oncomplete=ok;t.onerror=()=>no(t.error)})}
async function permission(){if(!root)return false;let p=await root.queryPermission({mode:"readwrite"});if(p==="granted")return true;return await root.requestPermission({mode:"readwrite"})==="granted"}
$("workerBtn").onclick=async()=>{let n=$("worker").value.trim();if(!n)return toast("กรุณาพิมพ์ชื่อพนักงาน");packer=n;$("currentWorker").textContent=n;$("workerStatus").textContent="ผู้แพ็ก: "+n;await put(PREFS,{key:"worker",value:n});$("barcode").focus()}
$("folderBtn").onclick=async()=>{try{root=await showDirectoryPicker({mode:"readwrite"});await put(HANDLES,{key:"root",handle:root});$("folderStatus").textContent="FOLDER: "+root.name;$("barcode").focus()}catch(e){}}
const QUALITY={480:{w:854,h:480,b:800000},720:{w:1280,h:720,b:1500000},1080:{w:1920,h:1080,b:3000000}};
function selectedQuality(){return QUALITY[$("quality").value]||QUALITY[720]}
async function openCamera(){try{let q=selectedQuality();stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:q.w},height:{ideal:q.h},frameRate:{ideal:30}},audio:false});$("preview").srcObject=stream;$("cameraStatus").textContent="CAMERA ON • "+$("quality").value+"p";$("cameraBtn").textContent="ปิดกล้อง";$("quality").disabled=false;$("barcode").focus();return true}catch(e){stream=null;toast("เปิดกล้องไม่ได้: "+e.message);return false}}
function closeCamera(){if(recorder&&recorder.state==="recording"){toast("ปิดกล้องไม่ได้ขณะกำลังบันทึก");return false}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$("preview").srcObject=null;$("cameraStatus").textContent="CAMERA OFF";$("cameraBtn").textContent="เปิดกล้อง";$("barcode").focus();return true}
$("cameraBtn").onclick=async()=>{if(stream)closeCamera();else await openCamera()}
$("quality").onchange=async()=>{if(recorder&&recorder.state==="recording"){toast("เปลี่ยนคุณภาพไม่ได้ขณะกำลังบันทึก");return}await put(PREFS,{key:"quality",value:$("quality").value});if(stream){closeCamera();await openCamera()}else{$("cameraStatus").textContent="CAMERA OFF • "+$("quality").value+"p"}}
async function start(code){if(!packer)return toast("กรุณาระบุชื่อพนักงานก่อน");if(!root)return toast("กรุณาเลือกโฟลเดอร์ก่อน");if(!await permission())return toast("ไม่ได้รับสิทธิ์โฟลเดอร์");if(!stream){let opened=await openCamera();if(!opened)return}let prior=(await all()).find(x=>x.barcode.toLowerCase()===code.toLowerCase());if(prior)return toast("Order นี้เคยบันทึกแล้ว หากต้องการอัดใหม่ให้ลบวิดีโอเดิมก่อน");active=code;chunks=[];let mime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm";let q=selectedQuality();recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:q.b});$("quality").disabled=true;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start(1000);started=Date.now();$("order").textContent=code;$("rec").hidden=false;$("stopBtn").disabled=false;$("state").textContent="RECORDING";timer=setInterval(()=>$("timer").textContent=fmt((Date.now()-started)/1000),500)}
async function stop(){if(!recorder||recorder.state!=="recording")return;let code=active,worker=packer,dur=(Date.now()-started)/1000;await new Promise(ok=>{recorder.onstop=ok;recorder.stop()});clearInterval(timer);$("state").textContent="SAVING";let d=new Date(),z=n=>String(n).padStart(2,"0"),day=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`,tm=`${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`,filename=`${safe(code)}_${safe(worker)}_${tm}.webm`;try{let dir=await root.getDirectoryHandle(day,{create:true}),fh=await dir.getFileHandle(filename,{create:true}),w=await fh.createWritable();await w.write(new Blob(chunks,{type:recorder.mimeType}));await w.close();await put(STORE,{barcode:code,worker,folder:day,filename,createdAt:d.toISOString(),durationSeconds:dur},true);toast("บันทึก "+code+" แล้ว")}catch(e){toast("บันทึกไม่สำเร็จ: "+e.message)}recorder=null;active="";chunks=[];$("quality").disabled=false;$("rec").hidden=true;$("stopBtn").disabled=true;$("order").textContent="-";$("state").textContent="IDLE";await render();$("barcode").focus()}
$("stopBtn").onclick=stop;
$("barcode").addEventListener("keydown",async e=>{if(e.key!=="Enter")return;let code=e.target.value.trim();e.target.value="";if(!code)return;if(recorder&&recorder.state==="recording"){if(code.toLowerCase()===active.toLowerCase())await stop();else toast("กำลังอัด "+active+" ต้องยิง Barcode เดิมเพื่อหยุด");return}await start(code)});
async function play(x){try{if(!root||!await permission())return toast("กรุณาเลือกโฟลเดอร์วิดีโอ");let dir=await root.getDirectoryHandle(x.folder),fh=await dir.getFileHandle(x.filename),f=await fh.getFile(),u=URL.createObjectURL(f);window.open(u,"_blank");setTimeout(()=>URL.revokeObjectURL(u),60000)}catch(e){toast("เปิดวิดีโอไม่ได้")}}
async function removeRecording(x){if(recorder&&recorder.state==="recording")return toast("ไม่สามารถลบขณะกำลังอัด");if(!root||!await permission())return toast("กรุณาเลือกโฟลเดอร์วิดีโอ");let m=document.createElement("div");m.className="modal";m.innerHTML=`<div><h3>ลบวิดีโอ?</h3><p>จะลบ Order <b></b> ทั้งไฟล์วิดีโอและ Packing Log หลังจากนั้นสามารถสแกน Barcode นี้เพื่ออัดใหม่ได้</p><div class="buttons"><button id="cancel">ยกเลิก</button><button class="red" id="yes">ลบวิดีโอ</button></div></div>`;m.querySelector("b").textContent=x.barcode;document.body.appendChild(m);m.querySelector("#cancel").onclick=()=>m.remove();m.querySelector("#yes").onclick=async()=>{m.remove();try{let dir=await root.getDirectoryHandle(x.folder);try{await dir.removeEntry(x.filename)}catch(e){if(e.name!=="NotFoundError")throw e}await del(x.id);toast("ลบแล้ว สามารถสแกน "+x.barcode+" เพื่ออัดใหม่ได้");await render()}catch(e){toast("ลบไม่สำเร็จ: "+e.message)}}}

const OLD_DAYS=10;
async function oldRecordings(){
  const rows=await all(),cutoff=Date.now()-OLD_DAYS*24*60*60*1000;
  return rows.filter(x=>new Date(x.createdAt).getTime()<cutoff);
}
async function deleteOldRecordings(rows){
  if(!root||!await permission())return toast("กรุณาเลือกโฟลเดอร์วิดีโอก่อน");
  let removed=0,failed=0;
  for(const x of rows){
    try{
      let dir=await root.getDirectoryHandle(x.folder);
      try{await dir.removeEntry(x.filename)}catch(e){if(e.name!=="NotFoundError")throw e}
      await del(x.id); removed++;
    }catch(e){failed++}
  }
  await render();
  toast(failed?("ลบแล้ว "+removed+" รายการ, ลบไม่สำเร็จ "+failed+" รายการ"):("ลบวิดีโอเก่าแล้ว "+removed+" รายการ"));
}
async function checkOldVideos(){
  const rows=await oldRecordings(); if(!rows.length)return;
  const oldest=Math.max(...rows.map(x=>Math.floor((Date.now()-new Date(x.createdAt).getTime())/86400000)));
  let m=document.createElement("div");m.className="modal";
  m.innerHTML=`<div><h3>พบวิดีโอเก่าเกิน 10 วัน</h3><p>พบ <b class="count"></b> รายการ (เก่าสุดประมาณ <b class="age"></b> วัน) ต้องการลบวิดีโอและ Packing Log เหล่านี้หรือไม่?</p><p><small>ระบบจะลบเฉพาะรายการที่มีอายุเกิน 10 วัน และจะถามยืนยันก่อนทุกครั้ง</small></p><div class="buttons"><button id="oldLater">ยังไม่ลบ</button><button class="red" id="oldDelete">ลบวิดีโอเก่า</button></div></div>`;
  m.querySelector(".count").textContent=rows.length;m.querySelector(".age").textContent=oldest;
  document.body.appendChild(m);
  m.querySelector("#oldLater").onclick=()=>m.remove();
  m.querySelector("#oldDelete").onclick=async()=>{m.remove();await deleteOldRecordings(rows)};
}


async function render(){let rows=await all(),q=$("search").value.trim().toLowerCase();rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(q)rows=rows.filter(x=>x.barcode.toLowerCase().includes(q)||(x.worker||"").toLowerCase().includes(q));$("logs").innerHTML="";for(let x of rows){let r=document.createElement("div");r.className="logrow";let a=document.createElement("div");a.className="actions",p=document.createElement("button"),d=document.createElement("button");p.textContent="▶ PLAY";p.onclick=()=>play(x);d.textContent="ลบ";d.className="delete";d.onclick=()=>removeRecording(x);a.append(p,d);for(let v of [x.barcode,x.worker,new Date(x.createdAt).toLocaleString(),fmt(x.durationSeconds)]){let el=document.createElement("div");el.textContent=v;r.appendChild(el)}r.appendChild(a);$("logs").appendChild(r)}}
$("search").oninput=render;
(async()=>{let w=await get(PREFS,"worker");if(w?.value){$("worker").value=w.value;packer=w.value;$("currentWorker").textContent=packer;$("workerStatus").textContent="ผู้แพ็ก: "+packer}let q=await get(PREFS,"quality");$("quality").value=q?.value||"720";let h=await get(HANDLES,"root");if(h?.handle){root=h.handle;$("folderStatus").textContent="FOLDER: "+root.name}await render();setTimeout(checkOldVideos,700)})();