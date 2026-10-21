import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdirSync,existsSync,statSync,createReadStream,createWriteStream,readFileSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolvePermissions,readPermissions,writePermission,permissionLabels} from './public/permissions.js';
import {unmetPrerequisites,validateContentRules} from './public/access-rules.js';
import {createLearningService} from './learning-service.mjs';
import {createFinanceService} from './finance-service.mjs';
import {createCheckoutService} from './checkout-service.mjs';
import {courseAvailability} from './public/course-policy.js';
import {validateVideoGates,gateRevision} from './public/video-gates.js';

const base=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.resolve(process.env.DATA_DIR||path.join(base,'data'));
mkdirSync(path.join(dataDir,'uploads'),{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'academy.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS documents(collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(collection,id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS presence(id TEXT PRIMARY KEY,data TEXT NOT NULL,seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,owner TEXT NOT NULL);`);
db.exec('CREATE TABLE IF NOT EXISTS rewards(email TEXT NOT NULL,item TEXT NOT NULL,amount INTEGER NOT NULL,PRIMARY KEY(email,item))');
const one=db.prepare('SELECT data FROM documents WHERE collection=? AND id=?');
const all=db.prepare('SELECT id,data FROM documents WHERE collection=? ORDER BY rowid');
let learningRevision=0;
const indexedLearningCollections=new Set(['users','courses','videos','progress','enrollments','certificates','certificate_templates','role_permissions','user_permissions','learning_paths']);
const putStatement=db.prepare('INSERT INTO documents(collection,id,data) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data');
const put={run(...args){if(indexedLearningCollections.has(args[0]))learningRevision++;return putStatement.run(...args);}};
const removeStatement=db.prepare('DELETE FROM documents WHERE collection=? AND id=?');
const remove={run(...args){if(indexedLearningCollections.has(args[0]))learningRevision++;return removeStatement.run(...args);}};
db.exec(`CREATE INDEX IF NOT EXISTS documents_user_email ON documents(collection,lower(json_extract(data,'$.userEmail')));
CREATE INDEX IF NOT EXISTS documents_email ON documents(collection,lower(json_extract(data,'$.email')));`);
const ownStatement=db.prepare("SELECT id,data FROM documents WHERE collection=? AND (lower(json_extract(data,'$.userEmail'))=? OR lower(json_extract(data,'$.email'))=?)");
const forUser=(collection,email)=>ownStatement.all(collection,email,email).map(x=>({id:x.id,data:JSON.parse(x.data)}));
const entityData=(collection,id,data)=>collection==='courses'?{...data,course_id:id}:collection==='videos'?{...data,video_id:id}:data;
const get=(collection,id)=>{if(id===undefined||id===null)return null;const row=one.get(collection,id);return row?entityData(collection,id,JSON.parse(row.data)):null;};
const rows=collection=>all.all(collection).map(x=>({id:x.id,data:entityData(collection,x.id,JSON.parse(x.data))}));
const passwordHash=password=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(String(password),salt,64).toString('hex')}`;};
function validPassword(password,hash){try{const [salt,key]=hash.split(':');const actual=scryptSync(String(password),salt,64);const expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
const adminEmail=(process.env.ADMIN_EMAIL||'admin@academy.local').toLowerCase();
if(!rows('users').some(x=>x.data.role==='admin')) {
  const password=process.env.ADMIN_PASSWORD||randomBytes(12).toString('base64url');
  put.run('users',adminEmail,JSON.stringify({email:adminEmail,full_name:'مدير الأكاديمية',role:'admin',status:'active',points:0,_passwordHash:passwordHash(password)}));
  if(!process.env.ADMIN_PASSWORD)console.log(`First administrator: ${adminEmail}\nTemporary password: ${password}`);
}
const safeUser=(data,user)=>{if(!data)return null;const {_passwordHash,...rest}=data;delete rest.password;return rest;};
const isManager=user=>user?.role==='admin'||user?.role==='trainer';
const capabilities=user=>user?resolvePermissions(user,get('role_permissions',user.role)||{},get('user_permissions',user.email)||{}):{};
const can=(user,key)=>user?.role==='admin'||capabilities(user)[key]===true;
const any=(user,keys)=>keys.some(k=>can(user,k));
function scopeFilter(user,people){
 if(user.role==='admin')return ()=>true;
 const role=get('role_permissions',user.role)||{},custom=get('user_permissions',user.email)||{},scope=custom.progressScope||role.progressScope;
 if(!scope||scope.all!==false)return ()=>true;
 return data=>{const email=data.userEmail||data.email||data.user_email||'',person=people?.get(email)||get('users',email)||data;
 return (!scope.users?.length||scope.users.includes(email))&&(!scope.regions?.length||scope.regions.includes(person.region))&&(!scope.groups?.length||scope.groups.includes(person.group))&&(!scope.courses?.length||scope.courses.includes(data.courseId||data.course_id));};
}
function withinScope(user,data){return scopeFilter(user)(data);}
function audienceAllowed(user,type,id){
 if(user?.role==='admin')return true;if(!can(user,'communication.chat.'+type))return false;
 const scope={...(get('role_permissions',user.role)?.chatScope||{}),...(get('user_permissions',user.email)?.chatScope||{})};
 if(type==='region')return scope.regionsAll===true||(scope.regions?.length?scope.regions.includes(id):user.region===id);
 if(type==='group'){const group=get('groups',id);return scope.groupsAll===true||scope.groups?.includes(id)||group?.members?.includes(user.email)||user.group===id||user.group===group?.group_name;}
 return false;
}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function session(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(x=>x.startsWith('academy_session='))?.slice(16);if(!token)return null;const row=db.prepare('SELECT email FROM sessions WHERE token=? AND expires>?').get(token,Date.now());if(!row)return null;const user=get('users',row.email);return user&&user.status==='active'?user:null;}
const publicRead=new Set(['settings','courses','paid_packages','faqs','announcements','learning_paths','sessions','conference_rooms','certificate_templates']);
const adminOnly=new Set(['user_permissions','role_permissions','settings','coupons','point_bonuses','points_log']);
const ownCollections=new Set(['progress','assessment_attempts','survey_answers','ratings','session_attendance','notifications','video_likes','enrollments','certificates','tech_support_tickets','user_tasks','purchases','transactions','course_enrollment_requests']);
function owns(data,user){return data&&(data.userEmail===user.email||data.email===user.email||data.user_email===user.email||data.traineeEmail===user.email||data.trainerEmail===user.email||data.createdBy===user.email||data.created_by===user.email);}
function readable(collection,id,data,user){
  if(!user)return publicRead.has(collection);
  if(user.role==='admin')return true;
  if(collection==='qa')return owns(data,user)||data.visibility==='public'||can(user,'qa.manage')&&(user.role!=='trainer'||get('courses',data.courseId)?.created_by===user.email);
  if(collection==='role_permissions')return id===user.role||can(user,'permissions.manage');
  if(collection==='user_permissions')return id===user.email||can(user,'permissions.manage');
  if(any(user,readPermissions[collection]||[]))return ['progress','enrollments','assessment_attempts','survey_answers','certificates','points_log'].includes(collection)?withinScope(user,data):true;
  if(collection==='users')return true; // User directory for the existing chat and community UI; credentials are removed below.
  if(collection==='chat_messages')return data.audienceType?audienceAllowed(user,data.audienceType,data.audienceId):(can(user,'communication.chat.private')||can(user,'tech_support.answer'))&&(data.fromEmail===user.email||data.toEmail===user.email);
  if(collection==='groups'&&can(user,'communication.chat.group'))return audienceAllowed(user,'group',id);
  if(ownCollections.has(collection))return owns(data,user);
  if(collection==='registration_requests'||collection==='user_permissions')return owns(data,user)||id===user.email;
  if(collection==='activity_log')return owns(data,user)||data.actorEmail===user.email;
  return !readPermissions[collection]||['courses','videos','learning_paths','announcements','paid_packages','sessions','conference_rooms','certificate_templates','course_surveys','faqs'].includes(collection);
}
function writable(collection,id,next,old,user,op){
  if(!user){if(collection==='registration_requests'&&op==='set'&&!old&&next.email&&next.role!=='admin'){
    const cfg=get('settings','registration');if(cfg?.enabled===false)fail('التسجيل الذاتي متوقف',403);
    if(get('settings','academy_extra')?.general?.forceRegistrationFields){const required=Object.entries(cfg?.fields||{full_name:true}).filter(([,enabled])=>enabled).map(([key])=>key);if(required.some(key=>!String(next[key]||'').trim()))fail('أكمل حقول التسجيل المطلوبة');}
    return;
  }fail('سجل الدخول أولاً',401);}
  if(user.role==='admin')return;
  if(collection==='qa'){
    if(can(user,'qa.manage')){if(user.role==='trainer'&&get('courses',(old||next)?.courseId)?.created_by!==user.email)fail('السؤال تابع لدورة مدرب آخر',403);return;}
    if(!owns(next,user)||old&&!owns(old,user))fail('لا يمكنك تعديل سؤال مستخدم آخر',403);
    const protectedFields=['userEmail','userName','courseId','id','answer','responses','visibility','isPinned','pinnedAt','answeredAt','answeredBy','answeredByName'];
    if(old&&protectedFields.some(k=>JSON.stringify(next[k])!==JSON.stringify(old[k])))fail('الرد على الأسئلة ونشرها يحتاج صلاحية الإدارة',403);
    if(!old&&(next.visibility&&next.visibility!=='private'||next.answer||next.responses?.length||next.isPinned||next.answeredBy||next.answeredAt))fail('السؤال الجديد خاص ولا يسمح بنشر رد إداري',403);
    return;
  }
  if(collection==='tech_support_tickets'&&!old&&!can(user,'tech_support.visible')&&!can(user,'tech_support.answer'))fail('إنشاء تذاكر الدعم غير متاح لهذا الحساب',403);
  if(collection==='groups'&&old&&can(user,'groups.managers')&&op!=='delete'&&Object.keys(next||{}).every(k=>['manager_emails','updatedAt','updatedBy'].includes(k)||JSON.stringify(next[k])===JSON.stringify(old[k])))return;
  if(collection==='users'&&op!=='delete'&&can(user,'points.grant')&&Object.keys(next||{}).every(k=>k==='points'||JSON.stringify(next[k])===JSON.stringify(old?.[k]))&&withinScope(user,{userEmail:id}))return;
  const key=writePermission(collection,id,op,next,old);
  const settingsExtra=collection==='settings'&&id==='academy_extra';
  const partnerKeys=['partners','headerLinks','footerBlocks'];
  const extraChanges=settingsExtra?(op==='delete'?Object.keys(old||{}):Object.keys(next||{})).filter(k=>!['updatedAt','updatedBy'].includes(k)&&(op==='delete'||JSON.stringify(next[k])!==JSON.stringify(old?.[k]))):[];
  const granted=settingsExtra?(extraChanges.length?extraChanges.every(k=>can(user,partnerKeys.includes(k)?'partners.manage':'style.manage')):can(user,'partners.manage')||can(user,'style.manage')):key&&can(user,key);
  if(granted){
    if(collection==='users'&&next?.role==='admin')fail('تعيين مدير النظام للمدير فقط',403);
    if(collection==='courses'&&user.role==='trainer'&&old&&old.created_by!==user.email)fail('الدورة تابعة لمدرب آخر',403);
    if(['progress','enrollments','certificates','survey_answers','assessment_attempts'].includes(collection)&&!withinScope(user,next||old))fail('خارج نطاق الصلاحية المحدد',403);
    return;
  }
  if(adminOnly.has(collection))fail('هذه العملية للمدير فقط',403);
  if(collection==='users'){
    if(get('settings','academy_extra')?.general?.preventProfileEdit)fail('تعديل البيانات الشخصية متوقف من إدارة الأكاديمية',403);
    if(id!==user.email)fail('لا يمكنك تعديل مستخدم آخر',403);
    const allowed=['full_name','phone','avatar_url','bio'];
    const changed=Object.keys(next).filter(k=>JSON.stringify(next[k])!==JSON.stringify(old?.[k]));
    if(op==='delete'||changed.some(k=>!allowed.includes(k)))fail('تعديل الصلاحيات وكلمات المرور من الإدارة فقط',403);
    return;
  }
  if(collection==='chat_messages'){
    if(get('settings','academy_extra')?.general?.disableChat&&user.role==='trainee')fail('الدردشة متوقفة من إعدادات الأكاديمية',403);
    if(next?.audienceType){if(!old&&next.fromEmail===user.email&&audienceAllowed(user,next.audienceType,next.audienceId))return;fail('خارج نطاق المحادثة المسموح',403);}
    if(!can(user,'communication.chat.private')&&!can(user,'tech_support.answer'))fail('ليست لديك صلاحية المحادثات الخاصة',403);
    if(!old&&next.fromEmail===user.email){
      const recipient=get('users',next.toEmail);
      if(recipient?.role==='trainee'){
        const sharedGroup=rows('groups').some(x=>x.data.members?.includes(user.email)&&x.data.members?.includes(recipient.email));
        const allowed=can(user,'communication.chat.trainees.all')||(can(user,'communication.chat.trainees.region')&&user.region&&user.region===recipient.region)||(can(user,'communication.chat.trainees.group')&&sharedGroup);
        if(!allowed)fail('هذا المتدرب خارج نطاق المحادثة المسموح',403);
      }
      return;
    }
    if(old?.toEmail===user.email&&op!=='delete'&&Object.keys(next).every(k=>['read','readAt'].includes(k)||JSON.stringify(next[k])===JSON.stringify(old[k])))return;
    fail('لا يمكنك تعديل هذه المحادثة',403);
  }
  if(collection==='registration_requests')fail('هذه العملية للإدارة فقط',403);
  if(collection==='tech_support_tickets'&&old&&next?.answer!==old.answer&&!can(user,'tech_support.answer'))fail('الرد على الدعم يحتاج صلاحية',403);
  if(collection==='ratings'&&old&&get('settings','academy_extra')?.general?.allowRatingEdit===false)fail('تعديل التقييم متوقف من الإدارة',403);
  if(collection==='enrollments'&&!old&&owns(next,user)&&op==='set'){
    const course=get('courses',next.courseId);
    const paths=rows('learning_paths').map(x=>({...x.data,id:x.id})).filter(p=>p.status==='published'&&(p.courseIds||[]).includes(next.courseId)&&get('path_enrollments',user.email+'|'+p.id)&&!(p.excludedUsers||[]).includes(user.email));
    if(paths.length&&!paths.some(p=>p.rule==='open'||(p.rule==='single'?p.courseIds.filter(id=>id!==next.courseId).every(id=>!get('enrollments',user.email+'_'+id)||completedCourse(user.email,id)):p.courseIds.slice(0,p.courseIds.indexOf(next.courseId)).every(id=>completedCourse(user.email,id)))))fail('أكمل الدورة السابقة في المسار أولًا',403);
    const purchased=rows('purchases').some(x=>owns(x.data,user)&&['paid','paid_fake','completed'].includes(x.data.status)&&(x.data.courseId===next.courseId||(x.data.courseIds||[]).includes(next.courseId)||get('paid_packages',x.data.packageId)?.courseIds?.includes(next.courseId)));
    if(!course||course.status!=='active'||(course.visibility==='private'&&!purchased&&!paths.length))fail('الدورة غير متاحة للتسجيل',403);
    if(course.end_date&&Date.parse(course.end_date)+86400000<Date.now())fail('انتهت الدورة',403);
    const pricing=course.pricing||{},paid=course.is_paid===true||pricing.isPaid===true||Number(course.price||pricing.price||0)>0;
    if(paid&&!purchased)fail('يلزم شراء الدورة أولاً',403);
    const rules=course.rules||course.course_rules||{};
    const count=rows('enrollments').filter(x=>x.data.courseId===next.courseId).length;
    if(Number(rules.capacity)>0&&count>=Number(rules.capacity))fail('اكتملت مقاعد الدورة',403);
    if(courseAvailability(course).reason==='upcoming')fail('لم يحن موعد فتح التسجيل',403);
    if(rules.disableEnrollment)fail('التسجيل في هذه الدورة متوقف',403);
    if(rules.approvalRequired||rules.requiresApproval||rules.enrollmentApproval||course.approvalRequired||course.require_admin_approval){const approved=rows('course_enrollment_requests').some(x=>x.data.userEmail===user.email&&x.data.courseId===next.courseId&&x.data.status==='approved');if(!approved)fail('الالتحاق يحتاج موافقة الإدارة أولاً',403);}
    const prerequisites=course.prerequisite_courses?.length?course.prerequisite_courses:course.prerequisite?[course.prerequisite]:[];
    if(prerequisites.some(id=>!completedCourse(user.email,id)))fail('أكمل الدورات المطلوبة أولاً',403);
    return;
  }
  if(collection==='certificates'&&owns(next,user)&&op==='set'&&completedCourse(user.email,next.courseId))return;
  if(['purchases','transactions','course_enrollment_requests'].includes(collection)&&!old&&owns(next,user)&&op==='set')return;
  if(collection==='user_tasks'&&old&&owns(old,user)&&next.status==='done')return;
  if(collection==='activity_log'&&!old&&next.actorEmail===user.email&&op==='set')return;
  if(['comments','qa','video_likes','progress','assessment_attempts','survey_answers','ratings','session_attendance','tech_support_tickets'].includes(collection)&&owns(next,user)&&(!old||owns(old,user)))return;
  if(collection==='notifications'&&old&&owns(old,user)&&op!=='delete'&&Object.keys(next).every(k=>['read','read_at','readAt'].includes(k)||JSON.stringify(next[k])===JSON.stringify(old[k])))return;
  if(collection==='notifications'&&!old&&op==='set'&&next.type==='chat'&&rows('chat_messages').some(x=>x.data.fromEmail===user.email&&x.data.toEmail===next.userEmail&&x.data.createdAt>Date.now()-60000))return;
  if(collection==='notifications'&&!old&&op==='set'&&next.type==='qa'&&can(user,'qa.manage')&&rows('qa').some(x=>x.data.answeredBy===user.email&&x.data.answeredAt>Date.now()-60000&&(x.data.visibility==='public'||x.data.userEmail===next.userEmail)))return;
  fail('ليست لديك صلاحية لتنفيذ العملية',403);
}
function completedCourse(email,courseId){
  if(String(courseId).startsWith('path_')){
    const learningPath=get('learning_paths',String(courseId).slice(5));
    return !!learningPath?.courseIds?.length&&learningPath.courseIds.every(id=>!String(id).startsWith('path_')&&completedCourse(email,id));
  }
  if(!get('enrollments',`${email}_${courseId}`))return false;
  const items=rows('videos').filter(x=>x.data.course_id===courseId&&x.data.content_type!=='section');
  return items.length>0&&items.every(x=>{const p=get('progress',`${email}_${x.data.video_id||x.id}`);return p?.completed==='yes'||Number(p?.progressPercent)>=100;});
}
function rewardUpdate(user,desired){
  const config=get('settings','points')||{},eligible=[],commentConfig=get('settings','points_extended')?.events?.comment;
  for(const x of rows('enrollments').filter(x=>owns(x.data,user)))eligible.push({key:'enroll:'+x.id,amount:Number(config.enroll||5)});
  for(const x of rows('progress').filter(x=>owns(x.data,user)&&(x.data.completed==='yes'||Number(x.data.progressPercent)>=100)))eligible.push({key:'video:'+x.id,amount:Number(config.video||2)});
  for(const x of rows('comments').filter(x=>owns(x.data,user)))eligible.push({key:'comment:'+x.id,amount:commentConfig?.enabled===false?0:Number(commentConfig?.points??config.comment??1)});
  for(const x of rows('certificates').filter(x=>owns(x.data,user)))eligible.push({key:'certificate:'+x.id,amount:Number(config.certificate||10)});
  const delta=Number(desired)-Number(user.points||0);
  const candidate=eligible.find(x=>x.amount===delta&&!db.prepare('SELECT 1 FROM rewards WHERE email=? AND item=?').get(user.email,x.key));
  if(!candidate)fail('لا توجد نقاط مستحقة لهذه العملية',403);
  db.prepare('INSERT INTO rewards VALUES(?,?,?)').run(user.email,candidate.key,candidate.amount);
  put.run('users',user.email,JSON.stringify({...user,points:Number(desired)}));
  put.run('points_log',randomUUID(),JSON.stringify({userEmail:user.email,delta,amount:delta,mode:'grant',reason:candidate.key,source:'automatic',by:'system',createdAt:Date.now()}));
}
function validateRef(ref){if(!ref||typeof ref.collection!=='string'||!/^\w{1,80}$/.test(ref.collection))fail('Invalid collection');if(ref.id!==undefined&&(typeof ref.id!=='string'||!ref.id||ref.id.length>1000))fail('Invalid document identifier');return ref;}
function clean(collection,data,user){
  if(!data)return null;
  if(collection==='users'){
    const safe=safeUser(data,user);
    if(!any(user,['users.view','users.manage',`users.${safe.role==='trainer'?'trainers':safe.role==='admin'?'admins':'trainees'}.view`])&&safe.email!==user?.email)return {email:safe.email,full_name:safe.full_name,role:safe.role,avatar_url:safe.avatar_url,status:safe.status,...(can(user,'points.leaderboard')?{points:safe.points||0,region:safe.region,group:safe.group,supervisor:safe.supervisor}: {})};
    return safe;
  }
  return data;
}
function mergeObject(target,source){for(const [key,value]of Object.entries(source)){if(['__proto__','constructor','prototype'].includes(key))fail('Invalid field');if(value?.__local_delete_field__===true){delete target[key];continue;}if(value&&typeof value==='object'&&!Array.isArray(value)){target[key]=mergeObject(target[key]&&typeof target[key]==='object'&&!Array.isArray(target[key])?{...target[key]}:{},value);}else target[key]=value;}return target;}
function matches(data,filters=[]){return filters.every(f=>{if(f.op!=='==')fail('Unsupported query');return JSON.stringify(f.field.split('.').reduce((v,k)=>v?.[k],data))===JSON.stringify(f.value);});}
function assertContentAccess(user,videoId){
  if(!user||user.role!=='trainee'||!videoId)return;
  const item=get('videos',videoId);if(!item)return;
  const courseId=item.course_id||item.courseId;
  const course=get('courses',courseId)||{},enrollment=get('enrollments',user.email+'_'+courseId);
  const availability=courseAvailability(course,{enrollment});
  if(availability.accessExpired)fail('انتهت مدة الوصول إلى الدورة',403);
  const start=Date.parse(course.start_date||''),early=Number((course.rules||course.course_rules)?.showBeforeHours)||0;
  if(Number.isFinite(start)&&Date.now()<start-early*3600000)fail('لم يحن موعد إتاحة محتوى الدورة',403);
  const items=rows('videos').map(x=>({...x.data,video_id:x.data.video_id||x.id})).filter(x=>(x.course_id||x.courseId)===courseId);
  const progress=Object.fromEntries(rows('progress').filter(x=>owns(x.data,user)).map(x=>[x.data.videoId||x.data.video_id,x.data]));
  if(unmetPrerequisites({...item,video_id:videoId},items,get('courses',courseId)||{},progress).length)fail('أكمل متطلبات فتح هذا المحتوى أولًا',403);
}
function assertRuleChanges(collection,id,next,op){
 if(!['videos','courses'].includes(collection))return;
 const courseId=collection==='courses'?id:(next.course_id||next.courseId);
 let items=rows('videos').map(x=>({...x.data,video_id:x.data.video_id||x.id})).filter(x=>(x.course_id||x.courseId)===courseId);
 if(collection==='videos')items=items.filter(x=>x.video_id!==id).concat(op==='delete'?[]:[{...next,video_id:id}]);
 const course=collection==='courses'&&op!=='delete'?next:get('courses',courseId)||{};
 if(course.content_sequence&&!['open','sequential','legacy'].includes(course.content_sequence))fail('إعداد ترتيب المحتوى غير صحيح');
 const error=validateContentRules(items,course);
 if(error)fail(error==='cycle'?'شروط فتح المحتوى تشكل حلقة؛ اختر متطلبات لا تعتمد على هذا العنصر':'متطلبات المحتوى غير صحيحة أو تشير إلى عنصر غير متاح');
}
let deferRuleValidation=false;
function operation(p,user){
  const ref=validateRef(p.ref), c=ref.collection,id=ref.id;
  if(['scheduled_exams','scheduled_exam_attempts','path_enrollments','video_gate_progress'].includes(c))fail('استخدم واجهة الخدمة المخصصة لهذه البيانات',403);
  if(p.op==='list'){
    if(!user&&!publicRead.has(c))fail('سجل الدخول أولاً',401);
    return {rows:rows(c).filter(x=>readable(c,x.id,x.data,user)&&matches(x.data,ref.filters)).map(x=>({id:x.id,data:clean(c,x.data,user)}))};
  }
  if(!id)fail('Document id required');
  const old=get(c,id);
  if(p.op==='get'){
    if(!user&&!publicRead.has(c))fail('سجل الدخول أولاً',401);
    if(old&&!readable(c,id,old,user))fail('ليس لديك صلاحية',403);
    return {data:clean(c,old,user)};
  }
  if(!['set','update','delete'].includes(p.op))fail('Invalid operation');
  if(p.op==='update'&&!old)fail('المستند غير موجود',404);
  if(p.op!=='delete'&&(!p.data||Array.isArray(p.data)||typeof p.data!=='object'))fail('Invalid data');
  let next=p.op==='delete'?old:mergeObject(p.merge?structuredClone(old||{}):{},p.data);
  if(p.op!=='delete')next=entityData(c,id,next);
  // A complete permission-editor snapshot replaces these maps, including an empty override map.
  if(c==='user_permissions'&&p.op!=='delete'&&p.data.permissions&&p.data.overrides){next.permissions=structuredClone(p.data.permissions);next.overrides=structuredClone(p.data.overrides);}
  if(c==='videos'&&p.op!=='delete'&&Object.hasOwn(p.data,'video_questions')){const error=validateVideoGates(next.video_questions,Number(next.video_duration)||0);if(error)fail('راجع نص السؤال والإجابات ونقاط الزمن وعدد المحاولات ('+error+')');}
  if(user?.role!=='admin'&&user&&!can(user,'points.grant')&&c==='users'&&id===user.email&&p.op!=='delete'&&Object.keys(p.data).length===1&&Object.hasOwn(p.data,'points')){rewardUpdate(get('users',user.email),p.data.points);return {success:true};}
  if(user?.role!=='admin'&&user&&!can(user,'points.grant')&&c==='points_log'&&p.op==='set'&&owns(next,user)){
    if(rows('points_log').some(x=>x.data.userEmail===user.email&&Number(x.data.delta)===Number(next.delta)&&x.data.createdAt>Date.now()-60000))return {success:true};fail('لا توجد عملية منح نقاط مطابقة',403);
  }
  writable(c,id,next,old,user,p.op);
  if(c==='learning_paths'&&p.op!=='delete'&&Array.isArray(p.data.audienceUsers))next.excludedUsers=(next.excludedUsers||[]).filter(email=>!next.audienceUsers.includes(email));
  if(!deferRuleValidation)assertRuleChanges(c,id,next,p.op);
  if(['progress','assessment_attempts','survey_answers'].includes(c)&&p.op!=='delete')assertContentAccess(user,next.videoId||next.video_id);
  if(c==='progress'&&p.op!=='delete'&&user?.role==='trainee'&&(Number(next.progressPercent??next.progress_percent)>=100||next.completed==='yes'||next.completed===true)){
    const item=get('videos',next.videoId||next.video_id),states=get('video_gate_progress',user.email+'|'+(next.videoId||next.video_id))?.gates||{};
    if((item?.video_questions||[]).some(g=>!states[g.id]?.passed||states[g.id].revision!==gateRevision(g)))fail('أجب عن أسئلة الفيديو بشكل صحيح قبل إكماله',409);
  }
  if(c==='users'&&p.op!=='delete'){
    if(p.data._passwordHash!==undefined)fail('Invalid credential field');
    if(p.data.password){next._passwordHash=passwordHash(p.data.password);}
    else if(old?._passwordHash)next._passwordHash=old._passwordHash;
    delete next.password;
    next.email=String(next.email||id).trim().toLowerCase();
  }
  if(c==='registration_requests'&&next&&!user){next.role='trainee';next.status='pending';}
  if(p.op==='delete')remove.run(c,id);else put.run(c,id,JSON.stringify(next));
  return {success:true};
}
async function body(req,limit=20*1024*1024){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>limit)fail('حجم الطلب كبير',413);chunks.push(part);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('Invalid JSON');}}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const attempts=new Map();
function cookie(res,value,maxAge){res.setHeader('Set-Cookie',`academy_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
async function serveFile(req,res,file,type){
  if(!existsSync(file)||!statSync(file).isFile())return json(res,404,{error:'File not found'});
  const size=statSync(file).size;let start=0,end=size-1,status=200;
  const headers={'Content-Type':type||mime[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m)return res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();if(m[1]){start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}else{start=Math.max(0,size-Number(m[2]));}if(start>end||start>=size)return res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
  headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);if(req.method==='HEAD'||!size)return res.end();await pipeline(createReadStream(file,{start,end}),res);
}
const learningService=createLearningService({get,rows,put,remove,can,withinScope,scopeFilter,fail,completedCourse,randomUUID,forUser,assertContentAccess,revision:()=>learningRevision});
const financeService=createFinanceService({get,rows,put,can,fail});
const checkoutService=createCheckoutService({get,rows,put,operation,db,fail,randomUUID});
export const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),user=session(req);
    if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail('Cross-origin request rejected',403);
    if(await learningService.handle({req,res,url,user,body,json}))return;
    if(await financeService.handle({req,res,url,user,body,json}))return;
    if(await checkoutService.handle({req,res,url,user,body,json}))return;
    if(url.pathname==='/api/health')return json(res,200,{ok:true,database:'sqlite'});
    if(url.pathname==='/api/capabilities'&&req.method==='GET'){if(!user)fail('سجل الدخول أولاً',401);const role=get('role_permissions',user.role)||{},custom=get('user_permissions',user.email)||{};return json(res,200,{permissions:capabilities(user),labels:permissionLabels,chatScope:{...(role.chatScope||{}),...(custom.chatScope||{})},progressScope:custom.progressScope||role.progressScope||{all:true}});}
    if(url.pathname==='/api/registration-check'&&req.method==='POST'){
      const p=await body(req,8192),email=String(p.email||'').trim().toLowerCase(),employee=String(p.employeeId||'').trim().toLowerCase();
      const account=rows('users').find(x=>x.data.email===email||(employee&&String(x.data.employee_id||'').toLowerCase()===employee));
      const pending=rows('registration_requests').find(x=>x.data.email===email||(employee&&String(x.data.employee_id||'').toLowerCase()===employee));
      return json(res,200,{duplicate:account?{kind:account.data.email===email?'email_user':'employee_user'}:pending?{kind:'request_'+(pending.data.status||'pending')}:null});
    }
    if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{user:safeUser(user,user)});
    if(url.pathname==='/api/login'&&req.method==='POST'){
      const p=await body(req,8192),email=String(p.email||'').trim().toLowerCase();
      const key=`${req.socket.remoteAddress}:${email}`,attempt=attempts.get(key);
      if(attempt&&attempt.until>Date.now()&&attempt.count>=10)fail('محاولات كثيرة، حاول بعد دقيقة',429);
      const account=get('users',email);
      if(!account||!validPassword(p.password,account._passwordHash)||account.status!=='active'){attempts.set(key,{count:(attempt?.until>Date.now()?attempt.count:0)+1,until:Date.now()+60000});return json(res,401,{success:false,error:'بيانات الدخول غير صحيحة أو الحساب غير مفعل'});}
      attempts.delete(key);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,email,Date.now()+7*86400000);cookie(res,token,7*86400);return json(res,200,{success:true,user:safeUser(account,account)});
    }
    if(url.pathname==='/api/logout'&&req.method==='POST'){
      const token=(req.headers.cookie||'').match(/academy_session=([^;]+)/)?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(token);if(user)db.prepare('UPDATE presence SET seen=0 WHERE json_extract(data,\'$.email\')=?').run(user.email);cookie(res,'',0);return json(res,200,{success:true});
    }
    if(url.pathname==='/api/password'&&req.method==='POST'){
      if(!user)fail('سجل الدخول أولاً',401);const p=await body(req,8192);if(!validPassword(p.oldPassword,user._passwordHash))fail('كلمة المرور الحالية غير صحيحة',403);if(!p.newPassword||String(p.newPassword).length<6)fail('كلمة المرور ٦ أحرف على الأقل');put.run('users',user.email,JSON.stringify({...user,_passwordHash:passwordHash(p.newPassword)}));db.prepare('DELETE FROM sessions WHERE email=?').run(user.email);cookie(res,'',0);return json(res,200,{success:true});
    }
    if(url.pathname==='/api/data'&&req.method==='POST')return json(res,200,operation(await body(req),user));
    if(url.pathname==='/api/batch'&&req.method==='POST'){
      const p=await body(req);if(!Array.isArray(p.ops)||p.ops.length>1000)fail('Invalid batch');
      const affected=new Set(p.ops.flatMap(op=>op.ref?.collection==='courses'?[op.ref.id]:op.ref?.collection==='videos'?[op.data?.course_id||op.data?.courseId||get('videos',op.ref.id)?.course_id]:[]).filter(Boolean));
      db.exec('BEGIN IMMEDIATE');try{deferRuleValidation=true;const results=p.ops.map(op=>operation(op,user));deferRuleValidation=false;for(const id of affected){const course=get('courses',id);if(course)assertRuleChanges('courses',id,course,'set');}db.exec('COMMIT');return json(res,200,{success:true,results});}catch(e){deferRuleValidation=false;db.exec('ROLLBACK');throw e;}
    }
    if(url.pathname==='/api/heartbeat'&&req.method==='POST'){if(user)db.prepare('UPDATE presence SET seen=? WHERE json_extract(data,\'$.email\')=?').run(Date.now(),user.email);return json(res,200,{success:true});}
    if(url.pathname==='/api/presence'&&req.method==='POST'){
      if(!user)fail('سجل الدخول أولاً',401);const p=await body(req,65536);
      if(p.op==='set'){if(p.data?.email!==user.email)fail('Invalid presence owner',403);db.prepare('INSERT INTO presence VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,seen=excluded.seen').run(String(p.path).split('/').pop(),JSON.stringify(p.data),Date.now());return json(res,200,{success:true});}
      if(p.path==='.info/connected')return json(res,200,{data:true});const data={};for(const row of db.prepare('SELECT * FROM presence').all()){const val=JSON.parse(row.data);if(row.seen<Date.now()-45000)val.state='offline';data[row.id]=val;}return json(res,200,{data:p.path==='presence'?data:data[String(p.path).split('/').pop()]||null});
    }
    if(url.pathname==='/api/support/ticket-number'&&req.method==='POST'){
      if(!user)fail('سجل الدخول أولًا',401);
      // Allocation runs synchronously in the server process; clients never write settings.
      const counter=get('settings','tech_support_counter')||{},number=Math.max(292000,Number(counter.lastNo)||0)+1;
      put.run('settings','tech_support_counter',JSON.stringify({lastNo:number,updatedAt:Date.now()}));
      return json(res,200,{success:true,number});
    }
    if(url.pathname==='/api/upload'&&req.method==='POST'){
      if(!user)fail('سجل الدخول أولاً',401);const name=path.basename(decodeURIComponent(req.headers['x-file-name']||'file'));const ext=path.extname(name).toLowerCase();
      const allowed=new Set(['.png','.jpg','.jpeg','.gif','.webp','.mp4','.webm','.mov','.pdf','.pptx','.docx','.xlsx','.csv','.txt','.zip','.mp3','.m4a']);if(!allowed.has(ext))fail('نوع الملف غير مدعوم');
      const id=randomUUID()+ext,file=path.join(dataDir,'uploads',id);let size=0;const max=Number(process.env.MAX_UPLOAD_MB||1024)*1024*1024;
      const guard=new Transform({transform(chunk,enc,done){size+=chunk.length;done(size>max?Object.assign(new Error('حجم الملف كبير'),{status:413}):null,chunk);}});
      const uploadMime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.pdf':'application/pdf','.mp3':'audio/mpeg','.m4a':'audio/mp4','.txt':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8'}[ext]||'application/octet-stream';
      await pipeline(req,guard,createWriteStream(file));db.prepare('INSERT INTO files VALUES(?,?,?,?)').run(id,name,uploadMime,user.email);
      const uploadUrl=`/uploads/${id}`;return json(res,200,{success:true,url:uploadUrl,data:{url:uploadUrl},name,size});
    }
    if(url.pathname==='/api/export'&&req.method==='GET'){if(user?.role!=='admin')fail('هذه العملية للمدير فقط',403);const documents={};for(const c of db.prepare('SELECT DISTINCT collection FROM documents').all())documents[c.collection]=rows(c.collection).map(x=>({id:x.id,data:clean(c.collection,x.data,user)}));res.setHeader('Content-Disposition','attachment; filename="academy-data.json"');return json(res,200,{exportedAt:new Date().toISOString(),documents});}
    if(url.pathname.startsWith('/uploads/')){
      const id=path.basename(url.pathname);const file=db.prepare('SELECT * FROM files WHERE id=?').get(id);if(!file)fail('File not found',404);
      const publicBrandImage=file.mime.startsWith('image/')&&JSON.stringify(get('settings','academy')||{}).includes('/uploads/'+id);
      if(!user&&!publicBrandImage)fail('سجل الدخول أولاً',401);
      if(user?.role==='trainee'){
        const linked=rows('videos').filter(x=>[x.data.video_url,x.data.file_url].includes('/uploads/'+id));
        if(linked.length){let allowed=false;for(const item of linked){try{assertContentAccess(user,item.id);allowed=true;break;}catch{}}if(!allowed)fail('أكمل متطلبات فتح هذا المحتوى أولًا',403);}
      }
      res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);return await serveFile(req,res,path.join(dataDir,'uploads',id),file.mime);
    }
    if(url.pathname.startsWith('/api/'))fail('Endpoint not found',404);
    if(!['GET','HEAD'].includes(req.method))fail('Method not allowed',405);
    const publicRoot=path.join(base,'public'),file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(publicRoot+path.sep))fail('Forbidden',403);return await serveFile(req,res,file);
  }catch(e){if(!res.headersSent)json(res,e.status||500,{success:false,error:e.status?e.message:'حدث خطأ في الخادم'});else res.destroy();if(!e.status)console.error(e);}
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Academy running: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
