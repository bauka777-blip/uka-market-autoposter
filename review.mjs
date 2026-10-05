export const BACKEND='https://uka-market-tiktok.nurpeisovbg847.workers.dev';
export function resetReviewSession(storage){
 storage.removeItem('uka_review_session');
 storage.removeItem('uka_review_verifier');
}
export function viewForJob(job){
 const success=job.inbox_delivered || job.status==='SEND_TO_USER_INBOX';
 const failed=job.status==='FAILED' || job.state==='INIT_REJECTED';
 const uncertain=job.state==='UPLOAD_UNCERTAIN';
 return {success,canUpload:job.can_upload===true,message:success?'Видео отправлено в TikTok. Откройте уведомление TikTok, чтобы отредактировать и опубликовать видео.':failed?'TikTok не смог обработать видео. Повторная отправка этого задания заблокирована.':uncertain?'Результат отправки уточняется. Не отправляйте ролик повторно. Проверяйте статус.':job.can_upload?'Видео готово к отправке.':job.status==='PROCESSING_UPLOAD'?'TikTok обрабатывает видео.':'Видео передано. Ожидаем результат TikTok.',terminal:success || failed || job.status==='PUBLISH_COMPLETE'};
}
export function mount(doc=globalThis.document){
 const el=id=>doc.getElementById(id);
 let session=sessionStorage.getItem('uka_review_session'),videoHash=null,busy=false,pollTimer=null,polls=0;
 const notify=text=>{el('notice').textContent=text;el('notice').hidden=!text;};
 el('reset-session').addEventListener('click',()=>{
  if(busy)return;
  clearTimeout(pollTimer);
  resetReviewSession(sessionStorage);
  location.reload();
 });
 async function api(path,body){
  const headers={};if(session)headers.Authorization='Bearer '+session;
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await fetch(BACKEND+'/review/'+path,{method:body===undefined?'GET':'POST',headers,credentials:'omit',redirect:'error',...(body!==undefined?{body:JSON.stringify(body)}:{})});
  let result;try{result=await res.json();}catch{throw new Error('Сервис временно недоступен. Обновите страницу.');}
  if(!res.ok){if(res.status===401){session=null;sessionStorage.removeItem('uka_review_session');el('upload').disabled=true;el('connect').hidden=false;el('connection').textContent='Подключите TikTok заново.';}
   if(path==='upload' && result.state)return result;
   throw new Error(res.status===401?'Подключите TikTok заново.':'Не удалось выполнить действие. Повторную отправку видео не запускайте.');}
  return result;
 }
 function displayJob(job){
  const view=viewForJob(job);videoHash=job.video?.sha256 || videoHash;
  el('upload').disabled=busy || !session || !view.canUpload;
  el('job-message').textContent=view.canUpload?'Отправка начнётся только после вашего подтверждения.':'Это задание уже было запущено. Повторная отправка заблокирована.';
  el('upload-status').textContent=view.message;el('success').hidden=!view.success;
  el('check-status').hidden=view.terminal || view.canUpload || !job.publish_id;
  el('progress').hidden=view.canUpload || view.terminal;
  if(!view.canUpload && !view.terminal)el('progress').value=80;
  if(view.terminal){clearTimeout(pollTimer);pollTimer=null;}
  return view;
 }
 async function poll(){
  try{const job=await api('job');const view=displayJob(job);polls++;
   if(!view.terminal && !view.canUpload && job.publish_id && polls<120)pollTimer=setTimeout(poll,5000);
  }catch(e){notify(e.message);el('check-status').hidden=false;}
 }
 el('connect').addEventListener('click',async()=>{
  if(busy)return;busy=true;el('connect').disabled=true;notify('');
  try{const bytes=crypto.getRandomValues(new Uint8Array(32));const verifier=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
   sessionStorage.setItem('uka_review_verifier',verifier);
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
   const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
   const result=await api('login',{challenge});const url=new URL(result.url);
   if(url.origin!==BACKEND || url.pathname!=='/oauth/tiktok/start')throw new Error('Не удалось открыть безопасный вход.');
   location.assign(url.href);
  }catch(e){notify(e.message);busy=false;el('connect').disabled=false;}
 });
 el('upload').addEventListener('click',()=>{if(busy || !session || !videoHash || el('upload').disabled)return;el('consent').checked=false;el('confirm-send').disabled=true;el('confirmation').showModal();});
 el('consent').addEventListener('change',()=>{el('confirm-send').disabled=!el('consent').checked || busy;});
 el('cancel-send').addEventListener('click',()=>el('confirmation').close());
 el('confirm-send').addEventListener('click',async()=>{
  if(busy || !el('consent').checked || !session || !videoHash)return;
  busy=true;el('confirmation').close();el('upload').disabled=true;el('confirm-send').disabled=true;
  el('progress').hidden=false;el('progress').removeAttribute('value');
  el('upload-status').textContent='Начинаем отправку и передаём видео в TikTok. Не закрывайте страницу.';notify('');
  try{const job=await api('upload',{confirmed:true,video_sha256:videoHash});displayJob(job);busy=false;await poll();}
  catch(e){busy=false;notify(e.message);el('upload').disabled=true;await poll();}
 });
 el('check-status').addEventListener('click',()=>{clearTimeout(pollTimer);polls=0;poll();});
 async function init(){
  const params=new URLSearchParams(location.hash.slice(1));const code=params.get('review_code');
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  try{
   if(code){const verifier=sessionStorage.getItem('uka_review_verifier');if(!verifier)throw new Error('Откройте подключение заново в этом браузере.');
    const result=await api('session',{code,verifier});session=result.session;sessionStorage.setItem('uka_review_session',session);sessionStorage.removeItem('uka_review_verifier');}
   if(!session)return;
   el('connection').textContent='TikTok подключён';el('connect').hidden=true;el('reset-session').hidden=false;
   try{const me=await api('me');el('profile').hidden=false;el('display-name').textContent=me.profile.display_name;el('avatar').hidden=!me.profile.avatar_url;if(me.profile.avatar_url)el('avatar').src=me.profile.avatar_url;}
   catch(e){notify('Не удалось получить профиль. '+e.message);}
   if(session)await poll();
  }catch(e){notify(e.message);}
 }
 return {ready:init()};
}
if(typeof document!=='undefined')mount();
