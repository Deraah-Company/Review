// Learning dashboards, scheduled examinations and path membership.
import {installLearningHub} from './learning-hub.js';
import {installPurchaseReports} from './purchase-reports.js';
import {installSiteDialogs} from './site-dialogs.js';
Object.assign(TR,{'إدارة الباقات والدورات المدفوعة':'Manage packages and paid courses','إدارة الاستبيانات':'Manage surveys','إدارة الشركاء وروابط الصفحة':'Manage partners and page links','الرد على تذاكر الدعم':'Reply to support tickets','إتاحة تذاكر الدعم':'Allow support tickets','المحادثات الخاصة':'Private conversations','محادثات المجموعات':'Group conversations','محادثات الأقاليم':'Regional conversations'});
const academyDialogs=installSiteDialogs({language:()=>APP_LANG});
window.academyConfirm=academyDialogs.confirm;
askConfirm=function(title,body,onYes){return academyDialogs.confirm(body,{title,danger:/حذف|مسح|إلغاء.*التحاق|delete|remove/i.test(title+' '+body)}).then(async accepted=>{if(accepted&&typeof onYes==='function')await onYes();}).catch(error=>toast(error.message,'error'));};window.askConfirm=askConfirm;
const interfacePolish=document.createElement('link');interfacePolish.rel='stylesheet';interfacePolish.href='/interface-polish.css';document.head.append(interfacePolish);
if(!ADV_PERMISSION_MODULES.some(([key])=>key==='exams.manage'))ADV_PERMISSION_MODULES.push(['exams.manage','إدارة الامتحانات المجدولة ونتائجها']);
if(!ADV_PERMISSION_MODULES.some(([key])=>key==='qa.manage'))ADV_PERMISSION_MODULES.push(['qa.manage',t('إدارة أسئلة المتدربين والرد عليها ونشرها','Manage learner questions, replies and publication')]);
const hubPriorPermissionBucket=adv15PermissionBucket;
adv15PermissionBucket=function(key){return key.startsWith('exams.')?'content':key.startsWith('qa.')||key.startsWith('communication.')?'communication':key.startsWith('users.')||key==='permissions.manage'?'users':hubPriorPermissionBucket(key);};
const hubProgressWrites=new Set();
const learningHub=installLearningHub({
 user:()=>CU,language:()=>APP_LANG,courseId:()=>CCI,can:key=>advCan(key),toast:(...args)=>toast(...args),
 call:p=>call(p),showTab:showTab,showTraineeTab:showTraineeTab,openPlayer:id=>openPlayer(id),enrollCourse:id=>enrollInCourse(id),
 openModal:id=>openModal(id),closeModal:id=>closeModal(id),exportRows:(...args)=>exportRowsToExcel(...args),
 courseDetailSub:courseDetailSub,courseCards:()=>courseDetailCards(),enrollModal:()=>openEnrollModal(),manualProgress:(email,id)=>openManualProgressItems(email,id),
 setProgressRows:rows=>{ALL_PROGRESS_ROWS=rows;},people:()=>UCACHE||[],pathSelection:()=>LP_SELECTED_USERS,
 setPathSelection:users=>{LP_SELECTED_USERS=users;}
 ,waitForProgress:()=>Promise.allSettled([...hubProgressWrites])
 ,renderCourseCard:(...args)=>renderTraineeCourseCard(...args),askQuestion:()=>openAskQuestion(),confirm:(...args)=>academyDialogs.confirm(...args)
 ,previewCertificate:c=>viewCert(c.certificate_image_url||'',c.user_name||c.userName||CU.full_name,c.course_name||c.courseName||'',c.certificate_body||'',encodeURIComponent(JSON.stringify(c.certificate_builder||null)))
 ,rateCourse:id=>layoutOpenCourseRating(id)
 ,homeDecor:async()=>{const r=await call({action:'getSettings'});if(r.success)applySettings(r.settings||{});await applyAcademyExtra();},homeStyle:()=>ADV_STYLE_EXTRA,duplicatePath:id=>duplicateLearningPath(id)
});
const hubPriorCall=call;
call=async function(p={}){
 if(CU&&advCan('progress.view')&&['getCourseProgress','getAllProgress'].includes(p.action)){
  try{const data=await learningHub.progressData();if(p.action==='getCourseProgress')return {success:true,progress:data.rows.filter(r=>r.course_id===p.courseId)};
  const summary=new Map();for(const row of data.rows){if(!summary.has(row.email))summary.set(row.email,{...row,courses:[]});summary.get(row.email).courses.push({...row});}return {success:true,summary:[...summary.values()]};}catch(error){return {success:false,error:error.message};}
 }
 const pending=hubPriorCall(p);if(p.action==='saveProgress')hubProgressWrites.add(pending);try{return await pending;}finally{hubProgressWrites.delete(pending);}
};
showTab=learningHub.showTab;
showTraineeTab=learningHub.showTraineeTab;
loadAllProgress=learningHub.loadProgress;
renderAllProgressTable=learningHub.renderProgress;
exportAllProgress=learningHub.exportProgress;
exportSelectedProgressCourse=learningHub.exportProgress;
courseDetailSub=learningHub.courseDetailSub;
exportCourseProgress=learningHub.exportCourseProgress;
const hubPriorOpenDetail=openCourseDetail;
openCourseDetail=async function(id){learningHub.beginCourse(id);return hubPriorOpenDetail(id);};
const hubPriorAudiencePicker=renderLearningPathAudiencePickers;
renderLearningPathAudiencePickers=function(){hubPriorAudiencePicker();learningHub.enhancePathEditor();};
const hubPriorLoadPaths=loadLearningPaths;
loadLearningPaths=async function(){await hubPriorLoadPaths();learningHub.enhancePathCards();};
const hubPriorLanguage=setLanguage;
setLanguage=function(...args){const result=hubPriorLanguage(...args);learningHub.languageChanged();return result;};
Object.assign(window,{call,showTab,showTraineeTab,loadAllProgress,renderAllProgressTable,exportAllProgress,exportSelectedProgressCourse,renderLearningPathAudiencePickers,loadLearningPaths,setLanguage,courseDetailSub,exportCourseProgress,openCourseDetail});
Object.assign(window.__academy,{call,hub:learningHub,reviewProgressRows:learningHub.filteredProgress});
const purchaseReports=installPurchaseReports({language:()=>APP_LANG,api:learningHub.api,pdf:learningHub.reportPDF,toast:(...args)=>toast(...args)});
loadFinancialReport=purchaseReports.load;
exportFinancialReportExcel=purchaseReports.excel;
Object.assign(window,{loadFinancialReport,exportFinancialReportExcel});
Object.assign(window.__academy,{purchaseReports});
const feedbackSetLanguage=setLanguage;
setLanguage=function(...args){const result=feedbackSetLanguage(...args);if(document.getElementById('tab-financial')&&!document.getElementById('tab-financial').classList.contains('hidden'))purchaseReports.load().catch(e=>toast(e.message,'error'));return result;};window.setLanguage=setLanguage;
// Keep ledger navigation inside the existing points page and retain its tabs.
const feedbackOpenModal=openModal;
const followupPointsHome=advRenderPointsHome;
advRenderPointsHome=async function(mode='home'){
 const ledger=document.querySelector('#hub-inline-points-ledger > .modal');
 if(ledger)document.getElementById('m-points-history-clean')?.append(ledger);
 document.getElementById('hub-inline-points-ledger')?.remove();
 if(mode==='home')document.getElementById('adv-points-body')?.replaceChildren();
 return followupPointsHome(mode);
};window.advRenderPointsHome=advRenderPointsHome;
openModal=function(id){
 if(id==='m-points-history-clean'){
  if((operationsPointsActive&&operationsPointsActive!==operationsPointsRequest)||document.getElementById('tab-points')?.classList.contains('hidden'))return;
  const wrap=document.getElementById(id),body=wrap?.querySelector('.modal')||document.querySelector('#hub-inline-points-ledger > .modal');
  const content=document.getElementById('adv-points-body');if(!content||!body)return;
  let holder=document.getElementById('hub-inline-points-ledger');if(!holder){holder=document.createElement('section');holder.id='hub-inline-points-ledger';}
  content.replaceChildren(holder);
  if(body){holder.append(body);body.style.cssText='width:100%;max-width:none;max-height:none;padding:0;box-shadow:none;border:0';body.querySelectorAll('[onclick*="closeModal"]').forEach(b=>b.onclick=()=>advRenderPointsHome('home'));}
  wrap?.classList.add('hidden');holder.classList.remove('hidden');document.getElementById('tab-points-history')?.classList.add('hidden');document.getElementById('tab-points')?.classList.remove('hidden');applyStaticTranslations(holder);return;
 }
 const result=feedbackOpenModal(id);
 if(id==='m-ann-form'&&!document.getElementById('feedback-ann-upload')){
  const input=document.getElementById('annm-img');input.type='hidden';input.insertAdjacentHTML('afterend',`<button type="button" id="feedback-ann-upload" onclick="this.nextElementSibling.click()"><i class="ti ti-upload"></i>${t('رفع صورة الإعلان','Upload announcement image')}</button><input type="file" accept="image/*" hidden id="feedback-ann-file"><div id="feedback-ann-preview"></div>`);
  document.getElementById('feedback-ann-file').onchange=async function(){const file=this.files[0];if(!file)return;const button=document.getElementById('feedback-ann-upload');button.disabled=true;try{const result=await localUpload(file);input.value=result.url;document.getElementById('feedback-ann-preview').innerHTML=`<img src="${esc(result.url)}" alt="" style="max-width:100%;height:140px;object-fit:contain;margin-top:12px">`;}catch(error){toast(error.message,'error');}finally{button.disabled=false;this.value='';}};
 }
 if(id==='m-ann-form'){const img=document.getElementById('annm-img')?.value;document.getElementById('feedback-ann-preview').innerHTML=img?`<img src="${esc(img)}" alt="" style="max-width:100%;height:140px;object-fit:contain">`:'';}
 return result;
};window.openModal=openModal;
function feedbackFileControls(root=document){
 const selectors='button[onclick],a[onclick],[data-hub-action="people-template"]';
 for(const el of root.querySelectorAll?.(selectors)||[]){const code=el.getAttribute('onclick')||'';el.classList.toggle('feedback-template-link',el.dataset.hubAction==='people-template'||(/download.*(?:template|sample)|(?:template|sample).*download/i.test(code)||/تحميل.*نموذج|تنزيل.*نموذج/.test(el.textContent)));}
 for(const input of root.querySelectorAll?.('label input[type="file"]')||[]){const label=input.closest('label');if(label&&!label.querySelector('.feedback-upload-label')){label.classList.add('feedback-upload-button');}}
}
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)feedbackFileControls(node.parentElement||node);}).observe(document.body,{subtree:true,childList:true});
feedbackFileControls();
const feedbackSessionStep=openSessionWizardStep2;
openSessionWizardStep2=async function(){
 const begin=Date.parse(val('ses2-start')),end=Date.parse(val('ses2-end'));let validLink=false;try{validLink=['https:','http:'].includes(new URL(val('ses2-link')).protocol);}catch{}
 if(!val('ses2-title').trim()||!validLink||!Number.isFinite(begin)||!Number.isFinite(end)||end<=begin)return toast(t('أكمل عنوان الجلسة ورابطها ومواعيدها، ويجب أن تكون النهاية بعد البداية.','Enter a session title, valid meeting link and an end time after the start.'),'warning');
 return feedbackSessionStep();
};
const feedbackRoomStep=openRoomWizardStep2;
openRoomWizardStep2=async function(){if(!val('room2-name').trim()||Number(val('room2-capacity'))<1||!val('room2-address').trim())return toast(t('أكمل اسم القاعة وعنوانها وحدد سعة أكبر من صفر.','Enter the room name, address and a capacity greater than zero.'),'warning');return feedbackRoomStep();};
const feedbackOpenSession=openSessionWizard;
openSessionWizard=async function(id=''){const back=!document.getElementById('m-adv2')?.classList.contains('hidden')&&document.querySelector('#adv2-body [onclick="saveSessionWizard()"]'),draft=back?structuredClone(ADV2_SESSION_DRAFT):null;if(draft){draft.userEmails=[...ADV2_TRANSFER.users];draft.groupIds=[...ADV2_TRANSFER.groups];}await feedbackOpenSession(id);if(draft){ADV2_SESSION_DRAFT=draft;for(const [field,key]of Object.entries({'ses2-title':'title','ses2-instructor':'instructor','ses2-link':'link','ses2-start':'startAt','ses2-end':'endAt','ses2-info':'info','ses2-cert':'certificateTemplateId'}))advSet(field,draft[key]||'');}};
const feedbackOpenRoom=openRoomWizard;
openRoomWizard=async function(id=''){const back=!document.getElementById('m-adv2')?.classList.contains('hidden')&&document.querySelector('#adv2-body [onclick="saveRoomWizard()"]'),draft=back?structuredClone(ADV2_ROOM_DRAFT):null;if(draft){draft.userEmails=[...ADV2_TRANSFER.users];draft.groupIds=[...ADV2_TRANSFER.groups];}await feedbackOpenRoom(id);if(draft){ADV2_ROOM_DRAFT=draft;for(const [field,key]of Object.entries({'room2-name':'name','room2-capacity':'capacity','room2-branch':'branch','room2-map':'mapUrl','room2-address':'address','room2-cert':'certificateTemplateId'}))advSet(field,draft[key]||'');}};
Object.assign(window,{openSessionWizardStep2,openRoomWizardStep2,openSessionWizard,openRoomWizard});
