# FREE FIRE TOURNAMENT SCOREBOARD

เว็บ React + Vite + Supabase สำหรับตารางคะแนน Free Fire ภาษาไทย รองรับผู้ชมทั่วไปและกรรมการที่ได้รับสิทธิ์, 12 ทีม, หลายรอบ, คะแนนสะสม, CSV/TXT และ OCR ช่วยอ่านภาพ

> สถานะเริ่มต้น: เป็นซอร์สโค้ด ยังไม่ได้ Deploy และยังไม่ได้เชื่อมฐานข้อมูลของคุณ จึงยังไม่มีลิงก์ใช้งานจริง

## 1. สิ่งที่ต้องมี

- GitHub account
- Supabase account
- Cloudflare account
- คอมพิวเตอร์จะสะดวกที่สุด แต่ทำได้บางส่วนจาก iPhone ผ่าน GitHub เว็บไซต์/แอป และแดชบอร์ดของบริการต่าง ๆ
- Node.js 20+ สำหรับทดสอบในเครื่อง (ถ้าใช้ iPhone อย่างเดียว ให้ใช้ Cloudflare build จาก GitHub แทนการรันในเครื่อง)

## 2. ติดตั้งและรันในเครื่อง

```bash
npm install
cp .env.example .env
```

แก้ `.env` ใส่ Project URL และ publishable/anon key ของ Supabase (ห้ามใส่ service_role key) แล้วรัน:

```bash
npm run dev
npm test
npm run build
```

## 3. สร้างฐานข้อมูล Supabase

1. สร้าง Project ใหม่ใน Supabase
2. เปิด SQL Editor แล้วคัดลอก `supabase/schema.sql` ไป Run
3. ไปที่ Project Settings → API (หรือ Connect) แล้วคัดลอก Project URL และ publishable key/anon key
4. ไปที่ Authentication → Providers และเปิด Email provider
5. สร้างบัญชีกรรมการใน Authentication → Users → Add user. ปิด public sign-up หากไม่ต้องการให้คนทั่วไปสร้างบัญชีได้
6. คัดลอก UUID ของบัญชีนั้น แล้วรันใน SQL Editor:
   ```sql
   insert into public.admin_users(user_id)
   values ('ใส่-UUID-ของกรรมการที่นี่');
   ```
   คำสั่งนี้ต้องทำโดยเจ้าของโปรเจกต์ใน SQL Editor เท่านั้น ผู้ชมไม่สามารถยกระดับตัวเองเป็นกรรมการได้
7. ตรวจสอบว่าแถวทีมหมายเลข 1–12 ถูกสร้างแล้ว และแก้ชื่อทีมในเว็บไซต์หลังล็อกอิน

## 4. Deploy ด้วย GitHub + Cloudflare Pages

1. สร้าง GitHub repository ใหม่ เช่น `free-fire-tournament-scoreboard`
2. อัปโหลดทุกไฟล์ในโฟลเดอร์โปรเจกต์นี้เข้า repository โดยรักษาโครงสร้างโฟลเดอร์
3. เข้า Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
4. เลือก repository นี้ และตั้งค่า:
   - Framework preset: Vite (ถ้ามี)
   - Build command: `npm run build`
   - Build output directory: `dist`
5. เพิ่ม Environment variables ใน Project settings → Variables and Secrets:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = publishable/anon key
6. Deploy แล้วเปิด URL ที่ Cloudflare แสดง จากนั้นทดสอบในหน้าต่าง Private/Incognito และมือถืออีกเครื่อง

หากแก้ Environment Variables ต้อง Trigger deploy ใหม่เพื่อให้ Vite ฝังค่า `VITE_...` ลงใน build ใหม่

## 5. ความปลอดภัย

- publishable/anon key ถูกออกแบบให้ใช้ใน frontend ได้เมื่อ RLS ถูกต้อง
- ห้ามใช้ `service_role` หรือ secret key ใน frontend, GitHub หรือ `VITE_` variables
- ตาราง `admin_users` ไม่มี policy ให้ผู้ใช้เพิ่ม/แก้ไขสิทธิ์ตัวเอง
- ผู้ชม SELECT ได้ แต่การ INSERT/UPDATE/DELETE ทีม รอบ และคะแนนต้องผ่าน policy `public.is_scoreboard_admin()`
- สร้างบัญชีกรรมการใน Supabase Auth แล้วเพิ่ม UUID ลง `admin_users` ด้วยเจ้าของโปรเจกต์เท่านั้น
- เปิด RLS ไว้เสมอ อย่าลบ policies เพื่อแก้ปัญหาเฉพาะหน้า

## 6. สูตรคะแนน

คะแนนอันดับ: 1=12, 2=9, 3=8, 4=7, 5=6, 6=5, 7=4, 8=3, 9=2, 10=1, 11=0, 12=0
คะแนนรวมรอบ = คะแนนอันดับ + คิวทีม
คะแนนสะสม = ผลรวมคะแนนรวมรอบทุกแถวของทีมนั้น
ตัวอย่างอันดับ 1 + 10 คิว = 12 + 10 = **22 คะแนน**

ฐานข้อมูลคำนวณคะแนนอันดับและคะแนนรวมรอบด้วย generated columns เพื่อไม่ให้ client ส่งคะแนนที่คำนวณเองมาทับได้

## 7. OCR

OCR ใช้ Tesseract.js ในเบราว์เซอร์และโหลดภาษาอังกฤษ (`eng`) เป็นค่าเริ่มต้น เหมาะสำหรับตัวเลข/ตัวอักษรละตินที่ชัดเจน ไม่รับประกันการอ่านชื่อในเกมได้ถูกต้อง และไม่รู้ความสัมพันธ์ระหว่างผู้เล่นกับทีมด้วยตัวเอง ต้องตรวจและเลือกทีมก่อนบันทึกเสมอ หากเป็นภาพสรุปคิวรายทีมให้ใช้ยอดทีมโดยตรง อย่าบวกยอดผู้เล่นซ้ำอีก

ข้อจำกัดปัจจุบัน: ขั้นตอน OCR เป็นเครื่องมือช่วยอ่านและแบบฟอร์มยืนยัน ไม่ใช่ตัว parser เฉพาะรูปแบบหน้าจอ Free Fire ทุกชนิด; ให้กรอกด้วยมือเมื่ออ่านไม่ชัด ภาพจะถูกระบุด้วย SHA-256 เพื่อช่วยเตือนภาพเดิม และการรวมคิวผู้เล่นหลายทีมใช้ RPC แบบ atomic (ต้องรัน SQL ฉบับนี้ใหม่เพื่อสร้างฟังก์ชัน)

## 8. ตรวจสอบข้อมูลและสำรอง

- ทดสอบสูตร: `npm test`
- Build: `npm run build`
- อย่าใช้ข้อมูลจริงระหว่างทดสอบ
- หากต้องล้างข้อมูลทดสอบก่อนแข่ง ให้สำรองก่อน แล้วลบคะแนนและรอบจาก Table Editor (ลบรอบจะลบคะแนนในรอบนั้นเพราะ ON DELETE CASCADE) อย่าลบ `admin_users` หรือทีมโดยไม่ตั้งใจ
- สำรองผ่าน Supabase Dashboard/เครื่องมือ export ที่มีในแผนของคุณ หรือใช้ `pg_dump` หากมี PostgreSQL client; ตรวจข้อจำกัดการสำรองข้อมูลของแพ็กเกจที่ใช้

## 9. หมายเหตุที่ควรรู้

- Realtime ใช้สำหรับ refresh เมื่อมีการเปลี่ยนแปลง และมี polling สำรองทุก 20 วินาที
- หาก Realtime ไม่ทำงาน หน้าเว็บยังควรอัปเดตจาก polling
- ชื่อทีมซ้ำแบบไม่สนตัวพิมพ์ใหญ่เล็กถูกป้องกันด้วย unique index; อันดับและทีมซ้ำในรอบเดียวกันถูกป้องกันด้วย constraints
- ตารางคะแนนรายรอบเรียงตามอันดับการแข่งขันที่บันทึกไว้ 1–12; ทีมที่ยังไม่มีอันดับจะแสดงท้ายตารางโดยเรียงตามหมายเลขทีม ไม่ใช้คะแนนรวมเป็นตัวเรียงอันดับการแข่งขัน
