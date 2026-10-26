# คู่มือติดตั้ง v2 — ระบบเสนอรายชื่อผู้เข้าฝึกอบรม กฝภ.2

หน้าเว็บเดียว `Nomination System v2.dc.html` ใช้ได้ทั้งผู้กรอกและผู้ดูแล
- **ผู้กรอก** — เปิดลิงก์ `…?c=<รหัสหลักสูตร>` → ใส่รหัสพนักงานของตนเอง → กรอก/ยืนยัน → ส่ง
- **ผู้ดูแล** — กรอกรหัสผ่านผู้ดูแล (ตั้งใน Script Properties `ADMIN_PASSWORD`)
- **ดูจำนวน (อ่านอย่างเดียว)** — `…?c=<รหัส>&view=count`

ถ้า `API_URL` ใน `nom2-config.js` ว่าง = โหมดทดลอง (ข้อมูลเก็บในเบราว์เซอร์)

## 1. ฐานข้อมูล + Apps Script
1. สร้าง Google Sheets ใหม่ → ส่วนขยาย › Apps Script → วาง `apps-script/Code-v2.gs` → บันทึก
2. Project Settings (⚙️) › Script Properties › เพิ่ม `ADMIN_PASSWORD` = รหัสผ่านหน้าผู้ดูแล
3. เลือกฟังก์ชัน `setup` → Run (อนุญาตสิทธิ์) — สร้างแท็บ Units, Employees, Courses, Entries, Subs, Logs (แท็บ Users ไม่ได้ใช้ในโหมดรหัสผ่าน)
4. วางข้อมูลในแท็บ `Units` (id, short, full, region)
   - **พนักงาน (เชื่อมชีตหลักอัตโนมัติ):** เพิ่ม Script Property `EMP_SHEET_ID` = ID ชีตฐานข้อมูลพนักงานหลัก (และ `EMP_TAB` = ชื่อแท็บ ถ้ามีหลายแท็บ) → Run `testEmp` เพื่อตรวจ · ระบบอ่านอย่างเดียว ไม่แก้ชีตหลัก
   - หรือไม่ตั้ง `EMP_SHEET_ID` แล้ววางเองในแท็บ `Employees` (code, name, pos, level, affil, unitId)
5. Deploy › New deployment › Web app · Execute as: **Me** · Who has access: **Anyone** → คัดลอก URL `/exec`

## 2. หน้าเว็บ
แก้ `nom2-config.js` (API_URL, FORM_URL) แล้วนำขึ้นโฮสต์พร้อมกัน:
`Nomination System v2.dc.html`, `nom2-config.js`, `nom2-core.js`, `support.js`, `assets/pwa-seal.jpg`

## สิทธิ์
- **Admin** — เห็นทุกหลักสูตร, จัดการผู้ใช้, ลบหลักสูตร
- **เจ้าหน้าที่** — เห็น/แก้เฉพาะหลักสูตรที่ได้รับมอบหมาย (หรือยังไม่มีผู้รับผิดชอบ), สร้างหลักสูตรใหม่ได้ (เป็นผู้รับผิดชอบอัตโนมัติ)
- ทุกคำสั่งตรวจสิทธิ์ซ้ำที่ Apps Script · การส่งรายชื่อตรวจโควตา/จำนวนรับ/รหัสซ้ำซ้ำฝั่งเซิร์ฟเวอร์พร้อม LockService


## อัปเดต: แบบ 3 สมัครด้วยตนเอง (ใครก่อนได้ก่อน) + รูปแบบการอบรม + ระบบเช็คชื่อ
**ประเภทการรับรายชื่อ**
- เสนอชื่อในหน่วยงาน → แบบ 1 ยืนยันรายชื่อ / แบบ 2 เลือกจากรายชื่อ
- สมัครด้วยตนเอง → แบบ 3 ใครก่อนได้ก่อน (แทน "เปิดรับรายชื่อ" เดิม) · กำหนดที่นั่งรายเขต · เขตเต็มแล้วรับเป็นสำรอง · สละสิทธิ์แล้วเลื่อนสำรองขึ้นอัตโนมัติ · แจ้งยืนยันบนหน้าจอ (ไม่ส่งอีเมล)

**ขั้นตอนอัปเดตระบบจริง**
1. วาง `apps-script/Code-v2.gs` ใหม่ทับของเดิม → Run `setup` อีกครั้ง (สร้างแท็บ `Regs`, `Checkins`)
2. อนุญาตสิทธิ์ใหม่ที่ขอเพิ่ม: **Google Drive (เก็บภาพปกหลักสูตร)**
3. Deploy › Manage deployments › แก้ deployment เดิม › Version: **New version** (URL /exec เดิมใช้ต่อได้)
4. นำขึ้นโฮสต์เพิ่ม: `Self Registration FCFS.dc.html`, `Check-in.dc.html`, `nom2-core.js` (ใหม่), `nom2-config.js` (ใหม่), `assets/pwa-logo-new.png`, `assets/pwa-wordmark-white.png`

**ลิงก์**
- หน้าสมัคร แบบ 3: `Self Registration FCFS.dc.html?c=<รหัส>` (ลิงก์หน้าหลัก `?c=` ของหลักสูตรแบบ 3 จะพาไปหน้านี้อัตโนมัติ)
- หน้าเช็คชื่อ: `Check-in.dc.html?c=<รหัส>`
- ทดลองด้วยข้อมูลตัวอย่างแม้ตั้ง API_URL แล้ว: ต่อท้าย `?demo` หรือ `?mock` (mock = ไม่บันทึก รีเซ็ตทุกครั้งที่โหลด)

**ภาพปกหลักสูตร** 1200 × 1500 px (4:5) · JPG/PNG/GIF ≤ 5 MB · เก็บใน Drive โฟลเดอร์ "Nomination Covers"
