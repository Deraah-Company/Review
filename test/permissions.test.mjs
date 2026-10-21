import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {permissionLabels} from '../public/permissions.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=mkdtempSync(path.join(tmpdir(),'academy-permissions-')),base='http://127.0.0.1:43223';
let child,admin,actor;
const allOff=Object.fromEntries(Object.keys(permissionLabels).map(k=>[k,false]));
async function api(url,p,cookie=admin){const r=await fetch(base+url,{method:p===undefined?'GET':'POST',headers:{cookie:cookie||'','Content-Type':'application/json'},body:p===undefined?undefined:JSON.stringify(p)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const set=(collection,id,data,cookie=admin,merge=false)=>api('/api/data',{op:'set',ref:{collection,id},data,merge},cookie);
async function role(bits){return set('role_permissions','auditor',{permissions:{...allOff,...bits}});}
before(async()=>{
 child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:'43223',ADMIN_PASSWORD:'Test-admin-2026'},stdio:'pipe',windowsHide:true});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 admin=(await api('/api/login',{email:'admin@academy.local',password:'Test-admin-2026'},'')).cookie;
 await set('users','auditor@test.local',{email:'auditor@test.local',password:'Actor-2026',role:'auditor',status:'active',region:'الرياض'});
 actor=(await api('/api/login',{email:'auditor@test.local',password:'Actor-2026'},'')).cookie;
});
after(async()=>{await new Promise(r=>{child.once('exit',r);child.kill();});rmSync(dir,{recursive:true,force:true});});
for(const key of Object.keys(permissionLabels))test('permission on / off / user override: '+key,async()=>{
 await role({});assert.equal((await api('/api/capabilities',undefined,actor)).data.permissions[key],false);
 await role({[key]:true});assert.equal((await api('/api/capabilities',undefined,actor)).data.permissions[key],true);
 await set('user_permissions','auditor@test.local',{overrides:{[key]:false}});assert.equal((await api('/api/capabilities',undefined,actor)).data.permissions[key],false);
 await api('/api/data',{op:'delete',ref:{collection:'user_permissions',id:'auditor@test.local'}});
});
const writes=[
 ['qa.manage','qa','managed-question',{id:'managed-question',userEmail:'other@test.local',question:'Question',visibility:'public',answer:'Official answer'}],
 ['users.manage','users','managed@test.local',{email:'managed@test.local',role:'trainee',status:'active',password:'Managed-2026'}],
 ['content.courses.create','courses','managed',{course_id:'managed',status:'draft',created_by:'auditor@test.local'}],
 ['content.packages.manage','paid_packages','managed',{title:'Package'}],
 ['content.sessions.manage','sessions','managed',{title:'Session'}],
 ['content.rooms.manage','conference_rooms','managed',{name:'Room'}],
 ['content.surveys.manage','survey_library','managed',{title:'Survey'}],
 ['question_bank.manage','question_bank','managed',{question:'Question'}],
 ['points.weights','settings','points',{video:3}],
 ['points.grant','points_log','managed',{userEmail:'other@test.local',delta:10}],
 ['style.manage','settings','academy',{academy_name:'Permitted'}],
 ['partners.manage','settings','academy_extra',{partners:[{name:'Partner'}]}],
 ['announcements.manage','announcements','managed',{title:'Announcement'}],
 ['utility.certificates','certificate_templates','managed',{name:'Template'}],
 ['utility.coupons','coupons','managed',{code:'TEST'}],
 ['utility.faq','faqs','managed',{question:'Question'}],
 ['tech_support.answer','tech_support_tickets','managed',{userEmail:'other@test.local',answer:'Answer'}],
 ['groups.manage','groups','managed',{group_name:'Group',members:[]}],
 ['permissions.manage','user_permissions','other@test.local',{permissions:{'groups.manage':true}}],
 ['users.registration.approve','registration_requests','managed@test.local',{email:'managed@test.local',status:'approved'}],
 ['content.enrollment.approve','enrollments','managed',{userEmail:'other@test.local',courseId:'managed'}],
 ['progress.view','progress','managed',{userEmail:'other@test.local',courseId:'managed',progressPercent:100}],
 ['dashboard.view','settings','admin_dashboard',{layout:[]}]
];
for(const [key,collection,id,data]of writes)test('server enforces '+key+' for '+collection,async()=>{
 await role({});assert.equal((await set(collection,id,data,actor)).status,403);
 await role({[key]:true});assert.equal((await set(collection,id,data,actor)).status,200);
 await role({});assert.equal((await set(collection,id,{...data,title:'Denied'},actor)).status,403);
});
test('course approval and deletion have independent permissions',async()=>{
 await set('courses','approval',{status:'draft',approval_status:'pending_review'});await role({});
 const payload={op:'set',ref:{collection:'courses',id:'approval'},merge:true,data:{status:'active',approval_status:'approved'}};
 assert.equal((await api('/api/data',payload,actor)).status,403);await role({'content.courses.approve':true});assert.equal((await api('/api/data',payload,actor)).status,200);
 await role({});assert.equal((await api('/api/data',{op:'delete',ref:{collection:'courses',id:'approval'}},actor)).status,403);await role({'content.courses.delete':true});assert.equal((await api('/api/data',{op:'delete',ref:{collection:'courses',id:'approval'}},actor)).status,200);
});
test('progress region scope restricts reads and writes',async()=>{
 await set('users','other@test.local',{email:'other@test.local',role:'trainee',region:'الخليج',status:'active'});
 await set('role_permissions','auditor',{permissions:{...allOff,'progress.view':true},progressScope:{all:false,regions:['الرياض'],users:[],groups:[],courses:[]}});
 assert.equal((await set('progress','outside',{userEmail:'other@test.local',courseId:'managed'},actor)).status,403);
});
test('group and region chats enforce both permissions and audience scope',async()=>{
 await role({});const region={chatId:'region:الرياض',audienceType:'region',audienceId:'الرياض',fromEmail:'auditor@test.local',body:'Hello'};
 assert.equal((await set('chat_messages','r1',region,actor)).status,403);await role({'communication.chat.region':true});assert.equal((await set('chat_messages','r1',region,actor)).status,200);
 assert.equal((await set('chat_messages','r2',{...region,audienceId:'الخليج'},actor)).status,403);
 await set('groups','mine',{members:['auditor@test.local']});await role({'communication.chat.group':true});assert.equal((await set('chat_messages','g1',{...region,audienceType:'group',audienceId:'mine',chatId:'group:mine'},actor)).status,200);
});
test('general settings enforce chat, profile and rating restrictions',async()=>{
 await set('users','learner@test.local',{email:'learner@test.local',password:'Learner-2026',role:'trainee',status:'active'});const cookie=(await api('/api/login',{email:'learner@test.local',password:'Learner-2026'},'')).cookie;
 await set('settings','academy_extra',{general:{disableChat:true,preventProfileEdit:true,allowRatingEdit:false}});
 assert.equal((await set('users','learner@test.local',{full_name:'Blocked'},cookie,true)).status,403);
 assert.equal((await set('chat_messages','private',{fromEmail:'learner@test.local',toEmail:'admin@academy.local',body:'Blocked'},cookie)).status,403);
 await set('ratings','rating',{userEmail:'learner@test.local',rating:5});assert.equal((await set('ratings','rating',{userEmail:'learner@test.local',rating:4},cookie)).status,403);
});
test('group manager permission updates managers independently of group editing',async()=>{
 await set('groups','managed-scope',{group_name:'Group',manager_emails:[]});await role({'groups.managers':true});
 assert.equal((await set('groups','managed-scope',{manager_emails:['auditor@test.local']},actor,true)).status,200);
 assert.equal((await set('groups','managed-scope',{group_name:'Not permitted'},actor,true)).status,403);
});
test('private trainee chat respects all, region and group permission bands',async()=>{
 await set('settings','academy_extra',{general:{disableChat:false}});await set('users','peer@test.local',{email:'peer@test.local',role:'trainee',region:'الرياض',status:'active'});
 const msg={fromEmail:'auditor@test.local',toEmail:'peer@test.local',body:'Hello'};
 await role({'communication.chat.private':true});assert.equal((await set('chat_messages','scope1',msg,actor)).status,403);
 for(const [key,id]of [['communication.chat.trainees.all','scope2'],['communication.chat.trainees.region','scope3'],['communication.chat.trainees.group','scope4']]){
  if(key.endsWith('group'))await set('groups','shared-chat',{members:['auditor@test.local','peer@test.local']});
  await role({'communication.chat.private':true,[key]:true});assert.equal((await set('chat_messages',id,msg,actor)).status,200);
 }
});
test('leaderboard permission includes points without exposing personal contact data',async()=>{
 await set('users','peer@test.local',{points:30,phone:'private-phone'},admin,true);await role({'points.leaderboard':true});
 const r=await api('/api/data',{op:'get',ref:{collection:'users',id:'peer@test.local'}},actor);assert.equal(r.data.data.points,30);assert.equal(r.data.data.phone,undefined);
});
test('private questions stay with the author; only a question manager can answer or publish',async()=>{
 await role({});
 await set('qa','private-question',{id:'private-question',userEmail:'other@test.local',question:'Private question',visibility:'private',answer:'',responses:[]});
 let response=await api('/api/data',{op:'list',ref:{collection:'qa'}},actor);assert(!response.data.rows.some(r=>r.id==='private-question'));
 assert.equal((await set('qa','private-question',{visibility:'public'},actor,true)).status,403);
 await set('qa','own-question',{id:'own-question',userEmail:'auditor@test.local',question:'Own question',visibility:'private',answer:'',followups:[]});
 assert.equal((await set('qa','own-question',{visibility:'public'},actor,true)).status,403);
 assert.equal((await set('qa','own-question',{answer:'Forged answer'},actor,true)).status,403);
 assert.equal((await set('qa','own-question',{followups:[{text:'Follow-up'}],status:'pending'},actor,true)).status,200);
 await role({'qa.manage':true});assert.equal((await set('qa','private-question',{answer:'Official reply',visibility:'public'},actor,true)).status,200);
 await role({});response=await api('/api/data',{op:'list',ref:{collection:'qa'}},actor);assert(response.data.rows.some(r=>r.id==='private-question'));
 await set('qa','private-question',{visibility:'private'},admin,true);response=await api('/api/data',{op:'list',ref:{collection:'qa'}},actor);assert(!response.data.rows.some(r=>r.id==='private-question'));
});
test('saving a full user permission form clears stale overrides while preserving scopes',async()=>{
 await role({});await set('user_permissions','auditor@test.local',{permissions:{'users.manage':true},overrides:{'users.manage':true},chatScope:{regions:['Riyadh']}});
 await set('user_permissions','auditor@test.local',{permissions:{'users.manage':false},overrides:{}},admin,true);
 assert.equal((await api('/api/capabilities',undefined,actor)).data.permissions['users.manage'],false);
 assert.deepEqual((await api('/api/capabilities',undefined,actor)).data.chatScope.regions,['Riyadh']);
 await api('/api/data',{op:'delete',ref:{collection:'user_permissions',id:'auditor@test.local'}});
});
test('support ticket visibility permission controls creation independently of replying',async()=>{
 const ticket={trainerEmail:'auditor@test.local',requesterEmail:'auditor@test.local',subject:'Test support',description:'A question',messages:[]};
 await role({});assert.equal((await set('tech_support_tickets','own-support',ticket,actor)).status,403);
 await role({'tech_support.visible':true});assert.equal((await set('tech_support_tickets','own-support',ticket,actor)).status,200);
 assert.equal((await set('tech_support_tickets','own-support',{answer:'Support impersonation'},actor,true)).status,403);
});
test('demo enrollment conditions enforce approval, prerequisites and expiry',async()=>{
 const cookie=(await api('/api/login',{email:'learner@test.local',password:'Learner-2026'},'')).cookie;
 await set('courses','needs-approval',{course_id:'needs-approval',status:'active',visibility:'public',rules:{approvalRequired:true}});
 const enrollment={userEmail:'learner@test.local',courseId:'needs-approval'};
 assert.equal((await set('enrollments','learner@test.local_needs-approval',enrollment,cookie)).status,403);
 await set('course_enrollment_requests','approved-request',{...enrollment,status:'approved'});assert.equal((await set('enrollments','learner@test.local_needs-approval',enrollment,cookie)).status,200);
 await set('courses','prereq-locked',{course_id:'prereq-locked',status:'active',visibility:'public',prerequisite:'not-completed'});assert.equal((await set('enrollments','prereq-locked',{userEmail:'learner@test.local',courseId:'prereq-locked'},cookie)).status,403);
 await set('courses','expired',{course_id:'expired',status:'active',visibility:'public',end_date:'2020-01-01'});assert.equal((await set('enrollments','expired',{userEmail:'learner@test.local',courseId:'expired'},cookie)).status,403);
});

test('partner and academy style permissions cannot be combined to bypass one another',async()=>{
 await set('settings','academy_extra',{partners:[],general:{disableChat:false}});
 await role({'partners.manage':true});
 assert.equal((await set('settings','academy_extra',{partners:[{name:'Allowed'}]},actor,true)).status,200);
 assert.equal((await set('settings','academy_extra',{partners:[{name:'Changed'}],general:{disableChat:true}},actor,true)).status,403);
 assert.equal((await api('/api/data',{op:'delete',ref:{collection:'settings',id:'academy_extra'}},actor)).status,403);
 await role({'style.manage':true});
 assert.equal((await set('settings','academy_extra',{general:{disableChat:true}},actor,true)).status,200);
 assert.equal((await set('settings','academy_extra',{partners:[],general:{disableChat:false}},actor,true)).status,403);
});
