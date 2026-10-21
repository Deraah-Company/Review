// Optional browser regression suite: npm install --no-save playwright
// Set PLAYWRIGHT_EXECUTABLE for an installed Chrome/Edge browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'academy-browser-'));
const port=43220,base=`http://127.0.0.1:${port}`;
const report={started:new Date().toISOString(),tests:[],navigation:[],handlers:[],errors:[]};
let server,browser,page,courseId,videoId,uploadUrl;
async function check(name,fn){try{await fn();report.tests.push({name,status:'passed'});console.log('PASS '+name);}catch(e){report.tests.push({name,status:'failed',error:e.message});console.log('FAIL '+name+': '+e.message);}}
const business=p=>page.evaluate(p=>window.__academy.call(p),p);
(async()=>{
  try{
    server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:String(port),ADMIN_PASSWORD:'Browser-admin-2026'},stdio:'pipe',windowsHide:true});
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
    page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(6000);page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.dismiss());
    await check('Original login screen and local assets',async()=>{const remote=[];page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))remote.push(r.url());});await page.goto(base,{waitUntil:'networkidle'});assert.equal(await page.title(),'Deraah Academy');assert.equal(remote.length,0);});
    await check('Administrator login using the original button',async()=>{await page.locator('#l-email').fill('admin@academy.local');await page.locator('#l-pass').fill('Browser-admin-2026');await page.locator('#login-screen button[onclick="doLogin()"]').click();await page.locator('#admin-screen').waitFor({state:'visible'});await page.waitForTimeout(500);});
    await check('All administrative navigation pages',async()=>{
      const tabs=await page.evaluate(()=>[...new Set([...document.querySelectorAll('.sidebar [onclick]')].map(e=>e.getAttribute('onclick').match(/showTab\(['"]([^'"]+)/)?.[1]).filter(Boolean))]);
      for(const tab of tabs){const n=report.errors.length;await page.evaluate(t=>showTab(t),tab);await page.waitForTimeout(100);const visible=await page.locator('#tab-'+tab).isVisible();report.navigation.push({tab,visible,errors:report.errors.slice(n)});assert(visible,tab);}
      assert.equal(report.errors.length,0);
    });
    await check('Every currently rendered event points to an existing function',async()=>{
      const data=await page.evaluate(()=>{const out=[];for(const el of document.querySelectorAll('[onclick],[onchange],[oninput]')){for(const attr of ['onclick','onchange','oninput']){const code=el.getAttribute(attr);if(!code)continue;const missing=[];for(const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)){if(['if','for','switch','function'].includes(m[1])||code[m.index-1]==='.')continue;if(typeof window[m[1]]!=='function')missing.push(m[1]);}out.push({tag:el.tagName,id:el.id,code,missing});}}return out;});report.handlers=data;assert.deepEqual(data.filter(x=>x.missing.length),[]);
    });
    await check('Create a trainee from the original user form',async()=>{
      await page.evaluate(()=>showTab('users'));await page.locator('#tab-users [onclick="openModal(\'m-add-user\')"]').click();await page.locator('#nu-name').fill('QA Trainee');await page.locator('#nu-email').fill('qa@test.local');await page.locator('#nu-pass').fill('Browser-trainee-2026');await page.locator('#m-add-user [onclick="submitAddUser()"]').click();await page.locator('#m-add-user').waitFor({state:'hidden'});assert((await business({action:'getUsers'})).users.some(u=>u.email==='qa@test.local'));
    });
    await check('Create a course through all three wizard steps',async()=>{
      await page.evaluate(()=>showTab('courses'));await page.locator('#tab-courses [onclick="openAddCourseModal()"]').click();await page.locator('#nc-name').fill('دورة الاختبار');await page.locator('#nc-name-en').fill('QA Course');await page.locator('#m-add-course button').filter({hasText:'التالي'}).click();await page.locator('#nc-status').selectOption('active');await page.locator('#nc-visibility').selectOption('public');await page.locator('#m-add-course button').filter({hasText:'التالي'}).click();await page.locator('#course-save-btn').click();await page.locator('#m-add-course').waitFor({state:'hidden'});courseId=(await business({action:'getCourses'})).courses.find(c=>c.course_name==='دورة الاختبار').course_id;assert(courseId);
    });
    await check('Upload a real video and add it to the original course',async()=>{
      const result=await page.evaluate(async b64=>fetch('/api/upload',{method:'POST',headers:{'X-File-Name':'test.webm','Content-Type':'video/webm'},body:Uint8Array.from(atob(b64),c=>c.charCodeAt(0))}).then(r=>r.json()),fs.readFileSync(path.join(root,'demo-assets/lesson.webm')).toString('base64'));assert(result.success);uploadUrl=result.url;
      assert((await business({action:'addVideo',video:{course_id:courseId,title:'QA Video',content_type:'video',video_url:uploadUrl,progress_mode:'manual',order:1,require_previous:'no'}})).success);videoId=(await business({action:'getVideos',courseId})).videos[0].video_id;
    });
    await check('Original group creation, membership, and course enrollment actions',async()=>{
      assert((await business({action:'addGroup',groupName:'QA Group',description:'Regression fixture'})).success);const g=(await business({action:'getGroups'})).groups.find(g=>g.group_name==='QA Group');assert(g);assert((await business({action:'addGroupMember',groupId:g.group_id,userEmail:'qa@test.local'})).success);assert((await business({action:'enrollGroup',groupId:g.group_id,courseId})).success);
    });
    await check('Create, edit, and delete announcements, paths, packages, banks, surveys, sessions, rooms and support data',async()=>{
      const cols=['announcements','learning_paths','paid_packages','question_bank','question_groups','survey_library','sessions','conference_rooms','coupons','faqs','tech_support_tickets','user_tasks'];
      for(const collection of cols){const r=await page.evaluate(async collection=>{const api=await import('/data-client.js');const ref=api.doc(api.db,collection,'qa-fixture');await api.setDoc(ref,{title:'QA Fixture',name:'QA Fixture',status:'active'});await api.updateDoc(ref,{title:'Updated QA Fixture'});const snap=await api.getDoc(ref);const value=snap.data();await api.deleteDoc(ref);return value.title;},collection);assert.equal(r,'Updated QA Fixture');}
    });
    await check('Certificate template create and delete through existing business actions',async()=>{const r=await business({action:'saveCertTemplate',template:{name:'QA Template',body:'QA certificate'}});assert(r.success);assert((await business({action:'getCertTemplates'})).templates.some(t=>t.id===r.id));assert((await business({action:'deleteCertTemplate',templateId:r.id})).success);});
    await check('Excel export downloads a nonempty workbook',async()=>{await page.evaluate(()=>showTab('users'));const download=page.waitForEvent('download');await page.evaluate(()=>exportVisibleUsers());const file=await download;const target=await file.path();assert(fs.statSync(target).size>0);});
    await check('Arabic/English switch and dark mode buttons',async()=>{await page.evaluate(()=>setLanguage('en'));assert.equal(await page.locator('html').getAttribute('dir'),'ltr');await page.evaluate(()=>setLanguage('ar'));assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.evaluate(()=>toggleDarkMode());await page.evaluate(()=>toggleDarkMode());});
    await check('Server session survives refresh',async()=>{await page.reload({waitUntil:'networkidle'});await page.locator('#admin-screen').waitFor({state:'visible'});});
    const tc=await browser.newContext({viewport:{width:1440,height:1000}}),tp=await tc.newPage();tp.setDefaultTimeout(6000);tp.on('pageerror',e=>report.errors.push(e.message));
    await check('Trainee login and enrolled course playback',async()=>{await tp.goto(base,{waitUntil:'networkidle'});await tp.locator('#l-email').fill('qa@test.local');await tp.locator('#l-pass').fill('Browser-trainee-2026');await tp.locator('#login-screen button[onclick="doLogin()"]').click();await tp.locator('#trainee-screen').waitFor({state:'visible'});await tp.waitForTimeout(500);await tp.evaluate(()=>showTraineeTab('my-courses'));await tp.locator('[data-hub-action="open-course"][data-id="'+courseId+'"]:visible').first().waitFor({state:'visible'});await tp.locator('[data-hub-action="open-course"][data-id="'+courseId+'"]:visible').first().click();await tp.locator('video:visible').waitFor();await tp.locator('video').evaluate(v=>v.play());await tp.locator('video').evaluate(v=>v.ended?true:new Promise(r=>v.addEventListener('ended',()=>r(true),{once:true})));});
    await check('Manual lesson completion updates the saved progress',async()=>{await tp.getByRole('button',{name:'تمت مشاهدة الدرس',exact:true}).click();await tp.waitForTimeout(400);const r=await tp.evaluate(id=>__academy.call({action:'getProgress',userEmail:'qa@test.local',courseId:id}),courseId);assert.equal(r.progress[videoId].completed,'yes');});
    await check('Original comments, video likes and own profile changes',async()=>{const result=await tp.evaluate(async ({courseId,videoId})=>{const a=await __academy.call({action:'addComment',courseId,videoId,userEmail:'qa@test.local',userName:'QA Trainee',commentText:'QA comment'});const b=await __academy.call({action:'likeVideo',videoId,userEmail:'qa@test.local'});const c=await __academy.call({action:'updateUser',email:'qa@test.local',updates:{full_name:'Updated QA Trainee'}});return [a.success,b.success,c.success];},{courseId,videoId});assert.deepEqual(result,[true,true,true]);});
    await check('Exam failure, retry, pass and survey submission using the original player buttons',async()=>{
      await business({action:'addVideo',video:{course_id:courseId,title:'QA Exam',content_type:'exam',questions:[{type:'choice',text:'Select A',options:['A','B'],correctIndex:0}],pass_score:1,time_minutes:0,require_previous:'no',progress_mode:'manual',order:2}});
      await business({action:'addVideo',video:{course_id:courseId,title:'QA Survey',content_type:'survey',questions:[{type:'text',text:'Your opinion'}],require_previous:'no',progress_mode:'manual',order:3}});
      await tp.evaluate(()=>document.querySelectorAll('[id^="m-"]').forEach(e=>e.classList.add('hidden')));
      await tp.evaluate(id=>openPlayer(id),courseId);await tp.locator('[onclick="startExamItem()"]:visible').click();await tp.locator('input[name="assess-0"][value="1"]').check();await tp.locator('[onclick="submitAssessmentItem(false)"]:visible').click();await tp.waitForTimeout(300);
      await tp.locator('[onclick="startExamItem()"]:visible').click();await tp.locator('input[name="assess-0"][value="0"]').check();await tp.locator('[onclick="submitAssessmentItem(false)"]:visible').click();await tp.waitForTimeout(300);
      await tp.locator('#vpc-2').click();await tp.locator('textarea.survey-answer').fill('QA feedback');await tp.locator('[onclick="submitSurveyItem()"]:visible').click();await tp.waitForTimeout(300);
      const r=await tp.evaluate(id=>__academy.call({action:'getProgress',userEmail:'qa@test.local',courseId:id}),courseId);assert.equal(Object.values(r.progress).filter(x=>x.completed==='yes').length,3);
    });
    await check('Completed trainee receives a certificate with the existing issuance action',async()=>{
      const r=await tp.evaluate(id=>__academy.call({action:'issueCertificate',userEmail:'qa@test.local',userName:'QA Trainee',courseId:id,courseName:'QA Course',pointsAwarded:10}),courseId);assert(r.success,r.error);
      const certs=await tp.evaluate(()=>__academy.call({action:'getUserCertificates',userEmail:'qa@test.local'}));assert(certs.certificates.some(c=>c.courseId===courseId));
    });
    await check('Chat sends and the recipient receives the saved message',async()=>{
      await page.evaluate(()=>openChatWith('qa@test.local'));await page.locator('#chat-input').fill('QA live chat');await page.locator('[onclick="sendChatMessage()"]:visible').click();
      const result=await tp.evaluate(async()=>{const api=await import('/data-client.js');const snap=await api.getDocs(api.query(api.collection(api.db,'chat_messages'),api.where('toEmail','==','qa@test.local')));return snap.docs.map(d=>d.data());});assert(result.some(x=>x.body==='QA live chat'));
    });
    await check('Dashboard widgets fit at desktop, tablet and phone widths',async()=>{
      await page.evaluate(()=>closeChatModal());await page.evaluate(()=>showTab('dash'));
      for(const width of [1920,1440,1024,900,714,480,360]){await page.setViewportSize({width,height:800});await page.waitForTimeout(80);const fit=await page.locator('#adv16-dashboard-canvas').evaluate(e=>{const b=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth+1&&[...e.children].every(w=>{const r=w.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1;});});assert(fit,'Overflow at '+width);}
      await page.setViewportSize({width:1440,height:1000});
    });
    await check('Sidebar labels stay stable while switching pages',async()=>{
      const labels=()=>page.locator('.sidebar').textContent();const before=await labels();for(const tab of ['users','courses','permissions','settings','question-bank','dash']){await page.evaluate(t=>showTab(t),tab);for(const delay of [0,80,250]){if(delay)await page.waitForTimeout(delay);assert.equal(await labels(),before,'Labels changed on '+tab);}}
    });
    await check('Dashboard reordering, resizing and saved layout work',async()=>{
      await page.evaluate(()=>showTab('dash'));await page.locator('[onclick="adv16ToggleDashboardEdit()"]:visible').click();await page.waitForTimeout(80);const widgets=page.locator('#adv16-dashboard-canvas .adv16-widget');const firstId=await widgets.nth(0).getAttribute('data-widget-id');const secondId=await widgets.nth(1).getAttribute('data-widget-id');await widgets.nth(0).dragTo(widgets.nth(1));await page.waitForTimeout(100);
      const target=page.locator('#adv16-dashboard-canvas .adv16-widget').first();const before=await target.boundingBox();const handle=target.locator('.adv16-resize');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+35,{steps:5});await page.mouse.up();await page.locator('[onclick="adv16SaveDashboardLayout()"]:visible').click();await page.waitForTimeout(200);
      const saved=await page.evaluate(async()=>{const api=await import('/data-client.js');return (await api.getDoc(api.doc(api.db,'settings','admin_dashboard'))).data();});assert.equal(saved.layout[0].id,secondId);assert.equal(saved.layout[1].id,firstId);assert(saved.layout[0].h>before.height);
    });
    await check('Brand settings persist: name, colors, light theme and zero opacity',async()=>{
      await page.evaluate(()=>showTab('settings'));await page.locator('#set-name').fill('QA Identity');await page.locator('#set-primary').fill('#1565c0');await page.locator('#set-theme').selectOption('light');await page.locator('#set-bg-opacity').evaluate(e=>e.value='0');await page.locator('[onclick="saveSettings()"]:visible').click();await page.waitForTimeout(200);const result=await business({action:'getSettings'});assert.equal(result.settings.academy_name,'QA Identity');assert.equal(result.settings.background_opacity,0);assert.equal(result.settings.theme,'light');
    });
    await check('Style partners, header and footer save and render without competing tabs',async()=>{
      await page.evaluate(()=>showStyleSub('partners'));await page.locator('#partner-name').fill('QA Partner');await page.locator('#partner-url').fill('https://example.com');await page.locator('[onclick="addPartnerItem()"]:visible').click();await page.waitForTimeout(200);
      await page.evaluate(()=>showStyleSub('chrome'));await page.locator('#hdr-title').fill('QA Header');await page.locator('#hdr-url').fill('https://example.com');await page.locator('[onclick="addHeaderLink()"]:visible').click();await page.waitForTimeout(200);await page.locator('#ftr-title').fill('QA Footer');await page.locator('[onclick="addFooterBlock()"]:visible').click();await page.waitForTimeout(200);
      const extra=await page.evaluate(async()=>{const api=await import('/data-client.js');return (await api.getDoc(api.doc(api.db,'settings','academy_extra'))).data();});assert.equal(extra.partners[0].name,'QA Partner');assert.equal(extra.headerLinks[0].title,'QA Header');assert.equal(extra.footerBlocks[0].title,'QA Footer');
    });
    await check('Home section visibility and order persist',async()=>{
      await page.evaluate(()=>showStyleSub('homepage'));if(await page.locator('#home-sec-faq').isChecked())await page.locator('#home-sec-faq').locator('..').click();await page.evaluate(()=>adv7MoveHomeSection([...document.querySelectorAll('#adv-style-extra input[id^=home-sec-]')].findIndex(e=>e.id==='home-sec-faq'),-1));await page.locator('[onclick="saveStyleHomepage()"]:visible').click();await page.waitForTimeout(200);const extra=await page.evaluate(async()=>{const api=await import('/data-client.js');return (await api.getDoc(api.doc(api.db,'settings','academy_extra'))).data();});assert.equal(extra.visibleSections.faq,false);assert.equal(extra.homeLayout.indexOf('faq'),extra.homeLayout.indexOf('partners')-1);
    });
    await check('General settings save active restrictions and clearly disable unavailable integrations',async()=>{
      await page.evaluate(()=>showStyleSub('general'));for(const id of ['st-email-verify','st-captcha','st-2fa','st-block-shot'])assert(await page.locator('#'+id).isDisabled());if(!await page.locator('#st-disable-chat').isChecked())await page.locator('#st-disable-chat').locator('..').click();if(!await page.locator('#st-prevent-profile').isChecked())await page.locator('#st-prevent-profile').locator('..').click();await page.locator('[onclick="saveStyleGeneral()"]:visible').click();await page.waitForTimeout(200);const extra=await page.evaluate(async()=>{const api=await import('/data-client.js');return (await api.getDoc(api.doc(api.db,'settings','academy_extra'))).data();});assert.equal(extra.general.disableChat,true);assert.equal(extra.general.preventProfileEdit,true);
    });
    await check('Role permission controls save and affect the server permission result',async()=>{
      await page.evaluate(()=>showTab('permissions'));await page.locator('#perm-role-kind').selectOption('trainer');await page.waitForTimeout(150);const input=page.locator('#role-wide-perms [data-key="content.courses.create"]');await input.evaluate(e=>{e.closest('details').open=true;});if(await input.isChecked())await input.locator('..').click();await page.locator('[onclick="saveRoleWidePermissions()"]:visible').click();await page.waitForTimeout(200);const data=await page.evaluate(async()=>{const api=await import('/data-client.js');return (await api.getDoc(api.doc(api.db,'role_permissions','trainer'))).data();});assert.equal(data.permissions['content.courses.create'],false);
    });
    await check('No uncaught browser JavaScript exceptions',async()=>assert.deepEqual(report.errors,[]));
    await tc.close();
  }catch(e){report.tests.push({name:'Suite setup',status:'failed',error:e.stack});}
  finally{await browser?.close();if(server)await new Promise(r=>{server.once('exit',r);server.kill();});fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/browser.json'),JSON.stringify(report,null,2));const failed=report.tests.filter(x=>x.status!=='passed');console.log(`${report.tests.length-failed.length}/${report.tests.length} browser checks passed`);process.exitCode=failed.length?1:0;}
})();
