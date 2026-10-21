// Single final navigation and settings layer. Original source is retained separately.
import {permissionLabels,tabPermissions,defaultPermissions} from './permissions.js';
window.__singleNavigationReady=true;
function maintenanceLegacyObserver(callback){const observer=new MutationObserver(callback);(window.__legacyObservers||=[]).push(observer);return observer;}
for(const observer of window.__legacyObservers||[])observer.disconnect();
let maintenanceNavigation=0,maintenanceStyleVersion=0;
rolePresetPermissions=defaultPermissions;
advLoadCurrentPermissions=async function(){
 if(!CU)return;
 const email=CU.email;
 const response=await fetch('/api/capabilities');if(!response.ok)return;
 const data=await response.json();if(CU?.email!==email)return;ADV_CURRENT_PERMS=data.permissions;
 (window.__launchPolish||={}).currentChatScope=data.chatScope||{};
 advApplyPermissions();
};
advCan=function(key){return CU?.role==='admin'||ADV_CURRENT_PERMS?.[key]===true;};
adv5TabPerms=tab=>tabPermissions[tab]||[];
adv5CanSeeTab=tab=>CU?.role==='admin'||(tabPermissions[tab]||[]).some(advCan);
advApplyPermissions=function(){
 if(!CU)return;
 const sidebar=document.querySelector('#admin-screen .sidebar');
 for(const [selector,ar,en]of [['#adv-ref-communication > .adv-ref-folder-title','التواصل والدعم','Communication and support'],['[data-ref-tab=qa]','أسئلة المتدربين','Learner questions'],['[data-ref-tab=chat]','المحادثات','Conversations'],['[data-ref-tab=tech-support]','تذاكر الدعم','Support tickets']]){const button=sidebar?.querySelector(selector);if(button){[...button.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());button.insertBefore(document.createTextNode(t(ar,en)),button.querySelector('.ti-chevron-down'));}}
 const ticketButton=document.getElementById('trainer-tech-ticket-btn');if(ticketButton){const allowed=advCan('tech_support.visible')||advCan('tech_support.answer');ticketButton.classList.toggle('hidden',!allowed);ticketButton.style.display=allowed?'':'none';}
 document.querySelectorAll('.adv-ref-nav[data-ref-tab],.sidebar [onclick]').forEach(el=>{
  const tab=el.dataset.refTab||(el.getAttribute('onclick')||'').match(/showTab\(['"]([^'"]+)/)?.[1];
  if(tab&&tabPermissions[tab]){const duplicate=!el.dataset.refTab&&!!sidebar?.querySelector(`[data-ref-tab="${tab}"]`),allowed=adv5CanSeeTab(tab)&&!duplicate;el.style.display=allowed?'':'none';el.classList.toggle('hidden',!allowed);}
 });
 const roleKey={trainee:'users.trainees.view',trainer:'users.trainers.view',admin:'users.admins.view'};
 document.querySelectorAll('[data-role-view]').forEach(el=>{const key=roleKey[el.dataset.roleView];el.style.display=CU.role==='admin'||advCan('users.manage')||advCan(key)||advCan('users.view')?'':'none';});
 document.querySelectorAll('[onclick*="openRoleHierarchyManager"]').forEach(el=>{el.style.display=advCan('permissions.manage')?'':'none';});
 const actions=[[/openModal\(['"]m-(?:add-user|bulk)['"]|openEditUser|doDelete\(|doAction\(|bulkSetStatus/,'users.manage'],[/bulkEnrollSelected/,'content.enrollment.approve'],[/bulkAddSelectedToPath|openLearningPathForm|saveLearningPath|deleteLearningPath|duplicateLearningPath/,'content.courses.create'],[/bulkAddSelectedToGroup|m-add-group|doDeleteGroup|removeMember|addGroupMember/,'groups.manage'],[/bulkIssueCertificate/,'utility.certificates'],[/openSurveyLibraryBuilder|duplicateSurveyTemplate|deleteSurveyTemplate/,'content.surveys.manage'],[/exportSurveyTemplateResults|exportSurveyToExcel/,'content.surveys.export'],[/openAddCourseModal|submitAddCourse/,'content.courses.create'],[/deleteCourse/,'content.courses.delete'],[/approveCourse/,'content.courses.approve'],[/openTechSupport|loadTechSupportPage/,'tech_support.answer']];
 document.querySelectorAll('button[onclick]').forEach(el=>{const action=el.getAttribute('onclick')||'';for(const [pattern,key]of actions)if(pattern.test(action))el.style.display=advCan(key)?'':'none';});
 document.querySelectorAll('button[onclick*="openChatWith"]').forEach(el=>{el.style.display=advCan('communication.chat.private')||advCan('tech_support.answer')?'':'none';});
 document.querySelectorAll('[onclick*="openGroupEditModal"]').forEach(el=>{el.style.display=advCan('groups.manage')||advCan('groups.managers')?'':'none';});
 document.querySelectorAll('[data-hub-action="path-duplicate"]').forEach(el=>{el.style.display=advCan('content.courses.create')?'':'none';});
 // A folder is visible when it contains an allowed page, even if a legacy role shell hid it before permissions loaded.
 sidebar?.querySelectorAll('.adv-ref-folder').forEach(folder=>{const visible=[...folder.querySelectorAll('.adv-ref-nav[data-ref-tab]')].some(el=>el.style.display!=='none'&&!el.classList.contains('hidden'));folder.style.display=visible?'':'none';folder.classList.toggle('hidden',!visible);});
 document.getElementById('top-settings-btn')?.classList.toggle('hidden',!advCan('style.manage')&&!advCan('partners.manage'));
};
showTab=async function(tab){
 if(CU&&!ADV_CURRENT_PERMS)await advLoadCurrentPermissions();
 const requested=tab;if(!adv5CanSeeTab(tab)){document.getElementById('tab-'+tab)?.classList.add('hidden');const fallback=Object.keys(tabPermissions).find(key=>adv5CanSeeTab(key)&&(document.getElementById('tab-'+key)||key==='scheduled-exams'));if(fallback&&fallback!==tab)return showTab(fallback);document.querySelectorAll('#admin-screen [id^="tab-"]').forEach(el=>el.classList.add('hidden'));toast('ليست لديك صلاحية فتح هذه الصفحة','warning');return;}
 const ticket=++maintenanceNavigation;
 document.querySelectorAll('#admin-screen [id^="tab-"]').forEach(el=>el.classList.toggle('hidden',el.id!=='tab-'+tab));
 document.querySelectorAll('.sidebar .active').forEach(el=>el.classList.remove('active'));
 document.querySelectorAll(`[data-ref-tab="${tab}"],#nav-${tab},#nav-adv-${tab}`).forEach(el=>el.classList.add('active'));
 const loaders={dash:loadDash,users:loadUsers,courses:loadCourses,paths:loadLearningPaths,progress:loadAllProgress,groups:loadGroups,certs:loadAllCerts,qa:loadQA,chat:loadChatTab,'question-bank':loadQuestionBank,points:loadPointsTab,settings:()=>loadSettingsModal(false),activity:loadActivity,announcements:loadAnnouncements,permissions:loadPermissionsPage,packages:loadPackagesPage,sessions:loadSessionsPage,rooms:loadRoomsPage,'survey-library':loadSurveyLibraryPage,coupons:loadCouponsPage,faq:loadFAQPage,financial:loadFinancialReport,'rating-report':loadRatingReport,'tech-support':loadTechSupportPage,'registration-requests':loadRegistrationRequestsPage,'login-settings':loadLoginRegistrationSettings,'enrollment-requests':window.loadCourseEnrollmentRequestsPage};
 try{await loaders[tab]?.();if(ticket!==maintenanceNavigation)return;if(tab==='settings')maintenanceBuildStylePage();advApplyPermissions();if(APP_LANG==='en')applyStaticTranslations(document.getElementById('tab-'+tab));}
 catch(error){if(ticket===maintenanceNavigation)toast(error.message,'error');console.error('Page '+requested,error);}
};
// Keep the established sidebar DOM; retire conflicting legacy relabelers.
adv6RelabelSidebar=function(){};
const maintenanceRenderDashboard=adv16RenderDashboard;
function maintenanceFitDashboard(){
 const canvas=document.getElementById('adv16-dashboard-canvas');if(!canvas)return;
 const width=canvas.clientWidth;
 const layout=(ADV16_DASH_LAYOUT||[]).slice().sort((a,b)=>(a.y||0)-(b.y||0)||(a.x||0)-(b.x||0));
 layout.forEach((w,index)=>{const el=[...canvas.children].find(e=>e.dataset.widgetId===w.id);if(!el)return;el.style.order=index;el.style.width='';el.style.flexBasis=width<900?'100%':Math.min(100,Math.max(28,(Number(w.w||440)/1200)*100))+'%';el.style.height=Math.max(180,Number(w.h||260))+'px';});
}
adv16RenderDashboard=function(){maintenanceRenderDashboard();maintenanceFitDashboard();};
adv16BindDashboardDrag=function(){
 const canvas=document.getElementById('adv16-dashboard-canvas');if(!canvas)return;
 let dragged=null;
 canvas.querySelectorAll('.adv16-widget').forEach(el=>{
  el.draggable=ADV16_DASH_EDIT;
  el.ondragstart=e=>{if(e.target.closest('.adv16-resize'))return e.preventDefault();dragged=el.dataset.widgetId;e.dataTransfer.setData('text/plain',dragged);};
  el.ondragover=e=>{if(ADV16_DASH_EDIT)e.preventDefault();};
  el.ondrop=e=>{e.preventDefault();const from=ADV16_DASH_LAYOUT.find(w=>w.id===dragged),to=ADV16_DASH_LAYOUT.find(w=>w.id===el.dataset.widgetId);if(!from||!to||from===to)return;const sorted=ADV16_DASH_LAYOUT.slice().sort((a,b)=>(a.y||0)-(b.y||0)||(a.x||0)-(b.x||0));const a=sorted.indexOf(from),b=sorted.indexOf(to);[sorted[a],sorted[b]]=[sorted[b],sorted[a]];sorted.forEach((w,i)=>{w.y=i*10;w.x=0;});ADV16_DASH_LAYOUT=sorted;adv16RenderDashboard();};
  const handle=el.querySelector('.adv16-resize');handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();el.draggable=false;const w=ADV16_DASH_LAYOUT.find(w=>w.id===el.dataset.widgetId),x=e.clientX,y=e.clientY,startW=el.clientWidth,startH=el.clientHeight;handle.setPointerCapture(e.pointerId);handle.onpointermove=ev=>{const next=Math.max(200,Math.min(canvas.clientWidth,startW+ev.clientX-x));w.w=next/canvas.clientWidth*1200;w.h=Math.max(180,startH+ev.clientY-y);maintenanceFitDashboard();};handle.onpointerup=()=>{handle.onpointermove=null;handle.onpointerup=null;el.draggable=true;};};
 });
};
new ResizeObserver(()=>maintenanceFitDashboard()).observe(document.getElementById('tab-dash'));
function maintenanceBuildStylePage(){
 const root=document.getElementById('tab-settings');
 root.querySelectorAll('#adv-style-tabs,#adv-style-tabs-refined,#adv-style-extra').forEach(el=>el.remove());
 [...root.children].filter(el=>el.classList.contains('card')).forEach(el=>el.classList.add('adv-style-core-card'));
 const initial=advCan('style.manage')?'brand':'partners';
 root.insertAdjacentHTML('afterbegin',adv7StyleTabs(initial)+'<div id="adv-style-extra" class="card hidden"></div>');
 root.querySelectorAll('#adv-style-tabs-refined button').forEach(button=>{const kind=(button.getAttribute('onclick')||'').match(/showStyleSub\('([^']+)/)?.[1];button.hidden=!advCan(['partners','chrome'].includes(kind)?'partners.manage':'style.manage');button.style.display=button.hidden?'none':'';});
 showStyleSub(initial,root.querySelector('#adv-style-tabs-refined button'));
}
showStyleSub=async function(kind,btn){
 if(!advCan(['partners','chrome'].includes(kind)?'partners.manage':'style.manage'))return toast(t('ليست لديك صلاحية','Permission denied'),'warning');
 const token=++maintenanceStyleVersion;await loadAcademyExtra();if(token!==maintenanceStyleVersion)return;
 document.querySelectorAll('#adv-style-tabs-refined button').forEach(el=>el.classList.toggle('active',(el.getAttribute('onclick')||'').includes("showStyleSub('"+kind+"'")));
 document.querySelectorAll('#tab-settings .adv-style-core-card').forEach(el=>el.style.display=kind==='brand'?'':'none');
 const extra=document.getElementById('adv-style-extra');if(!extra)return;extra.classList.toggle('hidden',kind==='brand');extra.style.display=kind==='brand'?'none':'';
 if(kind==='brand')return;
 if(kind==='homepage')return adv7RenderHomepageStyle();
 if(kind==='general'){
  adv7RenderGeneralStyle();
  const unsupported={'st-email-verify':'يتطلب إعداد خدمة إرسال بريد؛ غير مفعّل في التشغيل المحلي.','st-captcha':'يتطلب ربط مزود Captcha ومفاتيحه.','st-2fa':'يتطلب إعداد المصادقة الثنائية لكل حساب أولًا.','st-block-shot':'المتصفح لا يستطيع منع تسجيل الشاشة؛ هذا الخيار خاص بتطبيق جوال أصلي.'};
  for(const [id,reason]of Object.entries(unsupported)){const input=document.getElementById(id);if(input){input.disabled=true;input.checked=false;input.closest('.adv-mini-row').classList.add('maintenance-unavailable');input.closest('.adv-mini-row').insertAdjacentHTML('beforeend','<small>'+reason+'</small>');}}
  return;
 }
 return adv7PrevShowStyleSub(kind,btn);
};
saveAcademyExtra=async function(){const data={...ADV_STYLE_EXTRA},partnerKeys=['partners','headerLinks','footerBlocks'];for(const key of Object.keys(data))if(partnerKeys.includes(key)?!advCan('partners.manage'):!advCan('style.manage'))delete data[key];await setDoc(doc(db,'settings','academy_extra'),{...data,updatedAt:Date.now()},{merge:true});await applyAcademyExtra();toast('تم حفظ تصميم الأكاديمية');};
adv7MoveHomeSection=function(i,dir){
 const cfg=adv7MergeStyleExtra(ADV_STYLE_EXTRA||{});
 for(const key of cfg.homeLayout){const input=document.getElementById('home-sec-'+key);if(input)cfg.visibleSections[key]=input.checked;}
 const j=i+dir;if(j<0||j>=cfg.homeLayout.length)return;
 [cfg.homeLayout[i],cfg.homeLayout[j]]=[cfg.homeLayout[j],cfg.homeLayout[i]];ADV_STYLE_EXTRA=cfg;adv7RenderHomepageStyle();
};
adv3FindDuplicateRegistration=async function(email,employeeId=''){return (await request('/api/registration-check',{email,employeeId})).duplicate;};
const maintenanceApplyExtra=applyAcademyExtra;
applyAcademyExtra=async function(){await maintenanceApplyExtra();};
saveSettings=async function(){
 const settings={academy_name:val('set-name')||'Deraah Academy',logo_url:val('set-logo'),background_image:val('set-bg'),promo_banners:PROMO_BANNERS,background_opacity:Math.max(0,Math.min(100,Number(val('set-bg-opacity')))),primary_color:val('set-primary'),text_color:val('set-text'),bg_color:val('set-bgcolor'),theme:val('set-theme')||'light'};
 const result=await call({action:'saveSettings',settings});if(result.success){applySettings(settings);toast('تم حفظ الإعدادات');}else toast(result.error,'error');
};
const maintenanceBaseApplySettings=applySettings;
applySettings=function(s){localStorage.setItem('deraah_dark_mode',s.theme==='dark'?'1':'0');maintenanceBaseApplySettings(s);document.querySelectorAll('.academy-bg').forEach(el=>{if(!s.background_image)el.style.backgroundImage='none';});};
// One stable public API for the existing inline event handlers.
Object.assign(window,{showTab,advCan,advLoadCurrentPermissions,advApplyPermissions,showStyleSub,saveAcademyExtra,saveSettings,applySettings,adv16RenderDashboard,adv16BindDashboardDrag,adv7MoveHomeSection});
Object.assign(window.__academy,{permissionLabels,tabPermissions,getPermissions:()=>ADV_CURRENT_PERMS,fitDashboard:maintenanceFitDashboard});
