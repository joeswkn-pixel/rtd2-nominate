# rtd2-nominate — ระบบเสนอรายชื่อผู้เข้าฝึกอบรม กฝภ.2

หน้าเว็บ (GitHub Pages)
- `Nomination System.dc.html` — ผู้กรอก / ผู้ดูแล
- `Self Registration FCFS.dc.html` — สมัครด้วยตนเอง (ใครก่อนได้ก่อน)
- `Check-in.dc.html` — เช็คชื่อวันอบรม

ไฟล์ประกอบ: `nom2-config.js`, `nom2-core.js`, `support.js`, `assets/`

## อัปเดตรอบนี้
- หน้าสมัคร FCFS โฉมใหม่ · แสดงรอบอัปเดตที่นั่ง (ทุก 15 วินาที) · เอฟเฟกต์ยินดีเมื่อสมัครทัน · ตั๋วฉีกเมื่อสละสิทธิ์ · บันทึกภาพยืนยันเป็นไฟล์ PNG
- Admin: แก้ไขข้อมูลผู้สมัคร (รหัส/ชื่อ/เบอร์/อีเมล) พร้อมแจ้งเตือนก่อนแก้และบันทึกประวัติ
- Transition เมื่อเปลี่ยนหน้า/แท็บ

## ขั้นตอนนำขึ้น
1. อัปโหลดทุกไฟล์ในโฟลเดอร์นี้ทับ repo เดิม (ยกเว้นโฟลเดอร์ `apps-script/` ไม่จำเป็นต้องอยู่บน Pages)
2. Apps Script: วาง `apps-script/Code-v2.gs` ทับของเดิม → Deploy › Manage deployments › แก้ deployment เดิม › Version: **New version** (จำเป็นสำหรับคำสั่งใหม่ `adminEditReg`)
3. รายละเอียดเพิ่มเติม: `DEPLOY-v2.md`
