import {orderedContent,completed} from './public/access-rules.js';
import {courseAvailability} from './public/course-policy.js';
import {normalizeVideoGate,gateRevision,gradeVideoGate} from './public/video-gates.js';

export function createLearningService(ctx){
 const {get,rows,put,remove,can,withinScope,fail,completedCourse}=ctx;
 const email=x=>String(x||'').trim().toLowerCase();
 const values=c=>rows(c).map(x=>({id:x.id,...x.data}));
 const ownValues=(c,target)=>(ctx.forUser?ctx.forUser(c,target):rows(c).filter(x=>email(x.data.userEmail||x.data.email)===target)).map(x=>({id:x.id,...x.data}));
 const progressCache=new Map();
 const write=(c,id,data)=>put.run(c,id,JSON.stringify(data));
 const manager=user=>can(user,'exams.manage');
 const requireManager=user=>{if(!manager(user))fail('ليست لديك صلاحية إدارة الامتحانات',403);};
 const userInfo=u=>{const groups=[...new Set([u.group,...values('groups').filter(g=>(g.members||[]).some(m=>email(m)===email(u.email))).map(g=>g.group_name||g.name||g.id)].filter(Boolean))];return {email:u.email,full_name:u.full_name||u.email,employee_id:u.employee_id||'',region:u.region||'',branch:u.branch||'',supervisor:u.supervisor||'',group:groups.join('، '),groups,role:u.role};};
 const name=c=>c.course_name_ar||c.course_name||c.title||c.id;
 function progressDataset(user){
  if(!can(user,'progress.view'))fail('ليست لديك صلاحية تقارير التقدم',403);
  const revision=ctx.revision?.(),cached=progressCache.get(user.email);if(revision!==undefined&&cached?.revision===revision)return cached.data;
  const users=values('users').filter(u=>u.status!=='deleted'),people=new Map(users.map(u=>[email(u.email||u.id),u]));
  const permitted=ctx.scopeFilter?ctx.scopeFilter(user,people):data=>withinScope(user,data);
  const courses=values('courses'),courseMap=new Map(courses.map(c=>[c.course_id||c.id,c])),templates=values('certificate_templates');
  const withCertificate=c=>c.certificate_enabled==='yes'||c.certificate_enabled===true||!!c.certificate_template_id||templates.some(t=>t.courseId===(c.course_id||c.id)||(t.courseIds||[]).includes(c.course_id||c.id));
  const items=new Map();for(const item of values('videos')){const id=item.course_id||item.courseId;(items.get(id)||items.set(id,[]).get(id)).push(item);}
  const progress=new Map();for(const p of values('progress')){const key=email(p.userEmail||p.email)+'|'+(p.videoId||p.video_id);progress.set(key,p);}
  const pairs=new Map();for(const enrollment of values('enrollments')){
   const person=people.get(email(enrollment.userEmail||enrollment.email)),cid=enrollment.courseId||enrollment.course_id,course=courseMap.get(cid);
   if(!person||!course||!permitted({userEmail:person.email,courseId:cid}))continue;
   const content=orderedContent(items.get(cid)||[]),done=content.filter(v=>completed(progress.get(email(person.email)+'|'+(v.video_id||v.id)))).length;
   const partial=content.reduce((n,v)=>{const p=progress.get(email(person.email)+'|'+(v.video_id||v.id));return n+(completed(p)?100:Math.max(0,Math.min(100,Number(p?.progressPercent??p?.progress_percent)||0)));},0);
   pairs.set(person.email+'|'+cid,{...userInfo(person),course_id:cid,course_name:name(course),course_name_en:course.course_name_en||name(course),hasCertificate:withCertificate(course),total_videos:content.length,completed_videos:done,progress_percent:content.length?Math.round(partial/content.length):0,completed:content.length>0&&done===content.length});
  }
  const filteredRows=[...pairs.values()],visibleEmails=new Set(filteredRows.map(r=>r.email));
  const result={rows:filteredRows,courses:courses.map(c=>({course_id:c.course_id||c.id,course_name:name(c),course_name_en:c.course_name_en||name(c)})),people:users.filter(u=>u.role==='trainee'&&(permitted({userEmail:u.email})||visibleEmails.has(u.email))).map(userInfo)};
  if(progressCache.size>8)progressCache.clear();progressCache.set(user.email,{revision,data:result});return result;
 }
 function personDashboard(user,target){
  target=email(target||user.email);if(target!==user.email&&!can(user,'progress.view'))fail('ليست لديك صلاحية عرض هذا المتدرب',403);
  const person=get('users',target);if(!person)fail('المتدرب غير موجود',404);
  const enrollments=ownValues('enrollments',target).filter(e=>user.email===target||withinScope(user,{userEmail:target,courseId:e.courseId||e.course_id}));
  if(target!==user.email&&!withinScope(user,{userEmail:target})&&!enrollments.length)fail('المتدرب خارج نطاق صلاحياتك',403);
  const courseIds=new Set(enrollments.map(e=>e.courseId||e.course_id));
  const allItems=values('videos').filter(v=>courseIds.has(v.course_id||v.courseId));
  const progress=new Map(ownValues('progress',target).map(p=>[p.videoId||p.video_id,p]));
  const attempts=ownValues('assessment_attempts',target).sort((a,b)=>Number(a.submittedAt||0)-Number(b.submittedAt||0));
  const templates=values('certificate_templates');
  const certificates=ownValues('certificates',target).filter(c=>user.email===target||withinScope(user,{userEmail:target,courseId:c.courseId||c.course_id})).map(c=>({...c}));
  const courses=[...courseIds].map(cid=>{
   const c=get('courses',cid);if(!c||user.email===target&&(c.rules||c.course_rules)?.showInRecords===false)return null;
   const content=orderedContent(allItems.filter(v=>(v.course_id||v.courseId)===cid)).map(v=>{
    const id=v.video_id||v.id,p=progress.get(id)||{},list=attempts.filter(a=>(a.videoId||a.video_id)===id).map(a=>({id:a.id,score:Number(a.score)||0,total:Number(a.total)||0,passed:!!a.passed,submittedAt:a.submittedAt||a.submittedAtText||'',attemptNo:a.attemptNo||0,answers:a.answers||[]}));
    const percent=completed(p)?100:Math.max(0,Math.min(100,Number(p.progressPercent??p.progress_percent)||0));
    return {id,title:v.title_ar||v.title||'',title_en:v.title_en||v.title||'',type:v.content_type||'video',percent,completed:completed(p),started:percent>0||list.length>0,status:completed(p)?'completed':percent>0||list.length?'in_progress':'not_started',attempts:list};
   });
   const done=content.filter(v=>v.completed).length,complete=content.length>0&&done===content.length;
   const hasCertificate=c.certificate_enabled==='yes'||c.certificate_enabled===true||!!c.certificate_template_id||templates.some(t=>t.courseId===cid||(t.courseIds||[]).includes(cid));
   return {id:cid,title:name({...c,id:cid}),title_en:c.course_name_en||name({...c,id:cid}),hasCertificate,complete,percent:content.length?Math.round(content.reduce((sum,v)=>sum+v.percent,0)/content.length):0,done,total:content.length,items:content};
  }).filter(Boolean);
  const done=courses.filter(c=>c.complete).length;
  return {person:userInfo({...person,email:target}),courses,certificates,summary:{enrolled:courses.length,completed:done,remaining:courses.length-done,completionPercent:courses.length?Math.round(done/courses.length*100):0,withCertificate:courses.filter(c=>c.hasCertificate).length,withoutCertificate:courses.filter(c=>!c.hasCertificate).length,certificates:certificates.length},generatedAt:Date.now()};
 }
 function regionalDashboard(user,filter={}){
  const data=progressDataset(user),excluded=new Set(filter.excludeCourses||[]),target=Math.max(0,Math.min(100,Number(filter.target??100)));
  const people=data.people.filter(p=>!filter.region||p.region===filter.region),allowed=new Set(people.map(p=>p.email));
  const eligible=data.rows.filter(r=>allowed.has(r.email)&&!excluded.has(r.course_id)),category=filter.certificate||'';
  const filtered=eligible.filter(r=>category==='certificate'?r.hasCertificate:category==='no-certificate'?!r.hasCertificate:true);
  const aggregate=list=>{const done=list.filter(r=>r.completed).length,required=Math.ceil(list.length*target/100);return {enrollments:list.length,completed:done,percent:list.length?Math.round(done/list.length*100):0,average:list.length?Math.round(list.reduce((n,r)=>n+r.progress_percent,0)/list.length):0,target,remainingToTarget:Math.max(0,required-done)};};
  const regions=[...new Set(people.map(p=>p.region||'غير محدد'))].map(region=>{
   const regionalPeople=people.filter(p=>(p.region||'غير محدد')===region),emails=new Set(regionalPeople.map(p=>p.email)),list=filtered.filter(r=>emails.has(r.email));
   const courseRows=[...new Set(list.map(r=>r.course_id))].map(id=>{const subset=list.filter(r=>r.course_id===id);return {id,title:subset[0].course_name,title_en:subset[0].course_name_en,learners:new Set(subset.map(r=>r.email)).size,...aggregate(subset)};});
   const supervisors=[...new Set(regionalPeople.map(p=>p.supervisor||'غير محدد'))].map(supervisor=>{const members=regionalPeople.filter(p=>(p.supervisor||'غير محدد')===supervisor),ids=new Set(members.map(p=>p.email));return {name:supervisor,learners:members.length,...aggregate(list.filter(r=>ids.has(r.email)))};});
   return {region,learners:regionalPeople.length,courseCount:courseRows.length,...aggregate(list),courses:courseRows,supervisors};
  });
  return {regions,rows:filtered,courses:data.courses,category,categories:{certificate:aggregate(eligible.filter(r=>r.hasCertificate)),'no-certificate':aggregate(eligible.filter(r=>!r.hasCertificate))},availableRegions:[...new Set(data.people.map(p=>p.region).filter(Boolean))],target,excludeCourses:[...excluded],summary:{learners:people.length,courses:new Set(filtered.map(r=>r.course_id)).size,...aggregate(filtered)},generatedAt:Date.now()};
 }
 function resolvePeople(input){
  const users=values('users').filter(u=>u.status!=='deleted'),matches=[],unmatched=[];
  for(const [i,row]of (input||[]).entries()){
   const identifier=String(typeof row==='string'?row:row.email||row.employee_id||row['البريد الإلكتروني']||row['الرقم الوظيفي']||'').trim();
   if(!identifier)continue;
   const found=users.filter(u=>email(u.email)===email(identifier)||String(u.employee_id||'').trim().toLowerCase()===identifier.toLowerCase());
   if(found.length===1)matches.push(userInfo(found[0]));else unmatched.push({row:i+2,identifier,reason:found.length?'ambiguous':'not_found'});
  }
  return {matched:[...new Map(matches.map(u=>[u.email,u])).values()],unmatched};
 }
 function groupUsers(ids){
  const groups=values('groups').filter(g=>ids.includes(g.id)||ids.includes(g.group_id)||ids.includes(g.group_name));
  const members=new Set(groups.flatMap(g=>g.members||[]).map(email)),names=new Set(groups.flatMap(g=>[g.id,g.group_id,g.group_name]).filter(Boolean));
  return values('users').filter(u=>u.role==='trainee'&&u.status==='active'&&(members.has(email(u.email))||names.has(u.group))).map(u=>email(u.email));
 }
 const pathAllowed=(p,user)=>user.role==='admin'||!(p.excludedUsers||[]).includes(user.email)&&(p.visibility!=='private'||(p.audienceUsers||[]).includes(user.email)||(p.audienceRegions||[]).includes(user.region)||groupUsers(p.audienceGroups||[]).includes(user.email));
 function pathEnroll(user,id){
  const p=get('learning_paths',id);if(!p||p.status!=='published'||!pathAllowed(p,user))fail('هذا المسار غير متاح لك',403);
  write('path_enrollments',user.email+'|'+id,{userEmail:user.email,pathId:id,enrolledAt:Date.now()});
  return syncPath(user,{...p,id});
 }
 function syncPath(user,p){
  const courseIds=p.courseIds||[];let waiting=false,first='',blocked='';
  for(const cid of courseIds){
   if(waiting&&p.rule!=='open')break;
   const course=get('courses',cid);if(!course||course.status!=='active'){blocked='توجد دورة غير منشورة في المسار';break;}
   const paid=course.is_paid||course.pricing?.isPaid||Number(course.price||course.pricing?.price)>0;
   if(paid&&!values('purchases').some(x=>email(x.userEmail||x.email)===user.email&&['paid','paid_fake','completed'].includes(x.status)&&(x.courseId===cid||(x.courseIds||[]).includes(cid)))){blocked='الدورة التالية تتطلب شراءً';break;}
   const rules=course.rules||course.course_rules||{};
   if(rules.disableEnrollment){blocked='الالتحاق بالدورة التالية متوقف';break;}
   if((rules.approvalRequired||rules.requiresApproval)&&!values('course_enrollment_requests').some(r=>r.userEmail===user.email&&r.courseId===cid&&r.status==='approved')){blocked='الدورة التالية تتطلب موافقة الإدارة';break;}
   const prerequisite=course.prerequisite_courses?.length?course.prerequisite_courses:course.prerequisite?[course.prerequisite]:[];
   if(prerequisite.some(x=>!completedCourse(user.email,x))){blocked='أكمل متطلبات الدورة التالية أولًا';break;}
   if(course.end_date&&Date.parse(course.end_date)+86400000<Date.now()){blocked='انتهت مدة الدورة التالية';break;}
   const done=completedCourse(user.email,cid);if(!done&&!first)first=cid;if(!done)waiting=true;
  }
  return {firstCourseId:first,blocked};
 }
 function learnerHome(user){
  const paths=values('learning_paths').filter(p=>p.status==='published'&&pathAllowed(p,user));
  const enrolled=new Set(values('path_enrollments').filter(p=>p.userEmail===user.email).map(p=>p.pathId));
  const pathRows=paths.map(p=>({...p,enrolled:enrolled.has(p.id),...(enrolled.has(p.id)?syncPath(user,p):{}),completed:(p.courseIds||[]).filter(id=>completedCourse(user.email,id)).length}));
  const ownEnrollments=values('enrollments').filter(e=>e.userEmail===user.email),ids=new Set(ownEnrollments.map(e=>e.courseId));
  const pathEligible=new Set(paths.flatMap(p=>p.courseIds||[]));
  const allEnrollments=values('enrollments'),requests=ownValues('course_enrollment_requests',user.email);
  const courses=values('courses').filter(c=>c.status==='active'&&!['pending_review','rejected'].includes(c.approval_status)&&(c.visibility!=='private'||ids.has(c.course_id||c.id)||pathEligible.has(c.course_id||c.id))).map(c=>{
   const id=c.course_id||c.id,prereq=c.prerequisite_courses?.length?c.prerequisite_courses:c.prerequisite?[c.prerequisite]:[],prerequisitesDone=prereq.every(cid=>completedCourse(user.email,cid));
   return {...c,enrolled:ids.has(id),_prerequisitesDone:prerequisitesDone,_request:requests.find(r=>r.courseId===id),_availability:courseAvailability(c,{enrollment:ownEnrollments.find(e=>e.courseId===id),prerequisitesDone,enrolledCount:allEnrollments.filter(e=>e.courseId===id).length})};
  });
  return {courses,paths:pathRows,dashboard:personDashboard(user,user.email),exams:listExams(user)};
 }
 function normalizeQuestion(q,index){
  const type=q.type==='truefalse'?'truefalse':'choice';
  const options=type==='truefalse'?['صح','خطأ']:(q.options_ar?.length?q.options_ar:q.options||[]).map(o=>typeof o==='object'?o.text_ar||o.text||o.text_en||'':String(o));
  const correct=type==='truefalse'&&q.correct!==undefined?(String(q.correct)==='false'?1:0):Number(q.correctIndex??q.correct_index??0);
  const text=String(q.question_ar||q.text_ar||q.question||q.text||'').trim();
  if(!text||options.length<2||options.length>12||options.some(option=>!String(option).trim())||!Number.isInteger(correct)||correct<0||correct>=options.length)fail('كل سؤال يحتاج نصًا وخيارات وإجابة صحيحة صالحة');
  return {id:q.id||'q_'+index,text:text.slice(0,4000),text_en:q.question_en||q.text_en||'',options:options.map(s=>s.slice(0,1000)),options_en:q.options_en||[],correctIndex:correct,type};
 }
 function grade(exam,attempt,auto=false){
  if(attempt.submittedAt)return attempt;
  const score=exam.questions.filter(q=>Number.isInteger(attempt.answers[q.id])&&attempt.answers[q.id]===q.correctIndex).length;
  const next={...attempt,submittedAt:Date.now(),autoSubmitted:auto,score,total:exam.questions.length};write('scheduled_exam_attempts',attempt.id,next);return next;
 }
 function currentAttempt(exam,user){
  const id=exam.id+'|'+user.email;let attempt=get('scheduled_exam_attempts',id);
  if(attempt&&!attempt.submittedAt&&Date.now()>=Math.min(attempt.deadlineAt,exam.endsAt))attempt=grade(exam,attempt,true);
  return attempt;
 }
 function attemptView(exam,attempt,includeAnswers=false){
  const released=Date.now()>=exam.endsAt,review=released&&exam.reviewEnabled&&attempt.reviewAllowed!==false;
  return {...attempt,score:released||includeAnswers?attempt.score:undefined,total:exam.questions.length,released,reviewEnabled:review,questions:exam.questions.map(q=>{const {correctIndex,...safe}=q;return review||includeAnswers?{...safe,correctIndex,isCorrect:attempt.answers[q.id]===correctIndex}:safe;})};
 }
 function assigned(exam,user){return manager(user)||(exam.assignedEmails||[]).includes(user.email);}
 function examFor(user,id){const exam=get('scheduled_exams',id);if(!exam||!assigned(exam,user))fail('الامتحان غير متاح لك',403);return {...exam,id};}
 function openAttempt(user,id){
  const exam=examFor(user,id),now=Date.now();if(now<exam.startsAt)fail('لم يبدأ موعد الامتحان بعد',409);
  let attempt=currentAttempt(exam,user);
  if(!attempt){if(now>=exam.endsAt)fail('انتهى موعد الامتحان',409);attempt={id:id+'|'+user.email,examId:id,userEmail:user.email,startedAt:now,deadlineAt:Math.min(exam.endsAt,now+exam.durationMinutes*60000),answers:{},currentPage:0};write('scheduled_exam_attempts',attempt.id,attempt);}
  return {exam:examSummary(exam),attempt:attemptView(exam,attempt)};
 }
 function examSummary(exam){const {questions,assignedEmails,...safe}=exam;return {...safe,questionCount:questions.length,assignedCount:assignedEmails.length};}
 function listExams(user){return values('scheduled_exams').filter(exam=>assigned(exam,user)).map(exam=>{const attempt=currentAttempt(exam,user);return {...examSummary(exam),status:Date.now()<exam.startsAt?'upcoming':Date.now()>=exam.endsAt?'closed':'open',attempt:attempt?{submittedAt:attempt.submittedAt,deadlineAt:attempt.deadlineAt,released:Date.now()>=exam.endsAt,reviewEnabled:exam.reviewEnabled&&attempt.reviewAllowed!==false,score:Date.now()>=exam.endsAt?attempt.score:undefined,total:exam.questions.length}:null};}).sort((a,b)=>b.startsAt-a.startsAt);}
 async function handle({req,res,url,user,body,json}){
  if(!url.pathname.startsWith('/api/insights/')&&!url.pathname.startsWith('/api/exams')&&!url.pathname.startsWith('/api/video-gates/')&&!url.pathname.startsWith('/api/paths/')&&url.pathname!=='/api/learner-home'&&url.pathname!=='/api/people/resolve')return false;
  if(!user)fail('سجل الدخول أولًا',401);
  const send=data=>{json(res,200,{success:true,...data});return true;};
  const videoGateRoute=url.pathname.match(/^\/api\/video-gates\/([^/]+)\/(state|answer)$/);
  if(videoGateRoute){
   const videoId=decodeURIComponent(videoGateRoute[1]),item=get('videos',videoId);if(!item)fail('الفيديو غير موجود',404);
   const courseId=item.course_id||item.courseId,enrolled=ownValues('enrollments',user.email).some(e=>(e.courseId||e.course_id)===courseId);
   if(!enrolled)fail('يلزم الالتحاق بالدورة أولًا',403);ctx.assertContentAccess?.(user,videoId);
   const gates=(item.video_questions||[]).map(normalizeVideoGate),id=user.email+'|'+videoId,stored=get('video_gate_progress',id)||{userEmail:user.email,courseId,videoId,gates:{}};
   const current=g=>{const value=stored.gates?.[g.id];return value?.revision===gateRevision(g)?value:{passed:false,failures:0};};
   if(videoGateRoute[2]==='state'){if(req.method!=='GET')fail('طريقة غير مسموحة',405);return send({gates:Object.fromEntries(gates.map(g=>[g.id,{passed:!!current(g).passed,failures:current(g).failures||0,seekTo:current(g).seekTo??null}]))});}
   if(req.method!=='POST')fail('طريقة غير مسموحة',405);const input=await body(req),gate=gates.find(g=>g.id===input.gateId);if(!gate)fail('السؤال غير موجود',404);let result;try{result=gradeVideoGate(gate,current(gate),input.choice);}catch{fail('اختر إجابة صالحة');}
   if(current(gate).passed)return send({result:{...result,correct:true,passed:true,seekTo:null}});
   stored.gates={...(stored.gates||{}),[gate.id]:{passed:result.passed,failures:result.failures,seekTo:result.seekTo,revision:gateRevision(gate),updatedAt:Date.now()}};write('video_gate_progress',id,stored);return send({result});
  }
  if(url.pathname==='/api/insights/person')return send(personDashboard(user,url.searchParams.get('email')));
  if(url.pathname==='/api/insights/progress')return send(progressDataset(user));
  if(url.pathname==='/api/insights/regions')return send(regionalDashboard(user,req.method==='POST'?await body(req):{}));
  if(url.pathname==='/api/learner-home')return send(learnerHome(user));
  if(url.pathname==='/api/people/resolve'){if(!manager(user)&&!can(user,'content.courses.create'))fail('ليست لديك صلاحية إدارة المشاركين',403);const p=await body(req);if(!Array.isArray(p.rows)||p.rows.length>10000)fail('ملف المشاركين غير صالح');return send(resolvePeople(p.rows));}
  const pathMatch=url.pathname.match(/^\/api\/paths\/([^/]+)\/(enroll|members)$/);
  if(pathMatch){const id=decodeURIComponent(pathMatch[1]);
   if(pathMatch[2]==='enroll')return send(pathEnroll(user,id));
   if(!can(user,'content.courses.create'))fail('ليست لديك صلاحية إدارة المسارات',403);const p=get('learning_paths',id);if(!p)fail('المسار غير موجود',404);
   if(req.method==='GET'){const selected=new Set(p.audienceUsers||[]);return send({path:{id,...p},people:values('users').filter(u=>u.role==='trainee'&&u.status!=='deleted').map(u=>({...userInfo(u),selected:selected.has(u.email),excluded:(p.excludedUsers||[]).includes(u.email),enrolled:!!get('path_enrollments',u.email+'|'+id)}))});}
   const input=await body(req),add=(input.addEmails||[]).map(email),del=(input.removeEmails||[]).map(email),valid=new Set(values('users').filter(u=>u.role==='trainee').map(u=>u.email));if([...add,...del].some(x=>!valid.has(x)))fail('المشاركون يجب أن يكونوا حسابات متدربين صالحة');
   p.audienceUsers=[...new Set([...(p.audienceUsers||[]),...add])].filter(x=>!del.includes(x));p.excludedUsers=[...new Set([...(p.excludedUsers||[]),...del])].filter(x=>!add.includes(x));write('learning_paths',id,p);
   for(const target of del){remove.run('path_enrollments',target+'|'+id);for(const e of rows('enrollments').filter(x=>x.data.userEmail===target&&x.data.viaPath===id))remove.run('enrollments',e.id);}
   return send({path:{id,...p}});
  }
  if(url.pathname==='/api/exams/options'){requireManager(user);return send({people:values('users').filter(u=>u.role==='trainee'&&u.status==='active').map(userInfo),groups:values('groups').map(g=>({id:g.id,name:g.group_name||g.name_ar||g.name||g.title||g.id,memberCount:(g.members||[]).length})),bank:values('question_bank'),questionGroups:values('question_groups')});}
  if(url.pathname==='/api/exams'){
   if(req.method==='GET')return send({exams:listExams(user)});
   requireManager(user);const input=await body(req),id=input.id||ctx.randomUUID(),old=get('scheduled_exams',id);
   if(old&&Object.keys(input).every(k=>['id','reviewEnabled'].includes(k))){write('scheduled_exams',id,{...old,reviewEnabled:!!input.reviewEnabled});return send({id});}
   if(old&&values('scheduled_exam_attempts').some(a=>a.examId===id)){
    if(Object.keys(input).some(k=>!['id','reviewEnabled'].includes(k)))fail('بعد بدء المحاولات يمكن تغيير إتاحة المراجعة فقط',409);
    write('scheduled_exams',id,{...old,reviewEnabled:!!input.reviewEnabled});return send({id});
   }
   const startsAt=Number(input.startsAt),endsAt=Number(input.endsAt),durationMinutes=Number(input.durationMinutes);
   if(!input.title?.trim()||!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt||endsAt<=Date.now()||!(durationMinutes>0&&durationMinutes<=1440))fail('أكمل عنوان الامتحان ومواعيد الفتح والإغلاق والمدة بشكل صحيح');
   if(!Array.isArray(input.questions)||!input.questions.length||input.questions.length>500)fail('اختر من سؤال واحد إلى 500 سؤال');
   const questions=input.questions.map(normalizeQuestion);if(new Set(questions.map(q=>q.id)).size!==questions.length)fail('معرّفات الأسئلة مكررة');
   const people=new Set(values('users').filter(u=>u.role==='trainee'&&u.status==='active').map(u=>u.email));
   const assignedEmails=[...new Set([...(input.assignedEmails||[]).map(email),...groupUsers(input.groupIds||[])])];if(!assignedEmails.length||assignedEmails.some(e=>!people.has(e)))fail('حدد متدربين صالحين للامتحان');
   write('scheduled_exams',id,{id,title:input.title.trim().slice(0,300),title_en:input.title_en||'',startsAt,endsAt,durationMinutes,pageSize:Math.max(1,Math.min(100,parseInt(input.pageSize)||1)),navigationMode:input.navigationMode==='navigator'?'navigator':'pages',allowAnswerChange:input.allowAnswerChange!==false,lockPassedPages:input.navigationMode==='navigator'?false:!!input.lockPassedPages,reviewEnabled:input.reviewEnabled!==false,questions,assignedEmails,groupIds:input.groupIds||[],createdBy:user.email,createdAt:old?.createdAt||Date.now()});return send({id});
  }
  const match=url.pathname.match(/^\/api\/exams\/([^/]+)(?:\/(start|attempt|answer|navigate|submit|results|review|delete))?$/);if(!match)fail('الصفحة غير موجودة',404);
  const id=decodeURIComponent(match[1]),action=match[2],exam=examFor(user,id);
  if(action==='delete'){requireManager(user);if(req.method!=='POST')fail('طريقة غير مسموحة',405);for(const a of rows('scheduled_exam_attempts').filter(r=>r.data.examId===id))remove.run('scheduled_exam_attempts',a.id);remove.run('scheduled_exams',id);return send({deleted:true});}
  if(action==='review'){requireManager(user);if(req.method!=='POST')fail('طريقة غير مسموحة',405);const input=await body(req),target=email(input.email),attempt=currentAttempt(exam,{email:target});if(!attempt?.submittedAt)fail('لا توجد محاولة مكتملة لهذا المتدرب',409);write('scheduled_exam_attempts',attempt.id,{...attempt,reviewAllowed:!!input.allowed});return send({allowed:!!input.allowed});}
  if(!action){requireManager(user);return send({exam});}
  if(action==='results'){requireManager(user);return send({exam:examSummary(exam),results:exam.assignedEmails.map(target=>{const person=get('users',target)||{email:target},attempt=currentAttempt(exam,person);return {person:userInfo(person),attempt:attempt?attemptView(exam,attempt,true):null};})});}
  if(action==='start')return send(openAttempt(user,id));
  let attempt=currentAttempt(exam,user);if(!attempt)fail('ابدأ الامتحان أولًا',409);
  if(action==='attempt')return send({exam:examSummary(exam),attempt:attemptView(exam,attempt)});
  if(attempt.submittedAt||Date.now()>=exam.endsAt)fail('تم إغلاق هذه المحاولة',409);
  if(action==='submit')return send({exam:examSummary(exam),attempt:attemptView(exam,grade(exam,attempt))});
  const input=await body(req);
  if(action==='navigate'){
   const page=Number(input.page),pages=exam.navigationMode==='navigator'?exam.questions.length:Math.ceil(exam.questions.length/exam.pageSize);if(!Number.isInteger(page)||page<0||page>=pages)fail('صفحة غير صالحة');
   if(exam.navigationMode==='pages'&&(page>attempt.currentPage+1||(exam.lockPassedPages&&page<attempt.currentPage)))fail('الانتقال إلى هذه الصفحة غير مسموح',403);
   attempt.currentPage=page;write('scheduled_exam_attempts',attempt.id,attempt);return send({attempt:attemptView(exam,attempt)});
  }
  if(action==='answer'){
   const index=exam.questions.findIndex(q=>q.id===input.questionId),q=exam.questions[index],choice=Number(input.choice);if(!q||!Number.isInteger(choice)||choice<0||choice>=q.options.length)fail('الإجابة غير صالحة');
   if(exam.navigationMode==='pages'&&Math.floor(index/exam.pageSize)!==attempt.currentPage)fail('السؤال خارج الصفحة الحالية',403);
   if(!exam.allowAnswerChange&&Object.hasOwn(attempt.answers,q.id)&&attempt.answers[q.id]!==choice)fail('تغيير الإجابة بعد حفظها غير مسموح',403);
   attempt.answers[q.id]=choice;write('scheduled_exam_attempts',attempt.id,attempt);return send({attempt:attemptView(exam,attempt)});
  }
  fail('عملية غير صالحة',404);
 }
 return {handle,progressDataset,personDashboard,regionalDashboard};
}
