# Grade Garden 🌷

แพลนรายวิชา Computer Engineering 2022 คำนวณ GPA รายเทอมและสะสม พร้อมบัญชีส่วนตัวและบันทึกข้ามอุปกรณ์

## ทำอะไรได้บ้าง

- สมัครสมาชิก/เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน ยืนยันอีเมล และรีเซ็ตรหัสผ่าน
- แต่ละบัญชีมีแผนของตัวเอง บันทึกใน Supabase PostgreSQL
- ลากย้ายวิชาหรือเปลี่ยนเทอมจากหน้าต่างแก้ไขบนมือถือ
- เลือกหมวด แก้หน่วยกิตและเกรด เพิ่มวิชาและเทอม
- ตรวจขั้นต่ำแยกแต่ละหมวดและยอดรวม ลงเกินได้
- เซฟอัตโนมัติ พร้อมฉบับร่างในเครื่องเมื่อเน็ตขาด
- ถ้าแก้จากหลายเครื่องพร้อมกัน จะหยุดการเซฟที่ขัดแย้งเพื่อไม่ให้ทับกันโดยไม่รู้ตัว
- สำรองและนำเข้าแผนเป็น JSON

สมาชิกใหม่เริ่มด้วยรายการวิชาที่ยังไม่มีเกรด ไม่มีข้อมูลเกรดส่วนตัวใน repository นี้

## ตั้ง Supabase (ทำครั้งเดียว)

1. สร้างโปรเจกต์ที่ [Supabase Dashboard](https://supabase.com/dashboard)
2. เปิด SQL Editor แล้วรันไฟล์ [migration](supabase/migrations/202611060001_study_plans.sql) ทั้งไฟล์ครั้งเดียว สร้างตาราง, RLS และฟังก์ชันบันทึก
3. เปิด Authentication > Providers > Email ให้สมัครด้วย email/password ได้ และเปิด Confirm email (ลิงก์ยืนยันและรีเซ็ตแบบ PKCE ให้เปิดด้วยเบราว์เซอร์เดียวกับที่ขอส่งลิงก์)
4. เปิด Authentication > URL Configuration กำหนด Site URL เป็นโดเมน Vercel ที่ใช้งานจริง และเพิ่ม Redirect URL เป็น `https://YOUR-APP.vercel.app/` รวมถึง `http://127.0.0.1:4174/` สำหรับพัฒนา
5. สำหรับเปิดรับผู้ใช้ทั่วไป ให้ตั้ง **Custom SMTP** ใน Supabase ด้วยบริการส่งอีเมลของคุณ ค่าเริ่มต้นส่งอีเมลได้เฉพาะที่อยู่ในทีมและมีข้อจำกัด จึงยังใช้เปิดสมัครทั่วไปไม่ได้ รายละเอียด: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
6. คัดลอก Project URL และ Publishable key จาก Connect/API keys (anon public key แบบเดิมใช้ได้)

ไม่ใช้ service_role key หรือ database password ในเว็บ และไม่ต้องให้ข้อมูลสองอย่างนี้กับแอป

## Deploy บน Vercel

1. ส่งโค้ดขึ้น GitHub repository ของคุณ
2. เปิด [Vercel New Project](https://vercel.com/new) แล้ว Import repository `aonchalisa/GradeGarden`
3. Framework: **Vite**; Build command: `npm run build`; Output: `dist`; Node.js: **22 หรือใหม่กว่า**
4. เพิ่ม Environment Variables ใน Production/Preview ตามที่ต้องใช้:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = Publishable key (หรือ anon public key)
5. Deploy แล้วนำ URL จริงไปตั้งค่าใน Supabase ตามด้านบน
6. ถ้าเปลี่ยน Environment Variables หลัง deploy ให้ Redeploy เพื่อสร้าง frontend ใหม่

สองตัวแปรนี้เป็น public browser config ตามสถาปัตยกรรม Supabase ความเป็นส่วนตัวของข้อมูลบังคับผ่าน RLS ไม่ใช่การซ่อน publishable key

[เอกสาร Vercel GitHub](https://vercel.com/docs/git/vercel-for-github) · [Environment variables](https://vercel.com/docs/environment-variables) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

หากยังไม่ตั้งตัวแปร เว็บจะแสดงว่าระบบบัญชียังไม่พร้อม และไม่ให้สมัครปลอม/แสดงสถานะว่าเซฟสำเร็จ

## ย้ายแผนเดิมของเจ้าของเว็บ

ในเว็บเก่าที่ `localhost:4173` กดสำรองข้อมูลเป็น JSON จากนั้นล็อกอินด้วยบัญชีของคุณในเว็บใหม่ แล้วกดนำเข้าข้อมูล แผนจะถูกบันทึกในบัญชีนั้นเท่านั้น ไม่รวมไฟล์สำรองส่วนตัวใน Git

## พัฒนาในเครื่อง

```sh
npm ci
cp .env.example .env.local
# ใส่ public config ใน .env.local
npm run dev
```

เปิด `http://127.0.0.1:4174/`

```sh
npm test
npm run build
```

`npm test` ทดสอบ GPA, การบันทึก/กู้ draft, ความขัดแย้งข้ามอุปกรณ์ และ SQL จริงบน PostgreSQL ผ่าน PGlite รวมถึง RLS ของผู้ใช้สองคนและการปฏิเสธ anonymous

### Browser tests

```sh
# Terminal 1: config นี้เป็นค่าทดสอบ ไม่มีการต่อ Supabase จริง
VITE_SUPABASE_URL=https://gradegarden-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run dev -- --port 4175
# Terminal 2: ใช้ Chrome ที่ติดตั้งในเครื่อง
npm run test:browser
```

Browser tests ใช้ Supabase endpoints จำลอง ครอบคลุมสมัครสมาชิก/ยืนยันอีเมล, เข้าสู่ระบบ, ลืมรหัสผ่าน, เซฟ, เปิดเครื่องใหม่, conflict/reload, ลากย้าย, ออกจากระบบ และแยกบัญชีบน UI ทดสอบ PKCE recovery callback และการตั้งรหัสผ่านใหม่ด้วย endpoint จำลองแล้ว ยังต้องทดสอบการส่งอีเมลยืนยันและรีเซ็ตรหัสผ่านกับ Supabase/SMTP จริงหลังเชื่อมโปรเจกต์

## กติกาคำนวณและข้อมูลตั้งต้น

GPA = ผลรวมแต้มเกรด × หน่วยกิต / หน่วยกิตที่มีเกรด A ถึง F โดย A=4, B+=3.5, B=3, C+=2.5, C=2, D+=1.5, D=1, F=0; S/U/W/I/ยังไม่ระบุเกรดไม่รวม GPA หน่วยกิตผ่านนับ A–D และ S

รายวิชาซ้ำคิดแยกตามรายการ ไม่แทนเกรดเดิมโดยอัตโนมัติ ต้องตรวจนโยบายคณะก่อนใช้เป็นผลการเรียนทางการ

ขั้นต่ำรายหมวดตั้งจากภาพที่แนบ รวม 137 แต่หัวภาพระบุ 138 จึงเปิดให้แก้เกณฑ์และตรวจสองส่วนแยกกัน การจัดหมวดเป็นค่าเริ่มต้นที่ผู้ใช้ต้องตรวจ รวมถึงรายการที่ยังไม่ทราบหน่วยกิตซึ่งทำเครื่องหมายไว้
