// Adds a repeatable demonstration set. Existing records with these IDs are preserved.
import {DatabaseSync} from 'node:sqlite';
import {scryptSync,randomBytes} from 'node:crypto';
import path from 'node:path';
import {existsSync,copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const db=new DatabaseSync(path.join(process.env.DATA_DIR||'data','academy.sqlite'));
const now=Date.now(),password='Academy!2026';
const hash=()=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');};
const put=db.prepare('INSERT OR IGNORE INTO documents(collection,id,data) VALUES(?,?,?)');
const add=(c,id,data)=>{if(c==='courses')for(const key of ['course_name','course_name_ar','course_name_en'])if(data[key])data[key]=data[key].replace(/^[٠-٩\d]+\s*[—–-]\s*/,'');return put.run(c,id,JSON.stringify({...data,demo:true}));};
const users=[
 {email:'learner@academy.local',full_name:'أحمد — متدرب تجريبي',role:'trainee',region:'الرياض',branch:'النسيم',group:'تجربة — الرياض',employee_id:'DEMO-101'},
 {email:'learner2@academy.local',full_name:'سارة — متدربة تجريبية',role:'trainee',region:'الخليج',branch:'قطر',group:'تجربة — الخليج',employee_id:'DEMO-102'},
 {email:'trainer@academy.local',full_name:'محمد — مدرب تجريبي',role:'trainer',region:'الرياض',employee_id:'DEMO-201'},
 {email:'trainer2@academy.local',full_name:'منى — مدربة بصلاحيات محدودة',role:'trainer',region:'الخليج',employee_id:'DEMO-202'}
];
db.exec('BEGIN');
for(const user of users)add('users',user.email,{...user,_passwordHash:hash(),status:'active',points:0,createdAt:now});
const base={status:'active',visibility:'public',approval_status:'approved',certificate_enabled:'no',created_by:'admin@academy.local',created_by_name:'مدير الأكاديمية',created_by_role:'admin',created_at:now};
const courses=[
 ['demo_public','١ — أساسيات البيع: دورة عامة مجانية',{certificate_enabled:'yes',certificate_template_id:'demo_template',description:'ابدأ هنا: فيديو قصير وملف PDF وامتحان وتقييم. أسئلة الامتحان عن أساسيات تجربة العميل.'}],
 ['demo_private','٢ — تدريب خاص: مسجل لأحمد فقط',{visibility:'private',description:'لا تظهر للمستخدم غير المسجل. أحمد مسجل بها، وسارة غير مسجلة.'}],
 ['demo_paid','٣ — احتراف التفاوض: دورة مدفوعة تجريبية',{is_paid:true,price:100,currency:'SAR',pricing:{type:'paid',isPaid:true,price:100,currency:'SAR'},description:'تجربة ظهور التفاصيل والدفع التجريبي؛ لا يتم خصم أموال.'}],
 ['demo_approval','٤ — خدمة العملاء: تحتاج موافقة',{rules:{approvalRequired:true},description:'جرب طلب الالتحاق ومراجعته من حساب الأدمن.'}],
 ['demo_prerequisite','٥ — بيع متقدم: بعد أساسيات البيع',{prerequisite:'demo_public',prerequisite_courses:['demo_public'],description:'يلزم إكمال دورة أساسيات البيع قبل الدخول.'}],
 ['demo_expired','٦ — دورة انتهت مدتها',{end_date:'2026-10-01',description:'مثال لدورة منتهية؛ للتأكد من إغلاق الالتحاق والمحتوى حسب التاريخ.'}],
 ['demo_draft','٧ — مسودة تحت التجهيز',{status:'draft',approval_status:'draft',description:'تظهر في الإدارة ولا تُنشر للمتدرب.'}],
 ['demo_review','٨ — دورة المدرب تحت الاعتماد',{status:'draft',approval_status:'pending_review',created_by:'trainer@academy.local',created_by_name:'محمد — مدرب تجريبي',created_by_role:'trainer',description:'الأدمن يراجع ثم يعتمد، والمدرب يعدل الدورة التي يملكها.'}],
 ['demo_bonus','٩ — محتوى إضافي داخل الباقة',{visibility:'private',description:'دورة مجانية ضمن الباقة المدفوعة؛ للتأكد من قفل الوصول حتى إتاحة الباقة.'}],
 ['demo_limited','١٠ — دورة المدرب المحدود: عرض بدون تعديل',{created_by:'trainer2@academy.local',created_by_name:'منى — مدربة بصلاحيات محدودة',created_by_role:'trainer',description:'تظهر لصاحبة الحساب المحدود، لكن إضافة أو تعديل أو حذف المحتوى غير مسموح.'}]
];
for(const [id,title,extra]of courses)add('courses',id,{...base,course_id:id,course_name:title,course_name_ar:title,course_name_en:id.replace('demo_','Demo '),...extra});
const existingApproval=db.prepare("SELECT data FROM documents WHERE collection='courses' AND id='demo_approval'").get();
if(existingApproval){const c=JSON.parse(existingApproval.data);if(c.demo&&!Object.hasOwn(c.rules||{},'approvalRequired'))db.prepare("UPDATE documents SET data=? WHERE collection='courses' AND id='demo_approval'").run(JSON.stringify({...c,rules:{...(c.rules||{}),approvalRequired:true}}));}
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let media=process.env.DEMO_VIDEO_URL||'',pdf=process.env.DEMO_PDF_URL||'';
for(const [name,mime]of [['lesson.webm','video/webm'],['guide.pdf','application/pdf']]){
 const source=path.join(project,'demo-assets',name),id='demo-'+name;
 if(existsSync(source)){const uploads=path.join(process.env.DATA_DIR||'data','uploads');mkdirSync(uploads,{recursive:true});if(!existsSync(path.join(uploads,id)))copyFileSync(source,path.join(uploads,id));db.prepare('INSERT OR IGNORE INTO files(id,name,mime,owner) VALUES(?,?,?,?)').run(id,name,mime,'admin@academy.local');if(name==='lesson.webm')media=media||'/uploads/'+id;else pdf=pdf||'/uploads/'+id;}
}
const content=(id,course_id,title,type,order,extra={})=>add('videos',id,{video_id:id,course_id,title,title_ar:title,content_type:type,order,require_previous:'no',progress_mode:'manual',...extra});
for(const [id]of courses){content(id+'_video',id,'فيديو تطبيقي — مثال تجريبي','video',1,{video_url:media});}
content('demo_pdf','demo_public','ملف PDF تجريبي لاختبار العرض','pdf',2,{file_url:pdf,video_url:pdf});
content('demo_exam','demo_public','اختبار أساسيات البيع — نجاح ٢ من ٣','exam',3,{time_minutes:5,pass_score:2,questions:[{type:'choice',text:'أفضل بداية للتعامل مع العميل؟',options:['الترحيب والاستماع لاحتياجه','عرض الأغلى فورًا','تجاهل العميل'],correctIndex:0},{type:'choice',text:'لو المنتج غير مناسب لاحتياج العميل؟',options:['نصرّ على بيعه','نقترح البديل المناسب','ننهي الحوار'],correctIndex:1},{type:'truefalse',text:'الاستماع الجيد يساعد على فهم احتياج العميل.',options:['صح','خطأ'],correct:'true',correctIndex:0}]});
content('demo_survey','demo_public','تقييم التجربة التدريبية','survey',4,{questions:[{id:'feedback',type:'text',text:'ما أكثر شيء استفدت منه؟'},{id:'recommend',type:'nps',text:'ما مدى ترشيحك للدورة من ٠ إلى ١٠؟'}]});
add('groups','demo_riyadh',{group_id:'demo_riyadh',group_name:'تجربة — الرياض',members:['learner@academy.local'],description:'جروب للاختبار'});
add('groups','demo_gulf',{group_id:'demo_gulf',group_name:'تجربة — الخليج',members:['learner2@academy.local'],description:'جروب للاختبار'});
for(const email of ['learner@academy.local','learner2@academy.local'])add('enrollments',email+'_demo_public',{userEmail:email,courseId:'demo_public',enrolled_at:now});
add('enrollments','learner@academy.local_demo_private',{userEmail:'learner@academy.local',courseId:'demo_private',enrolled_at:now});
add('progress','learner2@academy.local_demo_public_video',{userEmail:'learner2@academy.local',courseId:'demo_public',videoId:'demo_public_video',completed:'yes',progressPercent:100,last_updated:now});
add('learning_paths','demo_path',{id:'demo_path',title:'مسار تجريبي — من البداية للاحتراف',description:'دورتان بالتسلسل',courseIds:['demo_public','demo_prerequisite'],status:'published',audience:'all'});
add('paid_packages','demo_package',{id:'demo_package',title:'باقة تجريبية — التفاوض والمحتوى الإضافي',description:'دورة مدفوعة مع محتوى إضافي؛ الدفع تجريبي.',price:150,currency:'SAR',status:'published',courseIds:['demo_paid','demo_bonus'],is_paid:true});
add('certificate_templates','demo_template',{id:'demo_template',name:'شهادة التجربة التدريبية',title:'شهادة إتمام',body:'تقديرًا لإتمام البرنامج التدريبي بنجاح',courseIds:['demo_public'],linkedCourseIds:['demo_public']});
add('user_permissions','trainer2@academy.local',{userEmail:'trainer2@academy.local',permissions:{'dashboard.view':true,'content.courses.view':true,'content.courses.create':false,'content.courses.delete':false,'content.courses.approve':false,'content.surveys.manage':false,'content.surveys.export':false,'question_bank.manage':false,'tech_support.answer':false,'communication.chat.private':true},overrides:{'content.courses.create':false}});
add('user_permissions','trainer@academy.local',{userEmail:'trainer@academy.local',permissions:{'communication.chat.private':true,'communication.chat.trainees.all':true}});
add('registration_requests','new.demo@academy.local',{email:'new.demo@academy.local',full_name:'طلب حساب تجريبي تحت الموافقة',password:'Academy!2026',role:'trainee',status:'pending',employee_id:'DEMO-301',region:'الرياض',createdAt:now});
add('announcements','demo_announcement',{id:'demo_announcement',title:'بيئة التجربة جاهزة',body:'جرب حساب المتدرب والمدرب، والدورات المتنوعة. كل سجل تجريبي مميز بكلمة تجربة.',status:'published',createdAt:now});
add('faqs','demo_faq',{question:'ما كلمة مرور حسابات التجربة؟',answer:'Academy!2026 — الحسابات التجريبية مذكورة في دليل التجربة.',published:true,createdAt:now});
db.exec('COMMIT');db.close();console.log(JSON.stringify({users:users.map(({email,role})=>({email,role})),password,courses:courses.length,mediaConfigured:!!media}));
