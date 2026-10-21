import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courseAvailability} from '../public/course-policy.js';
import {prerequisites} from '../public/access-rules.js';
const now=Date.parse('2026-10-19T12:00:00Z');
test('full courses stay visible but locked unless hide-when-full is selected',()=>{
 const course={rules:{capacity:1}};assert.equal(courseAvailability(course,{enrolledCount:1}).reason,'full');assert.equal(courseAvailability(course,{enrolledCount:1}).hiddenFromAvailable,false);course.rules.hideWhenFull=true;assert.equal(courseAvailability(course,{enrolledCount:1}).hiddenFromAvailable,true);
});
test('prerequisite completion, not enrollment, controls requirement visibility',()=>{
 const course={rules:{hideWhenRequirementsFail:true}};assert.equal(courseAvailability(course,{prerequisitesDone:false}).hiddenFromAvailable,true);assert.equal(courseAvailability(course,{prerequisitesDone:true}).locked,false);
});
test('release opening hours and enrollment access expiry use precise boundaries',()=>{
 const course={release_date:'2026-10-19T14:00:00Z',rules:{showBeforeHours:2,closeAfterDays:1}};assert.equal(courseAvailability(course,{now}).reason,'');assert.equal(courseAvailability(course,{now:now-1}).reason,'upcoming');assert.equal(courseAvailability(course,{now,enrollment:{enrolledAt:now-86400001}}).reason,'access-expired');assert.equal(courseAvailability(course,{now,enrollment:{enrolledAt:now-86400000}}).accessExpired,false);
});
test('closed enrollment and path-only visibility do not remove enrolled learner access',()=>{
 const course={rules:{disableEnrollment:true,hideOutsidePath:true}};assert.equal(courseAvailability(course).reason,'disabled');assert.equal(courseAvailability(course).hiddenFromAvailable,true);assert.equal(courseAvailability(course,{enrollment:{enrolledAt:now},now}).locked,false);
});
test('direct content access relaxes sequential rules and preserves explicit prerequisites',()=>{
 const items=[{video_id:'a',order:1},{video_id:'b',order:2}];assert.deepEqual(prerequisites(items[1],items,{content_sequence:'sequential',rules:{directAccess:true}}),[]);assert.deepEqual(prerequisites({...items[1],access_rules:{required_items:['a']}},items,{rules:{directAccess:true}}),['a']);
});
