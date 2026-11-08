import { updatePlan } from './src/plan-updates.js';
import { SEED } from './src/seed.js';
import { POINTS, GRADES, valid, metrics, isCounted } from './src/model.js';
import { setupAccount } from './src/account.js';
import { COURSE_GROUPS, courseGroup, groupProgress, matchesCourse, recommendedHonorsPlans, genEdProgress, validGpaxTarget } from './src/planning.js';
import { reorderTerms, termSummaries, termsByYear, orderedTerms, termKind, insertTerm, removeTerm, moveTermWithinYear } from './src/terms.js';
import './style.css';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>structuredClone(SEED);
let state=fresh(), year='all',query='',group='all',editing=null,dragged=null;
let account;
let termOrderDraft=[], deletingTerm=null, termDrag=null;
function fmt(n){return Number(n).toLocaleString('en-US',{maximumFractionDigits:2});}
function gpa(n){return n===null?'—':n.toFixed(2);}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function save(){account?.save(state);render();}
function cat(id){return state.categories.find(c=>c.id===id);}
function gradeOptions(selected){return GRADES.map(g=>`<option value="${g}" ${g===selected?'selected':''}>${g||'—'}</option>`).join('');}
function render(){
 const yearScroll=new Map([...document.querySelectorAll('.academic-year')].map(el=>[el.dataset.plannerYear,el.querySelector('.year-terms').scrollLeft]));
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
 const summaries=termSummaries(state),byTerm=new Map(summaries.map((s,i)=>[s.term.id,{...s,number:i+1}]));
 $('#terms').innerHTML=termsByYear(state.terms).filter(g=>year==='all'||g.year===+year).map(g=>`<section class="academic-year" data-planner-year="${g.year}"><div class="year-heading"><h3>ปี ${g.year}</h3><span>${g.terms.length} เทอม · เลื่อนซ้าย–ขวาดูเทอมในปีนี้</span></div><div class="year-terms" tabindex="0" role="region" aria-label="เทอมของปี ${g.year}">${g.terms.map(t=>renderTerm(byTerm.get(t.id))).join('')}</div></section>`).join('');
 document.querySelectorAll('.academic-year').forEach(el=>{el.querySelector('.year-terms').scrollLeft=yearScroll.get(el.dataset.plannerYear)||0;});
 
}
function renderTerm({term:t,courses,metrics:m,cumulative:cg,number}){
 const filtered=courses.filter(c=>matchesCourse(c,{query,group}));
 return `<article class="term ${termKind(t)==='summer'?'summer-term':''}" data-term="${esc(t.id)}"><div class="term-head"><div class="term-title-row"><h3>${esc(t.name)}${termKind(t)==='summer'?'<span class="summer-badge">ซัมเมอร์</span>':''}</h3><div class="term-tools"><span class="term-number">${String(number).padStart(2,'0')}</span><button type="button" class="delete-term" data-delete-term="${esc(t.id)}" aria-label="ลบ ${esc(t.name)}" ${state.terms.length===1?'disabled title="ต้องเหลืออย่างน้อย 1 เทอม"':''}>ลบเทอม</button></div></div><div class="term-metrics"><span>GPA <b>${gpa(m.gpa)}</b></span><span>GPAX <b>${gpa(cg.gpa)}</b></span><span>หน่วยกิต <b>${fmt(m.credits)}</b></span><span>ผ่าน <b>${fmt(m.earned)}</b></span></div></div><div class="course-list">${renderTermCourses(filtered,query||group!=='all')}</div><button class="term-add" data-add="${esc(t.id)}">＋ เพิ่มวิชาในเทอมนี้</button></article>`;
}
function eyeIcon(closed){return `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${closed?'<path d="m3 3 18 18"/>':''}</svg>`;}
function courseCard(c){return `<div class="course ${!isCounted(c)?'course-excluded':''}" draggable="true" data-course="${esc(c.id)}" style="--category:${c.accentColor||cat(c.category).color}"><span class="handle" aria-hidden="true">⠿</span><button class="course-main" data-edit="${esc(c.id)}" aria-label="แก้ไข ${esc(c.name)}"><span class="course-name">${esc(c.name)}</span><span class="course-meta">${courseGroup(c.category).name}${courseGroup(c.category).name!==cat(c.category).name?' · '+esc(cat(c.category).name):''}${c.isGenEd?' · GenEd':''}${!isCounted(c)?' · <span class="excluded-label">ปิดตา · ไม่นับในการคำนวณ</span>':''} · ${fmt(c.credits)} หน่วยกิต ${c.verify?'<span class="verify">⚑ ตรวจข้อมูล</span>':''}</span></button><select class="grade" aria-label="เกรด ${esc(c.name)}" data-grade="${esc(c.id)}">${gradeOptions(c.grade)}</select><button type="button" class="count-toggle" draggable="false" data-toggle-count="${esc(c.id)}" aria-pressed="${!isCounted(c)}" aria-label="${isCounted(c)?'ปิดตา ไม่นับ':'เปิดตา นับ'} ${esc(c.name)}" title="${isCounted(c)?'ปิดตา: ไม่นับวิชานี้ในการคำนวณ':'เปิดตา: นับวิชานี้อีกครั้ง'}">${eyeIcon(!isCounted(c))}</button></div>`;}
function renderTermCourses(courses,filtering){
 if(!courses.length)return `<div class="empty">${filtering?'ไม่พบวิชาในตัวกรองนี้':'วางวิชาในเทอมนี้ได้เลย'}</div>`;
 return courses.map(courseCard).join('');
}
function openCourse(id,term){editing=id||null;const c=id?state.courses.find(x=>x.id===id):{name:'',code:'',credits:3,grade:'',category:'core',term:term||state.terms[0].id,note:'',verify:false};const f=$('#course-form');$('#dialog-title').textContent=id?'แก้ไขวิชา':'เพิ่มวิชาใหม่';f.elements.category.innerHTML=COURSE_GROUPS.map(g=>`<optgroup label="${g.name}">${state.categories.filter(x=>courseGroup(x.id).id===g.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('');f.elements.term.innerHTML=state.terms.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');f.elements.isGenEd.checked=!!c.isGenEd;f.elements.grade.innerHTML=gradeOptions(c.grade);for(const key of ['name','code','credits','grade','category','term','note'])f.elements[key].value=c[key]??'';f.elements.verify.checked=!!c.verify;$('#delete-course').hidden=!id;$('#course-dialog').showModal();}
function renderHonors(){
 const p=recommendedHonorsPlans(state),goal=p.goals.find(g=>g.id===p.selectedId),selected=goal.target;
 $('#honors-summary').innerHTML=`<div><span>${p.actualComplete?'GPAX ท้ายแผน · '+esc(p.endTermName):'GPAX จากเกรดที่กรอกแล้ว'}</span><strong>${gpa(p.currentGpax)}</strong><small>${fmt(p.gradedCredits)} หน่วยกิตที่คิดเกรดจริง${p.currentGpax===null?'':' · ใช้ค่าก่อนปัด '+p.currentGpax.toFixed(4)}</small></div><div><span>${p.pendingCount?'ยังรอเกรดในแผน':'วิชาในแผนมีผลเกรดแล้ว'}</span><strong>${fmt(p.pendingCredits)} <small>หน่วยกิตที่รอเกรด</small></strong><small>${p.pendingCount?fmt(p.pendingCount)+' วิชา · จะจัดแผนจากวิชาที่เหลือก่อน':p.needsReview?'ยังมีข้อมูลหน่วยกิตที่ควรตรวจ':'ใช้ GPAX ที่กรอกจริงเป็นฐาน ไม่มีหน่วยกิตจำลองมาปน'}</small></div>`;
 $('#honors-goals').innerHTML=p.goals.map(g=>{
  const active=p.selectedId===g.id,body=`<span class="honors-name">${g.name}<span class="goal-check">${active?'✓ เป้าที่เลือก':'เลือกเป้านี้'}</span></span><span class="honors-target">GPAX ${g.target.toFixed(2)}</span><span class="honors-status">${p.currentGpax===null?'ยังไม่มีเกรดจริง':g.actualReached?'GPAX จากเกรดที่กรอกถึงเป้านี้แล้ว'+(p.pendingCount?' · ยังต้องรอเกรดที่เหลือ':''):'GPAX จริงยังต่ำกว่าเป้า · ดูแผนแนะนำด้านล่าง'}</span>`;
  return g.custom?`<article class="honors-goal custom-goal ${active?'selected':''}"><button type="button" class="custom-goal-select" data-honors-target="custom" aria-pressed="${active}">${body}</button><form id="custom-gpax-form"><label for="custom-gpax">GPAX ที่อยากได้</label><div class="custom-gpax-controls"><input id="custom-gpax" name="target" type="number" inputmode="decimal" min="0" max="4" step="0.01" required value="${p.customTarget.toFixed(2)}"><button type="submit" class="primary">ใช้เป้าหมาย</button></div><small>0.00–4.00 · คำนวณให้ถึงอย่างน้อยค่าที่กรอก</small></form></article>`:`<button type="button" class="honors-goal ${active?'selected':''}" data-honors-target="${g.id}" aria-pressed="${active}">${body}</button>`;
 }).join('');
 if(!goal.plans.length){$('#honors-recommendations').innerHTML=`<div class="plan-empty">${goal.unreachable?'เป้า GPAX 4.00 ไปไม่ถึงด้วยการลงเพิ่มจากเกรดที่มีอยู่ แม้ได้ A ทุกวิชา GPAX ก็ยังต่ำกว่า 4.00 ลองปรับเป้าหมายลงเพื่อดูแผนที่เป็นไปได้':goal.actualReached?'ไม่ต้องลงเพิ่มเพื่อยก GPAX ตามข้อมูลที่กรอกแล้ว':'กรอกเกรดและหน่วยกิตในแผนก่อน ระบบจึงจะแนะนำจำนวนวิชาที่เหมาะกับข้อมูลของคุณได้'}</div>`;}
 else{
  const header=goal.minimumExtraCredits>0?`เพื่อให้ GPAX ${goal.strict?'มากกว่า ': 'ถึง '}${selected.toFixed(2)} แผน A ทุกวิชาต้องเพิ่มอย่างน้อย ${fmt(goal.minimumExtraCredits)} หน่วยกิต ในวิชาเพิ่มเติมวิชาละ 3 หน่วยกิต`:'มีแผนที่ไปถึงเป้าได้โดยไม่เพิ่มวิชา ใช้วิชาที่เหลือในแผนก่อน';
  $('#honors-recommendations').innerHTML=`<p class="plan-intro">${header}</p><div class="recommended-plans">${goal.plans.map((plan,index)=>`<article class="recommended-plan ${index===0?'recommended-primary':''}" data-recommendation="${plan.id}"><div class="recommended-title"><span>${index===0?'แผนแนะนำ':'อีกทางเลือก'}</span><h3>${plan.title}</h3></div><div class="recommended-count">${plan.extraCourses?`เพิ่ม ${fmt(plan.extraCourses)} วิชา`:'ไม่ต้องเพิ่มวิชา'}<small>${plan.extraCredits?`รวม ${fmt(plan.extraCredits)} หน่วยกิตเพิ่มเติม`:'0 หน่วยกิตเพิ่มเติม'}</small></div>${plan.inPlanGrades.length?`<div class="in-plan-target"><b>วิชาที่ยังรอเกรดในแผน</b>${plan.inPlanGrades.map(g=>`<p>ตั้งเป้า ${g.grade} ${fmt(g.count)} วิชา · รวม ${fmt(g.credits)} หน่วยกิต</p>`).join('')}</div>`:''}${plan.extra.length?`<ul class="extra-targets">${plan.extra.map(g=>`<li><b>${g.grade} ${fmt(g.count)} วิชา</b> · วิชาละ ${fmt(g.creditsEach)} หน่วยกิต</li>`).join('')}</ul>`:''}<div class="recommended-result"><span>GPAX คาดการณ์หลังทำตามแผน</span><strong>${plan.projectedGpax.toFixed(4)}</strong><small>ค่านี้เป็นการคาดการณ์ ไม่ใช่ GPAX จริงตอนนี้</small></div>${plan.assignments.length?`<details class="assignment-details"><summary>ดูตัวอย่างเป้าเกรดรายวิชา</summary><p class="small">จัดตามหน่วยกิต สลับวิชาหน่วยกิตเท่ากันได้ ไม่ได้ประเมินความยากของแต่ละวิชา</p>${plan.assignments.map(c=>`<div><span>${esc(c.name)} · ${fmt(c.credits)} หน่วยกิต</span><b>${c.targetGrade}</b></div>`).join('')}</details>`:''}</article>`).join('')}</div>${goal.minimumExtraCredits>30?`<p class="plan-math-note">จำนวนที่ต้องเพิ่มสูงเพราะมีหน่วยกิตเดิม ${fmt(p.gradedCredits)} หน่วยกิตถ่วงอยู่แล้ว A ทุกวิชาเป็นขอบเขตที่เพิ่มน้อยที่สุดในวิชา 3 หน่วยกิต หากมี B+ จะต้องเพิ่มมากขึ้นตามทางเลือกด้านบน</p>`:''}`;
 }
 $('#honors-basis').dataset.credits=p.pendingCredits;
 $('#honors-basis').textContent=`แผนถึง ${p.endTermName} · หน่วยกิตในแผน ${fmt(p.totalPlanCredits)} · ขั้นต่ำจบ ${fmt(state.target)} ไม่ใช่เพดาน${p.needsReview?' · มีวิชารอตรวจข้อมูลหน่วยกิต ผลแนะนำอาจเปลี่ยนได้เมื่อกรอกครบ':''}`;
}
function setHonors(changes){state.honors={...state.honors,target:state.honors?.target??3.6,...changes};save();}
$('#honors-goals').onclick=e=>{const b=e.target.closest('[data-honors-target]');if(!b)return;if(b.dataset.honorsTarget==='custom'){const target=recommendedHonorsPlans(state).customTarget;setHonors({mode:'custom',target,customTarget:target});}else setHonors({mode:'honors',target:Number(b.dataset.honorsTarget)});};
$('#honors-goals').onsubmit=e=>{if(e.target.id!=='custom-gpax-form')return;e.preventDefault();const input=e.target.elements.target,target=input.valueAsNumber;if(!input.reportValidity()||!validGpaxTarget(target))return;setHonors({mode:'custom',target,customTarget:target});toast('ใช้เป้า GPAX '+target.toFixed(2)+' แล้ว');};
$('#add-course').onclick=()=>openCourse();
$('#years').onclick=e=>{const b=e.target.closest('[data-year]');if(b){year=b.dataset.year;render();}};
$('#search').oninput=e=>{query=e.target.value.toLowerCase().trim();render();};
$('#category-filter').innerHTML='<option value="all">ทุกหมวด</option>'+COURSE_GROUPS.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
$('#category-filter').onchange=e=>{group=e.target.value;render();};
$('#terms').onclick=e=>{const deletion=e.target.closest('[data-delete-term]');if(deletion){openDeleteTerm(deletion.dataset.deleteTerm);return;}const toggle=e.target.closest('[data-toggle-count]');if(toggle){const c=state.courses.find(c=>c.id===toggle.dataset.toggleCount);c.hidden=isCounted(c);save();toast(c.hidden?'ปิดตาวิชานี้แล้ว ข้อมูลเดิมยังอยู่ครบ':'เปิดตาวิชานี้แล้ว นำกลับมาคำนวณ');return;}const edit=e.target.closest('[data-edit]'),add=e.target.closest('[data-add]');if(edit)openCourse(edit.dataset.edit);if(add)openCourse(null,add.dataset.add);};
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
function updateTermFields(){
 const f=$('#term-form'),y=Number(f.elements.year.value),same=orderedTerms(state.terms).filter(t=>t.year===y),summer=f.elements.kind.value==='summer';
 if(f.elements.name.dataset.custom!=='true')f.elements.name.value=`ปี ${y} / ${summer?'ซัมเมอร์':'เทอม '+(same.filter(t=>termKind(t)==='regular').length+1)}`;
 f.elements.afterTerm.innerHTML=`<option value="">ต้นปี ${y}</option>`+same.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
 f.elements.afterTerm.value=(summer?same.at(-1):same.filter(t=>termKind(t)==='regular').at(-1))?.id||'';
}
$('#add-term').onclick=()=>{if(state.terms.length>=100){toast('เพิ่มได้สูงสุด 100 เทอม');return;}const f=$('#term-form');f.reset();f.elements.year.value=year==='all'?Math.max(...state.terms.map(t=>t.year)):+year;f.elements.name.dataset.custom='false';updateTermFields();$('#term-dialog').showModal();};
$('#term-form').elements.kind.onchange=updateTermFields;
$('#term-form').elements.year.oninput=updateTermFields;
$('#term-form').elements.name.oninput=e=>{e.target.dataset.custom='true';};
$('#term-form').onsubmit=e=>{e.preventDefault();const f=e.target,name=f.elements.name.value.trim();if(!name)return;try{state=insertTerm(state,{id:crypto.randomUUID(),name,year:Number(f.elements.year.value),kind:f.elements.kind.value},f.elements.afterTerm.value);}catch{toast('รายการเทอมเปลี่ยน กรุณาเปิดหน้าต่างเพิ่มเทอมอีกครั้ง');return;}year='all';$('#term-dialog').close();save();toast('เพิ่มเทอมแล้ว');};
function openDeleteTerm(id){
 if(state.terms.length<=1){toast('ต้องเหลืออย่างน้อย 1 เทอม');return;}
 const term=state.terms.find(t=>t.id===id);if(!term)return;deletingTerm=id;
 const courses=state.courses.filter(c=>c.term===id),terms=orderedTerms(state.terms),destinations=terms.filter(t=>t.id!==id),f=$('#delete-term-form');
 $('#delete-term-summary').textContent=`${term.name} · ${courses.length} วิชา`;
 $('#delete-term-destination').hidden=!courses.length;f.elements.destination.required=!!courses.length;
 f.elements.destination.innerHTML=destinations.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
 f.elements.destination.value=(terms[terms.indexOf(term)-1]||destinations[0]).id;
 $('#delete-term-note').textContent=courses.length?'วิชา เกรด หน่วยกิต โน้ต และสถานะปิดตาจะย้ายไปด้วยทั้งหมด':'เทอมนี้ยังไม่มีวิชา ลบได้โดยไม่เปลี่ยนวิชาในเทอมอื่น';
 $('#confirm-delete-term').textContent=courses.length?'ย้ายวิชาและลบเทอม':'ลบเทอม';$('#delete-term-dialog').showModal();
}
$('#delete-term-form').onsubmit=e=>{e.preventDefault();try{state=removeTerm(state,deletingTerm,e.target.elements.destination.value);}catch{toast('ลบเทอมไม่ได้ กรุณาตรวจเทอมที่ต้องการย้ายวิชา');return;}deletingTerm=null;year='all';$('#delete-term-dialog').close();save();toast('ลบเทอมแล้ว');};
function renderTermOrder(){
 const terms=termOrderDraft.map(id=>state.terms.find(t=>t.id===id)).filter(Boolean);
 $('#term-order-list').innerHTML=termsByYear(terms).map(g=>`<h3 class="term-order-year">ปี ${g.year}</h3>${g.terms.map((term,index)=>{
  const count=state.courses.filter(c=>c.term===term.id).length;
  return `<div class="term-order-row ${termDrag?.id===term.id?'term-dragging':''}" data-order-row="${esc(term.id)}"><button type="button" class="term-order-handle" data-order-handle="${esc(term.id)}" aria-label="ลาก ${esc(term.name)} เพื่อจัดลำดับ ใช้ปุ่มลูกศรขึ้นหรือลงได้">⠿</button><span class="term-order-name">${esc(term.name)}<small>${termKind(term)==='summer'?'ซัมเมอร์ · ':''}${count} วิชา</small></span><label class="term-position">ลำดับ<select data-order-position="${esc(term.id)}" aria-label="ลำดับ ${esc(term.name)}">${g.terms.map((t,i)=>`<option value="${termOrderDraft.indexOf(t.id)}" ${i===index?'selected':''}>${i+1}</option>`).join('')}</select></label><div class="term-order-arrows"><button type="button" class="button" data-order-up="${esc(term.id)}" aria-label="เลื่อน ${esc(term.name)} ขึ้น" ${index===0?'disabled':''}>↑</button><button type="button" class="button" data-order-down="${esc(term.id)}" aria-label="เลื่อน ${esc(term.name)} ลง" ${index===g.terms.length-1?'disabled':''}>↓</button></div></div>`;
 }).join('')}`).join('');
}
function moveTerm(id,position){const moved=moveTermWithinYear(state.terms,termOrderDraft,id,position);if(moved===termOrderDraft)return;termOrderDraft=moved;renderTermOrder();}
$('#edit-term-order').onclick=()=>{termOrderDraft=orderedTerms(state.terms).map(t=>t.id);renderTermOrder();$('#term-order-dialog').showModal();$('#term-order-list').scrollTop=0;};
$('#term-order-list').onchange=e=>{if(e.target.matches('[data-order-position]'))moveTerm(e.target.dataset.orderPosition,Number(e.target.value));};
$('#term-order-list').onclick=e=>{const up=e.target.closest('[data-order-up]'),down=e.target.closest('[data-order-down]');if(up)moveTerm(up.dataset.orderUp,termOrderDraft.indexOf(up.dataset.orderUp)-1);if(down)moveTerm(down.dataset.orderDown,termOrderDraft.indexOf(down.dataset.orderDown)+1);};
$('#term-order-list').onkeydown=e=>{const handle=e.target.closest('[data-order-handle]');if(handle&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const id=handle.dataset.orderHandle;moveTerm(id,termOrderDraft.indexOf(id)+(e.key==='ArrowUp'?-1:1));$('#term-order-list').querySelector(`[data-order-handle="${CSS.escape(id)}"]`)?.focus();}};
function dragTermAtPointer(){
 if(!termDrag)return;
 const list=$('#term-order-list'),bounds=list.getBoundingClientRect(),y=termDrag.y;
 if(y<bounds.top+40)list.scrollTop-=12;else if(y>bounds.bottom-40)list.scrollTop+=12;
 const row=document.elementFromPoint(termDrag.x,y)?.closest('[data-order-row]');
 if(row&&row.dataset.orderRow!==termDrag.id){const index=termOrderDraft.indexOf(termDrag.id),target=termOrderDraft.indexOf(row.dataset.orderRow),rect=row.getBoundingClientRect();if((index<target&&y>rect.top+rect.height/2)||(index>target&&y<rect.top+rect.height/2))moveTerm(termDrag.id,target);}
 termDrag.frame=requestAnimationFrame(dragTermAtPointer);
}
$('#term-order-list').onpointerdown=e=>{const handle=e.target.closest('[data-order-handle]');if(!handle||e.button!==0)return;e.preventDefault();termDrag={id:handle.dataset.orderHandle,pointer:e.pointerId,x:e.clientX,y:e.clientY};$('#term-order-list').setPointerCapture(e.pointerId);renderTermOrder();dragTermAtPointer();};
$('#term-order-list').onpointermove=e=>{if(termDrag&&e.pointerId===termDrag.pointer){e.preventDefault();termDrag.x=e.clientX;termDrag.y=e.clientY;}};
function endTermDrag(){if(!termDrag)return;const drag=termDrag;termDrag=null;cancelAnimationFrame(drag.frame);const list=$('#term-order-list');if(list.hasPointerCapture(drag.pointer))list.releasePointerCapture(drag.pointer);renderTermOrder();}
$('#term-order-list').onpointerup=endTermDrag;$('#term-order-list').onpointercancel=endTermDrag;$('#term-order-list').onlostpointercapture=endTermDrag;
$('#term-order-dialog').addEventListener('close',endTermDrag);
$('#term-order-form').onsubmit=e=>{e.preventDefault();try{state=reorderTerms(state,termOrderDraft);}catch{toast('รายการเทอมเปลี่ยน กรุณาปิดแล้วเปิดแก้ลำดับใหม่');return;}year='all';$('#term-order-dialog').close();save();toast('บันทึกลำดับเทอมแล้ว');};

function exportPlan(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='grade-garden-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('สำรองข้อมูลแล้ว เก็บไฟล์นี้ไว้ด้วยนะ ♡');}
$('#export').onclick=exportPlan;
$('#import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw Error();let parsed=JSON.parse(await file.text());if(!valid(parsed))throw Error();parsed=updatePlan(parsed);if(confirm('นำเข้าข้อมูลสำรองแทนแผนปัจจุบัน? แนะนำให้สำรองแผนเดิมก่อน')){state=parsed;year='all';save();toast('นำเข้าข้อมูลแล้ว');}}catch{toast('ไฟล์ไม่ถูกต้อง เลือกไฟล์ JSON ที่สำรองจากเว็บนี้');}e.target.value='';};
render();
account=setupAccount({fresh,valid,onPlan(plan){state=structuredClone(plan);year='all';query='';group='all';$('#category-filter').value='all';$('#search').value='';render();},getPlan:()=>structuredClone(state),exportPlan,toast});
