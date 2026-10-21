import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const maintenanceMarker='// Single final navigation and settings layer. Original source is retained separately.';
const maintenanceStart=app.indexOf(maintenanceMarker),reviewStart=app.indexOf('// Academy review improvements (October 2026).');
if(maintenanceStart<0)throw Error('Navigation maintenance layer was not found');
app=app.slice(0,maintenanceStart)+fs.readFileSync(path.join(root,'maintenance.fragment.js'),'utf8')+'\n'+(reviewStart<0?'':app.slice(reviewStart));
app=app.replace(/\\u(06[0-9a-f]{2})/gi,(_,code)=>String.fromCharCode(parseInt(code,16)));
// Edit the established implementation; preserve original/ as the reference copy.
const terminology=[['History النقاط','سجل النقاط'],['سيكشن','قسم'],['السيكشن','القسم'],['سيرفاي','استبيان'],['السيرفاي','الاستبيان'],['الجروبات','المجموعات'],['جروبات','مجموعات'],['الجروب','المجموعة'],['جروب','مجموعة'],['الأدمن','مدير النظام'],['أدمن','مدير النظام'],['الكونتنت','المحتوى'],['كونتنت','المحتوى'],['الشات','المحادثات'],['ستايل الأكاديمية','تصميم الأكاديمية'],['الإيميل','البريد الإلكتروني'],['الباسورد','كلمة المرور'],['رابط الفيديو (Google Drive) *','ملف الفيديو المرفوع *'],['Video Link (Google Drive) *','Uploaded video file *'],['فتح في Drive','فتح الملف'],['Open in Drive','Open file']];
terminology.push(['الكونتانت','المحتوى'],['الباكدج والمدفوع','الباقات المدفوعة'],['الباكدجات','الباقات'],['الباكدج','الباقة'],['باكدج','باقة'],['السيشن','الجلسات التدريبية'],['الاستبيان','الاستبيان']);
terminology.push(['السيشنز','الجلسات التدريبية'],['إنشاء سيشن أونلاين','إنشاء جلسة تدريبية عبر الإنترنت'],['إضافة قاعة أوفلاين','إضافة قاعة تدريب حضورية'],['دبلكيت','نسخ'],['الهيدر والفوتر','الترويسة والتذييل'],['اللوجو','الشعار'],['الأكشن','الإجراء'],['إضافة FAQ','إضافة سؤال شائع'],['إدارة Conference Rooms','إدارة قاعات التدريب'],['إظهار Tech Support للمستخدم','إظهار الدعم الفني للمستخدم'],['الجلسات التدريبيةز','الجلسات التدريبية']);
const permissionWording=[["إدارة الباقة والدورات المدفوعة","إدارة الباقات والدورات المدفوعة"],["إدارة الاستبيان","إدارة الاستبيانات"],["إدارة الشركاء والفوتر والهيدر","إدارة الشركاء وروابط الصفحة"],["الرد على الدعم التقني","الرد على تذاكر الدعم"],["إظهار الدعم الفني للمستخدم","إتاحة تذاكر الدعم"],["تفعيل المحادثات الخاص","المحادثات الخاصة"],["تفعيل شات المجموعات","محادثات المجموعات"],["تفعيل شات الأقاليم","محادثات الأقاليم"]];
for(const [from,to]of permissionWording)app=app.replaceAll("'"+from+"'","'"+to+"'");
terminology.sort((a,b)=>b[0].length-a[0].length);
for(const [from,to] of terminology)app=app.replaceAll(from,to);
// Use the same rule calculation when rendering locked playlist entries.
app=app.replace("const locked = v.require_previous !== 'no' && !!prevPlayable && !safeProgressDone(prog, prevPlayable.video_id);","const locked = reviewUnmet(v, prog).length > 0;");
app=app.replace("if(APP_LANG==='en')applyStaticTranslations();}","if(APP_LANG==='en')applyStaticTranslations(document.getElementById('tab-'+tab));}");
const remapLine="if (item.section_id) item.section_id = idMap.get(fId(item.section_id)) || '';";
if(!app.includes('idMap.get(String(required))'))app=app.replace(remapLine,remapLine+"\n                            if (item.access_rules?.required_items) item.access_rules = { ...item.access_rules, required_items:item.access_rules.required_items.map(required=>idMap.get(String(required))).filter(Boolean) }; ");
app=app.replace("const common = `left:","const common = `left:");
app=app.replace("font-size:${el.size || 18}px;color:","font-size:${(el.size || 18)/9.6}cqw;color:");
app=app.replace('overflow:hidden;text-overflow:ellipsis;', 'overflow:hidden;text-overflow:ellipsis;');
// The points shell is persistent; only its current content is rendered again.
{const begin=app.indexOf('async function advRenderPointsHome('),end=app.indexOf("if (mode === 'weights')",begin);if(begin>=0&&end>=0){let part=app.slice(begin,end);if(!part.includes("if (!tab.querySelector('#adv-points-body'))"))part=part.replace('tab.innerHTML = `',"if (!tab.querySelector('#adv-points-body')) tab.innerHTML = `");app=app.slice(0,begin)+part+app.slice(end);}}
app=app.replaceAll('الترويسة والفوتر','روابط أعلى الصفحة وأسفلها').replaceAll('الترويسة','روابط أعلى الصفحة');
const marker='// Academy review improvements (October 2026).';
app=app.replace("function lpCanViewCourses() { return lpCan('content.courses.view'); }", "function lpCanViewCourses() { return adv5CanSeeTab('courses'); }");
app=app.replaceAll("if (key.startsWith('content.') || key === 'question_bank.manage')", "if (key.startsWith('content.') || key.startsWith('exams.') || key === 'question_bank.manage')");
app=app.replaceAll("if (key.startsWith('communication.') || key.startsWith('tech_support.')", "if (key.startsWith('qa.') || key.startsWith('communication.') || key.startsWith('tech_support.')");
app=app.replaceAll('if (item.access_rules?.required_items)', 'if (item.access_rules)').replaceAll('required_items:item.access_rules.required_items.map(required=>idMap.get(String(required)))','required_items:(item.access_rules.required_items||[]).map(required=>idMap.get(String(required)))');
app=app.replace('required_items:item.access_rules.required_items.map(required=>idMap.get(String(required))).filter(Boolean) }','required_items:item.access_rules.required_items.map(required=>idMap.get(String(required))).filter(Boolean), required_sections:(item.access_rules.required_sections||[]).map(required=>idMap.get(String(required))).filter(Boolean) }');
app=app.replace('required_items:(item.access_rules.required_items||[]).map(required=>idMap.get(String(required))).filter(Boolean) }','required_items:(item.access_rules.required_items||[]).map(required=>idMap.get(String(required))).filter(Boolean), required_sections:(item.access_rules.required_sections||[]).map(required=>idMap.get(String(required))).filter(Boolean) }');
app=app.replace(/const maintenanceApplyExtra=applyAcademyExtra;[\s\S]*?\nsaveSettings=async function/,`const maintenanceApplyExtra=applyAcademyExtra;\napplyAcademyExtra=async function(){await maintenanceApplyExtra();};\nsaveSettings=async function`);
{
 const start=app.indexOf('async function lpNextTechTicketNo()'),end=app.indexOf('async function lpTrainerTechTickets()',start);
 if(start<0||end<0)throw Error('Support ticket helpers were not found');
 app=app.slice(0,start)+`async function lpNextTechTicketNo() {
                const response=await fetch('/api/support/ticket-number',{method:'POST'}),data=await response.json();
                if(!response.ok)throw Error(data.error);return data.number;
            }
            async function lpTechTicketsAll() {
                const rows=await advDocs('tech_support_tickets');
                return rows.map(tk=>({...tk,status:lpTechStatusKey(tk.status)})).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
            }
            `+app.slice(end);
}
app=app.replace(/(?:if \(!tab\.querySelector\('#adv-points-body'\)\)\s*){2,}/g,"if (!tab.querySelector('#adv-points-body')) ");
if(app.includes(marker))app=app.slice(0,app.indexOf(marker));
app=app.replace(/(?<![\w.])confirm\(/g,'await window.academyConfirm(');
app=app.replace(/\balert\(/g,'toast(');
app=app.replace("                    showTraineeTab?.('home');", "                    if (!window.__academy?.hub?.state.enrolling) await showTraineeTab?.('home');");
app=app.trimEnd();
app+='\n'+fs.readFileSync(path.join(root,'review.fragment.js'),'utf8');
app+='\n'+fs.readFileSync(path.join(root,'hub-integration.fragment.js'),'utf8');
app+='\n'+fs.readFileSync(path.join(root,'followup.fragment.js'),'utf8');
app+='\n'+fs.readFileSync(path.join(root,'course-studio.fragment.js'),'utf8');
app+='\n'+fs.readFileSync(path.join(root,'operations.fragment.js'),'utf8');
fs.writeFileSync(path.join(root,'public/app.js'),app);
let html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const [from,to]of terminology)html=html.replaceAll(from,to);
fs.writeFileSync(path.join(root,'public/index.html'),html);
let permissions=fs.readFileSync(path.join(root,'public/permissions.js'),'utf8');
for(const [from,to]of terminology)permissions=permissions.replaceAll(from,to);
permissions=permissions.replaceAll('User Activity','سجل النشاط').replaceAll('"FAQ"','"الأسئلة الشائعة"');
fs.writeFileSync(path.join(root,'public/permissions.js'),permissions);
// Expand the existing translation catalogue from the explicit bilingual UI pairs.
const dictionary={};
for(const m of app.matchAll(/\b(?:t|adv\d+Lang)\('((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\)/g)){
  const ar=m[1].replaceAll("\\'","'"),en=m[2].replaceAll("\\'","'");
  if(ar && en && !ar.includes('${') && !en.includes('${'))dictionary[ar]=en;
}
fs.writeFileSync(path.join(root,'public/review-translations.json'),JSON.stringify(dictionary,null,2));
console.log('Applied review changes; bilingual entries:',Object.keys(dictionary).length);
