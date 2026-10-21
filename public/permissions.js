export const permissionLabels = {
  "qa.manage": "إدارة أسئلة المتدربين والرد عليها ونشرها",
  "exams.manage": "إدارة الامتحانات المجدولة ونتائجها",
  "content.courses.view": "عرض الدورات",
  "content.courses.create": "إضافة دورة",
  "content.courses.delete": "حذف دورة",
  "content.courses.approve": "اعتماد الدورات",
  "content.packages.manage": "إدارة الباقات والدورات المدفوعة",
  "content.sessions.manage": "إدارة الجلسات التدريبية",
  "content.rooms.manage": "إدارة قاعات التدريب",
  "content.surveys.manage": "إدارة الاستبيانات",
  "content.surveys.export": "تصدير نتائج الاستبيان",
  "question_bank.manage": "إدارة بنك الأسئلة",
  "points.weights": "إعداد أوزان النقاط",
  "points.grant": "منح وخصم النقاط",
  "points.leaderboard": "ترتيب المتدربين",
  "points.history": "سجل النقاط",
  "activity.view": "سجل النشاط",
  "style.manage": "تصميم الأكاديمية",
  "announcements.manage": "إدارة الإعلانات",
  "partners.manage": "إدارة الشركاء وروابط الصفحة",
  "utility.certificates": "الشهادات",
  "utility.coupons": "الكوبونات",
  "utility.faq": "الأسئلة الشائعة",
  "reports.financial": "تقرير الشراء",
  "reports.rating": "تقرير التقييمات",
  "tech_support.visible": "إتاحة تذاكر الدعم",
  "tech_support.answer": "الرد على تذاكر الدعم",
  "groups.manage": "إدارة المجموعات",
  "groups.managers": "تعيين مدير المجموعة",
  "progress.view": "مشاهدة التقدم",
  "dashboard.view": "عرض لوحة التحكم",
  "users.view": "عرض المستخدمين",
  "users.trainees.view": "عرض بيانات المتدربين",
  "users.trainers.view": "عرض بيانات المدربين",
  "users.admins.view": "عرض بيانات مدير النظام",
  "users.manage": "إضافة وتعديل المستخدمين",
  "users.registration.approve": "موافقات إنشاء الحسابات",
  "content.enrollment.approve": "موافقات الالتحاق بالدورات",
  "permissions.manage": "إدارة الصلاحيات",
  "communication.chat.private": "المحادثات الخاصة",
  "communication.chat.trainees.all": "إظهار كل المتدربين في المحادثات",
  "communication.chat.trainees.region": "إظهار متدربي نفس الإقليم في المحادثات",
  "communication.chat.trainees.group": "إظهار متدربي نفس المجموعة في المحادثات",
  "communication.chat.group": "محادثات المجموعات",
  "communication.chat.region": "محادثات الأقاليم"
};
export const tabPermissions={dash:['dashboard.view'],users:['users.view','users.manage','users.trainees.view','users.trainers.view','users.admins.view'],courses:['content.courses.view','content.courses.create','content.courses.approve','content.courses.delete'],paths:['content.courses.view','content.courses.create'],'course-detail':['content.courses.view','content.courses.create','content.courses.approve','content.courses.delete'],'scheduled-exams':['exams.manage'],progress:['progress.view'],groups:['groups.manage','groups.managers'],certs:['utility.certificates'],qa:['qa.manage'],chat:['communication.chat.private','communication.chat.group','communication.chat.region','tech_support.answer'], 'question-bank':['question_bank.manage'],points:['points.weights','points.grant','points.leaderboard','points.history'],settings:['style.manage','partners.manage'],activity:['activity.view'],announcements:['announcements.manage'],packages:['content.packages.manage'],sessions:['content.sessions.manage'],rooms:['content.rooms.manage'],'survey-library':['content.surveys.manage','content.surveys.export'],coupons:['utility.coupons'],faq:['utility.faq'],financial:['reports.financial'],'rating-report':['reports.rating'],'tech-support':['tech_support.answer'],'registration-requests':['users.registration.approve'],'enrollment-requests':['content.enrollment.approve'],'login-settings':['style.manage'],permissions:['permissions.manage']};
export function defaultPermissions(role){
 const p=Object.fromEntries(Object.keys(permissionLabels).map(k=>[k,role==='admin']));
 const defaults={trainee:['tech_support.visible','communication.chat.private'],trainer:['dashboard.view','content.courses.view','content.courses.create','content.surveys.manage','content.surveys.export','question_bank.manage','tech_support.answer','communication.chat.private'],manager:['dashboard.view','users.view','users.trainees.view','users.trainers.view','content.courses.view','progress.view','points.leaderboard','activity.view','reports.rating','groups.manage','tech_support.answer'],region_manager:['dashboard.view','users.view','users.trainees.view','users.trainers.view','content.courses.view','progress.view','points.leaderboard','activity.view','reports.rating','reports.financial','groups.manage','groups.managers','tech_support.answer']};
 for(const k of defaults[role]||[])p[k]=true;if(['trainer','manager','region_manager'].includes(role))p['qa.manage']=true;return p;
}
export function resolvePermissions(user,role={},custom={}){return user?.role==='admin'?defaultPermissions('admin'):{...defaultPermissions(user?.role||'trainee'),...(role.permissions||{}),...(custom.permissions||{}),...(custom.overrides||{})};}
export const permits=(user,p,key)=>user?.role==='admin'||p[key]===true;
export const readPermissions={courses:['content.courses.view'],videos:['content.courses.view'],learning_paths:['content.courses.view'],users:['users.view','users.manage'],groups:['groups.manage','groups.managers'],enrollments:['progress.view','content.enrollment.approve','content.courses.view'],progress:['progress.view'],assessment_attempts:['progress.view','content.courses.view'],announcements:['announcements.manage'],paid_packages:['content.packages.manage'],sessions:['content.sessions.manage'],conference_rooms:['content.rooms.manage'],survey_library:['content.surveys.manage','content.surveys.export'],course_surveys:['content.surveys.manage'],survey_answers:['content.surveys.export','reports.rating'],ratings:['reports.rating'],question_bank:['question_bank.manage'],question_groups:['question_bank.manage'],certificates:['utility.certificates'],certificate_templates:['utility.certificates'],coupons:['utility.coupons'],faqs:['utility.faq'],purchases:['reports.financial'],transactions:['reports.financial'],points_log:['points.history','points.grant'],point_bonuses:['points.weights'],activity_log:['activity.view'],registration_requests:['users.registration.approve'],course_enrollment_requests:['content.enrollment.approve'],user_permissions:['permissions.manage'],role_permissions:['permissions.manage'],tech_support_tickets:['tech_support.answer'],user_tasks:['users.manage']};
export function writePermission(c,id,op,next,old){
 if(c==='settings')return id==='points'||id==='points_extended'?'points.weights':id==='custom_roles'?'permissions.manage':id==='academy_extra'?'partners.manage':id==='admin_dashboard'?'dashboard.view':'style.manage';
 if(c==='users')return 'users.manage';
 if(c==='courses'){if(op==='delete')return 'content.courses.delete';if(old&&['approval_status','reviewed_by','reviewed_at','status'].some(k=>JSON.stringify(next?.[k])!==JSON.stringify(old?.[k]))&&next?.approval_status==='approved')return 'content.courses.approve';return 'content.courses.create';}
 return {videos:'content.courses.create',learning_paths:'content.courses.create',groups:'groups.manage',enrollments:'content.enrollment.approve',progress:'progress.view',assessment_attempts:'progress.view',announcements:'announcements.manage',paid_packages:'content.packages.manage',sessions:'content.sessions.manage',session_attendance:'content.sessions.manage',conference_rooms:'content.rooms.manage',survey_library:'content.surveys.manage',course_surveys:'content.surveys.manage',survey_answers:'content.surveys.manage',question_bank:'question_bank.manage',question_groups:'question_bank.manage',certificates:'utility.certificates',certificate_templates:'utility.certificates',coupons:'utility.coupons',faqs:'utility.faq',points_log:'points.grant',point_bonuses:'points.weights',user_permissions:'permissions.manage',role_permissions:'permissions.manage',registration_requests:'users.registration.approve',course_enrollment_requests:'content.enrollment.approve',tech_support_tickets:'tech_support.answer',user_tasks:'users.manage'}[c];
}
