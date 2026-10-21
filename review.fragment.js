// Academy review improvements (October 2026).
import {unmetPrerequisites,orderedContent} from './access-rules.js';
import {uiTranslations,permissionEnglish} from './review-ui-languages.js';
let reviewPlayerCourse={}, reviewLastProgress={};
const reviewCloseModal=closeModal;
closeModal=function(id){if(document.getElementById(id))return reviewCloseModal(id);};
function reviewUnmet(item,progress={}) {return unmetPrerequisites(item,TRAINEE_COURSE_STRUCTURE.length?TRAINEE_COURSE_STRUCTURE:CVV,reviewPlayerCourse,progress);}
const reviewOpenPlayer=openPlayer;
openPlayer=async function(id){const r=await call({action:'getCourse',courseId:id});reviewPlayerCourse=r.course||{};return reviewOpenPlayer(id);};
const reviewPlayAt=playAt;
playAt=function(index,progress={}){
  reviewLastProgress=progress;
  if(CU?.role==='trainee'&&CVV[index]&&reviewUnmet(CVV[index],progress).length)return toast(t('أكمل متطلبات فتح هذا المحتوى أولًا','Complete this content’s prerequisites first'),'warning');
  const result=reviewPlayAt(index,progress),item=CVV[index];
  const video=document.querySelector('#yt-frame video');
  if(!video||!item)return result;
  if(PROG_INT){clearInterval(PROG_INT);PROG_INT=null;}
  let busy=false,lastSaved=Number(progress[item.video_id]?.progressPercent)||0,maxWatched=0;
  const initial=lastSaved;
  const save=async(pct)=>{if(busy)return;busy=true;try{const r=await call({action:'saveProgress',userEmail:CU.email,courseId:CCI,videoId:item.video_id,progressPercent:pct});if(r.success){lastSaved=pct;const pr=await call({action:'getProgress',userEmail:CU.email,courseId:CCI});renderPlaylist(pr.progress||{});updateCoursePBar(pr.progress||{});}}finally{busy=false;}};
  const resumeVideo=()=>{if(!stateReady||!Number.isFinite(video.duration))return;const pending=(item.video_questions||[]).slice().sort((a,b)=>a.trigger_seconds-b.trigger_seconds).find(g=>!item._gateState?.[g.id]?.passed&&item._gateState?.[g.id]?.seekTo!==null&&item._gateState?.[g.id]?.seekTo!==undefined);const seek=pending?Number(item._gateState[pending.id].seekTo):(initial/100)*video.duration;maxWatched=seek;if(pending||initial>0&&initial<100)video.currentTime=seek;};
  video.onloadedmetadata=resumeVideo;
  let gateBusy=false,stateReady=!(item.video_questions||[]).length;
  if(!stateReady){(CU?.role==='trainee'?videoStudio.loadPlayback(item):Promise.resolve(item._gateState={})).then(()=>{stateReady=true;resumeVideo();}).catch(error=>{video.pause();toast(error.message,'error');});}
  video.ontimeupdate=async()=>{
   if(!Number.isFinite(video.duration)||video.duration<=0||gateBusy)return;
   if(!stateReady){video.pause();return;}
   if(initial<100&&video.currentTime>maxWatched+Math.max(2,video.playbackRate*1.5)){video.currentTime=maxWatched;return;}
   maxWatched=Math.max(maxWatched,video.currentTime);
   const gate=(item.video_questions||[]).slice().sort((a,b)=>a.trigger_seconds-b.trigger_seconds).find(g=>video.currentTime>=Number(g.trigger_seconds||0)&&!item._gateState?.[g.id]?.passed);
   if(gate){gateBusy=true;video.pause();const answer=await videoStudio.ask(item,gate,{preview:CU?.role!=='trainee'});if(answer.cancelled){gateBusy=false;return;}if(!answer.correct){video.currentTime=Number(answer.seekTo)||0;maxWatched=video.currentTime;toast(t('إجابة غير صحيحة. الرجوع إلى','Incorrect answer. Rewind to')+' '+videoStudio.time(answer.seekTo),'warning');}gateBusy=false;await video.play().catch(()=>{});return;}
   const pct=Math.min(99,video.currentTime/video.duration*100);updatePBar(pct);
   const threshold=Math.max(1,Math.min(100,Number((reviewPlayerCourse.rules||reviewPlayerCourse.course_rules)?.videoCompletionPercent)||100));
   const gatesPassed=(item.video_questions||[]).every(g=>item._gateState?.[g.id]?.passed);
   if(item.progress_mode!=='manual'&&lastSaved<100&&pct>=threshold&&gatesPassed)await save(100);
   else if(item.progress_mode!=='manual'&&pct-lastSaved>=5)await save(pct);
  };
  video.onended=async()=>{if(gateBusy)return;const outstanding=(item.video_questions||[]).find(g=>!item._gateState?.[g.id]?.passed);if(outstanding){video.currentTime=Math.min(video.duration-.1,Number(outstanding.trigger_seconds)||0);return;}if(item.progress_mode!=='manual'){while(busy)await new Promise(r=>setTimeout(r,30));await save(100);toast(t('اكتملت مشاهدة الفيديو','Video completed'));}};
  return result;
};
const reviewNavVideo=navVideo;
navVideo=async function(direction){const next=CVI+direction;if(next<0||next>=CVV.length)return reviewNavVideo(direction);return playFromPlaylist(next);};
const reviewRenderPlaylist=renderPlaylist;
renderPlaylist=function(progress={}){reviewLastProgress=progress;return reviewRenderPlaylist(progress);};

// One translation pass for new UI nodes and on language change, in both directions.
const reviewNames={'History النقاط':'سجل النقاط','FAQ':'الأسئلة الشائعة','User Activity':'سجل النشاط','Dashboard':'لوحة التحكم','Content':'المحتوى','Style':'التصميم','Section':'قسم','Survey':'استبيان','سيكشن':'قسم','جروب':'مجموعة','سيرفاي':'استبيان','أدمن':'مدير النظام','الأدمن':'مدير النظام','ستايل الأكاديمية':'تصميم الأكاديمية','الشات':'المحادثات','Google Drive':'الملفات المرفوعة','Course name in English *':'اسم الدورة باللغة الإنجليزية *','Course description in English':'وصف الدورة باللغة الإنجليزية','Lesson title in English *':'عنوان الدرس باللغة الإنجليزية *','Description in English':'الوصف باللغة الإنجليزية','File title in English *':'عنوان الملف باللغة الإنجليزية *','Title in English':'العنوان باللغة الإنجليزية','Question text in English':'نص السؤال باللغة الإنجليزية','Question in English':'السؤال باللغة الإنجليزية','Option 1 English':'الخيار الأول باللغة الإنجليزية','Option 2 English':'الخيار الثاني باللغة الإنجليزية','Option 3 English':'الخيار الثالث باللغة الإنجليزية','Option 4 English':'الخيار الرابع باللغة الإنجليزية'};
Object.assign(TR,{'قسم':'Section','استبيان':'Survey','المجموعات':'Groups','المجموعة':'Group','المحتوى':'Content','مدير النظام':'Administrator','سجل النقاط':'Points history','تصميم الأكاديمية':'Academy design','المحادثات':'Messages','الأسئلة الشائعة':'Frequently asked questions','سجل النشاط':'Activity log','ملف الفيديو المرفوع *':'Uploaded video file *','نقل إلى قسم':'Move to section','قواعد فتح المحتوى':'Content access rules','إضافة إلى قسم':'Add to a section','إعداد ترتيب المحتوى':'Content order settings','عودة إلى النقاط':'Back to points','اكتمل':'Completed','قيد التقدم':'In progress','متطلبات فتح المحتوى':'Content prerequisites','اسم الدورة باللغة الإنجليزية *':'Course name in English *','وصف الدورة باللغة الإنجليزية':'Course description in English','عنوان الدرس باللغة الإنجليزية *':'Lesson title in English *','الوصف باللغة الإنجليزية':'Description in English','عنوان الملف باللغة الإنجليزية *':'File title in English *','العنوان باللغة الإنجليزية':'Title in English','نص السؤال باللغة الإنجليزية':'Question text in English','السؤال باللغة الإنجليزية':'Question in English','إحصائيات المحتوى':'Content statistics','إعداد الرئيسية':'Homepage settings'});
let reviewLanguageQueued=false;
Object.assign(TR,{'المحتوى':'Content','الباقات المدفوعة':'Paid packages','الجلسات التدريبية':'Training sessions','الاستبيان':'Surveys','الأدوات':'Tools','التقارير':'Reports','التواصل':'Communication','الأكاديمية':'Academy','إعدادات الحساب':'Account settings','المتدربون':'Trainees','المدربون':'Trainers','طلبات تحت الموافقة':'Pending requests','الصلاحيات':'Permissions','إعداد الرئيسية':'Homepage settings','سجل النقاط':'Points history','سجل النشاط':'Activity log'});
Object.assign(reviewNames,{'Utility':'الأدوات','الكونتانت':'المحتوى','الباكدج والمدفوع':'الباقات المدفوعة','السيشن':'الجلسات التدريبية'});
Object.assign(TR,uiTranslations);
for(const [key,label]of Object.entries(permissionLabels))if(permissionEnglish[key])TR[label]=permissionEnglish[key];
const reviewNodeSource=new WeakMap();
let reviewReverseDictionary={};
Object.assign(TR,{'المستلمين':'Recipients','الحضور':'Attendance','إنهاء':'Complete','النتائج':'Results','قواعد النقاط':'Point rules','إحصائيات':'Statistics','إدارة المستخدمين':'User management'});
Object.assign(reviewNames,{'Create':'إنشاء'});Object.assign(TR,{'إنشاء':'Create'});
const reviewTicketTerms={'Technical Support':'الدعم الفني','Create Ticket':'إنشاء تذكرة دعم','Ticket Type *':'نوع التذكرة *','Priority *':'الأولوية *','Subject *':'العنوان *','Description *':'الوصف *','Subject':'العنوان','Description':'الوصف','System Bug':'خلل في النظام','New Feature Request':'طلب ميزة جديدة','Data Issue':'مشكلة في البيانات','Inquiry':'استفسار','Low':'منخفضة','Medium':'متوسطة','High':'مرتفعة','Severe':'عاجلة','Ticket Details':'تفاصيل التذكرة','Ticket ID':'رقم التذكرة','Opened By':'مقدم الطلب','Updated':'آخر تحديث','Actions':'الإجراءات','Priority':'الأولوية','Type':'النوع','Status':'الحالة','In-Progress':'قيد المعالجة','Pending':'قيد الانتظار','Closed':'مغلقة','Open':'مفتوحة','ID':'الرقم'};
for(const [en,ar]of Object.entries(reviewTicketTerms)){TR[ar]=en;if(!['Open','Closed','Type','Status','ID'].includes(en))reviewNames[en]=ar;}
Object.assign(TR,{'عنوان الجلسة التدريبية':'Training session title','معلومات الجلسة التدريبية':'Training session details','الشهادة عند إنهاء الجلسة التدريبية':'Certificate on session completion','اختيار الحضور للجلسة التدريبية':'Select session attendees','رابط الجلسة':'Meeting link','عبر الإنترنت':'Online','حضوري':'In person','لا توجد جلسات تدريبية حاليًا.':'No training sessions yet.','غير مضاف':'Available','مضاف':'Selected','المستخدمون':'Users','حفظ الجلسة التدريبية':'Save training session','قاعات التدريب':'Training rooms','لا توجد أسئلة شائعة منشورة.':'No published frequently asked questions.'});
Object.assign(reviewNames,{'عنوان الجلسات التدريبية':'عنوان الجلسة التدريبية','معلومات الجلسات التدريبية':'معلومات الجلسة التدريبية','الشهادة عند إنهاء الجلسات التدريبية':'الشهادة عند إنهاء الجلسة التدريبية','حفظ الجلسات التدريبية':'حفظ الجلسة التدريبية','اختيار الحضور للسيشن':'اختيار الحضور للجلسة التدريبية','Meeting Room Link':'رابط الجلسة','أونلاين':'عبر الإنترنت','أوفلاين':'حضوري','لا يوجد سيشنز حالية.':'لا توجد جلسات تدريبية حاليًا.','غير متضاف':'غير مضاف','متضاف':'مضاف','المستخدمين':'المستخدمون','لا توجد FAQ منشورة.':'لا توجد أسئلة شائعة منشورة.','تعديل سيشن أونلاين':'تعديل جلسة تدريبية عبر الإنترنت','تعديل قاعة أوفلاين':'تعديل قاعة تدريب حضورية'});
Object.assign(reviewNames,{'Conference Rooms':'قاعات التدريب','Tech Support':'الدعم الفني','User Activity':'سجل النشاط','FAQ':'الأسئلة الشائعة','Groups':'المجموعات','History':'السجل','Content':'المحتوى','الجروبات':'المجموعات','الكونتانت':'المحتوى','المدربين':'المدربون','المتدربين':'المتدربون','الأدمن':'مدير النظام','Users':'المستخدمون','سيرفاى':'استبيان','سيشن':'جلسة تدريبية','رولز':'الصلاحيات'});
const reviewLegacyTranslate=translateSmart;
translateSmart=function(text){
  let original=String(text??''),core=original.trim();if(!core)return original;
  if(APP_LANG==='ar'){
    const reverse=reviewReverseDictionary;
    const formal=reviewNames[core]||reverse[core]||core;
    return original.replace(core,formal.replace(/السيكشن/g,'القسم').replace(/سيكشن/g,'قسم').replace(/سيرفاي/g,'استبيان').replace(/الجروبات/g,'المجموعات').replace(/جروب/g,'مجموعة').replace(/History النقاط/g,'سجل النقاط'));
  }
  const formal=reviewNames[core]||core;if(TR[formal])return original.replace(core,TR[formal]);
  const counted=core.match(/^(\d+)\s+(.+)$/);if(counted&&TR[counted[2]])return original.replace(core,counted[1]+' '+TR[counted[2]]);
  return original;
};
applyStaticTranslations=function(root=document.body){
 if(!root||I18N_LOCK)return;I18N_LOCK=true;reviewReverseDictionary=Object.fromEntries(Object.entries(TR).map(([ar,en])=>[en,ar]));
 try{
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('script,style,textarea,.no-i18n,.cert-stage,[data-user-content]')||!n.nodeValue.trim()?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){let saved=reviewNodeSource.get(node);if(!saved||node.nodeValue!==saved.output)saved={source:node.nodeValue};let output=translateSmart(saved.source);if(APP_LANG==='ar'&&node.parentElement.closest('#tab-tech-support,.launch-tech-form,.launch-ticket-side')&&reviewTicketTerms[saved.source.trim()])output=saved.source.replace(saved.source.trim(),reviewTicketTerms[saved.source.trim()]);if(node.nodeValue!==output)node.nodeValue=output;reviewNodeSource.set(node,{source:saved.source,output});}
  root.querySelectorAll('[title],[placeholder]').forEach(el=>{for(const attr of ['title','placeholder']){const raw=el.getAttribute(attr);if(!raw)continue;const key='reviewSource'+attr;el.dataset[key]||=raw;const translated=translateSmart(el.dataset[key]);if(raw!==translated)el.setAttribute(attr,translated);}});
 }finally{I18N_LOCK=false;}
};
const reviewLanguageRoots=new Set();
function reviewQueueLanguage(root=document.body){
 if(root?.closest?.('.no-i18n'))return;reviewLanguageRoots.add(root);if(reviewLanguageQueued)return;reviewLanguageQueued=true;
 requestAnimationFrame(()=>{reviewLanguageQueued=false;const roots=[...reviewLanguageRoots].filter(r=>r?.isConnected);reviewLanguageRoots.clear();for(const root of roots.filter(r=>!roots.some(other=>other!==r&&other.contains(r))))applyStaticTranslations(root);});
}
new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){const root=node.nodeType===1?node:node.parentElement;if(root&&!root.closest?.('script,style,.cert-stage,.no-i18n'))reviewQueueLanguage(root);}}}).observe(document.body,{childList:true,subtree:true});
fetch('./review-translations.json').then(r=>r.json()).then(dict=>{for(const [ar,en]of Object.entries(dict))if(!TR[ar])TR[ar]=en;reviewQueueLanguage();});
const reviewSetLanguage=setLanguage;
setLanguage=function(lang,silent=false){const result=reviewSetLanguage(lang,silent);applyStaticTranslations();return result;};

// The sidebar is an accordion: exactly the current group stays expanded.
advToggleFolder=function(id){
 const panel=document.getElementById('adv-ref-panel-'+id),opening=panel?.classList.contains('hidden');
 document.querySelectorAll('.adv-ref-folder').forEach(folder=>{const current=folder.id==='adv-ref-'+id&&opening;folder.querySelector('.adv-ref-panel')?.classList.toggle('hidden',!current);folder.querySelector('.adv-ref-folder-title')?.classList.toggle('closed',!current);});
};
const reviewShowTab=showTab;
showTab=async function(tab){
 const output=await reviewShowTab(tab);
 const requested=document.getElementById('tab-'+tab),current=requested&&!requested.classList.contains('hidden')?tab:document.querySelector('#admin-screen [id^="tab-"]:not(.hidden)')?.id.slice(4);
 const active=document.querySelector(`.sidebar [data-ref-tab="${current}"]`)||document.querySelector(`.sidebar [onclick*="showTab('${current}'"]`);
 const folder=active?.closest('.adv-ref-folder');
 if(folder)document.querySelectorAll('.adv-ref-folder').forEach(f=>{f.querySelector('.adv-ref-panel')?.classList.toggle('hidden',f!==folder);f.querySelector('.adv-ref-folder-title')?.classList.toggle('closed',f!==folder);});
 reviewQueueLanguage(document.getElementById('tab-'+current)||document.body);return output;
};

const reviewModalForms={'m-add-video':{section:'nv-section',lock:'nv-lock'},'m-edit-video':{section:'ev-section',lock:'ev-lock'},'m-add-pdf':{section:'pdf-section',lock:'pdf-lock'},'m-course-item':{section:'ci-section',lock:'ci-lock'},'m-survey-admin':{section:'review-survey-section'}};
const reviewModalState=new Map();
const reviewModalPreparing=new Set();
const reviewLoadCourseSections=loadCourseSections;
loadCourseSections=async function(selected=''){
 const active=[...document.querySelectorAll('.modal-wrap:not(.hidden) select[id$="-section"]')].map(input=>[input.id,input.value,input.hidden]);
 const result=await reviewLoadCourseSections(selected);
 for(const input of document.querySelectorAll('.modal-wrap:not(.hidden) select[id$="-section"]'))if(input.dataset.reviewValue!==undefined)input.value=input.dataset.reviewValue;
 for(const [id,value,hidden]of active){const input=document.getElementById(id);if(input){input.value=input.dataset.reviewValue??value;input.hidden=hidden;}}
 return result;
};
async function reviewPrepareContentModal(id){
 const cfg=reviewModalForms[id],modal=document.getElementById(id);if(!cfg||!modal||!CCI)return;
 if(id==='m-survey-admin'&&SURVEY_ITEM_CONTEXT!=='content')return;
 const result=await call({action:'getVideos',courseId:CCI});if(!result.success||modal.classList.contains('hidden'))return;
 for(const inputId of ['nv-url','ev-url','pdf-url']){const input=document.getElementById(inputId);if(input){input.readOnly=true;input.placeholder=t('ارفع الملف من جهازك إلى الأكاديمية','Upload a file from your device to the academy');const label=input.closest('.field')?.querySelector('label');if(label)label.textContent=t(inputId==='pdf-url'?'ملف PDF المرفوع':'ملف الفيديو المرفوع','Uploaded file');}}
 const editing=id==='m-edit-video'?val('ev-id'):id==='m-survey-admin'?SURVEY_EDITING_ITEM_ID:EDITING_VIDEO_ID;
 const item=result.videos.find(v=>v.video_id===editing);
 reviewModalState.set(id,{editing,items:result.videos});
 let select=document.getElementById(cfg.section);
 if(!select){modal.querySelector('.modal').insertAdjacentHTML('beforeend',`<div class="field"><select id="${cfg.section}"></select></div>`);select=document.getElementById(cfg.section);}
 const sectionField=select.closest('.field');
 sectionField.querySelector('.review-section-toggle')?.remove();
 select.innerHTML='<option value="">'+t('اختر القسم','Choose a section')+'</option>'+result.videos.filter(v=>v.content_type==='section').map(v=>`<option value="${esc(v.video_id)}">${esc(itemTitle(v))}</option>`).join('');
 select.value=item?.section_id||'';select.dataset.reviewValue=select.value;select.onchange=()=>{select.dataset.reviewValue=select.value;};select.hidden=!select.value;
 const toggle=document.createElement('label');toggle.className='review-section-toggle';toggle.innerHTML=`<input type="checkbox" ${select.value?'checked':''}> ${t('إضافة إلى قسم','Add to a section')}`;
 toggle.querySelector('input').onchange=e=>{select.hidden=!e.target.checked;if(!e.target.checked){select.value='';select.dataset.reviewValue='';}};
 sectionField.querySelector('label')?.remove();sectionField.prepend(toggle);
 const lock=document.getElementById(cfg.lock);if(lock)lock.closest('.field').hidden=true;
 modal.querySelector('.review-rules')?.remove();
 const panel=document.createElement('details');panel.className='review-rules card';
 panel.innerHTML=`<summary><i class="ti ti-adjustments"></i> ${t('قواعد فتح المحتوى','Content access rules')}</summary><p>${t('اختر العناصر المطلوب إكمالها قبل فتح هذا المحتوى. عند عدم الاختيار، يُطبّق إعداد الترتيب العام للدورة.','Choose the items that must be completed first. With no selection, the course order setting applies.')}</p><div class="review-rule-options">${orderedContent(result.videos).filter(v=>v.video_id!==editing).map(v=>`<label><input type="checkbox" value="${esc(v.video_id)}" ${(item?.access_rules?.required_items||[]).includes(v.video_id)?'checked':''}> ${esc(itemTitle(v))} <small>${contentTypeLabel(v)}</small></label>`).join('')||t('أضف محتوى آخر للدورة أولًا','Add another course item first')}</div>`;
 sectionField.after(panel);
}
function reviewCurrentContentOptions(){
 for(const [id,cfg]of Object.entries(reviewModalForms)){
  const modal=document.getElementById(id);if(!modal||modal.classList.contains('hidden')||!modal.querySelector('.review-rules'))continue;
  return {section_id:val(cfg.section)||'',require_previous:'no',access_rules:{required_items:[...modal.querySelectorAll('.review-rule-options input:checked')].map(x=>x.value)}};
 }
 return null;
}
const reviewCall=call;
call=async function(p={}){
 if(p.action==='addVideo'||p.action==='updateVideo'){
  if([...reviewModalPreparing].some(id=>!document.getElementById(id)?.classList.contains('hidden')))return {success:false,error:t('انتظر اكتمال تحميل إعدادات المحتوى','Wait for the content settings to finish loading')};
  const options=reviewCurrentContentOptions();
  if(options){p={...p};if(p.action==='addVideo')p.video={...p.video,...options};else p.updates={...p.updates,...options};}
 }
 return reviewCall(p);
};
async function reviewCourseOrder(){
 const r=await call({action:'getCourse',courseId:CCI});if(!r.success)return;
 let modal=document.getElementById('m-review-order');if(!modal){document.body.insertAdjacentHTML('beforeend',`<div class="modal-wrap hidden" id="m-review-order"><div class="modal"><h3>${t('إعداد ترتيب المحتوى','Content order settings')}</h3><p>${t('يُطبق هذا الإعداد عندما لا توجد متطلبات خاصة للعنصر.','Applies when the item has no explicit prerequisites.')}</p><div class="field"><select id="review-course-sequence"><option value="open">${t('فتح المحتوى دون ترتيب إلزامي','Open content in any order')}</option><option value="sequential">${t('إكمال المحتوى بالترتيب','Complete content in order')}</option><option value="legacy">${t('الاحتفاظ بإعدادات العناصر الحالية','Keep existing item settings')}</option></select></div><button class="primary" onclick="reviewSaveCourseOrder()">${t('حفظ','Save')}</button><button onclick="closeModal('m-review-order')">${t('إلغاء','Cancel')}</button></div></div>`);}
 set('review-course-sequence',r.course.content_sequence||'legacy');openModal('m-review-order');
}
async function reviewSaveCourseOrder(){const sequence=val('review-course-sequence');const r=await call({action:'updateCourse',courseId:CCI,updates:{content_sequence:sequence}});if(!r.success)return toast(r.error,'error');const c=CCACHE.find(c=>c.course_id===CCI);if(c)c.content_sequence=sequence;closeModal('m-review-order');toast(t('تم حفظ ترتيب المحتوى','Content order saved'));}
const reviewCourseDetail=openCourseDetail;
openCourseDetail=async function(id){await reviewCourseDetail(id);if(!document.getElementById('review-course-order'))document.getElementById('cd-meta')?.insertAdjacentHTML('beforeend',`<button id="review-course-order" class="sm" onclick="reviewCourseOrder()"><i class="ti ti-adjustments"></i>${t('إعداد ترتيب المحتوى','Content order settings')}</button>`);};
async function reviewMoveSection(id){
 const r=await call({action:'getVideos',courseId:CCI});if(!r.success)return;
 document.getElementById('m-review-move')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal-wrap hidden" id="m-review-move"><div class="modal"><h3>${t('نقل إلى قسم','Move to section')}</h3><div class="review-section-options">${r.videos.filter(v=>v.content_type==='section').map(v=>`<button data-section-id="${esc(v.video_id)}">${esc(itemTitle(v))}</button>`).join('')}<button data-section-id="">${t('عرض في المستوى الرئيسي','Show at the top level')}</button></div><button onclick="closeModal('m-review-move')">${t('إلغاء','Cancel')}</button></div></div>`);
 document.querySelectorAll('#m-review-move [data-section-id]').forEach(button=>button.onclick=async()=>{closeModal('m-review-move');await setContentSection(id,button.dataset.sectionId);});openModal('m-review-move');
}
const reviewContentTree=renderContentTree;
renderContentTree=function(items){
 const template=document.createElement('template');template.innerHTML=reviewContentTree(items);
 template.content.querySelectorAll('.content-item-card select[onchange]').forEach(select=>{const id=(select.getAttribute('onchange')||'').match(/setContentSection\('([^']+)'/)?.[1];if(!id)return;const button=document.createElement('button');button.className='icon-btn sm';button.title=t('نقل إلى قسم','Move to section');button.setAttribute('onclick',`reviewMoveSection('${id}')`);button.innerHTML='<i class="ti ti-folder-symlink"></i>';select.replaceWith(button);});return template.innerHTML;
};

// Points history uses the normal content area and keeps the existing ledger/export.
const reviewOpenModal=openModal;
openModal=function(id){
 if(id==='m-points-history-clean'){
  const wrap=document.getElementById(id);let page=document.getElementById('tab-points-history');
  if(!page){page=document.createElement('div');page.id='tab-points-history';document.getElementById('tab-points').after(page);}
  const body=wrap?.querySelector('.modal');if(body){body.style.width='100%';page.append(body);body.querySelector('[onclick^="closeModal"]')?.setAttribute('onclick',"showTab('points')");}
  wrap?.classList.add('hidden');document.querySelectorAll('#admin-screen [id^="tab-"]').forEach(el=>el.classList.toggle('hidden',el!==page));page.insertAdjacentHTML('afterbegin',page.querySelector('.review-back')?'':`<button class="review-back" onclick="showTab('points')">${t('عودة إلى النقاط','Back to points')}</button>`);reviewQueueLanguage();return;
 }
 const result=reviewOpenModal(id);if(reviewModalForms[id]){
  const modal=document.getElementById(id);modal?.querySelector('.review-rules')?.remove();reviewModalPreparing.add(id);
  const buttons=[...modal.querySelectorAll('button[onclick]')].filter(b=>/submitVideo|saveEditVideo|submitPdfItem|saveCourseItem|saveSurveyAdmin/.test(b.getAttribute('onclick'))).map(button=>[button,button.disabled]);
  buttons.forEach(([button])=>button.disabled=true);
  reviewPrepareContentModal(id).catch(e=>toast(e.message,'error')).finally(()=>{reviewModalPreparing.delete(id);buttons.forEach(([button,disabled])=>button.disabled=disabled);});
 }return result;
};

// The visible progress rows are the single source for table and Excel export.
let reviewFilteredProgress=[];
function reviewProgressRows(){return ALL_PROGRESS_ROWS.filter(row=>['course','region','group','supervisor'].every(key=>{const selected=val('progress-filter-'+key);return !selected||String(row[key==='course'?'course_id':key]||'')===selected;}));}
renderAllProgressTable=function(){
 reviewFilteredProgress=reviewProgressRows();
 html('progress-tb',reviewFilteredProgress.map(row=>`<tr><td><button class="icon-btn sm success" onclick="confirmManualProgress('${esc(row.email)}','${esc(row.course_id)}')"><i class="ti ti-check"></i></button></td><td>${esc(row.full_name||row.email)}</td><td dir="ltr">${esc(row.email)}</td><td>${esc(row.course_name)}</td><td>${esc(row.region||'—')}</td><td>${esc(row.group||'—')}</td><td>${esc(row.supervisor||'—')}</td><td>${Math.round(row.progress_percent||0)}% (${row.completed_videos||0}/${row.total_videos||0})</td><td>${row.completed?t('اكتمل','Completed'):t('قيد التقدم','In progress')}</td></tr>`).join('')||`<tr><td colspan="9">${t('لا توجد بيانات مطابقة للفلاتر','No data matches the filters')}</td></tr>`);
};
function reviewProgressExport(){
 const rows=reviewProgressRows();if(!rows.length)return toast(t('لا توجد بيانات مطابقة للفلاتر','No data matches the filters'),'warning');
 exportRowsToExcel(rows.map(row=>({[t('الاسم','Name')]:row.full_name||row.email,[t('البريد الإلكتروني','Email')]:row.email,[t('اسم الدورة','Course name')]:row.course_name,[t('الإقليم','Region')]:row.region||'',[t('المجموعة','Group')]:row.group||'',[t('المدير المباشر','Supervisor')]:row.supervisor||'',[t('نسبة الإنجاز','Progress')]:Math.round(row.progress_percent||0)+'%',[t('الحالة','Status')]:row.completed?t('اكتمل','Completed'):t('قيد التقدم','In progress')})),t('تقرير التقدم','Progress report'),'progress_filtered.xlsx');
}
exportAllProgress=async function(){reviewProgressExport();};
exportSelectedProgressCourse=async function(){reviewProgressExport();};

// Style every export, including legacy callers of XLSX.writeFile.
function reviewStyleWorkbook(wb){
 wb.Workbook||={};wb.Workbook.Views=[{RTL:APP_LANG!=='en'}];
 for(const name of wb.SheetNames){const sheet=wb.Sheets[name];if(!sheet['!ref'])continue;const range=XLSX.utils.decode_range(sheet['!ref']);const widths=[];
  for(let col=range.s.c;col<=range.e.c;col++){let width=12;for(let row=range.s.r;row<=range.e.r;row++){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(!cell)continue;width=Math.max(width,Math.min(48,String(cell.v??'').length+3));cell.s={font:{name:'Arial',sz:11,color:{rgb:row===range.s.r?'FFFFFF':'203247'},bold:row===range.s.r},fill:{fgColor:{rgb:row===range.s.r?'174A67':row%2?'EEF5F9':'FFFFFF'}},alignment:{horizontal:APP_LANG==='en'?'left':'right',vertical:'center',wrapText:true},border:{bottom:{style:'thin',color:{rgb:'DAE5EC'}}}};}widths.push({wch:width});}
  sheet['!cols']=widths;sheet['!rows']=Array.from({length:range.e.r+1},(_,row)=>{let lines=1;for(let col=range.s.c;col<=range.e.c;col++){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(cell)lines=Math.max(lines,String(cell.v??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(8,widths[col-range.s.c].wch-3))),0));}return {hpt:Math.min(409,Math.max(row===range.s.r?32:28,lines*15+8))};});sheet['!autofilter']={ref:sheet['!ref']};sheet['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
 }
 return wb;
}
function reviewInstallExcel(){if(!window.XLSX)return setTimeout(reviewInstallExcel,100);if(XLSX.__reviewStyled)return;const write=XLSX.writeFile;XLSX.writeFile=function(wb,...args){reviewStyleWorkbook(wb);return write.call(this,wb,...args);};XLSX.__reviewStyled=true;}
reviewInstallExcel();

// Certificate coordinates and text sizes scale with the certificate, not viewport pixels.
function reviewFitCertificates(){
 document.querySelectorAll('.cert-stage').forEach(stage=>{
  stage.querySelectorAll('.cert-el:not(img)').forEach(element=>{
   if(element.offsetWidth===0||element.offsetHeight===0)return;
   element.style.fontSize=element.dataset.reviewFont||element.style.fontSize;
   element.dataset.reviewFont=element.style.fontSize;
   let size=parseFloat(getComputedStyle(element).fontSize),guard=0;
   while((element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1)&&size>2&&guard++<50){size*=.94;element.style.fontSize=size+'px';}
  });
 });
}
const reviewRenderCert=renderCertBuilder;
renderCertBuilder=function(){reviewRenderCert();const stage=document.getElementById('cert-stage');stage?.querySelectorAll('.cert-el').forEach(element=>{if(element.dataset.id!==SELECTED_CERT_ELEMENT)return;const handle=document.createElement('span');handle.className='review-cert-resize';handle.onmousedown=e=>e.stopPropagation();handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const item=CERT_BUILDER.elements.find(x=>x.id===element.dataset.id);const rect=stage.getBoundingClientRect(),startX=e.clientX,startY=e.clientY,w=item.w,h=item.h;handle.setPointerCapture(e.pointerId);handle.onpointermove=ev=>{item.w=Math.max(2,Math.min(100-item.x,w+(ev.clientX-startX)/rect.width*100));item.h=Math.max(2,Math.min(100-item.y,h+(ev.clientY-startY)/rect.height*100));element.style.width=item.w+'%';element.style.height=item.h+'%';syncCertControls();};handle.onpointerup=()=>{handle.onpointermove=null;renderCertBuilder();};};element.append(handle);});reviewFitCertificates();};
const reviewUpdateCert=certBuilderUpdateSelected;
certBuilderUpdateSelected=function(){reviewUpdateCert();for(const item of CERT_BUILDER.elements){item.x=Math.min(98,Math.max(0,item.x||0));item.y=Math.min(98,Math.max(0,item.y||0));item.w=Math.min(100-item.x,Math.max(2,item.w||20));item.h=Math.min(100-item.y,Math.max(2,item.h||8));}renderCertBuilder();};
const reviewCertElement=certElementHTML;
certElementHTML=function(element,...args){const el={...element};el.x=Math.min(98,Math.max(0,Number(el.x)||0));el.y=Math.min(98,Math.max(0,Number(el.y)||0));el.w=Math.max(1,Math.min(100-el.x,Number(el.w)||20));el.h=Math.max(1,Math.min(100-el.y,Number(el.h)||8));return reviewCertElement(el,...args);};
async function reviewEditLinkedCertificate(elementId=''){const id=val('cert-linker-id');closeModal('m-cert-linker');await openCertTemplateModal(id);if(elementId)certBuilderSelect(elementId);}
const reviewLinkerPreview=renderCertLinkerPreview;
renderCertLinkerPreview=function(){reviewLinkerPreview();const preview=document.getElementById('cert-linker-preview');if(!preview)return;preview.insertAdjacentHTML('afterbegin',`<button class="sm" onclick="reviewEditLinkedCertificate()"><i class="ti ti-resize"></i>${t('تعديل أبعاد النص وعناصر الشهادة','Edit text boxes and certificate elements')}</button>`);preview.querySelectorAll('.cert-el').forEach(element=>{element.title=t('تعديل أبعاد النص وعناصر الشهادة','Edit text boxes and certificate elements');element.onclick=()=>reviewEditLinkedCertificate(element.dataset.id);});reviewFitCertificates();};
new ResizeObserver(reviewFitCertificates).observe(document.body);
const reviewCertObserver=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.cert-stage')||n.querySelector?.('.cert-stage')))))reviewFitCertificates();});reviewCertObserver.observe(document.body,{childList:true,subtree:true});
Object.assign(window,{call,showTab,openModal,closeModal,openPlayer,playAt,navVideo,loadCourseSections,renderPlaylist,applyStaticTranslations,setLanguage,advToggleFolder,openCourseDetail,renderContentTree,renderAllProgressTable,exportAllProgress,exportSelectedProgressCourse,reviewCourseOrder,reviewSaveCourseOrder,reviewMoveSection,renderCertBuilder,certBuilderUpdateSelected,renderCertLinkerPreview,reviewEditLinkedCertificate});
Object.assign(window.__academy,{call,reviewProgressRows,reviewStyleWorkbook,reviewUnmet});
reviewQueueLanguage();
