import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
// Checkout tests below use the same isolated database and trainee session.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir=mkdtempSync(path.join(tmpdir(),'academy-test-'));
const port=Number(process.env.TEST_PORT||43219),url=`http://127.0.0.1:${port}`;
let child,adminCookie,traineeCookie;
async function api(endpoint,p,cookie=adminCookie,headers={}){
  const r=await fetch(url+endpoint,{method:p===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),'Content-Type':'application/json',...headers},body:p===undefined?undefined:JSON.stringify(p)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const ref=(collection,id)=>({collection,...(id?{id}:{})});
const set=(collection,id,data,merge=false,cookie=adminCookie)=>api('/api/data',{op:'set',ref:ref(collection,id),data,merge},cookie);
const get=(collection,id,cookie=adminCookie)=>api('/api/data',{op:'get',ref:ref(collection,id)},cookie);
before(async()=>{
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:String(port),ADMIN_PASSWORD:'Test-admin-2026'},stdio:'pipe',windowsHide:true});
  let log='';child.stderr.on('data',x=>log+=x);
  for(let i=0;i<100;i++){try{if((await api('/api/health',undefined,'')).status===200)break;}catch{}if(i===99)throw Error('Server not ready '+log);await new Promise(r=>setTimeout(r,50));}
  const login=await api('/api/login',{email:'admin@academy.local',password:'Test-admin-2026'},'');assert.equal(login.status,200);adminCookie=login.cookie;
});
after(async()=>{child?.kill();await new Promise(r=>child?.once('exit',r));rmSync(dir,{recursive:true,force:true});});
test('authentication rejects invalid credentials and protects private data',async()=>{
  assert.equal((await api('/api/login',{email:'admin@academy.local',password:'wrong'},'')).status,401);
  assert.equal((await get('users','admin@academy.local','')).status,401);
  assert.equal((await api('/api/session',undefined,adminCookie)).data.user.role,'admin');
});
test('create users; passwords stored as hashes and omitted from API',async()=>{
  assert.equal((await set('users','trainee@test.local',{email:'trainee@test.local',full_name:'Test Trainee',password:'Trainee-2026',role:'trainee',status:'active'})).status,200);
  const user=(await get('users','trainee@test.local')).data.data;assert.equal(user.password,undefined);assert.equal(user._passwordHash,undefined);
  const readDb=new DatabaseSync(path.join(dir,'academy.sqlite'));const raw=readDb.prepare("SELECT data FROM documents WHERE collection='users' AND id='trainee@test.local'").get().data;readDb.close();assert(!raw.includes('Trainee-2026'));assert(raw.includes('_passwordHash'));
  const login=await api('/api/login',{email:'trainee@test.local',password:'Trainee-2026'},'');assert.equal(login.status,200);traineeCookie=login.cookie;
});
test('document create, filtered list, nested merge, field removal and update',async()=>{
  await set('courses','c1',{course_id:'c1',name:'Before',status:'active',nested:{a:1,b:2},obsolete:1});
  await set('courses','c1',{name:'After',nested:{a:3},obsolete:{__local_delete_field__:true}},true);
  const c=(await get('courses','c1')).data.data;assert.equal(c.name,'After');assert.deepEqual(c.nested,{a:3,b:2});assert.equal(c.obsolete,undefined);
  const list=await api('/api/data',{op:'list',ref:{collection:'courses',filters:[{field:'name',op:'==',value:'After'}]}});assert.equal(list.data.rows.length,1);
  assert.equal((await api('/api/data',{op:'update',ref:ref('courses','missing'),data:{x:1}})).status,404);
});
test('atomic batches roll back all changes on failure',async()=>{
  const result=await api('/api/batch',{ops:[{op:'set',ref:ref('groups','rollback'),data:{name:'x'}},{op:'update',ref:ref('groups','missing'),data:{name:'bad'}}]});assert.equal(result.status,404);assert.equal((await get('groups','rollback')).data.data,null);
  assert.equal((await api('/api/batch',{ops:[{op:'set',ref:ref('groups','g1'),data:{name:'Group'}},{op:'set',ref:ref('enrollments','e1'),data:{userEmail:'trainee@test.local',courseId:'c1'}}]})).status,200);
});
test('trainee may save own progress but cannot change roles, other progress, or courses',async()=>{
  assert.equal((await set('progress','p1',{userEmail:'trainee@test.local',courseId:'c1',progressPercent:100},false,traineeCookie)).status,200);
  assert.equal((await set('progress','p2',{userEmail:'other@test.local'},false,traineeCookie)).status,403);
  assert.equal((await set('courses','c1',{name:'Hacked'},true,traineeCookie)).status,403);
  assert.equal((await set('users','trainee@test.local',{role:'admin'},true,traineeCookie)).status,403);
  assert.equal((await set('users','trainee@test.local',{full_name:'Updated'},true,traineeCookie)).status,200);
});
test('chat privacy and message read receipts',async()=>{
  await set('chat_messages','m1',{fromEmail:'admin@academy.local',toEmail:'trainee@test.local',text:'hello'});
  await set('chat_messages','m2',{fromEmail:'admin@academy.local',toEmail:'other@test.local',text:'private'});
  const result=await api('/api/data',{op:'list',ref:ref('chat_messages')},traineeCookie);assert.deepEqual(result.data.rows.map(x=>x.id),['m1']);
  assert.equal((await set('chat_messages','m1',{read:true},true,traineeCookie)).status,200);
  assert.equal((await set('chat_messages','m1',{text:'changed'},true,traineeCookie)).status,403);
});
test('trainee enrollment works for a public free course and rejects locked courses',async()=>{
  await set('courses','free',{course_id:'free',status:'active',visibility:'public'});
  await set('courses','private',{course_id:'private',status:'active',visibility:'private'});
  await set('courses','paid',{course_id:'paid',status:'active',visibility:'public',price:100});
  assert.equal((await set('enrollments','trainee@test.local_free',{userEmail:'trainee@test.local',courseId:'free'},false,traineeCookie)).status,200);
  assert.equal((await set('enrollments','trainee@test.local_private',{userEmail:'trainee@test.local',courseId:'private'},false,traineeCookie)).status,403);
  assert.equal((await set('enrollments','trainee@test.local_paid',{userEmail:'trainee@test.local',courseId:'paid'},false,traineeCookie)).status,403);
});
test('rewards may be claimed once for a completed action',async()=>{
  assert.equal((await set('users','trainee@test.local',{points:5},true,traineeCookie)).status,200);
  assert.equal((await set('users','trainee@test.local',{points:10},true,traineeCookie)).status,200);
  assert.equal((await set('users','trainee@test.local',{points:15},true,traineeCookie)).status,403);
  assert.equal((await set('users','trainee@test.local',{points:50000},true,traineeCookie)).status,403);
});
test('path certificate requires completion of every linked course',async()=>{
  await set('videos','v-free',{video_id:'v-free',course_id:'free',content_type:'video'});
  await set('learning_paths','p-free',{courseIds:['free']});
  const certificate={userEmail:'trainee@test.local',courseId:'path_p-free',courseName:'Path Certificate'};
  assert.equal((await set('certificates','trainee@test.local_path_p-free',certificate,false,traineeCookie)).status,403);
  await set('progress','trainee@test.local_v-free',{userEmail:'trainee@test.local',courseId:'free',videoId:'v-free',completed:'yes',progressPercent:100});
  assert.equal((await set('certificates','trainee@test.local_path_p-free',certificate,false,traineeCookie)).status,200);
});
test('registration cannot grant itself administrative access',async()=>{
  assert.equal((await set('registration_requests','r1',{email:'new@test.local',role:'trainee'},false,'')).status,200);
  assert.equal((await set('registration_requests','r2',{email:'hacker@test.local',role:'admin'},false,'')).status,401);
  assert.equal((await set('users','hacker@test.local',{role:'admin'},false,'')).status,401);
});
test('presence is owned by the logged-in user',async()=>{
  assert.equal((await api('/api/presence',{op:'set',path:'presence/trainee',data:{email:'trainee@test.local',state:'online'}},traineeCookie)).status,200);
  assert.equal((await api('/api/presence',{op:'set',path:'presence/admin',data:{email:'admin@academy.local',state:'online'}},traineeCookie)).status,403);
  assert.equal((await api('/api/presence',{op:'get',path:'presence'},traineeCookie)).data.data.trainee.state,'online');
});
test('uploads persist and support authenticated media range requests',async()=>{
  const r=await fetch(url+'/api/upload',{method:'POST',headers:{cookie:adminCookie,'X-File-Name':'sample.mp4','Content-Type':'video/mp4'},body:Buffer.from('0123456789')});assert.equal(r.status,200);const upload=await r.json();
  const range=await fetch(url+upload.url,{headers:{cookie:traineeCookie,Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(await range.text(),'2345');
  assert.equal((await fetch(url+upload.url)).status,401);
  assert.equal((await fetch(url+'/api/upload',{method:'POST',headers:{cookie:adminCookie,'X-File-Name':'bad.html'},body:'bad'})).status,400);
});
test('cross-origin mutation is rejected',async()=>{
  assert.equal((await api('/api/data',{op:'set',ref:ref('courses','csrf'),data:{}},adminCookie,{Origin:'https://example.com'})).status,403);
});
test('content rules block video, PDF, questions, exams, surveys and direct media until prerequisites complete',async()=>{
  await set('courses','rules-http',{content_sequence:'open'});
  await set('videos','rules-base',{course_id:'rules-http',video_id:'rules-base',require_previous:'no',order:1});
  const upload=await fetch(url+'/api/upload',{method:'POST',headers:{cookie:adminCookie,'X-File-Name':'rules-test.webm'},body:readFileSync(path.join(root,'demo-assets/lesson.webm'))});const media=await upload.json();assert.equal(upload.status,200);
  for(const type of ['video','pdf','question','exam','survey']){
    const id='rules-'+type;
    assert.equal((await set('videos',id,{course_id:'rules-http',video_id:id,content_type:type,video_url:type==='video'?media.url:'',order:2,access_rules:{required_items:['rules-base']}})).status,200);
    assert.equal((await set('progress','trainee@test.local_'+id,{userEmail:'trainee@test.local',courseId:'rules-http',videoId:id,progressPercent:100,completed:'yes'},false,traineeCookie)).status,403,type);
  }
  assert.equal((await set('assessment_attempts','blocked-attempt',{userEmail:'trainee@test.local',courseId:'rules-http',videoId:'rules-exam'},false,traineeCookie)).status,403);
  assert.equal((await set('survey_answers','blocked-survey',{userEmail:'trainee@test.local',courseId:'rules-http',videoId:'rules-survey'},false,traineeCookie)).status,403);
  assert.equal((await fetch(url+media.url,{headers:{cookie:traineeCookie}})).status,403);
  assert.equal((await set('progress','trainee@test.local_rules-base',{userEmail:'trainee@test.local',courseId:'rules-http',videoId:'rules-base',completed:'yes',progressPercent:100},false,traineeCookie)).status,200);
  for(const type of ['video','pdf','question','exam','survey'])assert.equal((await set('progress','trainee@test.local_rules-'+type,{userEmail:'trainee@test.local',courseId:'rules-http',videoId:'rules-'+type,completed:'yes',progressPercent:100},false,traineeCookie)).status,200,type);
  assert.equal((await fetch(url+media.url,{headers:{cookie:traineeCookie}})).status,200);
});
test('atomic rule edits validate the final graph and roll back cycles; course deletion removes linked items',async()=>{
  await set('courses','rule-batch',{content_sequence:'open'});
  const batch=await api('/api/batch',{ops:[{op:'set',ref:ref('videos','rule-a'),data:{course_id:'rule-batch',video_id:'rule-a',access_rules:{required_items:['rule-b']}}},{op:'set',ref:ref('videos','rule-b'),data:{course_id:'rule-batch',video_id:'rule-b',require_previous:'no'}}]});assert.equal(batch.status,200);
  const cycle=await api('/api/batch',{ops:[{op:'set',ref:ref('videos','rule-b'),merge:true,data:{access_rules:{required_items:['rule-a']}}}]});assert.equal(cycle.status,400);assert.equal((await get('videos','rule-b')).data.data.access_rules,undefined);
  const removal=await api('/api/batch',{ops:[{op:'delete',ref:ref('courses','rule-batch')},{op:'delete',ref:ref('videos','rule-a')},{op:'delete',ref:ref('videos','rule-b')}]});assert.equal(removal.status,200);assert.equal((await get('videos','rule-a')).data.data,null);
});
test('password change invalidates existing sessions',async()=>{
  assert.equal((await api('/api/password',{oldPassword:'wrong',newPassword:'Trainee-New-2026'},traineeCookie)).status,403);
  assert.equal((await api('/api/password',{oldPassword:'Trainee-2026',newPassword:'Trainee-New-2026'},traineeCookie)).status,200);
  assert.equal((await api('/api/session',undefined,traineeCookie)).data.user,null);
  assert.equal((await api('/api/login',{email:'trainee@test.local',password:'Trainee-New-2026'},'')).status,200);
});
test('data survive a server restart',async()=>{
  await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:String(port)},stdio:'pipe',windowsHide:true});
  for(let i=0;i<100;i++){try{if((await api('/api/health',undefined,'')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  assert.equal((await get('courses','c1')).data.data.name,'After');
});
test('logout revokes the server session',async()=>{
  assert.equal((await api('/api/logout',{},adminCookie)).status,200);assert.equal((await api('/api/session',undefined,adminCookie)).data.user,null);
});

test('checkout validates coupon audience, course, dates, status, currency and percentage',async()=>{
  adminCookie=(await api('/api/login',{email:'admin@academy.local',password:'Test-admin-2026'},'')).cookie;
  const login=await api('/api/login',{email:'trainee@test.local',password:'Trainee-New-2026'},'');assert.equal(login.status,200);traineeCookie=login.cookie;
  await set('courses','coupon-course',{course_id:'coupon-course',course_name:'Coupon course',status:'active',approval_status:'approved',visibility:'public',pricing:{isPaid:true,price:200,currency:'SAR'}});
  for(const [id,extra]of [['valid',{}],['disabled',{active:false}],['expired',{expiresAt:'2020-01-01'}],['future',{startsAt:'2099-01-01'}],['wrong-course',{courseId:'another'}],['wrong-person',{userEmails:['someone@else.local']}],['wrong-currency',{currency:'USD'}],['bad-percent',{percent:110}]]){
    await set('coupons',id,{code:id,percent:25,active:true,maxDiscount:30,usageLimit:1,...extra});
    const r=await api('/api/checkout/preview',{itemType:'course',id:'coupon-course',couponCode:id},traineeCookie);
    if(id==='valid'){assert.equal(r.status,200);assert.equal(r.data.discountAmount,30);assert.equal(r.data.finalAmount,170);}else assert.equal(r.status,400,id);
  }
});
test('checkout commits purchase, enrollment and coupon usage once; replay is idempotent',async()=>{
  const input={itemType:'course',id:'coupon-course',couponCode:'valid',token:'checkout-test-token-0001'};
  const r=await api('/api/checkout/simulate',input,traineeCookie);assert.equal(r.status,200);assert.equal(r.data.purchase.status,'paid_fake');assert.equal(r.data.purchase.finalAmount,170);
  assert((await get('enrollments','trainee@test.local_coupon-course')).data.data);
  assert.equal((await get('coupons','valid')).data.data.used,1);
  assert.equal((await api('/api/checkout/simulate',input,traineeCookie)).data.alreadyProcessed,true);
  assert.equal((await get('coupons','valid')).data.data.used,1);
  assert.equal((await api('/api/checkout/preview',{...input},traineeCookie)).status,400);
});
test('checkout rolls back discount usage and purchase if course enrollment requirements fail',async()=>{
  await set('courses','coupon-approval',{course_id:'coupon-approval',course_name:'Approval course',status:'active',approval_status:'approved',visibility:'public',pricing:{isPaid:true,price:100,currency:'SAR'},rules:{approvalRequired:true}});
  await set('coupons','rollback',{code:'rollback',percent:10,active:true,usageLimit:1});
  const token='checkout-rollback-0001',r=await api('/api/checkout/simulate',{itemType:'course',id:'coupon-approval',couponCode:'rollback',token},traineeCookie);assert.equal(r.status,403);
  assert.equal((await get('purchases','trainee@test.local|'+token)).data.data,null);assert.equal((await get('coupons','rollback')).data.data.used,undefined);
});
test('checkout rejects an unpublished trainer draft and never trusts a client supplied price',async()=>{
  await set('courses','coupon-draft',{course_id:'coupon-draft',status:'draft',approval_status:'pending_review',pricing:{price:200,isPaid:true}});
  assert.equal((await api('/api/checkout/preview',{itemType:'course',id:'coupon-draft'},traineeCookie)).status,403);
  const r=await api('/api/checkout/preview',{itemType:'course',id:'coupon-course',price:1,amount:1,finalAmount:1},traineeCookie);assert.equal(r.status,200);assert.equal(r.data.amount,200);assert.equal(r.data.finalAmount,200);
});
