// Shared by the player and service: content rules apply to every content type.
export const itemId = item => String(item.video_id || item.id || '');
export function orderedContent(items = []) {
  const ordered = items.slice().sort((a,b) => (Number(a.order)||0)-(Number(b.order)||0));
  const sections = new Set(ordered.filter(x=>x.content_type==='section').map(itemId));
  return ordered.flatMap(x=>x.content_type==='section'
    ? ordered.filter(y=>y.content_type!=='section' && y.section_id===itemId(x))
    : !x.section_id || !sections.has(x.section_id) ? [x] : []);
}
export function prerequisites(item, items, course = {}) {
  const rules=item.access_rules||{},mode=rules.mode,explicit=rules.required_items;
  if(mode==='open')return [];
  const list=orderedContent(items),index=list.findIndex(x=>itemId(x)===itemId(item));
  if(mode==='previous')return index>0?[itemId(list[index-1])]:[];
  const sections=rules.required_sections||[];
  if(mode==='required'||Array.isArray(explicit)&&explicit.length||sections.length)return [...new Set([...(explicit||[]).map(String),...list.filter(x=>sections.includes(x.section_id)).map(itemId)])];
  if((course.rules||course.course_rules)?.directAccess)return [];
  const sequential = course.content_sequence === 'sequential' ||
    (course.content_sequence !== 'open' && item.require_previous !== 'no');
  if(!sequential) return [];
  return index>0 ? [itemId(list[index-1])] : [];
}
export function completed(progress) {
  return progress?.completed==='yes' || progress?.completed===true || Number(progress?.progressPercent ?? progress?.progress_percent)>=100;
}
export function unmetPrerequisites(item, items, course, progress = {}) {
  return prerequisites(item,items,course).filter(id=>!completed(progress[id]));
}
export function validateContentRules(items, course = {}) {
  const ids = new Set(items.filter(x=>x.content_type!=='section').map(itemId));
  const sections=new Set(items.filter(x=>x.content_type==='section').map(itemId));
  const edges = new Map();
  for(const item of items.filter(x=>x.content_type!=='section')) {
    const required = item.access_rules?.required_items;
    if(required!==undefined && (!Array.isArray(required) || required.some(id=>typeof id!=='string'))) return 'invalid';
    const rules=item.access_rules||{},sectionIds=rules.required_sections||[];
    if(rules.mode!==undefined&&!['inherit','open','previous','required'].includes(rules.mode))return 'invalid';
    if(!Array.isArray(sectionIds)||sectionIds.some(id=>typeof id!=='string'||!sections.has(id)||id===item.section_id))return 'reference';
    if(rules.mode==='required'&&!(required||[]).length&&!sectionIds.length)return 'invalid';
    const deps = prerequisites(item,items,course);
    if(deps.some(id=>!ids.has(id)||id===itemId(item))) return 'reference';
    edges.set(itemId(item),deps);
  }
  const visiting = new Set(), visited = new Set();
  function cyclic(id) {
    if(visiting.has(id)) return true;
    if(visited.has(id)) return false;
    visiting.add(id);
    if((edges.get(id)||[]).some(cyclic)) return true;
    visiting.delete(id);visited.add(id);return false;
  }
  return [...edges.keys()].some(cyclic) ? 'cycle' : '';
}
