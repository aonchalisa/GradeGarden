import { updatePlan } from './src/plan-updates.js';
import { SEED } from './src/seed.js';
import { POINTS, GRADES, valid, metrics, isCounted } from './src/model.js';
import { setupAccount } from './src/account.js';
import { COURSE_GROUPS, courseGroup, groupProgress, matchesCourse, honorsProjection, requiredGpaText, genEdProgress } from './src/planning.js';
import './style.css';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>structuredClone(SEED);
let state=fresh(), year='all',query='',group='all',editing=null,dragged=null;
let account;
function fmt(n){return Number(n).toLocaleString('en-US',{maximumFractionDigits:2});}
function gpa(n){return n===null?'—':n.toFixed(2);}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function save(){account?.save(state);render();}
function cat(id){return state.categories.find(c=>c.id===id);}
function gradeOptions(selected){return GRADES.map(g=>`<option value="${g}" ${g===selected?'selected':''}>${g||'—'}</option>`).join('');}
function render(){
 const counted=state.courses.filter(isCounted),hiddenCount=state.courses.length-counted.length;
 const m=metrics(state.courses),complete=COURSE_GROUPS.filter(g=>g.id!=='unassigned'&&groupProgress(state,g).complete).length,totalCats=COURSE_GROUPS.filter(g=>g.id!=='unassigned').length;
 const sumMin=state.categories.reduce((s,c)=>s+c.min,0),allRequirements=complete===totalCats&&m.earned>=state.target;
 $('#stats').innerHTML=[['GPAX',gpa(m.gpa),'คำนวณจาก '+fmt(m.gpaCredits)+' หน่วยกิต','✧'],['หน่วยกิตที่ผ่าน',fmt(m.earned)+` <small>/ ${fmt(state.target)}</small>`,allRequirements?'ครบตามเกณฑ์ที่ตั้งไว้ ♡':'ยังขาดอีก '+fmt(Math.max(0,state.target-m.earned))+' หน่วยกิตจากยอดรวม','♡'],['หน่วยกิตในแผน',fmt(m.credits),counted.length+' วิชาที่นับ'+(hiddenCount?' · ปิดตา '+hiddenCount+' วิชา':'')+' · '+state.terms.length+' เทอม','▤'],['หมวดที่ครบแล้ว',complete+` <small>/ ${totalCats}</small>`,'นับเฉพาะหน่วยกิตที่ผ่าน','✿']].map(([label,value,bottom,icon])=>`<article class="stat"><span class="stat-icon">${icon}</span><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-bottom">${bottom}</div></article>`).join('');
 $('#requirements').innerHTML=COURSE_GROUPS.map(g=>{
   const x=groupProgress(state,g);
   if(g.id==='unassigned'&&!state.courses.some(c=>courseGroup(c.category).id===g.id))return '';
   const status=g.id==='unassigned'?'เลือกหมวดให้วิชาเหล่านี้':x.complete?'✓ ครบแล้ว'+(x.earned>x.minimum?' · เกิน '+fmt(x.earned-x.minimum)+' หน่วยกิต':''):x.missing===0&&x.genEdMissing?'หน่วยกิตครบ · GenEd ยังขาด '+x.genEdMissing+' วิชา':'ขาด'+(x.earned>=x.minimum?'ในหมวดย่อย':'')+' '+fmt(x.missing)+' หน่วยกิต';
   const details=x.categories.length>1?`<details class="subcategories"><summary>ดูหมวดย่อย ${x.categories.length} หมวด</summary>${x.categories.map(c=>{const earned=metrics(state.courses.filter(x=>x.category===c.id)).earned;return `<div class="subcategory"><span>${esc(c.name)}</span><b>${fmt(earned)} / ${fmt(c.min)}</b></div>`;}).join('')}</details>`:'';
   return `<div class="requirement"><div class="req-head"><span>${g.name}</span><b>${fmt(x.earned)} <span style="color:var(--muted);font-weight:400">/ ${g.id==='unassigned'?'—':fmt(x.minimum)}</span></b></div><div class="track"><span style="width:${x.minimum?Math.min(100,x.earned/x.minimum*100):0}%;background:${g.color}"></span></div><div class="req-status">${status} · ในแผน ${fmt(x.credits)}</div>${details}</div>`;
 }).join('');
 const genEd=genEdProgress(state);
 $('#gened-progress').innerHTML=`<div class="section-title"><h3>GenEd ในศึกษาทั่วไป</h3><b>${genEd.passed} / ${genEd.minimum} วิชา</b></div><p class="small">บังคับลง ${genEd.minimum} วิชา · ในแผน ${genEd.total} วิชา · ${genEd.complete?'ผ่านครบแล้ว':'ยังขาด '+genEd.missing+' วิชาที่ผ่าน'}</p>`;
 renderHonors();
 const visibleCourses=state.courses.filter(c=>(year==='all'||state.terms.find(t=>t.id===c.term).year===+year)&&matchesCourse(c,{query,group}));
 $('#filter-result').textContent=`${visibleCourses.length} วิชา${visibleCourses.some(c=>!isCounted(c))?' · ปิดตา '+visibleCourses.filter(c=>!isCounted(c)).length+' วิชา':''} · GPA / GPAX คิดเฉพาะวิชาที่เปิดตาทั้งหมด`;
 const verify=counted.filter(c=>c.verify).length;
 $('#source-note').textContent=`มี ${verify} วิชารอตรวจข้อมูล${sumMin!==state.target?' · ขั้นต่ำรายหมวดรวม '+fmt(sumMin)+' แต่เป้าหมายรวม '+fmt(state.target)+' หน่วยกิต':''}`;
 $('#years').innerHTML=[['all','ทุกปี'],...Array.from(new Set(state.terms.map(t=>t.year))).sort((a,b)=>a-b).map(y=>[String(y),'ปี '+y])].map(([id,name])=>`<button data-year="${id}" class="${year===id?'active':''}" aria-pressed="${year===id}">${name}</button>`).join('');
 let cumulative=[];
 $('#terms').innerHTML=state.terms.map((t,i)=>{const courses=state.courses.filter(c=>c.term===t.id),m=metrics(courses);cumulative.push(...courses);const cg=metrics(cumulative);if(year!=='all'&&t.year!==+year)return '';const filtered=courses.filter(c=>matchesCourse(c,{query,group}));return `<article class="term" data-term="${esc(t.id)}"><div class="term-head"><div class="term-title-row"><h3>${esc(t.name)}</h3><span class="term-number">${String(i+1).padStart(2,'0')}</span></div><div class="term-metrics"><span>GPA <b>${gpa(m.gpa)}</b></span><span>GPAX <b>${gpa(cg.gpa)}</b></span><span>หน่วยกิต <b>${fmt(m.credits)}</b></span><span>ผ่าน <b>${fmt(m.earned)}</b></span></div></div><div class="course-list">${renderTermCourses(filtered,query||group!=='all')}</div><button class="term-add" data-add="${esc(t.id)}">＋ เพิ่มวิชาในเทอมนี้</button></article>`;}).join('');
 
}
function eyeIcon(closed){return `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${closed?'<path d="m3 3 18 18"/>':''}</svg>`;}
function courseCard(c){return `<div class="course ${!isCounted(c)?'course-excluded':''}" draggable="true" data-course="${esc(c.id)}" style="--category:${cat(c.category).color}"><span class="handle" aria-hidden="true">⠿</span><button class="course-main" data-edit="${esc(c.id)}" aria-label="แก้ไข ${esc(c.name)}"><span class="course-name">${esc(c.name)}</span><span class="course-meta">${courseGroup(c.category).name}${courseGroup(c.category).name!==cat(c.category).name?' · '+esc(cat(c.category).name):''}${c.isGenEd?' · GenEd':''}${!isCounted(c)?' · <span class="excluded-label">ปิดตา · ไม่นับในการคำนวณ</span>':''} · ${fmt(c.credits)} หน่วยกิต ${c.verify?'<span class="verify">⚑ ตรวจข้อมูล</span>':''}</span></button><select class="grade" aria-label="เกรด ${esc(c.name)}" data-grade="${esc(c.id)}">${gradeOptions(c.grade)}</select><button type="button" class="count-toggle" draggable="false" data-toggle-count="${esc(c.id)}" aria-pressed="${!isCounted(c)}" aria-label="${isCounted(c)?'ปิดตา ไม่นับ':'เปิดตา นับ'} ${esc(c.name)}" title="${isCounted(c)?'ปิดตา: ไม่นับวิชานี้ในการคำนวณ':'เปิดตา: นับวิชานี้อีกครั้ง'}">${eyeIcon(!isCounted(c))}</button></div>`;}
function renderTermCourses(courses,filtering){
 if(!courses.length)return `<div class="empty">${filtering?'ไม่พบวิชาในตัวกรองนี้':'วางวิชาในเทอมนี้ได้เลย'}</div>`;
 return courses.map(courseCard).join('');
}
function openCourse(id,term){editing=id||null;const c=id?state.courses.find(x=>x.id===id):{name:'',code:'',credits:3,grade:'',category:'core',term:term||state.terms[0].id,note:'',verify:false};const f=$('#course-form');$('#dialog-title').textContent=id?'แก้ไขวิชา':'เพิ่มวิชาใหม่';f.elements.category.innerHTML=COURSE_GROUPS.map(g=>`<optgroup label="${g.name}">${state.categories.filter(x=>courseGroup(x.id).id===g.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('');f.elements.term.innerHTML=state.terms.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');f.elements.isGenEd.checked=!!c.isGenEd;f.elements.grade.innerHTML=gradeOptions(c.grade);for(const key of ['name','code','credits','grade','category','term','note'])f.elements[key].value=c[key]??'';f.elements.verify.checked=!!c.verify;$('#delete-course').hidden=!id;$('#course-dialog').showModal();}
function renderHonors(){
 const projection=honorsProjection(state), selected=state.honors?.target??3.65;
 $('#honors-remaining').value=projection.remaining;
 $('#honors-goals').innerHTML=projection.goals.map(goal=>{
   let result, status;
   if(!projection.remaining){result=goal.currentReached?'GPAX ปัจจุบันถึงเป้า':'GPAX ปัจจุบันยังไม่ถึงเป้า';status='ไม่มีหน่วยกิตที่เหลือที่คิดเกรดในจำนวนที่ใช้คำนวณ';}
   else{result=`ต้องทำ GPA เฉลี่ย <strong>${requiredGpaText(goal.required)}</strong>`;status=goal.reachable?'ในหน่วยกิตที่เหลือ เพื่อจบตามเป้า GPAX นี้':'สูงกว่า 4.00 จึงยังไปไม่ถึงเป้าด้วยหน่วยกิตที่เหลือเท่านี้';}
   return `<button type="button" class="honors-goal ${selected===goal.target?'selected':''} ${goal.reachable?'reachable':'unreachable'}" data-honors-target="${goal.target}" aria-pressed="${selected===goal.target}"><span class="honors-name">${goal.name}<span class="goal-check">${selected===goal.target?'✓ เป้าที่เลือก':'เลือกเป้านี้'}</span></span><span class="honors-target">GPAX ${goal.target.toFixed(2)}</span><span class="honors-required">${result}</span><span class="honors-status">${status}</span></button>`;
 }).join('');
 const maximum=projection.maxGpax===null?'—':projection.maxGpax.toFixed(2);
 $('#honors-basis').textContent=`เกรดที่กรอกแล้ว ${fmt(projection.gradedCredits)} หน่วยกิต · ยังไม่ออกเกรดตามแผน ${fmt(projection.plannedRemaining)} หน่วยกิต · ${state.honors?.remainingCredits!=null?'ใช้จำนวนที่กำหนดเอง (ไม่เปลี่ยนตามการปิดตา)':'ใช้จำนวนตามแผน เฉพาะวิชาที่เปิดตา'} · ถ้าที่เหลือได้ A ทั้งหมด GPAX สูงสุด ${maximum}${projection.needsReview?' · มีวิชารอตรวจหน่วยกิต':''}`;
}
function setHonors(changes){state.honors={target:state.honors?.target??3.65,remainingCredits:state.honors?.remainingCredits??null,...changes};save();}
$('#honors-goals').onclick=e=>{const b=e.target.closest('[data-honors-target]');if(b)setHonors({target:Number(b.dataset.honorsTarget)});};
$('#honors-remaining').onchange=e=>{if(!e.target.value||!e.target.checkValidity()){renderHonors();return;}setHonors({remainingCredits:Number(e.target.value)});};
$('#honors-auto').onclick=()=>setHonors({remainingCredits:null});
$('#add-course').onclick=()=>openCourse();
$('#years').onclick=e=>{const b=e.target.closest('[data-year]');if(b){year=b.dataset.year;render();}};
$('#search').oninput=e=>{query=e.target.value.toLowerCase().trim();render();};
$('#category-filter').innerHTML='<option value="all">ทุกหมวด</option>'+COURSE_GROUPS.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
$('#category-filter').onchange=e=>{group=e.target.value;render();};
$('#terms').onclick=e=>{const toggle=e.target.closest('[data-toggle-count]');if(toggle){const c=state.courses.find(c=>c.id===toggle.dataset.toggleCount);c.hidden=isCounted(c);save();toast(c.hidden?'ปิดตาวิชานี้แล้ว ข้อมูลเดิมยังอยู่ครบ':'เปิดตาวิชานี้แล้ว นำกลับมาคำนวณ');return;}const edit=e.target.closest('[data-edit]'),add=e.target.closest('[data-add]');if(edit)openCourse(edit.dataset.edit);if(add)openCourse(null,add.dataset.add);};
$('#terms').onchange=e=>{if(e.target.matches('[data-grade]')){const c=state.courses.find(c=>c.id===e.target.dataset.grade);c.grade=e.target.value;save();}};
$('#course-form').onsubmit=e=>{e.preventDefault();const f=e.target;const c={...(editing?state.courses.find(x=>x.id===editing):{}),id:editing||crypto.randomUUID(),name:f.elements.name.value.trim(),code:f.elements.code.value.trim(),credits:Number(f.elements.credits.value),isGenEd:f.elements.isGenEd.checked,grade:f.elements.grade.value,category:f.elements.category.value,term:f.elements.term.value,note:f.elements.note.value.trim(),verify:f.elements.verify.checked};if(!c.name)return;if(c.isGenEd)c.category='gen';if(editing)state.courses[state.courses.findIndex(x=>x.id===editing)]=c;else state.courses.push(c);$('#course-dialog').close();save();toast('บันทึกวิชาแล้ว ♡');};
$('#course-form').elements.isGenEd.onchange=e=>{if(e.target.checked)$('#course-form').elements.category.value='gen';};
$('#delete-course').onclick=()=>{if(confirm('ลบวิชานี้ออกจากแผน?')){state.courses=state.courses.filter(c=>c.id!==editing);$('#course-dialog').close();save();toast('ลบวิชาแล้ว');}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#terms').ondragstart=e=>{const c=e.target.closest('[data-course]');if(!c||e.target.closest('select,[data-toggle-count]')){e.preventDefault();return;}dragged=c.dataset.course;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragged);c.classList.add('dragging');};
$('#terms').ondragover=e=>{const t=e.target.closest('[data-term]');if(t&&dragged){e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));t.classList.add('over');}};
$('#terms').ondrop=e=>{e.preventDefault();const t=e.target.closest('[data-term]'),target=e.target.closest('[data-course]');if(!t||!dragged)return;const c=state.courses.find(x=>x.id===dragged);if(!c)return;if(target?.dataset.course===dragged){render();return;}state.courses=state.courses.filter(x=>x.id!==dragged);c.term=t.dataset.term;let at=target?state.courses.findIndex(x=>x.id===target.dataset.course):-1;if(at>=0){const rect=target.getBoundingClientRect();if(e.clientY>rect.top+rect.height/2)at++;state.courses.splice(at,0,c);}else state.courses.push(c);dragged=null;save();toast('ย้ายวิชาแล้ว ♡');};
$('#terms').ondragend=()=>{dragged=null;document.querySelectorAll('.over,.dragging').forEach(x=>x.classList.remove('over','dragging'));};
$('#settings').onclick=()=>{$('#settings-fields').innerHTML=`<label class="settings-row"><b>หน่วยกิตรวมขั้นต่ำ</b><input type="number" name="target" min="0" max="1000" step="0.5" value="${state.target}" required></label>`+state.categories.filter(c=>c.id!=='unassigned').map(c=>`<label class="settings-row">${esc(c.name)}<input type="number" name="${esc(c.id)}" min="0" max="1000" step="0.5" value="${c.min}" required></label>${c.id==='gen'?`<label class="settings-row settings-subrow">GenEd ที่ต้องผ่าน (วิชา)<input type="number" name="genEdMinCourses" min="0" max="100" step="1" value="${state.genEdMinCourses??4}" required></label><p class="small">GenEd อยู่ในศึกษาทั่วไป ไม่บวกหน่วยกิตซ้ำ</p>`:''}`).join('');$('#settings-dialog').showModal();settingsWarning();};
function settingsWarning(){const f=$('#settings-form'),sum=state.categories.filter(c=>c.id!=='unassigned').reduce((s,c)=>s+Number(f.elements[c.id]?.value||0),0),target=Number(f.elements.target.value);$('#settings-warning').textContent=`รายหมวดรวม ${fmt(sum)} หน่วยกิต · ยอดรวมขั้นต่ำ ${fmt(target)} หน่วยกิต${sum!==target?' — ยอดสองส่วนไม่ตรงกัน กรุณาตรวจหลักสูตร':''} · ระบบตรวจทั้งรายหมวดและยอดรวม`;}$('#settings-form').oninput=settingsWarning;
$('#settings-form').onsubmit=e=>{e.preventDefault();const f=e.target;state.target=Number(f.elements.target.value);if(f.elements.genEdMinCourses)state.genEdMinCourses=Number(f.elements.genEdMinCourses.value);for(const c of state.categories)if(c.id!=='unassigned')c.min=Number(f.elements[c.id].value);$('#settings-dialog').close();save();toast('บันทึกเกณฑ์แล้ว');};
$('#add-term').onclick=()=>{$('#term-form').reset();$('#term-dialog').showModal();};$('#term-form').onsubmit=e=>{e.preventDefault();const f=e.target;const name=f.elements.name.value.trim();if(!name)return;state.terms.push({id:crypto.randomUUID(),name,year:Number(f.elements.year.value)});year='all';$('#term-dialog').close();save();toast('เพิ่มเทอมแล้ว');};
function exportPlan(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='grade-garden-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('สำรองข้อมูลแล้ว เก็บไฟล์นี้ไว้ด้วยนะ ♡');}
$('#export').onclick=exportPlan;
$('#import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw Error();let parsed=JSON.parse(await file.text());if(!valid(parsed))throw Error();parsed=updatePlan(parsed);if(confirm('นำเข้าข้อมูลสำรองแทนแผนปัจจุบัน? แนะนำให้สำรองแผนเดิมก่อน')){state=parsed;year='all';save();toast('นำเข้าข้อมูลแล้ว');}}catch{toast('ไฟล์ไม่ถูกต้อง เลือกไฟล์ JSON ที่สำรองจากเว็บนี้');}e.target.value='';};
render();
account=setupAccount({fresh,valid,onPlan(plan){state=structuredClone(plan);year='all';query='';group='all';$('#category-filter').value='all';$('#search').value='';render();},getPlan:()=>structuredClone(state),exportPlan,toast});
