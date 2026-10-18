(() => {
'use strict';
const $=id=>document.getElementById(id), canvas=$('view'),ctx=canvas.getContext('2d'),video=$('video'),stage=$('stage'),editor=$('artEditor'),ectx=editor.getContext('2d');
const CM_IN=2.54, clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), r1=v=>Math.round(v*10)/10;
const PRESETS=[{id:'center',label:'Center chest',dx:0,top:8},{id:'left',label:'Wearer left chest',dx:9,top:10},{id:'right',label:'Wearer right chest',dx:-9,top:10},{id:'back',label:'Upper back',dx:0,top:6},{id:'full',label:'Full front',dx:0,top:10}], QUICK=[[8,8],[10,10],[20,25],[28,35]];
const S={source:null,photo:null,frozen:null,facing:'environment',stream:null,pxPerCm:10,calibrated:false,collarY:null,centerX:null,design:{img:null,original:null,wCm:25,hCm:30,x:0,y:0,rot:0},opacity:.8,unit:'cm',grid:false,guides:true,mode:'move',calPts:[],calIdx:-1,dpr:1,artName:'',editMode:null,editBase:null,editPixels:null,brush:20,personModel:null,detectBusy:false,referenceCutout:null,showReference:true,trackingTemplate:null,trackingCanvas:document.createElement('canvas'),trackingCtx:null,lastTrackAt:0,trackConfidence:0,anchorSet:false,setupStage:0,trackingActive:true,lastTrackStatusAt:0,trackLost:false,placementLocked:false,anchorLocked:false,guideStyle:'transparent',shirtOutline:null,designOutline:null};
let W=1,H=1; const els={};['w','h','top','off','rot','unit','lock','opacity','readout','hint','toast','start','err','calbar','calCm','freeze','sizes','presets'].forEach(id=>els[id]=$(id));
const toU=cm=>S.unit==='in'?cm/CM_IN:cm,fromU=v=>S.unit==='in'?v*CM_IN:v;
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').hidden=true,3200)}
function resize(){const r=stage.getBoundingClientRect();S.dpr=window.devicePixelRatio||1;W=Math.max(1,Math.round(r.width));H=Math.max(1,Math.round(r.height));canvas.width=W*S.dpr;canvas.height=H*S.dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';if(S.collarY==null){S.collarY=H*.24;S.centerX=W/2;S.pxPerCm=W/50;applyPreset(PRESETS[0])}}
function topEdgePx(){const d=S.design,w=d.wCm*S.pxPerCm/2,h=d.hCm*S.pxPerCm/2,c=Math.cos(d.rot),s=Math.sin(d.rot);let m=Infinity;for(const [x,y] of [[-w,-h],[w,-h],[w,h],[-w,h]])m=Math.min(m,d.y+x*s+y*c);return m}
function setTop(cm){S.design.y+=S.collarY+cm*S.pxPerCm-topEdgePx()}
function applyPreset(p){const d=S.design;d.rot=0;d.x=S.centerX+p.dx*S.pxPerCm;d.y=S.collarY+p.top*S.pxPerCm+d.hCm*S.pxPerCm/2;$('presetSelect').value=p.id}
function aspect(){return S.design.img?S.design.img.naturalWidth/S.design.img.naturalHeight:null}
function stopStream(){if(S.stream)S.stream.getTracks().forEach(t=>t.stop());S.stream=null}
async function startCamera(){stopStream();S.frozen=null;$('freeze').textContent='Freeze';if(!navigator.mediaDevices?.getUserMedia){showError('Camera access needs a supported browser and HTTPS. Choose a photo instead.');return false}try{S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:S.facing},width:{ideal:1920},height:{ideal:1080}},audio:false});video.srcObject=S.stream;await video.play();S.source='video';$('sourceLabel').textContent='Live camera';$('start').hidden=true;return true}catch(e){showError(e.name==='NotAllowedError'?'Camera permission was denied. Allow camera access or choose a photo.':'Could not start the camera. Choose a photo instead.');return false}}
function showError(msg){$('start').hidden=false;$('err').hidden=false;$('err').textContent=msg}
function loadPhoto(file){if(!file)return;if(!file.type.startsWith('image/')){toast('Choose an image file.');return}const im=new Image();im.onload=()=>{stopStream();S.photo=im;S.source='photo';S.frozen=null;$('sourceLabel').textContent='Photo preview';$('start').hidden=true;toast('Shirt photo loaded. Tap Detect shirt to estimate placement.');URL.revokeObjectURL(im.src)};im.onerror=()=>toast('Could not open that image.');im.src=URL.createObjectURL(file)}
function bg(){if(S.frozen)return S.frozen;if(S.source==='photo')return S.photo;if(S.source==='video'&&video.readyState>=2&&video.videoWidth)return video;return null}
function bgSize(el){return el===video?[video.videoWidth,video.videoHeight]:el instanceof HTMLImageElement?[el.naturalWidth,el.naturalHeight]:[el.width,el.height]}
function drawGrid(){const step=(S.unit==='in'?CM_IN:5)*S.pxPerCm;if(step<8)return;ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1;ctx.beginPath();for(let x=((S.centerX%step)+step)%step;x<W;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,H)}for(let y=((S.collarY%step)+step)%step;y<H;y+=step){ctx.moveTo(0,y);ctx.lineTo(W,y)}ctx.stroke()}
function drawGuides(){ctx.lineWidth=1.5;ctx.setLineDash([8,6]);ctx.strokeStyle='#f7c948';ctx.beginPath();ctx.moveTo(S.centerX,0);ctx.lineTo(S.centerX,H);ctx.stroke();ctx.strokeStyle='#ff9f43';ctx.beginPath();ctx.moveTo(0,S.collarY);ctx.lineTo(W,S.collarY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.font='600 11px system-ui';ctx.fillText('COLLAR',8,S.collarY-6)}
function alphaOutline(source,color='#252522'){
  if(!source)return null;const sw=source.naturalWidth||source.width,sh=source.naturalHeight||source.height;if(!sw||!sh)return null;
  const scale=Math.min(1,320/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale)),base=document.createElement('canvas'),b=base.getContext('2d',{willReadFrequently:true});base.width=w;base.height=h;b.drawImage(source,0,0,w,h);
  try{const im=b.getImageData(0,0,w,h),out=b.createImageData(w,h),a=im.data,d=out.data;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;if(a[i+3]>24&&(a[i-4+3]<=24||a[i+4+3]<=24||a[i-w*4+3]<=24||a[i+w*4+3]<=24)){d[i]=37;d[i+1]=37;d[i+2]=34;d[i+3]=255}}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(out,0,0);return c}catch(e){return null}
}
function drawDesign(){const d=S.design,w=d.wCm*S.pxPerCm,h=d.hCm*S.pxPerCm;ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);if(d.img){if(S.guideStyle==='outline'){if(!S.designOutline)S.designOutline=alphaOutline(d.img);if(S.designOutline)ctx.drawImage(S.designOutline,-w/2,-h/2,w,h);else{ctx.globalAlpha=.2;ctx.drawImage(d.img,-w/2,-h/2,w,h)}}else{ctx.globalAlpha=S.opacity;ctx.drawImage(d.img,-w/2,-h/2,w,h);ctx.globalAlpha=1}}else{ctx.fillStyle='rgba(79,99,232,.16)';ctx.fillRect(-w/2,-h/2,w,h)}if(S.guideStyle==='transparent'){ctx.lineWidth=2;ctx.strokeStyle='#6374ff';ctx.setLineDash([7,5]);ctx.strokeRect(-w/2,-h/2,w,h);ctx.setLineDash([]);if(!S.placementLocked){const t=Math.min(16,w/4,h/4);ctx.lineWidth=3;ctx.beginPath();[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{let x=sx*w/2,y=sy*h/2;ctx.moveTo(x-sx*t,y);ctx.lineTo(x,y);ctx.lineTo(x,y-sy*t)});ctx.stroke()}}else{ctx.lineWidth=1.6;ctx.strokeStyle='#252522';ctx.setLineDash([]);ctx.strokeRect(-w/2,-h/2,w,h)}ctx.restore()}
function updateReadout(){const d=S.design,top=toU((topEdgePx()-S.collarY)/S.pxPerCm),off=toU((d.x-S.centerX)/S.pxPerCm),deg=Math.round(d.rot*180/Math.PI*10)/10;const approx=S.calibrated?'':' · approx. scale';$('readout').innerHTML='<span>'+r1(toU(d.wCm))+' × '+r1(toU(d.hCm))+' '+S.unit+' · collar→top '+r1(top)+' '+S.unit+' · offset '+(off>0?'+':'')+r1(off)+' '+S.unit+(deg?' · '+deg+'°':'')+approx+'</span>'}
function syncInputs(){const d=S.design,set=(el,v)=>{if(document.activeElement!==el&&el.value!==String(v))el.value=v};set(els.w,r1(toU(d.wCm)));set(els.h,r1(toU(d.hCm)));set(els.top,r1(toU((topEdgePx()-S.collarY)/S.pxPerCm)));set(els.off,r1(toU((d.x-S.centerX)/S.pxPerCm)));set(els.rot,r1(d.rot*180/Math.PI));$('rotationValue').textContent=r1(d.rot*180/Math.PI)+'°'}
function frame(){ctx.setTransform(S.dpr,0,0,S.dpr,0,0);ctx.fillStyle='#e8ebf4';ctx.fillRect(0,0,W,H);const el=bg();if(el){const [sw,sh]=bgSize(el);if(sw&&sh){const k=Math.max(W/sw,H/sh),dw=sw*k,dh=sh*k,ox=(W-dw)/2,oy=(H-dh)/2;ctx.drawImage(el,ox,oy,dw,dh);if(S.referenceCutout&&S.showReference){ctx.save();if(S.guideStyle==='outline'){if(!S.shirtOutline)S.shirtOutline=alphaOutline(S.referenceCutout);if(S.shirtOutline)ctx.drawImage(S.shirtOutline,ox,oy,dw,dh)}else{ctx.globalAlpha=.27;ctx.drawImage(S.referenceCutout,ox,oy,dw,dh)}ctx.restore()}}}if(S.anchorSet&&S.trackingActive&&S.source==='video'&&!S.frozen)trackAnchor(el);if(S.grid)drawGrid();if(S.guides)drawGuides();drawDesign();if(S.mode==='calibrate')drawCal();updateReadout();syncInputs();requestAnimationFrame(frame)}
function drawCal(){ctx.fillStyle='#35c58b';ctx.strokeStyle='#35c58b';ctx.lineWidth=2;if(S.calPts.length===2){ctx.beginPath();ctx.moveTo(S.calPts[0].x,S.calPts[0].y);ctx.lineTo(S.calPts[1].x,S.calPts[1].y);ctx.stroke()}S.calPts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill()})}
const ptrs=new Map();let gest=null;const pos=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
function rebase(){const pts=[...ptrs.values()],d=S.design;if(S.placementLocked){gest=null;return}if(pts.length===1)gest={type:'drag',dx:d.x-pts[0].x,dy:d.y-pts[0].y};else if(pts.length>=2){const[a,b]=pts;gest={type:'pinch',dist:Math.hypot(b.x-a.x,b.y-a.y)||1,ang:Math.atan2(b.y-a.y,b.x-a.x),w:d.wCm,h:d.hCm,rot:d.rot,mx:(a.x+b.x)/2,my:(a.y+b.y)/2,x:d.x,y:d.y}}else gest=null}
function moveGesture(){const pts=[...ptrs.values()],d=S.design;if(S.placementLocked||!gest)return;if(gest.type==='drag'&&pts.length===1){d.x=pts[0].x+gest.dx;d.y=pts[0].y+gest.dy}else if(gest.type==='pinch'&&pts.length>=2){const[a,b]=pts,k=(Math.hypot(b.x-a.x,b.y-a.y)||1)/gest.dist,ang=Math.atan2(b.y-a.y,b.x-a.x),kk=clamp(k,.05,20);d.wCm=clamp(gest.w*kk,.5,150);d.hCm=clamp(gest.h*kk,.5,150);d.rot=gest.rot+ang-gest.ang;d.x=gest.x+(a.x+b.x)/2-gest.mx;d.y=gest.y+(a.y+b.y)/2-gest.my}}
function calTap(p){if(S.calPts.length<2){S.calPts.push(p);S.calIdx=S.calPts.length-1}else{let best=0,bd=Infinity;S.calPts.forEach((q,i)=>{let dd=Math.hypot(q.x-p.x,q.y-p.y);if(dd<bd){bd=dd;best=i}});S.calPts[best]=p;S.calIdx=best}}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();

  const p = pos(e);

  // Locked anchors cannot be changed by tapping the camera view.
  if (S.anchorLocked && S.mode === 'setup') {
    return toast('Anchors are locked. Tap Unlock collar & center anchors to change them.');
  }

  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, p);

  if (S.mode === 'move') {
    rebase();
  } else if (S.mode === 'setup') {
    if (S.setupStage === 1) {
      S.collarY = p.y;
      S.setupStage = 2;
      toast('Collar marked. Now tap the shirt centerline at collar height.');
    } else {
      S.centerX = p.x;
      S.setupStage = 0;
      captureTrackingTemplate();

      const pp = PRESETS.find(q => q.id === $('presetSelect').value) || PRESETS[0];
      applyPreset(pp);

      $('guideStatus').textContent =
        'Collar/center anchor set. Small shirt movements can now be tracked.';
      toast('Anchor set. The design is positioned relative to your shirt.');
    }
  } else if (S.mode === 'calibrate') {
    calTap(p);
  }
});

canvas.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;

  const p = pos(e);
  ptrs.set(e.pointerId, p);

  if (S.mode === 'move') {
    moveGesture();
  } else if (S.mode === 'setup' && ptrs.size === 1) {
    // Never change locked anchors through pointer movement.
    if (S.anchorLocked) return;

    if (S.setupStage === 1) {
      S.collarY = p.y;
    } else if (S.setupStage === 2) {
      S.centerX = p.x;
    }
  } else if (S.mode === 'calibrate' && ptrs.size === 1 && S.calIdx >= 0) {
    S.calPts[S.calIdx] = p;
  }
});

const HINTS={move:'Drag to move · pinch to resize · twist to rotate',setup:'Tap collar center, then tap shirt centerline at collar height',calibrate:'Tap two points a known distance apart, then enter the real distance'};function setMode(m){S.mode=m;ptrs.clear();gest=null;document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$('hint').textContent=HINTS[m];els.calbar.hidden=m!=='calibrate'}document.querySelectorAll('#modes button').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.mode==='setup'){
    if(S.anchorLocked)return toast('Unlock the collar and center anchors before realigning.');
    S.setupStage=1;
  }
  setMode(b.dataset.mode);
}));
document.querySelectorAll('#tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));['design','pos','export'].forEach(t=>$('tab-'+t).hidden=t!==b.dataset.tab)}));
$('calApply').addEventListener('click',()=>{const real=fromU(parseFloat(els.calCm.value));if(S.calPts.length<2)return toast('Tap two points on the screen first.');if(!(real>0))return toast('Enter the known distance.');S.pxPerCm=Math.hypot(S.calPts[1].x-S.calPts[0].x,S.calPts[1].y-S.calPts[0].y)/real;S.calibrated=true;S.calPts=[];els.calCm.value='';setMode('move');toast('Scale calibrated. Keep the camera at the same distance.')});$('calReset').addEventListener('click',()=>S.calPts=[]);
function updateArtInfo(){const d=S.design;$('artName').textContent=S.artName||'No artwork selected';$('artMeta').textContent=d.img?d.img.naturalWidth+' × '+d.img.naturalHeight+' px':'PNG with transparency recommended';const thumb=$('artThumb');thumb.innerHTML='';if(d.img){const im=new Image();im.src=d.img.src;thumb.appendChild(im)}else thumb.innerHTML='<span>✳</span>';drawEditor()}
function hasTransparency(im){try{const c=document.createElement('canvas');c.width=Math.min(64,im.naturalWidth);c.height=Math.min(64,im.naturalHeight);const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(im,0,0,c.width,c.height);const a=q.getImageData(0,0,c.width,c.height).data;for(let i=3;i<a.length;i+=4)if(a[i]<250)return true;return false}catch(e){return /png/i.test(im.src)}}
async function autoRemoveBackground(im){const btn=$('removeBg');btn.disabled=true;btn.textContent='Removing background…';$('bgStatus').textContent='Removing the image background automatically. The first run may need internet access.';try{const mod=await import('https://esm.sh/@imgly/background-removal@1.5.5');const blob=await (mod.removeBackground||mod.default)(im.src,{output:{format:'image/png'}});const url=URL.createObjectURL(blob),cut=new Image();await new Promise((res,rej)=>{cut.onload=res;cut.onerror=rej;cut.src=url});S.design.img=cut;S.designOutline=null;S.editMode=null;editor.classList.remove('active');updateArtInfo();$('bgStatus').textContent='Background removed automatically. Inspect edges before printing.';toast('Background removed automatically.')}catch(e){$('bgStatus').textContent='Automatic removal failed. Check your connection or use Manual erase.';toast('Could not remove the background. You can retry in Settings.')}finally{btn.disabled=false;btn.textContent='✧ Remove background automatically'}}
function loadArt(file){if(!file)return;if(!file.type.startsWith('image/'))return toast('Choose an image file.');const im=new Image();im.onload=async()=>{S.design.original=im;S.design.img=im;S.designOutline=null;S.artName=file.name;const asp=im.naturalWidth/im.naturalHeight;S.design.wCm=asp>=1?25:25*asp;S.design.hCm=S.design.wCm/asp;if(S.design.hCm>35){S.design.hCm=35;S.design.wCm=35*asp}applyPreset(PRESETS[0]);S.editMode=null;editor.classList.remove('active');updateArtInfo();if(!hasTransparency(im)){toast('Design imported. Removing background…');await autoRemoveBackground(im)}else{ $('bgStatus').textContent='Transparent artwork detected. Its transparency has been preserved.';toast('Transparent design imported.')} };im.onerror=()=>toast('Could not open that image.');im.src=URL.createObjectURL(file)}
$('art').addEventListener('change',e=>{loadArt(e.target.files[0]);e.target.value=''});$('plain').addEventListener('click',()=>{S.designOutline=null;S.design.img=null;S.design.original=null;S.artName='';editor.classList.remove('active');updateArtInfo()});
function numVal(el){const v=parseFloat(el.value);return Number.isFinite(v)?v:null}els.w.addEventListener('input',()=>{if(S.placementLocked)return syncInputs();const v=numVal(els.w);if(v===null||v<=0)return;S.design.wCm=clamp(fromU(v),.5,150);if(els.lock.checked&&aspect())S.design.hCm=S.design.wCm/aspect()});els.h.addEventListener('input',()=>{if(S.placementLocked)return syncInputs();const v=numVal(els.h);if(v===null||v<=0)return;S.design.hCm=clamp(fromU(v),.5,150);if(els.lock.checked&&aspect())S.design.wCm=S.design.hCm*aspect()});els.top.addEventListener('input',()=>{if(S.placementLocked)return syncInputs();const v=numVal(els.top);if(v!==null)setTop(fromU(v))});els.off.addEventListener('input',()=>{if(S.placementLocked)return syncInputs();const v=numVal(els.off);if(v!==null)S.design.x=S.centerX+fromU(v)*S.pxPerCm});els.rot.addEventListener('input',()=>{if(S.placementLocked)return syncInputs();const v=numVal(els.rot);if(v!==null)S.design.rot=v*Math.PI/180});els.opacity.addEventListener('input',()=>{S.opacity=els.opacity.value/100;$('opacityValue').textContent=els.opacity.value+'%'});$('rot0').addEventListener('click',()=>{if(!S.placementLocked)S.design.rot=0});$('centerBtn').addEventListener('click',()=>{if(!S.placementLocked)S.design.x=S.centerX});$('unit').addEventListener('change',()=>{S.unit=els.unit.value;document.querySelectorAll('.unit-label').forEach(x=>x.textContent=S.unit);$('heightUnit').textContent=S.unit;try{localStorage.setItem('dtf-unit',S.unit)}catch(e){}renderChips()});
function renderChips(){els.sizes.innerHTML='';QUICK.forEach(([w,h])=>{const b=document.createElement('button');b.className='chip';b.textContent=r1(toU(w))+' × '+r1(toU(h))+' '+S.unit;b.onclick=()=>{if(S.placementLocked)return toast('Unlock the design to change its size.');S.design.wCm=w;S.design.hCm=aspect()&&els.lock.checked?w/aspect():h};els.sizes.appendChild(b)})}function renderPresets(){els.presets.innerHTML='';PRESETS.forEach(p=>{const b=document.createElement('button');b.className='chip';b.textContent=p.label;b.onclick=()=>{if(S.placementLocked)return toast('Unlock the design to change placement.');applyPreset(p);$('presetSelect').value=p.id};els.presets.appendChild(b)})}$('presetSelect').addEventListener('change',()=>{if(S.placementLocked){toast('Unlock the design to change placement.');return}applyPreset(PRESETS.find(p=>p.id===$('presetSelect').value)||PRESETS[0])});
$('gridT')?.addEventListener('change',e=>S.grid=e.target.checked);$('guidesT')?.addEventListener('change',e=>S.guides=e.target.checked);$('freeze').addEventListener('click',()=>{if(S.frozen){S.frozen=null;$('freeze').textContent='Freeze';return}if(S.source!=='video'||!video.videoWidth)return toast('Freeze works with the live camera.');const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);S.frozen=c;$('freeze').textContent='Unfreeze'});$('flip').addEventListener('click',async()=>{S.facing=S.facing==='environment'?'user':'environment';await startCamera()});$('live').addEventListener('click',()=>startCamera());$('photoStart').addEventListener('change',e=>{loadPhoto(e.target.files[0]);e.target.value=''});$('startBtn').addEventListener('click',startCamera);$('startOverlayBtn').addEventListener('click',startCamera);
// Create a translucent garment cutout from the initial camera frame. It is a visual reference
// for repeating camera position/height; background-removal quality depends on contrast and lighting.
async function backgroundRemovalModule(){return await import('https://esm.sh/@imgly/background-removal@1.5.5')}
async function imageFromBlob(blob){const url=URL.createObjectURL(blob),im=new Image();await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=url});URL.revokeObjectURL(url);return im}
$('captureGuide').addEventListener('click',async()=>{const source=bg();if(!source)return toast('Start the live camera or load a shirt photo first.');const btn=$('captureGuide');btn.disabled=true;btn.textContent='Creating cutout…';$('guideStatus').textContent='Creating a garment silhouette from the current frame. Contrast between the shirt and table helps.';try{const [sw,sh]=bgSize(source),shot=document.createElement('canvas');shot.width=sw;shot.height=sh;shot.getContext('2d').drawImage(source,0,0,sw,sh);const mod=await backgroundRemovalModule(),blob=await (mod.removeBackground||mod.default)(shot.toDataURL('image/jpeg',.92),{output:{format:'image/png'}});S.referenceCutout=await imageFromBlob(blob);S.showReference=true;S.trackLost=false;$('toggleGuide').disabled=false;$('toggleGuide').textContent='Hide guide';$('guideStatus').textContent='Garment cutout captured. Align the live shirt with the translucent ghost to repeat the same camera position and height.';toast('Cutout guide ready. Align the live garment to the ghost outline.')}catch(e){$('guideStatus').textContent='Automatic cutout failed. Try brighter lighting and a contrasting table, or continue with manual collar/center alignment.';toast('Could not create the cutout. Try again with better shirt/table contrast.')}finally{btn.disabled=false;btn.textContent='Capture shirt guide'}});
$('toggleGuide').addEventListener('click',()=>{if(!S.referenceCutout)return;S.showReference=!S.showReference;$('toggleGuide').textContent=S.showReference?'Hide guide':'Show guide';$('guideStatus').textContent=S.showReference?'Align the live shirt with the translucent captured cutout.':'Reference hidden. Collar/center tracking remains available.'});
$('trackToggle').addEventListener('click',()=>{S.trackingActive=!S.trackingActive;$('trackToggle').textContent=S.trackingActive?'Tracking on':'Lock position';$('guideStatus').textContent=S.trackingActive?'Tracking enabled. Keep the collar seam visible; use the ghost cutout if tracking drifts.':'Tracking paused. The overlay is locked to its current screen position.';if(S.trackingActive&&!S.anchorSet)toast('Set the collar and center anchor first to start tracking.')});
$('autoDetect').addEventListener('click',()=>{
  if(S.anchorLocked)return toast('Unlock the collar and center anchors before re-marking them.');
  if(!bg())return toast('Start the camera or upload a shirt photo first.');
  S.setupStage=1;
  S.anchorSet=false;
  setMode('setup');
  $('autoDetect').textContent='Re-mark collar & center';
  toast('Tap the collar center, then tap the shirt centerline at collar height. The overlay will anchor to these points.');
});

$('anchorLock').addEventListener('click',()=>{
  if(!S.anchorLocked&&!S.anchorSet){
    return toast('Set both collar and center anchors before locking them.');
  }

  S.anchorLocked=!S.anchorLocked;

  if(S.anchorLocked&&S.mode==='setup'){
    setMode('move');
  }

  $('anchorLock').textContent=S.anchorLocked
    ?'Unlock collar & center anchors'
    :'Lock collar & center anchors';

  $('anchorLock').setAttribute('aria-pressed',String(S.anchorLocked));
  $('anchorLock').classList.toggle('primary',S.anchorLocked);
  $('anchorLock').classList.toggle('secondary',!S.anchorLocked);

  $('anchorLockNote').textContent=S.anchorLocked
    ?'Collar and center anchor references are locked against re-marking. Shirt tracking remains active and follows garment movement. Tap once to unlock. This lock resets when you reload the page.'
    :'Anchor lock is off. You can re-mark the collar and center anchors. Tracking follows the shirt whenever anchors are set.';

  toast(S.anchorLocked
    ?'Collar and center anchors locked. Tracking remains active.'
    :'Anchor lock released. You can re-mark the anchors.');
});
// Robust grayscale-gradient patch tracking for a fixed overhead camera.
// Normalized matching, coarse-to-fine search, peak uniqueness and conservative smoothing reduce drift.
function trackingFrame(source){
  const tc=S.trackingCanvas,tctx=S.trackingCtx||(S.trackingCtx=tc.getContext('2d',{willReadFrequently:true}));
  tc.width=Math.max(1,Math.round(W*.5));tc.height=Math.max(1,Math.round(H*.5));
  const [sw,sh]=bgSize(source),k=Math.max(tc.width/sw,tc.height/sh),dw=sw*k,dh=sh*k;
  tctx.drawImage(source,(tc.width-dw)/2,(tc.height-dh)/2,dw,dh);
  try{return {w:tc.width,h:tc.height,data:tctx.getImageData(0,0,tc.width,tc.height).data}}catch(e){return null}
}
function grayAt(f,x,y){const i=(clamp(Math.round(y),0,f.h-1)*f.w+clamp(Math.round(x),0,f.w-1))*4,d=f.data;return .299*d[i]+.587*d[i+1]+.114*d[i+2]}
function makePatch(f,cx,cy,w=36,h=36){
  const raw=new Float32Array(w*h);let sum=0,sum2=0,n=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const gx=cx+(x-(w-1)/2),gy=cy+(y-(h-1)/2),v=grayAt(f,gx,gy),dx=grayAt(f,gx+1,gy)-grayAt(f,gx-1,gy),dy=grayAt(f,gx,gy+1)-grayAt(f,gx,gy-1),z=.35*v+.65*Math.hypot(dx,dy)*3;raw[n++]=z;sum+=z;sum2+=z*z}
  const mean=sum/raw.length,sd=Math.sqrt(Math.max(1,sum2/raw.length-mean*mean));for(let i=0;i<raw.length;i++)raw[i]=(raw[i]-mean)/sd;return {p:raw,w,h,texture:sd};
}
function patchScore(f,t,cx,cy,stride=2){
  let sum=0,sum2=0,n=0;
  for(let y=0;y<t.h;y+=stride)for(let x=0;x<t.w;x+=stride){const gx=cx+(x-(t.w-1)/2),gy=cy+(y-(t.h-1)/2),v=grayAt(f,gx,gy),dx=grayAt(f,gx+1,gy)-grayAt(f,gx-1,gy),dy=grayAt(f,gx,gy+1)-grayAt(f,gx,gy-1),z=.35*v+.65*Math.hypot(dx,dy)*3;sum+=z;sum2+=z*z;n++}
  const mean=sum/n,sd=Math.sqrt(Math.max(1,sum2/n-mean*mean));let err=0,j=0;
  for(let y=0;y<t.h;y+=stride)for(let x=0;x<t.w;x+=stride){const gx=cx+(x-(t.w-1)/2),gy=cy+(y-(t.h-1)/2),v=grayAt(f,gx,gy),dx=grayAt(f,gx+1,gy)-grayAt(f,gx-1,gy),dy=grayAt(f,gx,gy+1)-grayAt(f,gx,gy-1),z=(.35*v+.65*Math.hypot(dx,dy)*3-mean)/sd;err+=Math.abs(z-t.p[y*t.w+x]);j++}
  return err/j;
}
function captureTrackingTemplate(){
  const source=bg();if(!source)return;const f=trackingFrame(source);if(!f){toast('Tracking needs camera image access.');return}
  const t=makePatch(f,S.centerX*.5,S.collarY*.5,36,36);
  if(t.texture<2){$('guideStatus').textContent='This anchor has too little visual detail. Mark near the collar seam, label, or stitching for more reliable tracking.';S.anchorSet=false;return}
  S.trackingTemplate=t;S.anchorSet=true;S.trackLost=false;S.trackConfidence=1;S.trackPoint={x:S.centerX*.5,y:S.collarY*.5};S.trackVelocity={x:0,y:0};S.trackMisses=0;S.lastTrackAt=0;
  $('guideStatus').textContent='Tracking anchor captured. Matching now uses local image gradients and confidence checks; use the ghost guide if tracking drops.';
}
function trackAnchor(source){
  if(!source||!S.trackingTemplate||performance.now()-S.lastTrackAt<85)return;S.lastTrackAt=performance.now();const f=trackingFrame(source);if(!f)return;
  const scale=.5,t=S.trackingTemplate,point=S.trackPoint||{x:S.centerX*scale,y:S.collarY*scale},predX=point.x+(S.trackVelocity?.x||0),predY=point.y+(S.trackVelocity?.y||0),rad=Math.min(100,32+Math.min(S.trackMisses||0,4)*12);
  let best={score:Infinity,x:predX,y:predY},second=Infinity;const minX=t.w/2+2,maxX=f.w-t.w/2-2,minY=t.h/2+2,maxY=f.h-t.h/2-2;
  const scan=(cx,cy,r,step,stride)=>{for(let y=Math.max(minY,cy-r);y<=Math.min(maxY,cy+r);y+=step)for(let x=Math.max(minX,cx-r);x<=Math.min(maxX,cx+r);x+=step){const score=patchScore(f,t,x,y,stride);if(score<best.score){second=best.score;best={score,x,y}}else if(Math.hypot(x-best.x,y-best.y)>t.w*.65&&score<second)second=score}};
  scan(predX,predY,rad,4,3);scan(best.x,best.y,5,1,2);let refined={...best};
  for(const [dx,dy] of [[-.5,0],[.5,0],[0,-.5],[0,.5],[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]]){const x=best.x+dx,y=best.y+dy,score=patchScore(f,t,x,y,1);if(score<refined.score)refined={x,y,score}}
  const uniqueness=Number.isFinite(second)?clamp((second-refined.score)/Math.max(.08,second),0,1):0,quality=clamp(1-refined.score/1.15,0,1);S.trackConfidence=quality*(.68+.32*uniqueness);
  if(refined.score<.78&&quality>.25&&uniqueness>.025){const dx=(refined.x-point.x)/scale,dy=(refined.y-point.y)/scale,jump=Math.hypot(dx,dy);if(jump<Math.min(120,rad/scale+24)){
    const alpha=S.trackMisses?.48:.34,sx=dx*alpha,sy=dy*alpha;S.centerX+=sx;S.collarY+=sy;S.design.x+=sx;S.design.y+=sy;S.trackVelocity={x:(refined.x-point.x)*.25,y:(refined.y-point.y)*.25};S.trackPoint={x:point.x+(refined.x-point.x)*alpha,y:point.y+(refined.y-point.y)*alpha};S.trackMisses=0;S.trackLost=false;
    if(performance.now()-S.lastTrackStatusAt>900){$('guideStatus').textContent='Tracking shirt anchor · '+Math.round(S.trackConfidence*100)+'% confidence. Keep collar detail visible; the original ghost guide is available for recovery.';S.lastTrackStatusAt=performance.now()}
  }else S.trackMisses=(S.trackMisses||0)+1}else{S.trackMisses=(S.trackMisses||0)+1;S.trackVelocity={x:(S.trackVelocity?.x||0)*.35,y:(S.trackVelocity?.y||0)*.35};if(!S.trackLost&&performance.now()-S.lastTrackStatusAt>700){S.trackLost=true;$('guideStatus').textContent='Tracking uncertain — overlay held steady to prevent a false jump. Align to the ghost guide or re-mark the collar anchor.';S.lastTrackStatusAt=performance.now()}}
}
// Manual erase/restore edits operate on a full-resolution editable artwork canvas.
function drawEditor(){if(!S.design.original)return;const im=S.design.original;editor.width=im.naturalWidth;editor.height=im.naturalHeight;ectx.clearRect(0,0,editor.width,editor.height);ectx.drawImage(S.design.img||im,0,0);S.editBase=ectx.getImageData(0,0,editor.width,editor.height);}
function setEditMode(mode){if(!S.design.original)return toast('Upload artwork first.');S.editMode=mode;editor.classList.add('active');editor.style.cursor=mode==='erase'?'cell':'copy';drawEditor();toast(mode==='erase'?'Brush over unwanted background to erase it.':'Brush over artwork to restore original pixels.')}$('eraseMode').addEventListener('click',()=>setEditMode('erase'));$('restoreMode').addEventListener('click',()=>setEditMode('restore'));$('brushSize').addEventListener('input',e=>S.brush=+e.target.value);$('brushClear').addEventListener('click',()=>{if(!S.design.original)return;S.design.img=S.design.original;S.editMode=null;drawEditor();updateArtInfo();toast('Manual edits reset.')});let brushing=false,lastBrush=null;
function editorPoint(e){const r=editor.getBoundingClientRect();return{x:(e.clientX-r.left)*editor.width/r.width,y:(e.clientY-r.top)*editor.height/r.height}}
function brush(e){if(!brushing||!S.editMode||!S.design.original)return;const p=editorPoint(e),base=S.design.original;const radius=S.brush*Math.max(editor.width,editor.height)/Math.max(editor.clientWidth,editor.clientHeight);ectx.save();ectx.beginPath();ectx.arc(p.x,p.y,radius/2,0,Math.PI*2);ectx.clip();if(S.editMode==='erase'){ectx.globalCompositeOperation='destination-out';ectx.fillStyle='rgba(0,0,0,1)';ectx.fillRect(0,0,editor.width,editor.height)}else{ectx.globalCompositeOperation='source-over';ectx.drawImage(base,0,0)}ectx.restore();lastBrush=p}
editor.addEventListener('pointerdown',e=>{if(!S.editMode)return;brushing=true;editor.setPointerCapture(e.pointerId);brush(e)});editor.addEventListener('pointermove',e=>{if(brushing)brush(e)});const brushEnd=()=>{if(brushing&&S.editMode&&S.design.original){const im=new Image();im.onload=()=>{S.design.img=im;const thumb=$('artThumb');thumb.innerHTML='';const ti=new Image();ti.src=im.src;thumb.appendChild(ti);$('artMeta').textContent=im.naturalWidth+' × '+im.naturalHeight+' px · edited'};im.src=editor.toDataURL('image/png')}brushing=false;lastBrush=null};editor.addEventListener('pointerup',brushEnd);editor.addEventListener('pointercancel',brushEnd);
$('removeBg').addEventListener('click',async()=>{if(!S.design.original)return toast('Upload artwork before removing its background.');await autoRemoveBackground(S.design.original)});
function artBlob(){return new Promise((resolve,reject)=>{if(!S.design.img)return reject(new Error('Upload artwork first.'));const im=S.design.img,srcW=im.naturalWidth,srcH=im.naturalHeight;let w=srcW,h=srcH;const dpi=$('dpi').value,printW=parseFloat($('exportWidth').value);if(dpi!=='max'&&printW>0){w=Math.round(printW/2.54*Number(dpi));h=Math.round(w*srcH/srcW)}else if(dpi==='max'){w=srcW;h=srcH}const max=12000;if(w>max||h>max){const k=Math.min(max/w,max/h);w=Math.floor(w*k);h=Math.floor(h*k)}const c=document.createElement('canvas');c.width=w;c.height=h;const cctx=c.getContext('2d');if(!$('transparentExport').checked){cctx.fillStyle='#fff';cctx.fillRect(0,0,w,h)}cctx.drawImage(im,0,0,w,h);c.toBlob(b=>b?resolve({blob:b,w,h,dpi:dpi==='max'?null:Number(dpi)}):reject(new Error('Could not export PNG.')),'image/png')})}
async function downloadBlob(blob,name){const file=new File([blob],name,{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}$('exportPng').addEventListener('click',async()=>{try{const o=await artBlob();await downloadBlob(o.blob,'dtf-artwork.png');$('exportInfo').textContent=o.w+' × '+o.h+' pixels'+(o.dpi?' · '+o.dpi+' DPI target':' · source resolution');toast('PNG export ready.')}catch(e){toast(e.message)}});$('save').addEventListener('click',()=>{const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;out.getContext('2d').drawImage(canvas,0,0);out.toBlob(async b=>{if(b)await downloadBlob(b,'dtf-placement-preview.png')},'image/png')});
$('alignShirt').addEventListener('click',()=>{
  if(S.anchorLocked)return toast('Unlock the collar and center anchors before realigning.');
  if(S.placementLocked)return toast('Unlock the design before realigning it.');
  S.setupStage=1;
  setMode('setup');
  toast('Tap the collar center, then tap the shirt centerline at collar height.');
});
// Camera-first mobile controls
$('galleryBtn')?.addEventListener('click',()=>{if(!$('art').disabled)$('art').click()});
$('settingsBtn')?.addEventListener('click',()=>{$('settingsPanel').classList.add('settings-open');$('settingsPanel').scrollTop=0});
$('closeSettings')?.addEventListener('click',()=>{$('settingsPanel').classList.remove('settings-open')});
$('shutterBtn')?.addEventListener('click',()=>{const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const c=out.getContext('2d');c.drawImage(canvas,0,0);out.toBlob(async b=>{if(!b)return toast('Could not capture the mockup.');await downloadBlob(b,'dtf-shirt-mockup.png');toast('Mockup captured.')},'image/png')});
$('placementLock').addEventListener('change',e=>{S.placementLocked=e.target.checked;document.querySelectorAll('#w,#h,#top,#off,#rot,#presetSelect,#sizes .chip,#presets .chip,#rot0,#centerBtn,#alignShirt').forEach(el=>{el.disabled=S.placementLocked});toast(S.placementLocked?'Design locked. Tracking can still follow the shirt.':'Design unlocked. You can move and resize it again.')});
document.querySelectorAll('[data-guide-style]').forEach(btn=>btn.addEventListener('click',()=>{S.guideStyle=btn.dataset.guideStyle;S.designOutline=null;S.shirtOutline=null;document.querySelectorAll('[data-guide-style]').forEach(b=>{const on=b.dataset.guideStyle===S.guideStyle;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});toast(S.guideStyle==='outline'?'Outline guides enabled.':'Transparent guides enabled.')}));
renderPresets();try{const u=localStorage.getItem('dtf-unit');if(u==='in'||u==='cm')S.unit=u}catch(e){}els.unit.value=S.unit;document.querySelectorAll('.unit-label').forEach(x=>x.textContent=S.unit);$('heightUnit').textContent=S.unit;renderChips();resize();setMode('move');window.addEventListener('resize',resize);window.addEventListener('orientationchange',()=>setTimeout(resize,250));requestAnimationFrame(frame);
})();