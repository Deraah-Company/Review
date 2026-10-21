// Shared, keyboard-accessible confirmations rendered inside the academy.
export function installSiteDialogs(h){
 const pending=[];let current=null,previousFocus=null;
 const L=(ar,en)=>h.language()==='en'?en:ar;
 const root=document.createElement('div');root.id='m-site-dialog';root.className='modal-wrap hidden no-i18n';
 root.innerHTML='<section class="modal site-dialog" role="alertdialog" aria-modal="true" aria-labelledby="site-dialog-title" aria-describedby="site-dialog-message"><div class="site-dialog-icon"><i class="ti ti-help-circle"></i></div><h2 id="site-dialog-title"></h2><p id="site-dialog-message"></p><footer><button type="button" data-dialog-cancel></button><button type="button" class="primary" data-dialog-accept></button></footer></section>';
 document.body.append(root);
 const cancel=root.querySelector('[data-dialog-cancel]'),accept=root.querySelector('[data-dialog-accept]');
 function next(){if(current||!pending.length)return;current=pending.shift();previousFocus=document.activeElement;root.querySelector('h2').textContent=current.options.title||L('تأكيد الإجراء','Confirm action');root.querySelector('p').textContent=current.message;cancel.textContent=L('إلغاء','Cancel');accept.textContent=current.options.confirmLabel||L('تأكيد','Confirm');accept.classList.toggle('danger',!!current.options.danger);accept.classList.toggle('primary',!current.options.danger);root.classList.remove('hidden');cancel.focus();}
 function settle(answer){if(!current)return;const item=current;current=null;root.classList.add('hidden');if(previousFocus?.isConnected)previousFocus.focus();item.resolve(answer);queueMicrotask(next);}
 cancel.addEventListener('click',()=>settle(false));accept.addEventListener('click',()=>settle(true));root.addEventListener('click',e=>{if(e.target===root)settle(false);});
 document.addEventListener('keydown',e=>{if(!current)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();settle(false);}else if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();(document.activeElement===cancel?accept:cancel).focus();}},true);
 return {confirm:(message,options={})=>new Promise(resolve=>{pending.push({message:String(message||''),options,resolve});next();})};
}
