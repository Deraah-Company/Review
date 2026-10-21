// Survey dashboard exports use an immutable snapshot of the results currently open.
let operationsSurveySnapshot=null;
const operationsSurveyReports=new Map();
const operationsPriorSummary=renderSurveySummary;
renderSurveySummary=function(rows=[],questions=[]){
 const output=operationsPriorSummary(rows,questions).replaceAll('Promoters',t('المؤيدون','Promoters')).replaceAll('Passives',t('المحايدون','Passives')).replaceAll('Detractors',t('غير الراضين','Detractors'));
 operationsSurveySnapshot={rows:structuredClone(rows),questions:structuredClone(questions),summary:output};
 return output;
};
function operationsSurveyButton(host,title){
 if(!host||!operationsSurveySnapshot)return;
 host.querySelectorAll('[data-survey-pdf]').forEach(e=>e.remove());
 if(!advCan('content.surveys.export'))return;
 const id=crypto.randomUUID(),snapshot=structuredClone({...operationsSurveySnapshot,title});
 // Keep only open/recent report contexts; the button always owns its own snapshot.
 while(operationsSurveyReports.size>12)operationsSurveyReports.delete(operationsSurveyReports.keys().next().value);
 operationsSurveyReports.set(id,snapshot);
 const bar=document.createElement('div');bar.className='survey-report-actions';bar.innerHTML=`<button class="primary" data-survey-pdf="${id}"><i class="ti ti-file-type-pdf"></i>${t('تنزيل تقرير PDF','Download PDF report')}</button>`;
 host.prepend(bar);
}
const operationsPriorContentResults=openContentResults;
openContentResults=async function(...args){operationsSurveySnapshot=null;await operationsPriorContentResults(...args);operationsSurveyButton(document.getElementById('content-results-body'),document.getElementById('content-results-title')?.textContent||t('نتائج الاستبيان','Survey results'));};
const operationsPriorTemplateResults=viewSurveyTemplateResults;
viewSurveyTemplateResults=async function(...args){operationsSurveySnapshot=null;await operationsPriorTemplateResults(...args);operationsSurveyButton(document.getElementById('adv2-body'),document.getElementById('adv2-title')?.textContent||t('نتائج الاستبيان','Survey results'));};
const operationsPriorSurveyResults=renderSurveyResults;
renderSurveyResults=function(rows=[]){operationsSurveySnapshot=null;operationsPriorSurveyResults(rows);if(SURVEY_ITEM_CONTEXT!=='content')operationsSurveyButton(document.getElementById('survey-results'),t('نتائج استبيان الدورة','Course survey results'));};
function operationsSurveyReport(snapshot){
 const root=document.createElement('div');root.innerHTML=snapshot.summary;
 const cards=[...root.querySelectorAll('.stat-card')];
 const visualBlocks=[];
 for(let n=0;n<cards.length;n+=3)visualBlocks.push(`<div class="survey-pdf-cards">${cards.slice(n,n+3).map(e=>e.outerHTML).join('')}</div>`);
 if(!cards.length)visualBlocks.push(`<div class="hub-info">${esc(t('لا توجد إجابات رقمية لحساب الإحصائيات.','No numeric responses available.'))}</div>`);
 const detail=root.querySelector('table'),sections=[];
 if(detail)sections.push({title:t('تفصيل الأسئلة','Question breakdown'),headers:[...detail.querySelectorAll('thead th')].map(e=>e.textContent.trim()),rows:[...detail.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.trim())),widths:[27,12,11,10,10,10,10,10]});
 const participants=snapshot.rows.map(row=>[row.userName||row.userEmail||'',row.userEmail||'',row.submittedAtText||(row.submittedAt?new Date(row.submittedAt).toLocaleString(APP_LANG==='en'?'en-GB':'ar-SA'):''),(row.answers||[]).map((a,i)=>`${a.question||snapshot.questions[i]?.text||snapshot.questions[i]?.question||t('السؤال','Question')+' '+(i+1)}: ${a.value??a.answer??''}`).join('\n')]);
 sections.push({title:t('مشاركات المتدربين','Learner responses'),headers:[t('المتدرب','Learner'),t('البريد الإلكتروني','Email'),t('وقت الإرسال','Submitted at'),t('الإجابات','Answers')],widths:[18,22,18,42],rows:participants});
 return {title:snapshot.title,subtitle:t('تقرير الاستبيان · النتائج المعروضة','Survey dashboard · displayed results'),metrics:[[snapshot.rows.length,t('المشاركات','Responses')],[snapshot.questions.length,t('الأسئلة','Questions')]],visualBlocks,sections};
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-survey-pdf]');if(!button)return;
 const snapshot=operationsSurveyReports.get(button.dataset.surveyPdf);if(!snapshot||!advCan('content.surveys.export'))return;
 button.disabled=true;try{await learningHub.reportPDF(operationsSurveyReport(snapshot),'survey-dashboard.pdf');}catch(error){toast(error.message,'error');}finally{button.disabled=false;}
});
Object.assign(window,{openContentResults,viewSurveyTemplateResults,renderSurveyResults});

// Both chat surfaces retain state, while only the active surface owns the shared IDs.
function operationsChatSurface(inline){
 for(const [selector,active]of [['#tab-chat',inline],['#m-chat',!inline]]){
  const root=document.querySelector(selector);if(!root)continue;
  for(const el of root.querySelectorAll('[id],[data-operations-chat-id]')){
   const id=el.dataset.operationsChatId||el.id;
   if(!['chat-input','chat-messages'].includes(id))continue;
   el.dataset.operationsChatId=id;el.id=active?id:'inactive-'+root.id+'-'+id;
  }
 }
}
const operationsLoadChat=loadChatTab;
loadChatTab=async function(...args){operationsChatSurface(adminChatVisible());const result=await operationsLoadChat(...args);operationsChatSurface(adminChatVisible());return result;};
const operationsOpenChat=openChatWith;
openChatWith=async function(...args){operationsChatSurface(adminChatVisible());return operationsOpenChat(...args);};
const operationsOpenAudience=openAudienceChat;
openAudienceChat=function(...args){operationsChatSurface(adminChatVisible());return operationsOpenAudience(...args);};
Object.assign(window,{loadChatTab,openChatWith,openAudienceChat});

// Serialize the legacy asynchronous renderers; only the latest requested view is committed last.
let operationsPointsRequest=0,operationsPointsActive=0,operationsPointsQueue=Promise.resolve();
function operationsNavigatePoints(mode,render){
 const ticket=++operationsPointsRequest,body=document.getElementById('adv-points-body');
 if(body){body.inert=true;body.setAttribute('aria-busy','true');}
 const job=operationsPointsQueue.catch(()=>{}).then(async()=>{
  if(ticket!==operationsPointsRequest)return;
  operationsPointsActive=ticket;
  try{await render();}finally{
   operationsPointsActive=0;
   if(ticket===operationsPointsRequest){
    const content=document.getElementById('adv-points-body');if(content){content.inert=false;content.removeAttribute('aria-busy');}
    document.querySelectorAll('#tab-points .adv-folder-card').forEach(card=>{const code=card.getAttribute('onclick')||'',target=code.includes('openPointsHistory')?'history':code.match(/advRenderPointsHome\(['"]([^'"]+)/)?.[1];card.classList.toggle('active',target===mode);});
   }
  }
 });
 operationsPointsQueue=job.catch(()=>{});return job;
}
const operationsPointPermissions={bonus:'points.weights',weights:'points.weights',rules:'points.weights',grant:'points.grant',leaderboard:'points.leaderboard',history:'points.history'};
const operationsPointsHome=advRenderPointsHome;
advRenderPointsHome=async function(mode='home'){
 if(mode!=='home'&&!advCan(operationsPointPermissions[mode]))return toast(t('ليست لديك صلاحية','Permission denied'),'warning');
 await operationsNavigatePoints(mode,()=>operationsPointsHome(mode));
 for(const el of document.querySelectorAll('#tab-points .adv-folder-card')){
  const code=el.getAttribute('onclick')||'',target=code.includes('openPointsHistory')?'history':code.match(/advRenderPointsHome\(['"]([^'"]+)/)?.[1];
  if(target&&operationsPointPermissions[target]){el.hidden=!advCan(operationsPointPermissions[target]);el.style.display=el.hidden?'none':'';}
 }
};
const operationsPointsHistory=openPointsHistory;
openPointsHistory=async function(...args){if(!advCan('points.history')&&!advCan('points.grant'))return toast(t('ليست لديك صلاحية','Permission denied'),'warning');return operationsNavigatePoints('history',()=>operationsPointsHistory(...args));};
Object.assign(window,{advRenderPointsHome,openPointsHistory,openPointUserDetails:openPointsHistory});

const operationsRenderUsers=renderUsers;
renderUsers=function(...args){const result=operationsRenderUsers(...args);advApplyPermissions();return result;};
const operationsOpenModal=openModal;
openModal=function(...args){const result=operationsOpenModal(...args);advApplyPermissions();return result;};
const operationsGroupEditor=openGroupEditModal;
openGroupEditModal=async function(...args){
 if(!advCan('groups.manage')&&!advCan('groups.managers'))return toast(t('ليست لديك صلاحية','Permission denied'),'warning');
 await operationsGroupEditor(...args);const onlyManagers=!advCan('groups.manage');
 document.querySelectorAll('#m-edit-group input:not(.eg-manager),#m-edit-group select,#m-edit-group textarea,#m-edit-group input[type=file]').forEach(el=>el.disabled=onlyManagers);
};
const operationsSaveGroup=saveGroupEdits;
saveGroupEdits=async function(){
 if(advCan('groups.manage'))return operationsSaveGroup();
 if(!advCan('groups.managers'))return toast(t('ليست لديك صلاحية','Permission denied'),'warning');
 await setDoc(doc(db,'groups',val('eg-id')),{manager_emails:[...document.querySelectorAll('.eg-manager:checked')].map(el=>normalizeEmail(el.value)),updatedAt:Date.now()},{merge:true});
 closeModal('m-edit-group');await loadGroups();advApplyPermissions();toast(t('تم حفظ مديري المجموعة','Group managers saved'));
};
Object.assign(window,{renderUsers,openModal,openGroupEditModal,saveGroupEdits});
