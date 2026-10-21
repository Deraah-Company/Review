// Local payment simulator. Totals, coupon eligibility and usage are checked on the server.
export function createCheckoutService({get,rows,put,operation,db,fail,randomUUID}){
 const cents=n=>Math.round((Number(n)||0)*100),money=n=>n/100;
 function quote(user,input){
  const type=input.itemType==='course'?'course':'package',id=String(input.id||''),item=get(type==='course'?'courses':'paid_packages',id);
  if(!item||!(type==='course'?item.status==='active'&&(!item.approval_status||item.approval_status==='approved'):['published','active'].includes(item.status)))fail('العنصر غير متاح للشراء',403);
  const price=type==='course'?(item.pricing?.price??item.price):item.price,currency=item.pricing?.currency||item.currency||'SAR',gross=cents(price);
  if(gross<=0)fail('لا يوجد سعر صالح لهذا العنصر');
  const courseIds=type==='course'?[id]:[...new Set(item.courseIds||[])];if(!courseIds.length)fail('لا توجد دورات في الباقة');
  const code=String(input.couponCode||'').trim().toUpperCase();let coupon=null,discount=0;
  if(code){
   coupon=rows('coupons').map(x=>({...x.data,id:x.id})).find(c=>String(c.code||'').toUpperCase()===code);
   if(!coupon||coupon.active===false)fail('كوبون الخصم غير صالح أو متوقف');
   const audience=(coupon.userEmails||[]).map(e=>String(e).toLowerCase());
   if(audience.length&&!audience.includes(user.email)||coupon.courseId&&!courseIds.includes(coupon.courseId)&&coupon.courseId!==id)fail('كوبون الخصم غير متاح لهذا المستخدم أو لهذه الدورة');
   const expires=coupon.expiresAt||coupon.expiryDate||coupon.endDate;if(expires&&new Date(expires).getTime()<Date.now())fail('انتهت صلاحية كوبون الخصم');
   const starts=coupon.startsAt||coupon.startDate;if(starts&&new Date(starts).getTime()>Date.now())fail('لم تبدأ صلاحية كوبون الخصم');
   if(coupon.currency&&coupon.currency!==currency)fail('عملة الكوبون لا تطابق عملة الشراء');
   const actual=rows('purchases').filter(x=>x.data.couponId===coupon.id&&['paid','paid_fake','completed'].includes(x.data.status)).length;
   if(Number(coupon.usageLimit)>0&&Math.max(Number(coupon.used)||0,actual)>=Number(coupon.usageLimit))fail('تم بلوغ الحد الأقصى لاستخدام الكوبون');
   const percent=Number(coupon.percent);if(!Number.isFinite(percent)||percent<0||percent>100)fail('نسبة خصم الكوبون غير صالحة');
   discount=Math.min(gross,Math.round(gross*percent/100),Number(coupon.maxDiscount)>0?cents(coupon.maxDiscount):gross);
  }
  return {itemType:type,id,title:item.course_name||item.title,courseIds,currency,amount:money(gross),discountAmount:money(discount),finalAmount:money(gross-discount),couponCode:code,couponId:coupon?.id||'',coupon};
 }
 async function handle({req,res,url,user,body,json}){
  if(!url.pathname.startsWith('/api/checkout/'))return false;if(!user)fail('سجل الدخول أولًا',401);if(req.method!=='POST')fail('طريقة غير مسموحة',405);
  const input=await body(req,8192);
  if(url.pathname==='/api/checkout/preview'){const {coupon,...total}=quote(user,input);json(res,200,{success:true,...total});return true;}
  if(url.pathname!=='/api/checkout/simulate')return false;
  const token=String(input.token||'');if(!/^[a-zA-Z0-9_-]{16,100}$/.test(token))fail('معرّف عملية الشراء غير صالح');
  const purchaseId=user.email+'|'+token,old=get('purchases',purchaseId);if(old){if(old.itemType!==input.itemType||(old.courseId||old.packageId)!==input.id)fail('معرّف العملية مستخدم لعنصر آخر');json(res,200,{success:true,purchase:old,alreadyProcessed:true});return true;}
  db.exec('BEGIN IMMEDIATE');try{
   const {coupon,...total}=quote(user,input),purchase={...total,courseId:total.itemType==='course'?total.id:'',packageId:total.itemType==='package'?total.id:'',courseName:total.itemType==='course'?total.title:'',packageTitle:total.itemType==='package'?total.title:'',couponDiscount:total.discountAmount,userEmail:user.email,userName:user.full_name||user.email,createdAt:Date.now(),status:'paid_fake',demo:true};
   put.run('purchases',purchaseId,JSON.stringify(purchase));
   for(const id of total.courseIds){if(get('enrollments',user.email+'_'+id))continue;operation({op:'set',ref:{collection:'enrollments',id:user.email+'_'+id},data:{userEmail:user.email,courseId:id,enrolledAt:Date.now()}},user);}
   if(coupon)put.run('coupons',coupon.id,JSON.stringify({...coupon,used:(Number(coupon.used)||0)+1,updatedAt:Date.now()}));
   db.exec('COMMIT');json(res,200,{success:true,purchase});
  }catch(error){db.exec('ROLLBACK');throw error;}return true;
 }
 return {handle};
}
