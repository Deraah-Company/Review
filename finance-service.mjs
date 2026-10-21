// Financial reporting is derived from purchases only: transaction mirrors are never counted twice.
export function createFinanceService({get,rows,put,can,fail}){
 const values=c=>rows(c).map(x=>({...x.data,id:x.id}));
 const cents=x=>Math.round((Number(x)||0)*100),money=x=>x/100;
 const monthOf=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit'}).format(d).replace('/', '-');};
 const monthKey=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
 function report(filter={}){
  const currency=String(filter.currency||'SAR').toUpperCase(),courseId=String(filter.courseId||''),kind=filter.kind||'all';
  if(!/^[A-Z]{3}$/.test(currency)||!['all','actual','demo'].includes(kind))fail('مرشحات التقرير غير صالحة');
  const courses=values('courses'),courseMap=new Map(courses.map(c=>[c.course_id||c.id,c])),packages=new Map(values('paid_packages').map(p=>[p.id,p])),people=new Map(values('users').map(u=>[u.email,u]));
  const purchases=values('purchases'),availableMonths=[...new Set(purchases.map(p=>monthOf(p.createdAt||p.created_at||p.date)).filter(Boolean))].sort().reverse();
  const requested=filter.months||[availableMonths[0]||monthOf(Date.now())];if(!Array.isArray(requested)||requested.length>120||requested.some(m=>!monthKey(m)))fail('اختر شهورًا صالحة');
  const months=[...new Set(requested)].sort(),selected=new Set(months);let omitted=0;
  const detail=[];
  for(const p of purchases){
   const month=monthOf(p.createdAt||p.created_at||p.date);if(!month){omitted++;continue;}if(!selected.has(month)||String(p.currency||'SAR').toUpperCase()!==currency)continue;
   if(!['paid','completed','paid_fake','refunded','partially_refunded'].includes(p.status))continue;
   const demo=p.status==='paid_fake'||p.demo===true;if(kind==='actual'&&demo||kind==='demo'&&!demo)continue;
   const ids=[...new Set(p.courseId?[p.courseId]:p.courseIds?.length?p.courseIds:packages.get(p.packageId)?.courseIds||[])];
   if(courseId&&!ids.includes(courseId))continue;
   const allocate=amount=>courseId&&ids.length>1?Math.floor(amount/ids.length)+(ids.indexOf(courseId)<amount%ids.length?1:0):amount;
   const gross=Math.max(0,cents(p.amount??p.price??p.finalAmount)),discount=Math.max(0,cents(p.discountAmount??p.discount??0)),paid=Math.max(0,cents(p.finalAmount??Math.max(0,money(gross-discount))));
   const totalDiscount=Math.max(discount,gross-paid,0),bonus=Math.min(totalDiscount,Math.max(0,cents(p.bonusDiscount??p.bonus_discount??p.pointsDiscount??p.rewardDiscount??0))),coupon=p.couponCode?Math.min(totalDiscount-bonus,Math.max(0,cents(p.couponDiscount??money(totalDiscount-bonus)))):0;
   const refund=Math.min(paid,Math.max(0,cents(p.refundAmount??p.refundedAmount??(p.status==='refunded'?money(paid):0))));
   const person=people.get(p.userEmail)||{},item=courseId?courseMap.get(courseId):courseMap.get(p.courseId);
   detail.push({id:p.id,month,date:p.createdAt||p.created_at||p.date,email:p.userEmail||'',name:p.userName||person.full_name||p.userEmail||'',employee_id:person.employee_id||'',title:item?.course_name_ar||item?.course_name||p.packageTitle||p.courseName||p.courseId||p.packageId||'',title_en:item?.course_name_en||p.packageTitle||p.courseName||'',courseIds:ids,currency,status:p.status,demo,allocated:!!courseId&&ids.length>1,gross:allocate(gross),discount:allocate(totalDiscount),bonus:allocate(bonus),coupon:allocate(coupon),otherDiscount:0,paid:allocate(paid),refund:allocate(refund),net:0,couponCode:p.couponCode||''});
   const d=detail.at(-1);d.discount=d.gross-d.paid;d.bonus=Math.min(d.bonus,d.discount);d.coupon=Math.min(d.coupon,d.discount-d.bonus);d.otherDiscount=d.discount-d.bonus-d.coupon;d.net=d.paid-d.refund;
  }
  const aggregate=list=>{const sum=k=>money(list.reduce((s,r)=>s+r[k],0));return {orders:list.length,learners:new Set(list.map(r=>r.email)).size,gross:sum('gross'),discount:sum('discount'),bonus:sum('bonus'),coupon:sum('coupon'),otherDiscount:sum('otherDiscount'),paid:sum('paid'),refund:sum('refund'),net:sum('net'),demoOrders:list.filter(x=>x.demo).length};};
  const stored=get('settings','financial_targets')||{};
  const monthly=months.map(month=>{const s=aggregate(detail.filter(r=>r.month===month)),config=stored.months?.[month]?.[currency],target=Number(courseId?config?.courses?.[courseId]:config?.overall)||0;return {month,...s,target,achievement:target?Math.round(s.net/target*100):null,remaining:Math.max(0,target-s.net)};});
  const summary=aggregate(detail),target=monthly.reduce((s,m)=>s+m.target,0);
  return {currency,kind,courseId,months,availableMonths,currencies:[...new Set(['SAR',...purchases.map(p=>String(p.currency||'SAR').toUpperCase())])],courses:courses.map(c=>({id:c.course_id||c.id,title:c.course_name_ar||c.course_name||c.id,title_en:c.course_name_en||c.course_name||c.id})),summary:{...summary,target,achievement:target?Math.round(summary.net/target*100):null,remaining:Math.max(0,target-summary.net)},monthly,details:detail.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(d=>({...d,...Object.fromEntries(['gross','discount','bonus','coupon','otherDiscount','paid','refund','net'].map(k=>[k,money(d[k])]))})),omitted,allocation:detail.some(d=>d.allocated),generatedAt:Date.now()};
 }
 async function handle({req,res,url,user,body,json}){
  if(!url.pathname.startsWith('/api/finance/'))return false;
  if(!user)fail('سجل الدخول أولًا',401);if(!can(user,'reports.financial'))fail('ليست لديك صلاحية تقارير الشراء',403);if(req.method!=='POST')fail('طريقة غير مسموحة',405);
  const input=await body(req);
  if(url.pathname==='/api/finance/report'){json(res,200,{success:true,...report(input)});return true;}
  if(url.pathname==='/api/finance/target'){
   const {month,currency='SAR',courseId='',target}=input;if(!monthKey(month)||!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(Number(target))||Number(target)<0||Number(target)>1e12)fail('المستهدف أو الشهر غير صالح');
   if(courseId&&!get('courses',courseId))fail('الدورة غير موجودة',404);
   const data=get('settings','financial_targets')||{};data.months||={};data.months[month]||={};const value=data.months[month][currency]||={overall:0,courses:{}};value.courses||={};if(courseId)value.courses[courseId]=money(cents(target));else value.overall=money(cents(target));put.run('settings','financial_targets',JSON.stringify(data));json(res,200,{success:true});return true;
  }
  fail('التقرير غير موجود',404);
 }
 return {handle,report};
}
