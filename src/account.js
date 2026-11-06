import { createClient } from '@supabase/supabase-js';
import { SyncEngine } from './sync.js';
import { usernameEmail } from './identity.js';
const usernameMode = import.meta.env.VITE_AUTH_MODE !== 'email';
const $ = selector => document.querySelector(selector);

function friendly(error) {
  const code = error?.code;
  if (code === 'invalid_credentials') return usernameMode ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code === 'email_not_confirmed') return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  if (code === 'weak_password') return 'รหัสผ่านยังไม่ผ่านเกณฑ์ กรุณาใช้รหัสผ่านที่ยาวและเดายากขึ้น';
  if (code === 'over_email_send_rate_limit' || error?.status === 429) return 'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (code === 'user_already_exists') return usernameMode ? 'ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองเลือกชื่ออื่นหรือเข้าสู่ระบบ' : 'อีเมลนี้สมัครแล้ว ลองเข้าสู่ระบบหรือรีเซ็ตรหัสผ่าน';
  return 'ทำรายการไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่';
}

export function setupAccount({ fresh, valid, onPlan, exportPlan, toast }) {
  let client, engine, user, epoch = 0, mode = 'login', busy = false, loading = false;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url || '') && !!key && !key.includes('YOUR_');
  function screen(name) {
    $('#account-screen').hidden = name !== 'account';
    $('#loading-screen').hidden = name !== 'loading';
    $('#app-header').hidden = name !== 'app';
    $('#app-main').hidden = name !== 'app';
    if (name !== 'app') $('#sync-banner').hidden = true;
  }
  function setMode(next) {
    mode = next;
    const resetting = mode === 'reset', recovery = mode === 'recovery';
    $('#auth-title').textContent = ({ login: 'กลับมาปลูกฝันกัน ♡', signup: 'เริ่มสวนเกรดของตัวเอง ♡', reset: 'มารับรหัสผ่านใหม่กัน', recovery: 'ตั้งรหัสผ่านใหม่ ♡' })[mode];
    $('#auth-subtitle').textContent = ({ login: 'เข้าสู่ระบบเพื่อดูแผนการเรียนของคุณ', signup: usernameMode ? 'เลือกชื่อผู้ใช้ แล้วเก็บแผนไว้ได้ทุกเครื่อง' : 'สมัครด้วยอีเมล แล้วเก็บแผนไว้ได้ทุกเครื่อง', reset: 'เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปทางอีเมล', recovery: 'เลือกรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร' })[mode];
    $('#auth-submit').textContent = ({ login: 'เข้าสู่ระบบ', signup: 'สร้างบัญชี', reset: 'ส่งลิงก์รีเซ็ตรหัสผ่าน', recovery: 'บันทึกรหัสผ่านใหม่' })[mode];
    $('#auth-tabs').hidden = resetting || recovery;
    $('#forgot-password').hidden = usernameMode || resetting || recovery;
    $('#back-login').hidden = !resetting;
    $('#password-label').hidden = resetting;
    $('#email-label').hidden = recovery;
    $('#auth-form').elements.password.required = !resetting;
    $('#auth-form').elements.email.required = !recovery;
    $('#auth-form').elements.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#auth-form').elements.password.value = '';
    $('#auth-message').textContent = '';
    document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active', b.dataset.mode === mode); b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
  }
  function status({ kind, localAvailable }) {
    const labels = { loading: 'กำลังโหลด…', pending: 'รอบันทึก…', saving: 'กำลังบันทึก…', saved: 'บันทึกออนไลน์แล้ว', error: 'ยังไม่บันทึกออนไลน์', conflict: 'มีแผนใหม่จากอีกเครื่อง' };
    $('#save-status').textContent = labels[kind];
    $('#save-status').dataset.kind = kind;
    $('#sync-banner').hidden = !['error', 'conflict'].includes(kind);
    $('#app-main').inert = kind === 'conflict';
    $('#sync-retry').hidden = kind === 'conflict';
    $('#sync-message').textContent = kind === 'conflict'
      ? 'มีการแก้ไขจากอีกเครื่อง กรุณาสำรองแผนนี้แล้วโหลดแผนล่าสุดก่อนแก้ต่อ'
      : localAvailable ? 'ยังเซฟออนไลน์ไม่ได้ แผนฉบับร่างเก็บในเครื่องนี้ กดลองบันทึกอีกครั้งเมื่อพร้อม'
        : 'ยังเซฟออนไลน์ไม่ได้ และเก็บฉบับร่างในเครื่องไม่ได้ กรุณาสำรองแผนนี้ก่อนปิด';
  }
  function signedOut() {
    epoch++;
    engine?.dispose(); engine = null; user = null; loading = false;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    $('#app-main').inert = false;
    onPlan(fresh());
    screen('account');
    if (mode !== 'reset') setMode('login');
  }
  async function activate(session) {
    if (!session?.user) { signedOut(); return; }
    if (mode === 'recovery') return;
    if (user?.id === session.user.id && (engine || loading)) return;
    const generation = ++epoch;
    engine?.dispose(); engine = null; user = session.user; loading = true;
    $('#account-email').textContent = usernameMode ? (user.user_metadata?.username || user.email?.split('@')[0] || '') : user.email || '';
    $('#loading-message').textContent = 'กำลังเปิดแผนของคุณ…';
    $('#load-retry').hidden = true;
    screen('loading');
    const api = {
      async load() {
        const { data, error } = await client.from('study_plans').select('data,revision').eq('user_id', session.user.id).maybeSingle();
        if (error) throw error;
        return data;
      },
      async save(plan, revision) {
        const { data, error } = await client.rpc('save_study_plan', { plan_data: plan, expected_revision: revision });
        if (error) throw error;
        if (!data?.[0]) throw new Error('missing_save_result');
        return data[0];
      },
    };
    const next = new SyncEngine({ api, userId: user.id, fresh, valid, storage: {
      getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: k => localStorage.removeItem(k),
    }, onPlan, onStatus: status });
    engine = next;
    try {
      await next.open();
      if (generation !== epoch) { next.dispose(); return; }
      engine = next;
      loading = false;
      screen('app');
    } catch {
      next.dispose();
      if (generation !== epoch) return;
      loading = false;
      engine = null;
      $('#loading-message').textContent = 'เปิดแผนไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง';
      $('#load-retry').hidden = false;
    }
  }
  async function logout() {
    if (!client) return;
    if (engine?.pending) {
      const saved = await engine.flush();
      if (!saved && !confirm('แผนยังไม่เซฟออนไลน์ ฉบับร่างจะอยู่ในเครื่องนี้ ถ้าเก็บฉบับร่างไม่ได้กรุณาสำรองก่อน ออกจากระบบต่อไหม?')) return;
    }
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) { toast('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่'); return; }
    signedOut();
  }
  $('#auth-tabs').onclick = e => { const b = e.target.closest('[data-mode]'); if (b && !busy) setMode(b.dataset.mode); };
  $('#forgot-password').onclick = () => { if (!busy) setMode('reset'); };
  $('#back-login').onclick = () => { if (!busy) setMode('login'); };
  $('#logout').onclick = logout;
  $('#load-logout').onclick = logout;
  $('#sync-export').onclick = exportPlan;
  $('#sync-retry').onclick = () => engine?.flush();
  $('#save-status').onclick = () => { if (engine?.pending && !engine.conflict) engine.flush(); };
  $('#sync-reload').onclick = async () => {
    if (engine?.pending && !confirm('โหลดแผนล่าสุดแทนฉบับร่างนี้? กดสำรองแผนนี้ก่อนหากต้องการเก็บ')) return;
    try { await engine?.reload(); toast('โหลดแผนล่าสุดแล้ว'); }
    catch { toast('โหลดไม่ได้ กรุณาลองอีกครั้ง'); }
  };
  $('#load-retry').onclick = async () => { const { data } = await client.auth.getSession(); user = null; activate(data.session); };
  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    if (!client || busy) return;
    busy = true;
    $('#auth-submit').disabled = true;
    $('#auth-message').textContent = 'กำลังดำเนินการ…';
    const identifier = e.target.elements.email.value.trim(), password = e.target.elements.password.value;
    let email;
    try { email = mode === 'recovery' ? '' : usernameMode ? usernameEmail(identifier) : identifier; }
    catch { $('#auth-message').textContent = 'ใช้ชื่อ 3–24 ตัว เป็น a–z ตัวเลข หรือ _ เท่านั้น'; busy = false; $('#auth-submit').disabled = false; return; }
    const redirectTo = window.location.origin + '/';
    try {
      let result;
      if (mode === 'signup') {
        result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: usernameMode ? { username: identifier.toLowerCase() } : {} } });
        if (result.error) throw result.error;
        if (result.data.session) await activate(result.data.session);
        else $('#auth-message').textContent = 'ตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบได้เลย (ดูในจดหมายขยะด้วยนะ)';
      } else if (mode === 'reset') {
        result = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (result.error) throw result.error;
        $('#auth-message').textContent = 'หากมีบัญชีนี้ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้ทางอีเมล';
      } else if (mode === 'recovery') {
        result = await client.auth.updateUser({ password });
        if (result.error) throw result.error;
        setMode('login');
        const { data } = await client.auth.getSession();
        user = null;
        await activate(data.session);
        toast('เปลี่ยนรหัสผ่านแล้ว ♡');
      } else {
        result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        await activate(result.data.session);
      }
      e.target.elements.password.value = '';
    } catch (error) { $('#auth-message').textContent = friendly(error); }
    finally { busy = false; $('#auth-submit').disabled = false; }
  };
  window.addEventListener('online', () => engine?.flush());
  window.addEventListener('beforeunload', e => { if (engine?.pending) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') engine?.flush(); });
  if (usernameMode) {
    const input = $('#auth-form').elements.email;
    $('#email-label').firstChild.textContent = 'ชื่อผู้ใช้';
    input.type = 'text'; input.autocomplete = 'username'; input.placeholder = 'เช่น aon_garden';
    input.pattern = '[A-Za-z0-9_]{3,24}'; input.minLength = 3; input.maxLength = 24;
    input.title = 'ชื่อ 3–24 ตัว ใช้ a–z ตัวเลข และ _ ได้';
    $('.auth-footnote').innerHTML = 'ชื่อผู้ใช้ใช้ a–z ตัวเลข และ _ (3–24 ตัว)<br>เก็บชื่อและรหัสผ่านไว้สำหรับเปิดบนเครื่องอื่น';
  }
  setMode('login');
  if (!configured) {
    $('#config-message').hidden = false;
    $('#auth-submit').disabled = true;
    return { save() { toast('ยังไม่ได้เชื่อมระบบบัญชี'); } };
  }
  client = createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: true, autoRefreshToken: true, persistSession: true }, global: {
    fetch: async (input, init = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
      try { return await fetch(input, { ...init, signal }); } finally { clearTimeout(timeout); }
    },
  } });
  client.auth.onAuthStateChange((event, session) => {
    // Supabase runs callbacks during auth locks; do not await client calls here.
    if (event === 'PASSWORD_RECOVERY') {
      epoch++; engine?.dispose(); engine = null; loading = false;
      setMode('recovery'); screen('account');
      return;
    }
    setTimeout(() => { if (event === 'SIGNED_OUT') signedOut(); else activate(session); }, 0);
  });
  // INITIAL_SESSION is delivered by onAuthStateChange, including PKCE email callbacks.
  return { save(plan) { if (engine && user) engine.change(plan); } };
}
