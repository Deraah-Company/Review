import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderedContent,unmetPrerequisites,validateContentRules} from '../public/access-rules.js';
const items=[{video_id:'section',content_type:'section',order:1},{video_id:'video',section_id:'section',order:2},{video_id:'exam',content_type:'exam',order:3},{video_id:'pdf',content_type:'pdf',order:4},{video_id:'survey',content_type:'survey',order:5}];
test('sections never count as prerequisites; ordering follows the displayed tree',()=>assert.deepEqual(orderedContent(items).map(x=>x.video_id),['video','exam','pdf','survey']));
for(const type of ['video','pdf','exam','question','survey'])test('explicit completion rules for '+type,()=>{
 const item={video_id:'target',content_type:type,access_rules:{required_items:['video','exam']}};
 assert.deepEqual(unmetPrerequisites(item,items,{content_sequence:'open'},{video:{completed:'yes'}}),['exam']);
 assert.deepEqual(unmetPrerequisites(item,items,{content_sequence:'open'},{video:{progressPercent:100},exam:{completed:'yes'}}),[]);
});
test('course sequential default applies even when an item was previously always open',()=>assert.deepEqual(unmetPrerequisites({...items[3],require_previous:'no'},items,{content_sequence:'sequential'},{}),['exam']));
test('course open default permits navigation without custom rules',()=>assert.deepEqual(unmetPrerequisites(items[3],items,{content_sequence:'open'},{}),[]));
test('legacy course settings retain previous-item behavior',()=>assert.deepEqual(unmetPrerequisites(items[3],items,{},{}),['exam']));
test('self references, missing prerequisites and malformed rules are rejected',()=>{
 for(const required_items of [['a'],['missing'],'bad'])assert(validateContentRules([{video_id:'a',access_rules:{required_items}}],{content_sequence:'open'}));
});
test('indirect rule cycles and course defaults that introduce cycles are rejected',()=>{
 const nodes=[{video_id:'a',order:1,access_rules:{required_items:['b']}},{video_id:'b',order:2,require_previous:'no'}];
 assert.equal(validateContentRules(nodes,{content_sequence:'open'}),'');
 assert.equal(validateContentRules(nodes,{content_sequence:'sequential'}),'cycle');
});
test('an explicitly open item overrides the sequential course setting',()=>assert.deepEqual(unmetPrerequisites({...items[3],access_rules:{mode:'open'}},items,{content_sequence:'sequential'},{}),[]));
test('explicit previous-item requirements work even in an open course',()=>assert.deepEqual(unmetPrerequisites({...items[3],access_rules:{mode:'previous'}},items,{content_sequence:'open'},{}),['exam']));
test('section requirements include all section items and expand when another item is added',()=>{const target={video_id:'target',access_rules:{mode:'required',required_sections:['section']}},base=[...items,target];assert.deepEqual(unmetPrerequisites(target,base,{content_sequence:'open'},{video:{completed:true}}),[]);assert.deepEqual(unmetPrerequisites(target,[...base,{video_id:'new',section_id:'section',order:2.5}],{content_sequence:'open'},{video:{completed:true}}),['new']);});
test('a section cannot depend on itself, and empty custom requirements are rejected',()=>{assert(validateContentRules([{video_id:'s',content_type:'section'},{video_id:'v',section_id:'s',access_rules:{mode:'required',required_sections:['s']}}]));assert(validateContentRules([{video_id:'v',access_rules:{mode:'required'}}]));});
