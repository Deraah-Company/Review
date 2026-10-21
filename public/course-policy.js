export function courseAvailability(course,{enrollment=null,prerequisitesDone=true,enrolledCount=0,now=Date.now()}={}){
 const rules=course.rules||course.course_rules||{},full=Number(rules.capacity)>0&&enrolledCount>=Number(rules.capacity);
 const release=Date.parse(course.release_date||''),end=Date.parse(course.end_date||'');
 const future=Number.isFinite(release)&&now<release-Math.max(0,Number(rules.showBeforeHours)||0)*3600000;
 const expired=Number.isFinite(end)&&now>end+86400000;
 const enrolledAt=Number(enrollment?.enrolledAt||enrollment?.enrolled_at)||Date.parse(enrollment?.enrolled_at||enrollment?.enrolledAt||'');
 const accessExpired=!!enrollment&&Number(rules.closeAfterDays)>0&&Number.isFinite(enrolledAt)&&now>enrolledAt+Number(rules.closeAfterDays)*86400000;
 const reason=accessExpired?'access-expired':expired?'ended':future?'upcoming':!enrollment&&rules.disableEnrollment?'disabled':!enrollment&&full?'full':!enrollment&&!prerequisitesDone?'prerequisites':'';
 return {reason,locked:!!reason,hiddenFromAvailable:future||expired||!!rules.hideOutsidePath||full&&!!rules.hideWhenFull||!prerequisitesDone&&!!rules.hideWhenRequirementsFail,full,accessExpired};
}
