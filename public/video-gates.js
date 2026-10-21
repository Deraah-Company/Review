// Shared validation and attempt calculation for timeline questions and playback.
const text=x=>String(x??'').trim();
export const gateOptionText=(option,language='ar')=>typeof option==='object'?text(language==='en'?option.text_en||option.text_ar||option.text:option.text_ar||option.text||option.text_en):text(option);
export function normalizeVideoGate(input={}){
 const type=input.type==='truefalse'?'truefalse':'choice',raw=input.options_ar?.length?input.options_ar:input.options||[];
 const options=type==='truefalse'?['صح','خطأ']:raw.map(o=>gateOptionText(o));
 const options_en=type==='truefalse'?['True','False']:(input.options_en||raw.map(o=>typeof o==='object'?text(o.text_en):'')).map(text);
 return {id:text(input.id),type,text:text(input.text_ar||input.text||input.question_ar||input.question),text_ar:text(input.text_ar||input.text||input.question_ar||input.question),text_en:text(input.text_en||input.question_en),options,options_en,correctIndex:Number(input.correctIndex??(String(input.correct)==='false'?1:0)),trigger_seconds:Number(input.trigger_seconds),rewind_seconds:Number(input.rewind_seconds??0),fallback_seconds:Number(input.fallback_seconds??0),fallback_mode:input.fallback_mode||((Number(input.fallback_seconds)||0)>0?'point':'start'),max_attempts:Number(input.max_attempts??3)};
}
export function validateVideoGates(gates,duration=0){
 if(!Array.isArray(gates)||gates.length>100)return 'count';const ids=new Set();
 for(const raw of gates){const g=normalizeVideoGate(raw);if(!g.id||ids.has(g.id))return 'id';ids.add(g.id);
  if(!g.text||g.text.length>4000)return 'question';
  if(g.options.length<2||g.options.length>12||g.options.some(o=>!o||o.length>1000)||!Number.isInteger(g.correctIndex)||g.correctIndex<0||g.correctIndex>=g.options.length)return 'options';
  if(!Number.isFinite(g.trigger_seconds)||g.trigger_seconds<=0||duration>0&&g.trigger_seconds>=duration)return 'trigger';
  if(!Number.isFinite(g.rewind_seconds)||g.rewind_seconds<0||g.rewind_seconds>=g.trigger_seconds||!Number.isFinite(g.fallback_seconds)||g.fallback_seconds<0||g.fallback_seconds>=g.trigger_seconds)return 'rewind';
  if(!Number.isInteger(g.max_attempts)||g.max_attempts<1||g.max_attempts>100)return 'attempts';
 }
 return '';
}
export function gateRevision(gate){const g=normalizeVideoGate(gate);return JSON.stringify(g);}
export function gradeVideoGate(gate,old={},choice){const g=normalizeVideoGate(gate);if(!Number.isInteger(choice)||choice<0||choice>=g.options.length)throw Error('choice');const correct=choice===g.correctIndex,failures=Number(old.failures||0)+(correct?0:1),exhausted=!correct&&failures>=g.max_attempts;return {passed:correct||!!old.passed,correct,failures,maxAttempts:g.max_attempts,remaining:Math.max(0,g.max_attempts-failures),exhausted,seekTo:correct?null:exhausted?g.fallback_seconds:g.rewind_seconds};}
