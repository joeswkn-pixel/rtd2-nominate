// ตั้งค่าระบบเสนอรายชื่อ v2 — แก้ไฟล์นี้ไฟล์เดียว
// ถ้า API_URL ว่าง = โหมดทดลอง (ข้อมูลเก็บในเบราว์เซอร์)
// รหัสผ่านผู้ดูแลตั้งที่ Apps Script › Script Properties › ADMIN_PASSWORD (ไม่ต้องใส่ในไฟล์นี้)
window.NOM2_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwZ2lUrshHLg-7m_vRxkkcNLSL_9VupoftAFLr4rGug5uzeBqMXfWSHeU2GhrKQTaO72w/exec',            // URL /exec ของ Apps Script (Code-v2.gs)
  FORM_URL: 'https://joeswkn-pixel.github.io/rtd2-nominate/Nomination%20System.dc.html',           // ที่อยู่จริงของหน้าเว็บ (ใช้สร้างลิงก์/QR) — เว้นว่าง = ใช้ที่อยู่ปัจจุบัน
  FCFS_PAGE: 'Self Registration FCFS.dc.html',  // หน้าสมัครแบบ 3 (อยู่โฟลเดอร์เดียวกับหน้าหลัก)
  CHECKIN_PAGE: 'Check-in.dc.html'               // หน้าเช็คชื่อ (Add-on)
};
