import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=mkdtempSync(path.join(tmpdir(),'academy-hub-')),base='http://127.0.0.1:43225';
let child,admin,learner,other,restricted;
async function api(route,data,cookie=admin){const r=await fetch(base+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const set=(collection,id,data,merge=false)=>api('/api/data',{op:'set',ref:{collection,id},data,merge});
const login=async(email,password='Hub!2026')=>(await api('/api/login',{email,password},'')).cookie;
const question=(id='q1')=>({id,text:'اختر نعم',options:['نعم','لا'],correctIndex:0});
const exam=(extra={})=>({title:'امتحان تجربة',startsAt:Date.now()-1000,endsAt:Date.now()+60000,durationMinutes:30,pageSize:1,navigationMode:'pages',allowAnswerChange:true,reviewEnabled:true,assignedEmails:['a@hub.local'],questions:[question('q1'),question('q2'),question('q3')],...extra});
before(async()=>{
 child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:'43225',ADMIN_PASSWORD:'Hub-admin!2026'},stdio:'pipe',windowsHide:true});let errors='';child.stderr.on('data',d=>errors+=d);
 for(let n=0;n<100;n++){try{if((await api('/api/health',undefined,'')).status===200)break;}catch{}if(n===99)throw Error(errors);await new Promise(r=>setTimeout(r,50));}
 admin=await login('admin@academy.local','Hub-admin!2026');
 for(const [email,id,region,role]of [['a@hub.local','101','الرياض','trainee'],['b@hub.local','102','الخليج','trainee'],['scope@hub.local','201','الرياض','trainer']])await set('users',email,{email,employee_id:id,full_name:email==='a@hub.local'?'أحمد متدرب':email,region,supervisor:'مشرف '+region,role,status:'active',password:'Hub!2026'});
 learner=await login('a@hub.local');other=await login('b@hub.local');restricted=await login('scope@hub.local');
 await set('user_permissions','scope@hub.local',{permissions:{'progress.view':true},progressScope:{all:false,regions:['الرياض']}});
 await set('groups','g1',{group_name:'مجموعة الرياض',members:['a@hub.local']});
 for(const id of ['c1','c2']){await set('courses',id,{course_id:id,course_name:id,status:'active',visibility:'public',content_sequence:'open',certificate_enabled:id==='c1'?'yes':'no'});await set('enrollments','a@hub.local_'+id,{userEmail:'a@hub.local',courseId:id});}
 await set('videos','v1',{video_id:'v1',course_id:'c1',title:'فيديو مكتمل',order:1});
 for(const [id,type,order]of [['v2','video',1],['e2','exam',2],['s2','survey',3]])await set('videos',id,{video_id:id,course_id:'c2',title:id,content_type:type,order,require_previous:'no'});
 await set('progress','a@hub.local_v1',{userEmail:'a@hub.local',courseId:'c1',videoId:'v1',progressPercent:100,completed:'yes'});
 await set('progress','a@hub.local_v2',{userEmail:'a@hub.local',courseId:'c2',videoId:'v2',progressPercent:42});
 for(let n=1;n<=2;n++)await set('assessment_attempts','a'+n,{userEmail:'a@hub.local',courseId:'c2',videoId:'e2',attemptNo:n,score:n,total:5,passed:false,submittedAt:Date.now()+n});
 await set('certificates','cert1',{userEmail:'a@hub.local',courseId:'c1',course_name:'c1',issued_at:new Date().toISOString()});
});
after(async()=>{await new Promise(r=>{child.once('exit',r);child.kill();});rmSync(dir,{recursive:true,force:true});});
test('support ticket numbers can be reserved by learners without settings write permission',async()=>{
 const a=await api('/api/support/ticket-number',{},learner),b=await api('/api/support/ticket-number',{},other);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(b.data.number,a.data.number+1);
 assert.equal((await api('/api/support/ticket-number',{},'')).status,401);
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'settings',id:'tech_support_counter'},data:{lastNo:1}},learner)).status,403);
});
test('progress group filters include actual membership even without a legacy profile group',async()=>{const d=(await api('/api/insights/progress')).data;assert(d.rows.filter(r=>r.email==='a@hub.local').every(r=>r.groups.includes('مجموعة الرياض')));});
test('course identity is preserved when legacy records or edits omit the course_id field',async()=>{await set('courses','legacy_identity',{course_name:'اسم قديم'});assert.equal((await api('/api/data',{op:'get',ref:{collection:'courses',id:'legacy_identity'}})).data.data.course_id,'legacy_identity');});
test('video question attempts persist, enforce enrollment and use the configured fallback point',async()=>{
 await set('courses','gate_course',{course_name:'أسئلة الفيديو',status:'active',content_sequence:'open'});await set('enrollments','gate_enrollment',{userEmail:'a@hub.local',courseId:'gate_course'});
 const gate={id:'gate1',text:'اختر ب',options:['أ','ب'],correctIndex:1,trigger_seconds:8,rewind_seconds:4,fallback_seconds:1,max_attempts:2};
 assert.equal((await set('videos','gate_video',{course_id:'gate_course',content_type:'video',video_duration:10,video_questions:[gate]})).status,200);
 assert.equal((await api('/api/video-gates/gate_video/state',undefined,other)).status,403);
 assert.equal((await api('/api/video-gates/gate_video/answer',{gateId:'gate1',choice:0},learner)).data.result.seekTo,4);
 assert.equal((await api('/api/video-gates/gate_video/state',undefined,learner)).data.gates.gate1.failures,1);
 const exhausted=await api('/api/video-gates/gate_video/answer',{gateId:'gate1',choice:0},learner);assert.equal(exhausted.data.result.seekTo,1);assert.equal(exhausted.data.result.exhausted,true);
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'progress',id:'gate_progress'},data:{userEmail:'a@hub.local',courseId:'gate_course',videoId:'gate_video',completed:'yes',progressPercent:100}},learner)).status,409);
 assert.equal((await api('/api/video-gates/gate_video/answer',{gateId:'gate1',choice:1},learner)).data.result.passed,true);
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'progress',id:'gate_progress'},data:{userEmail:'a@hub.local',courseId:'gate_course',videoId:'gate_video',completed:'yes',progressPercent:100}},learner)).status,200);
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'video_gate_progress',id:'fake'},data:{userEmail:'a@hub.local',passed:true}},learner)).status,403);
 await set('videos','gate_video',{video_questions:[{...gate,text:'سؤال مختلف'}]},true);const reset=(await api('/api/video-gates/gate_video/state',undefined,learner)).data.gates.gate1;assert.equal(reset.passed,false);assert.equal(reset.failures,0);await api('/api/data',{op:'delete',ref:{collection:'enrollments',id:'gate_enrollment'}});await api('/api/data',{op:'delete',ref:{collection:'progress',id:'gate_progress'}});
});
test('video question definitions reject unsafe timeline points and invalid answers',async()=>{const base={id:'q',text:'سؤال',options:['أ','ب'],correctIndex:0,trigger_seconds:8,rewind_seconds:1,fallback_seconds:0,max_attempts:3};for(const invalid of [{trigger_seconds:10},{rewind_seconds:9},{max_attempts:0},{options:['','ب']}])assert.equal((await set('videos','invalid_gate',{course_id:'gate_course',video_duration:10,video_questions:[{...base,...invalid}]})).status,400);});
test('personal dashboard counts completed courses separately from content and includes attempts',async()=>{
 const r=await api('/api/insights/person?email=a@hub.local');assert.equal(r.status,200);assert.equal(r.data.summary.completionPercent,50);assert.equal(r.data.summary.withCertificate,1);assert.equal(r.data.summary.withoutCertificate,1);assert.equal(r.data.certificates.length,1);
 const c=r.data.courses.find(c=>c.id==='c2');assert.equal(c.items.find(v=>v.id==='v2').percent,42);assert.equal(c.items.find(v=>v.id==='s2').status,'not_started');assert.deepEqual(c.items.find(v=>v.id==='e2').attempts.map(a=>a.score),[1,2]);
});
test('own dashboards are allowed; other learners and scoped staff cannot read out-of-scope people',async()=>{
 assert.equal((await api('/api/insights/person?email=a@hub.local',undefined,learner)).status,200);assert.equal((await api('/api/insights/person?email=a@hub.local',undefined,other)).status,403);assert.equal((await api('/api/insights/person?email=b@hub.local',undefined,restricted)).status,403);
});
test('progress data has employee IDs and regional exclusions change target denominators',async()=>{
 const data=(await api('/api/insights/progress')).data;assert.equal(data.rows[0].employee_id,'101');
 const full=(await api('/api/insights/regions',{})).data;assert.equal(full.summary.percent,50);assert.equal(full.summary.remainingToTarget,1);
 const filtered=(await api('/api/insights/regions',{excludeCourses:['c2'],target:100})).data;assert.equal(filtered.summary.percent,100);assert.equal(filtered.summary.remainingToTarget,0);assert(!filtered.rows.some(r=>r.course_id==='c2'));assert.equal(filtered.regions.find(r=>r.region==='الرياض').supervisors[0].learners,1);
 assert((await api('/api/insights/progress',undefined,restricted)).data.people.every(p=>p.region==='الرياض'));
 const onlyCertificate=(await api('/api/insights/regions',{certificate:'certificate'})).data;assert.equal(onlyCertificate.summary.percent,100);assert(onlyCertificate.rows.every(r=>r.hasCertificate));const without=(await api('/api/insights/regions',{certificate:'no-certificate'})).data;assert(without.rows.every(r=>!r.hasCertificate));assert.equal(without.categories.certificate.completed,1);
});
test('Excel identifiers resolve employee IDs and emails and report unmatched rows',async()=>{
 const r=await api('/api/people/resolve',{rows:[{employee_id:'101'},{email:'b@hub.local'},{employee_id:'missing'}]});assert.equal(r.data.matched.length,2);assert.equal(r.data.unmatched.length,1);assert.equal((await api('/api/people/resolve',{rows:[]},learner)).status,403);
});
test('exam creation requires permission, validates schedules, and supports group assignment',async()=>{
 assert.equal((await api('/api/exams',exam(),learner)).status,403);assert.equal((await api('/api/exams',exam({endsAt:Date.now()-5000}))).status,400);
 const r=await api('/api/exams',exam({assignedEmails:[],groupIds:['g1']}));assert.equal(r.status,200);assert.equal((await api('/api/exams/'+r.data.id)).data.exam.assignedEmails[0],'a@hub.local');assert.equal((await api('/api/exams/'+r.data.id+'/start',{},other)).status,403);
});
test('future exams cannot be started and answers are never exposed in learner listings',async()=>{
 const r=await api('/api/exams',exam({startsAt:Date.now()+10000}));assert.equal((await api('/api/exams/'+r.data.id+'/start',{},learner)).status,409);
 const list=await api('/api/exams',undefined,learner);assert(!JSON.stringify(list.data).includes('correctIndex'));assert.equal((await api('/api/exams/options',undefined,learner)).status,403);
});
test('first-answer locking, forward page locking, and final submission are enforced on the service',async()=>{
 const id=(await api('/api/exams',exam({allowAnswerChange:false,lockPassedPages:true}))).data.id;
 const start=await api('/api/exams/'+id+'/start',{},learner);assert.equal(start.status,200);assert(!JSON.stringify(start.data).includes('correctIndex'));
 assert.equal((await api('/api/exams/'+id+'/answer',{questionId:'q2',choice:0},learner)).status,403);
 assert.equal((await api('/api/exams/'+id+'/answer',{questionId:'q1',choice:0},learner)).status,200);
 assert.equal((await api('/api/exams/'+id+'/answer',{questionId:'q1',choice:1},learner)).status,403);
 assert.equal((await api('/api/exams/'+id+'/navigate',{page:2},learner)).status,403);assert.equal((await api('/api/exams/'+id+'/navigate',{page:1},learner)).status,200);assert.equal((await api('/api/exams/'+id+'/navigate',{page:0},learner)).status,403);
 const submitted=await api('/api/exams/'+id+'/submit',{},learner);assert.equal(submitted.data.attempt.score,undefined);assert(submitted.data.attempt.submittedAt);
 assert.equal((await api('/api/exams/'+id+'/answer',{questionId:'q2',choice:0},learner)).status,409);
 assert.equal((await api('/api/exams',{id,title:'changed'})).status,409);
});
test('question navigator supports random access and editable saved answers',async()=>{
 const id=(await api('/api/exams',exam({navigationMode:'navigator',pageSize:20}))).data.id;await api('/api/exams/'+id+'/start',{},learner);
 assert.equal((await api('/api/exams/'+id+'/navigate',{page:2},learner)).status,200);assert.equal((await api('/api/exams/'+id+'/answer',{questionId:'q3',choice:1},learner)).status,200);assert.equal((await api('/api/exams/'+id+'/answer',{questionId:'q3',choice:0},learner)).status,200);
 assert.equal((await api('/api/exams/'+id+'/navigate',{page:0},learner)).status,200);assert.equal((await api('/api/exams/'+id+'/attempt',undefined,learner)).data.attempt.answers.q3,0);
});
test('closing time releases grade and optional correct/wrong review; review can be disabled later',async()=>{
 const id=(await api('/api/exams',exam({endsAt:Date.now()+700}))).data.id;await api('/api/exams/'+id+'/start',{},learner);await api('/api/exams/'+id+'/answer',{questionId:'q1',choice:0},learner);await api('/api/exams/'+id+'/submit',{},learner);
 await new Promise(r=>setTimeout(r,750));let r=await api('/api/exams/'+id+'/attempt',undefined,learner);assert.equal(r.data.attempt.score,1);assert.equal(r.data.attempt.questions[0].isCorrect,true);assert.equal(r.data.attempt.questions[1].isCorrect,false);
 assert.equal((await api('/api/exams',{id,reviewEnabled:false})).status,200);r=await api('/api/exams/'+id+'/attempt',undefined,learner);assert.equal(r.data.attempt.reviewEnabled,false);assert(!JSON.stringify(r.data.attempt).includes('correctIndex'));
});
test('expired attempts auto-submit saved answers and manager results include unstarted people',async()=>{
 const id=(await api('/api/exams',exam({endsAt:Date.now()+500,assignedEmails:['a@hub.local','b@hub.local']}))).data.id;const start=await api('/api/exams/'+id+'/start',{},learner);assert(start.data.attempt.deadlineAt<=Date.now()+500);await api('/api/exams/'+id+'/answer',{questionId:'q1',choice:0},learner);await new Promise(r=>setTimeout(r,550));const result=(await api('/api/exams/'+id+'/results')).data;assert.equal(result.results.length,2);assert(result.results.find(r=>r.person.email==='a@hub.local').attempt.autoSubmitted);assert.equal(result.results.find(r=>r.person.email==='b@hub.local').attempt,null);
});
test('generic data writes cannot tamper with scheduled examinations or attempts',async()=>{
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'scheduled_exam_attempts',id:'fake'},data:{userEmail:'a@hub.local',score:100}},learner)).status,403);assert.equal((await api('/api/data',{op:'list',ref:{collection:'scheduled_exams'}},learner)).status,403);
});
test('private path enrollment opens only the first unfinished course, then unlocks the next',async()=>{
 await set('learning_paths','path1',{title:'مسار تجريبي',status:'published',visibility:'private',rule:'sequential',courseIds:['c2','c1'],audienceUsers:['a@hub.local']});
 const denied=await api('/api/paths/path1/enroll',{},other);assert.equal(denied.status,403);const joined=await api('/api/paths/path1/enroll',{},learner);assert.equal(joined.data.firstCourseId,'c2');
 for(const videoId of ['v2','e2','s2'])await set('progress','a@hub.local_'+videoId,{userEmail:'a@hub.local',courseId:'c2',videoId,progressPercent:100,completed:'yes'});
 const home=(await api('/api/learner-home',undefined,learner)).data;assert.equal(home.paths.find(p=>p.id==='path1').completed,2);
});
test('path membership supports bulk add and exclusion/removal without deleting unrelated enrollments',async()=>{
 await set('learning_paths','path2',{title:'مسار مجموعة',status:'published',visibility:'private',rule:'sequential',courseIds:['c1'],audienceGroups:['g1']});
 assert.equal((await api('/api/paths/path2/enroll',{},learner)).status,200);
 assert.equal((await api('/api/paths/path2/members',{removeEmails:['a@hub.local'],addEmails:['b@hub.local']})).status,200);
 assert.equal((await api('/api/paths/path2/enroll',{},learner)).status,403);assert.equal((await api('/api/paths/path2/enroll',{},other)).status,200);
 assert((await api('/api/insights/person',undefined,learner)).data.courses.some(c=>c.id==='c1'));
});

test('path membership does not automatically enroll courses and enforces sequential manual enrollment',async()=>{
 for(const id of ['manual1','manual2']){await set('courses',id,{course_id:id,course_name:id,status:'active',visibility:'private'});await set('videos',id+'_v',{video_id:id+'_v',course_id:id,title:id,order:1});}
 await set('learning_paths','manual',{title:'مسار يدوي',status:'published',visibility:'private',rule:'sequential',courseIds:['manual1','manual2'],audienceUsers:['b@hub.local']});
 const joined=await api('/api/paths/manual/enroll',{},other);assert.equal(joined.data.firstCourseId,'manual1');
 let d=(await api('/api/insights/person',undefined,other)).data;assert(!d.courses.some(c=>c.id==='manual1'));
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'enrollments',id:'b@hub.local_manual2'},data:{userEmail:'b@hub.local',courseId:'manual2'}},other)).status,403);
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'enrollments',id:'b@hub.local_manual1'},data:{userEmail:'b@hub.local',courseId:'manual1'}},other)).status,200);
 await set('progress','b@hub.local_manual1_v',{userEmail:'b@hub.local',courseId:'manual1',videoId:'manual1_v',completed:'yes',progressPercent:100});
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'enrollments',id:'b@hub.local_manual2'},data:{userEmail:'b@hub.local',courseId:'manual2'}},other)).status,200);
});

test('individual review toggles only the selected completed learner, and exam deletion removes attempts',async()=>{
 const id=(await api('/api/exams',exam({endsAt:Date.now()+500}))).data.id;await api('/api/exams/'+id+'/start',{},learner);await api('/api/exams/'+id+'/answer',{questionId:'q1',choice:0},learner);await api('/api/exams/'+id+'/submit',{},learner);await new Promise(r=>setTimeout(r,550));
 assert.equal((await api('/api/exams/'+id+'/review',{email:'a@hub.local',allowed:false},learner)).status,403);
 assert.equal((await api('/api/exams/'+id+'/review',{email:'a@hub.local',allowed:false})).status,200);
 let result=(await api('/api/exams/'+id+'/attempt',undefined,learner)).data;assert.equal(result.attempt.reviewEnabled,false);assert(!JSON.stringify(result).includes('correctIndex'));
 await api('/api/exams/'+id+'/review',{email:'a@hub.local',allowed:true});result=(await api('/api/exams/'+id+'/attempt',undefined,learner)).data;assert.equal(result.attempt.reviewEnabled,true);
 assert.equal((await api('/api/exams/'+id+'/delete',{},learner)).status,403);assert.equal((await api('/api/exams/'+id+'/delete',{})).status,200);assert.equal((await api('/api/exams/'+id+'/attempt',undefined,learner)).status,403);
});

test('financial reports reconcile discounts and refunds, filter months/course/currency and preserve scoped targets',async()=>{
 await set('paid_packages','financepkg',{courseIds:['c1','c2'],title:'باقة'});
 for(const [id,data]of [['fin1',{courseId:'c1',amount:100,finalAmount:70,discountAmount:30,bonusDiscount:10,couponCode:'SAVE',createdAt:'2026-09-10T12:00:00Z',status:'paid'}],['fin2',{packageId:'financepkg',amount:100.01,finalAmount:80.01,discountAmount:20,refundAmount:10,createdAt:'2026-10-10T12:00:00Z',status:'paid'}],['fin3',{courseId:'c1',amount:50,finalAmount:50,currency:'USD',createdAt:'2026-10-10T12:00:00Z',status:'paid'}],['fin4',{courseId:'c1',amount:25,finalAmount:25,createdAt:'2026-10-10T12:00:00Z',status:'paid_fake'}],['fin5',{courseId:'c1',amount:999,createdAt:'2026-10-10T12:00:00Z',status:'pending'}]])await set('purchases',id,{userEmail:'a@hub.local',currency:'SAR',...data});
 await set('transactions','mirror',{purchaseId:'fin1',amount:70,status:'paid',createdAt:'2026-09-10T12:00:00Z'});
 const filter={months:['2026-09','2026-10'],currency:'SAR',kind:'actual'};
 let r=await api('/api/finance/report',filter);assert.equal(r.status,200);assert.equal(r.data.summary.orders,2);assert.equal(r.data.summary.net,140.01);assert.equal(r.data.summary.bonus,10);assert.equal(r.data.summary.coupon,20);assert.equal(r.data.summary.refund,10);assert.equal(r.data.summary.learners,1);
 assert.equal(r.data.summary.gross-r.data.summary.discount,r.data.summary.paid);
 await api('/api/finance/target',{month:'2026-10',currency:'SAR',target:100});await api('/api/finance/target',{month:'2026-10',currency:'SAR',courseId:'c1',target:50});
 r=await api('/api/finance/report',{...filter,months:['2026-10']});assert.equal(r.data.summary.target,100);assert.equal(r.data.summary.net,70.01);assert.equal(r.data.summary.achievement,70);
 const a=(await api('/api/finance/report',{...filter,months:['2026-10'],courseId:'c1'})).data,b=(await api('/api/finance/report',{...filter,months:['2026-10'],courseId:'c2'})).data;assert.equal(a.summary.target,50);assert.equal(Math.round((a.summary.net+b.summary.net)*100),7001);assert(a.allocation);
 assert.equal((await api('/api/finance/report',{...filter,currency:'USD'})).data.summary.net,50);
 assert.equal((await api('/api/finance/report',{...filter,kind:'demo'})).data.summary.net,25);
 assert.equal((await api('/api/finance/report',filter,learner)).status,403);assert.equal((await api('/api/finance/target',{month:'2026-10',target:1},learner)).status,403);assert.equal((await api('/api/finance/report',{months:['invalid']})).status,400);
 await set('courses','after_purchase',{course_id:'after_purchase',course_name:'دورة بعد الشراء',status:'active',visibility:'public'});
 assert.equal((await api('/api/data',{op:'set',ref:{collection:'enrollments',id:'a@hub.local_after_purchase'},data:{userEmail:'a@hub.local',courseId:'after_purchase'}},learner)).status,200,'A direct purchase without packageId must not break unrelated enrollment');
});

test('exam questions preserve a false answer through editing and grade variable-length choices',async()=>{
 const data=exam({navigationMode:'navigator',questions:[{id:'tf',text:'العبارة غير صحيحة',type:'truefalse',correctIndex:1},{id:'multi',text:'اختر السادس',options:['أ','ب','ج','د','هـ','و'],correctIndex:5}]});
 const saved=await api('/api/exams',data);assert.equal(saved.status,200);const id=saved.data.id;
 let loaded=(await api('/api/exams/'+id)).data.exam;assert.equal(loaded.questions[0].correctIndex,1);assert.equal(loaded.questions[1].options.length,6);
 assert.equal((await api('/api/exams',{...loaded,title:'بعد التعديل'})).status,200);loaded=(await api('/api/exams/'+id)).data.exam;assert.equal(loaded.questions[0].correctIndex,1);
 await api('/api/exams/'+id+'/start',{},learner);await api('/api/exams/'+id+'/answer',{questionId:'tf',choice:1},learner);await api('/api/exams/'+id+'/answer',{questionId:'multi',choice:5},learner);await api('/api/exams/'+id+'/submit',{},learner);
 assert.equal((await api('/api/exams/'+id+'/results')).data.results.find(r=>r.person.email==='a@hub.local').attempt.score,2);
 for(const options of [['نعم',''],Array(13).fill('اختيار')])assert.equal((await api('/api/exams',exam({questions:[{text:'سؤال',options,correctIndex:0}]}))).status,400);
});
