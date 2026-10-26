/**
 * ระบบเสนอรายชื่อผู้เข้าฝึกอบรม v2 — กฝภ.2 (Google Apps Script backend)
 * หน้าเว็บ: Nomination System v2.dc.html + nom2-core.js (คำสั่งตรงกับ backend จำลองใน nom2-core.js)
 *
 * แท็บในสเปรดชีต (สร้างให้อัตโนมัติด้วย setup()):
 *   Users      : email | name | role(admin/staff)            ← ผู้มีสิทธิ์เข้าหน้าผู้ดูแล (Google)
 *   Units      : id | short | full | region                  ← หน่วยงาน
 *   Employees  : code | name | pos | level | affil | unitId  ← ฐานข้อมูลพนักงาน (วางเอง)
 *   Courses    : id | title | status | deadline | json
 *   Entries    : courseId | code | uid | status | selected | reason | note | sub | round | preset | phone | reg
 *   Subs       : courseId | key | at | ref | byCode | byName | byPos | phone
 *   Logs       : at | courseId | uid | who | whoId | role | action | detail
 *   Regs       : courseId | code | uid | region | name | email | phone | at | ref | status | wdAt | first   ← แบบ 3 สมัครด้วยตนเอง (ใครก่อนได้ก่อน)
 *   Checkins   : courseId | session | code | at                             ← ระบบเช็คชื่อ (Add-on)
 * ไฟล์ภาพปกหลักสูตรเก็บใน Google Drive โฟลเดอร์ "Nomination Covers" (สร้างให้อัตโนมัติ · แชร์แบบทุกคนที่มีลิงก์ดูได้)
 * Script Properties: ADMIN_PASSWORD (รหัสผ่านหน้าผู้ดูแล), DB_SHEET_ID (ถ้าโค้ดไม่ได้ผูกกับชีต),
 *   EMP_SHEET_ID (+EMP_TAB) = อ่านพนักงานจากชีตฐานข้อมูลหลักโดยตรง แทนแท็บ Employees
 */
var LOCK_MS = 20000, EMP_TTL = 21600, ADM_TTL = 21600;
var REASONS = ['ติดภารกิจ', 'ติดอบรมหลักสูตรอื่น', 'ลา', 'ติดขัดเรื่องการเดินทาง', 'อื่นๆ'];
var HEAD = {
  Users: ['email', 'name', 'role'],
  Units: ['id', 'short', 'full', 'region'],
  Employees: ['code', 'name', 'pos', 'level', 'affil', 'unitId'],
  Courses: ['id', 'title', 'status', 'deadline', 'json'],
  Entries: ['courseId', 'code', 'uid', 'status', 'selected', 'reason', 'note', 'sub', 'round', 'preset', 'phone', 'reg'],
  Subs: ['courseId', 'key', 'at', 'ref', 'byCode', 'byName', 'byPos', 'phone'],
  Logs: ['at', 'courseId', 'uid', 'who', 'whoId', 'role', 'action', 'detail'],
  Regs: ['courseId', 'code', 'uid', 'region', 'name', 'email', 'phone', 'at', 'ref', 'status', 'wdAt', 'first', 'org', 'pos'],
  Checkins: ['courseId', 'session', 'code', 'at']
};

// ---------- entry ----------
function doPost(e) {
  var out;
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = route(d.action, d);
  } catch (err) {
    out = String(err && err.message) === 'SESSION' ? { ok: false, error: 'SESSION' } : { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return ContentService.createTextOutput('OK — ระบบเสนอรายชื่อ v2 (ใช้ POST)'); }
function route(a, d) {
  var A = { open: apiOpen, pub: apiPub, empLogin: apiEmpLogin, home: apiHome, form: apiForm, lookup: apiLookup, admLookup: apiAdmLookup, submit: apiSubmit,
    pwLogin: apiPwLogin, adminLoad: apiAdminLoad, saveCourse: apiSaveCourse, setStatus: apiSetStatus, delCourse: apiDelCourse,
    saveUser: apiSaveUser, delUser: apiDelUser, 'export': apiExport,
    fcfsInfo: apiFcfsInfo, fcfsCheck: apiFcfsCheck, fcfsRegister: apiFcfsRegister, fcfsMine: apiFcfsMine, fcfsWithdraw: apiFcfsWithdraw, adminEditReg: apiAdminEditReg,
    ciInfo: apiCiInfo, ciCheck: apiCiCheck, ciSubmit: apiCiSubmit, ciLive: apiCiLive, uploadCover: apiUploadCover };
  if (!A[a]) return { ok: false, error: 'ไม่รู้จักคำสั่ง: ' + a };
  return A[a](d || {});
}

// ---------- sheet helpers ----------
function SS() { var id = prop('DB_SHEET_ID'); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function prop(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
var _hdr = {};
function sh(name) {
  var s = SS().getSheetByName(name);
  if (!s) { s = SS().insertSheet(name); s.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold'); s.setFrozenRows(1); }
  else if (!_hdr[name]) { // เติมหัวคอลัมน์ใหม่ที่ยังว่าง (เช่น reg) โดยไม่แตะหัวเดิม
    var n = HEAD[name].length, h0 = s.getRange(1, 1, 1, n).getValues()[0], fix = false;
    for (var i = 0; i < n; i++) if (String(h0[i]).trim() === '') { h0[i] = HEAD[name][i]; fix = true; }
    if (fix) s.getRange(1, 1, 1, n).setValues([h0]).setFontWeight('bold'); _hdr[name] = 1;
  }
  return s;
}
var _cache = {};
function rows(name) {
  if (_cache[name]) return _cache[name];
  var s = sh(name), v = s.getDataRange().getValues(), h = v[0].map(function (x) { return String(x).trim(); }), out = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i].join('') === '') continue;
    var o = {}; for (var j = 0; j < h.length; j++) o[h[j]] = v[i][j]; out.push(o);
  }
  return (_cache[name] = out);
}
function ensureHead(s, h) { if (s.getLastColumn() < h.length) s.getRange(1, 1, 1, h.length).setValues([h]); }
function writeAll(name, list) {
  var s = sh(name), h = HEAD[name]; ensureHead(s, h);
  s.getRange(2, 1, Math.max(1, s.getMaxRows() - 1), h.length).clearContent();
  if (list.length) s.getRange(2, 1, list.length, h.length).setValues(list.map(function (o) { return h.map(function (k) { return o[k] == null ? '' : o[k]; }); }));
  _cache[name] = list;
}
function append(name, list) {
  if (!list.length) return; var s = sh(name), h = HEAD[name]; ensureHead(s, h);
  s.getRange(s.getLastRow() + 1, 1, list.length, h.length).setValues(list.map(function (o) { return h.map(function (k) { return o[k] == null ? '' : o[k]; }); }));
  _cache[name] = null;
}

// ---------- domain ----------
function normCode(c) { c = String(c == null ? '' : c).trim(); return /^\d+$/.test(c) ? String(Number(c)) : c; }
var _emp = null, _units = null;
// ฐานข้อมูลพนักงาน: ถ้าตั้ง Script Property EMP_SHEET_ID จะอ่านจากชีตฐานข้อมูลหลักโดยตรง (อ่านอย่างเดียว อัปเดตตามต้นทางทันที)
//   EMP_TAB = ชื่อแท็บ (เว้นว่าง = หาแท็บแรกที่มีหัว "รหัส" + "ชื่อ-นามสกุล") · ไม่ตั้ง EMP_SHEET_ID = ใช้แท็บ Employees ในชีตนี้
var EMP_COLS = { code: ['รหัส', 'รหัสพนักงาน', 'code'], name: ['ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'name'], pos: ['ตำแหน่ง', 'pos'], level: ['ชั้น', 'ระดับ', 'level'],
  acting: ['ตำแหน่งรักษาการ'], unitId: ['unitId', 'รหัสหน่วยงาน'], affil: ['สังกัด', 'affil'], job: ['งาน'], div: ['กอง'], dept: ['ฝ่าย'], asst: ['ผู้ช่วย'], line: ['สายงาน', 'สานงาน'] };
function hNorm(h) { return String(h == null ? '' : h).replace(/\s+/g, ''); }
function empTable() {
  var id = prop('EMP_SHEET_ID'); if (!id) return null;
  var ss = SpreadsheetApp.openById(id), tab = prop('EMP_TAB'), list = tab ? [ss.getSheetByName(tab)] : ss.getSheets();
  for (var s = 0; s < list.length; s++) {
    if (!list[s]) continue; var data = list[s].getDataRange().getValues();
    for (var r = 0; r < Math.min(10, data.length); r++) {
      var hs = data[r].map(hNorm), ix = {};
      for (var k in EMP_COLS) { ix[k] = -1; for (var j = 0; j < EMP_COLS[k].length && ix[k] < 0; j++) ix[k] = hs.indexOf(hNorm(EMP_COLS[k][j])); }
      if (ix.code >= 0 && ix.name >= 0) return { data: data, hr: r, ix: ix, sheet: list[s].getName(), hs: hs };
    }
  }
  throw new Error('ไม่พบแท็บที่มีหัวคอลัมน์ "รหัส" และ "ชื่อ-นามสกุล" ในชีตฐานข้อมูลพนักงาน');
}
// สังกัด: ถ้าคอลัมน์ งาน/กอง/ฝ่าย/ผู้ช่วย/สายงาน มี "การประปาส่วนภูมิภาคเขต 1–10" → เขตนั้น · อื่น ๆ ทั้งหมด = สำนักงานใหญ่ (0) · บุคคลภายนอก = 99
function lineRegion(t) { var m = String(t || '').replace(/\s+/g, '').match(/(?:การประปาส่วนภูมิภาค|กปภ\.?)เขต(\d{1,2})/); return m && Number(m[1]) >= 1 && Number(m[1]) <= 10 ? Number(m[1]) : 0; }
function regionLabel(k) { k = String(k); return k === '0' ? 'สำนักงานใหญ่' : k === '99' ? 'บุคคลภายนอก' : 'กปภ.เขต ' + k; }
function empRegion(e) { return e.region != null ? e.region : unitOf(e.uid).region; }
function thNorm(t) { return String(t || '').replace(/\s+/g, '').replace(/การประปาส่วนภูมิภาค/g, 'กปภ.'); }
function matchUnit(text) {
  var t = thNorm(text), best = null, us = units();
  Object.keys(us).forEach(function (id) { var u = us[id];
    [u.full, u.short].forEach(function (n) { n = thNorm(n); if (n.length > 3 && t.indexOf(n) >= 0 && (!best || n.length > best.len)) best = { id: id, len: n.length }; }); });
  if (best) return best.id;
  var m = t.match(/เขต(\d{1,2})/); if (!m) return '';
  var g = Number(m[1]), off = Object.keys(us).filter(function (id) { return us[id].region === g && /เขต/.test(us[id].short) && !/สาขา/.test(us[id].short); })[0];
  return off || '';
}
// หาหน่วยงานจากสังกัด: สาขา > สำนักงานเขต > กอง/สำนัก (สำนักงานใหญ่)
function unitKey(parts) {
  var br = parts.filter(function (p) { return /สาขา/.test(p); })[0]; if (br) return br;
  var rg = parts.filter(function (p) { return /เขต\s*\d/.test(p); }).pop(); if (rg) return rg;
  var hq = parts.filter(function (p) { return /^(กอง|สำนัก|ศูนย์)/.test(p); })[0]; if (hq) return hq;
  return parts.filter(function (p) { return /^ฝ่าย/.test(p); })[0] || parts[parts.length - 1] || '';
}
function unitByFull() { var o = {}, us = units(); for (var id in us) o[thNorm(us[id].full)] = id; return o; }
function empParts(row, v) { return ['job', 'div', 'dept', 'asst', 'line'].map(function (x) { return v(row, x); }).filter(String); }
// สร้าง/อัปเดตแท็บ Units จากฐานข้อมูลพนักงาน — Run ครั้งแรก และทุกครั้งที่มีหน่วยงานใหม่ (รหัสหน่วยงานเดิมไม่เปลี่ยน)
function buildUnits() {
  var tb = empTable(); if (!tb) throw new Error('ต้องตั้ง EMP_SHEET_ID ก่อน');
  var ix = tb.ix, v = function (row, k) { return ix[k] >= 0 ? String(row[ix[k]] == null ? '' : row[ix[k]]).trim() : ''; };
  var old = rows('Units'), byFull = {}, n = 0, cnt = {}, add = 0;
  old.forEach(function (u) { byFull[thNorm(u.full)] = u; var m = String(u.id).match(/^U(\d+)$/); if (m) n = Math.max(n, Number(m[1])); });
  for (var r = tb.hr + 1; r < tb.data.length; r++) {
    var row = tb.data[r]; if (!normCode(row[ix.code])) continue;
    var parts = empParts(row, v), full = unitKey(parts); if (!full) continue;
    var key = thNorm(full); cnt[key] = (cnt[key] || 0) + 1; if (byFull[key]) continue;
    var all = parts.join(' '), m = all.match(/เขต\s*(\d{1,2})/);
    byFull[key] = { id: 'U' + ('000' + (++n)).slice(-3), short: full.replace(/การประปาส่วนภูมิภาค/g, 'กปภ.').replace(/\s+/g, ' ').trim(), full: full, region: lineRegion(all) }; add++;
  }
  var list = Object.keys(byFull).map(function (k) { return byFull[k]; }).sort(function (a, b) { return (Number(a.region) || 0) - (Number(b.region) || 0) || (a.short < b.short ? -1 : 1); });
  writeAll('Units', list); _units = null; _emp = null;
  Logger.log('หน่วยงานทั้งหมด ' + list.length + ' (เพิ่มใหม่ ' + add + ')');
  list.slice(0, 15).forEach(function (u) { Logger.log(u.id + ' · เขต ' + u.region + ' · ' + u.short + ' · ' + (cnt[thNorm(u.full)] || 0) + ' คน'); });
}
function emps() {
  if (_emp) return _emp; _emp = {};
  var tb = empTable();
  if (!tb) { rows('Employees').forEach(function (r) { var k = normCode(r.code); if (k) _emp[k] = { code: k, name: String(r.name), pos: String(r.pos), level: String(r.level), affil: String(r.affil), uid: String(r.unitId) }; }); return _emp; }
  var ix = tb.ix, v = function (row, k) { return ix[k] >= 0 ? String(row[ix[k]] == null ? '' : row[ix[k]]).trim() : ''; }, UF = unitByFull();
  for (var r = tb.hr + 1; r < tb.data.length; r++) {
    var row = tb.data[r], k = normCode(row[ix.code]); if (!k) continue;
    var parts = empParts(row, v);
    var affil = v(row, 'affil') || parts.slice(0, 2).join(' ');
    _emp[k] = { code: k, name: v(row, 'name'), pos: v(row, 'pos') + (v(row, 'acting') ? ' (รักษาการ ' + v(row, 'acting') + ')' : ''),
      level: v(row, 'level'), affil: affil, uid: v(row, 'unitId') || UF[thNorm(unitKey(parts))] || matchUnit(parts.concat([affil]).join(' ')), region: lineRegion(parts.join(' ')) };
  }
  return _emp;
}
// ทดสอบ: เลือก testEmp แล้วกด Run → ดูผลใน บันทึกการดำเนินการ
function testEmp() {
  var tb = empTable();
  Logger.log(tb ? 'อ่านจากชีตหลัก แท็บ "' + tb.sheet + '" · หัวคอลัมน์: ' + tb.hs.filter(String).join(' | ') : 'ไม่ได้ตั้ง EMP_SHEET_ID — ใช้แท็บ Employees ในชีตนี้');
  var all = Object.keys(emps()).map(function (k) { return _emp[k]; }), no = all.filter(function (e) { return !e.uid; });
  Logger.log('พนักงานทั้งหมด ' + all.length + ' คน · จับคู่หน่วยงานไม่ได้ ' + no.length + ' คน · หน่วยงานในแท็บ Units ' + Object.keys(units()).length);
  all.slice(0, 3).forEach(function (e) { Logger.log(JSON.stringify(e)); });
  no.slice(0, 10).forEach(function (e) { Logger.log('ไม่มีหน่วยงาน: ' + e.code + ' ' + e.name + ' — ' + e.affil); });
  var rc = {}; all.forEach(function (e) { var k = regionLabel(e.region); rc[k] = (rc[k] || 0) + 1; });
  Logger.log('จำนวนตามสังกัด: ' + Object.keys(rc).map(function (k) { return k + ' ' + rc[k]; }).join(' · '));
  all.filter(function (e) { return e.region === 0; }).slice(0, 5).forEach(function (e) { Logger.log('สนญ.: ' + e.code + ' ' + e.name + ' — ' + e.affil); });
}
function units() { if (_units) return _units; _units = {}; rows('Units').forEach(function (u) { _units[String(u.id)] = { id: String(u.id), short: String(u.short), full: String(u.full), region: Number(u.region) || 0 }; }); return _units; }
function unitOf(id) { return units()[id] || { id: id, short: id, full: id, region: 0 }; }
function empOf(k) { return emps()[normCode(k)] || null; }
function empPub(e) { if (!e) return null; var u = unitOf(e.uid); return { code: e.code, name: e.name, pos: e.pos, level: e.level, affil: e.affil, uid: e.uid, region: empRegion(e), unit: u.short }; }
function courses() { return rows('Courses').map(function (r) { try { return JSON.parse(r.json); } catch (e) { return null; } }).filter(Boolean); }
function course(id) { id = String(id || '').toUpperCase(); return courses().filter(function (c) { return c.id === id; })[0] || null; }
function saveCourses(list) { writeAll('Courses', list.map(function (c) { return { id: c.id, title: c.title, status: c.status, deadline: new Date(c.deadline), json: JSON.stringify(c) }; })); }
function entries(cid) { return rows('Entries').filter(function (r) { return r.courseId === cid; }).map(function (r) {
  return { code: normCode(r.code), uid: String(r.uid), status: String(r.status || ''), selected: r.selected === true || r.selected === 'TRUE', reason: String(r.reason || ''), note: String(r.note || ''), sub: normCode(r.sub || ''), round: String(r.round || ''), preset: r.preset === true || r.preset === 'TRUE', phone: String(r.phone || ''), reg: String(r.reg || '') }; }); }
function setEntries(cid, list) { var other = rows('Entries').filter(function (r) { return r.courseId !== cid; }); writeAll('Entries', other.concat(list.map(function (r) { var o = { courseId: cid }; for (var k in r) o[k] = r[k]; if (o.phone) o.phone = "'" + o.phone; return o; }))); }
function subs(cid) { var o = {}; rows('Subs').forEach(function (r) { if (r.courseId === cid) o[String(r.key)] = { at: Number(r.at), ref: r.ref, byCode: String(r.byCode), byName: r.byName, byPos: r.byPos, phone: String(r.phone || '') }; }); return o; }
function setSub(cid, key, v) { var list = rows('Subs').filter(function (r) { return !(r.courseId === cid && String(r.key) === key); }); if (v) list.push({ courseId: cid, key: key, at: v.at, ref: v.ref, byCode: v.byCode, byName: v.byName, byPos: v.byPos, phone: v.phone }); writeAll('Subs', list); }
function logs(cid, n) { return rows('Logs').filter(function (r) { return r.courseId === cid; }).map(function (r) { return { at: Number(r.at), uid: r.uid, who: r.who, whoId: String(r.whoId), role: r.role, action: r.action, detail: r.detail }; }).sort(function (a, b) { return b.at - a.at; }).slice(0, n || 300); }
function log(cid, list) { append('Logs', list.map(function (l) { return { at: l.at, courseId: cid, uid: l.uid || '', who: l.who, whoId: l.whoId, role: l.role, action: l.action, detail: l.detail }; })); }

function isClosed(c) { return !c || c.status !== 'open' || Date.now() > c.deadline; }
function active(c, r) { if (c.type === 'fcfs') return r.status !== 'withdrawn'; if (c.type === 'confirm') return r.status === 'absent' ? !!r.sub : (r.status === 'attend' || !!c.defaultAttend); if (c.type === 'nominate') return !!r.selected; return true; }
function scopeKey(c, e) { return c.who === 'self' ? e.code : e.uid; }
function inScope(c, r, e) { return c.who === 'self' ? r.code === e.code : r.uid === e.uid; }
function pubC(c) { var o = {}; for (var k in c) if (k !== 'owners' && k !== 'groupQr' && k !== 'groupLink') o[k] = c[k];
  if (o.checkin) o.checkin = { on: !!o.checkin.on, sessions: (o.checkin.sessions || []).map(function (x) { return { id: x.id, label: x.label, date: x.date, start: x.start, end: x.end }; }) }; return o; }
function grp(c) { return c.groupQr || c.groupLink ? { qr: c.groupQr || '', link: c.groupLink || '' } : null; } // QR กลุ่ม — ส่งให้เฉพาะผู้ลงทะเบียนสำเร็จ
function padN(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
function reasonText(r) { return r.reason === 'อื่นๆ' ? 'อื่นๆ: ' + (r.note || '') : (r.reason || ''); }
function pad4(n) { n = String(n); while (n.length < 4) n = '0' + n; return n; }

// ---------- session (CacheService) ----------
function newToken(obj, ttl) { var t = Utilities.getUuid().replace(/-/g, ''); CacheService.getScriptCache().put('s_' + t, JSON.stringify(obj), ttl); return t; }
function sess(t) { var v = t && CacheService.getScriptCache().get('s_' + t); if (!v) throw new Error('SESSION'); return JSON.parse(v); }
function sessEmp(t) { var s = sess(t); if (s.k !== 'emp') throw new Error('SESSION'); var e = empOf(s.code); if (!e) throw new Error('SESSION'); return e; }
function sessUser(t) { var s = sess(t); if (s.k !== 'adm') throw new Error('SESSION'); if (s.pw) return { email: s.email, name: 'ผู้ดูแลระบบ', role: 'admin' }; var u = rows('Users').filter(function (x) { return String(x.email).trim().toLowerCase() === s.email; })[0]; if (!u) throw new Error('SESSION'); return { email: s.email, name: String(u.name), role: String(u.role) === 'admin' ? 'admin' : 'staff' }; }
function canEdit(u, c) { return u.role === 'admin' || (c.owners || []).indexOf(u.email) >= 0 || !(c.owners || []).length; }
function roleTh(u) { return u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'; }

// ---------- validation (เหมือน NOM2.validate) ----------
function ctxFor(c, e) {
  var taken = {}, others = 0, unitOthers = 0;
  entries(c.id).forEach(function (r) { if (inScope(c, r, e)) return; var us = unitOf(r.uid).short; taken[r.code] = us; if (r.sub) taken[r.sub] = us; if (active(c, r)) { others++; if (r.uid === e.uid) unitOthers++; } });
  return { who: c.who, uid: e.uid, selfCode: e.code, taken: taken, othersTotal: others, unitOthers: c.who === 'self' ? unitOthers : 0 };
}
function validate(c, list, ctx) {
  var errs = {}, glob = [], seen = {}, subSeen = {}, mult = (c.rounds || []).length > 1;
  function add(k, m) { (errs[k] = errs[k] || []).push(m); }
  list.forEach(function (r) {
    var e = empOf(r.code); if (!e) { add(r.code, 'ไม่พบรหัสพนักงานนี้'); return; }
    if (ctx.who === 'self' && r.code !== ctx.selfCode) add(r.code, 'สมัครได้เฉพาะตนเอง');
    if (ctx.who === 'unit' && e.uid !== ctx.uid) add(r.code, 'ไม่ใช่บุคลากรในหน่วยงานของท่าน');
    if (seen[r.code]) add(r.code, 'รหัสซ้ำในรายการ'); seen[r.code] = 1;
    if (ctx.taken[r.code]) add(r.code, 'มีรายชื่อแล้วใน ' + ctx.taken[r.code]);
    if (c.type === 'confirm') {
      if (!r.status && !c.defaultAttend) add(r.code, 'กรุณาเลือก เข้าอบรม หรือ ไม่สามารถเข้าอบรม');
      if (r.status === 'absent') {
        if (!r.reason) add(r.code, 'กรุณาเลือกเหตุผล'); else if (r.reason === 'อื่นๆ' && !String(r.note || '').trim()) add(r.code, 'กรุณาระบุรายละเอียดเหตุผล');
        if (r.sub) {
          if (!empOf(r.sub)) add(r.code, 'ไม่พบรหัสผู้เข้าแทน');
          else if (list.some(function (x) { return x.code === r.sub; })) add(r.code, 'ผู้เข้าแทนมีรายชื่ออยู่แล้ว');
          else if (ctx.taken[r.sub]) add(r.code, 'ผู้เข้าแทนมีรายชื่อแล้วใน ' + ctx.taken[r.sub]);
          else if (subSeen[r.sub]) add(r.code, 'ผู้เข้าแทนซ้ำ');
          subSeen[r.sub] = 1;
        }
      }
    }
    if (mult && active(c, r) && !r.round) add(r.code, 'กรุณาเลือกรุ่น');
    if (active(c, r) && String(r.phone || '').replace(/\D/g, '').length < 4) add(r.code, r.status === 'absent' ? 'กรุณากรอกเบอร์โทรติดต่อผู้เข้าแทน' : 'กรุณากรอกเบอร์โทรติดต่อผู้เข้าอบรม');
  });
  var n = list.filter(function (r) { return active(c, r); }).length;
  if (c.quota > 0 && c.type !== 'confirm' && n + (ctx.unitOthers || 0) > c.quota) glob.push('เกินโควตาหน่วยงาน ' + c.quota + ' คน');
  if (c.capacity > 0 && c.type !== 'confirm' && n + (ctx.othersTotal || 0) > c.capacity) glob.push('จำนวนรับเต็มแล้ว (เหลือ ' + Math.max(0, c.capacity - ctx.othersTotal) + ' ที่นั่ง)');
  return { errs: errs, glob: glob, ok: !glob.length && !Object.keys(errs).length, count: n };
}
function diffRows(c, oldR, newR) {
  var out = [], O = {}, N = {}; oldR.forEach(function (r) { O[r.code] = r; }); newR.forEach(function (r) { N[r.code] = r; });
  function nm(k) { var e = empOf(k); return e ? e.name : k; }
  newR.forEach(function (r) {
    var o = O[r.code];
    if (!o) { out.push({ action: c.who === 'self' ? 'สมัครเข้าอบรม' : 'เพิ่มรายชื่อ', detail: nm(r.code) + (r.round ? ' · ' + r.round : '') }); return; }
    if (c.type === 'confirm' && o.status !== r.status) out.push(r.status === 'absent' ? { action: 'แจ้งไม่เข้าอบรม', detail: nm(r.code) + ' · ' + reasonText(r) + (r.sub ? ' · ผู้เข้าแทน ' + nm(r.sub) : '') } : { action: 'ยืนยันเข้าอบรม', detail: nm(r.code) });
    else if (c.type === 'confirm' && r.status === 'absent' && (o.sub !== r.sub || o.reason !== r.reason || o.note !== r.note)) out.push({ action: 'แก้ไขเหตุผล/ผู้เข้าแทน', detail: nm(r.code) + ' · ' + reasonText(r) });
    if (c.type === 'nominate' && !!o.selected !== !!r.selected) out.push({ action: r.selected ? 'เลือกเข้าอบรม' : 'ยกเลิกการเลือก', detail: nm(r.code) });
    if ((o.round || '') !== (r.round || '') && o.round) out.push({ action: 'เปลี่ยนรุ่น', detail: nm(r.code) + ' · ' + o.round + ' → ' + r.round });
  });
  oldR.forEach(function (r) { if (!N[r.code]) out.push({ action: c.who === 'self' ? 'ยกเลิกการสมัคร' : 'ลบรายชื่อ', detail: nm(r.code) }); });
  return out;
}

// ---------- public ----------
function apiOpen() { return { ok: true, courses: courses().filter(function (c) { return c.status !== 'draft'; }).map(function (c) { return { course: pubC(c), total: entries(c.id).filter(function (r) { return active(c, r); }).length }; }) }; }
function apiPub(d) {
  var c = course(d.c); if (!c || c.status === 'draft') return { ok: false, error: 'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิดรับ' };
  var m = {}, sb = subs(c.id), me = null; try { if (d.token) me = sessEmp(d.token); } catch (x) {}
  entries(c.id).forEach(function (r) {
    var u = unitOf(r.uid), o = m[u.id] = m[u.id] || { uid: u.id, short: u.short, region: u.region, n: 0, rows: 0, at: 0 }; o.rows++; if (active(c, r)) o.n++;
    { var em = empOf(r.code) || {}, se = r.sub ? empOf(r.sub) : null; (o.people = o.people || []).push({ code: me ? r.code : '', name: em.name || r.code, pos: em.pos || '', level: em.level || '', status: r.status, selected: !!r.selected, reason: r.reason, note: me ? r.note : '', sub: r.sub, subName: se ? se.name : '', round: r.round }); }
    var s = sb[c.who === 'self' ? r.code : r.uid]; if (s && s.at > o.at) o.at = s.at;
  });
  var us = Object.keys(m).map(function (k) { var o = m[k]; o.submitted = c.who === 'self' ? o.rows > 0 : !!sb[o.uid]; return o; }).sort(function (a, b) { return a.region - b.region || (a.uid < b.uid ? -1 : 1); });
  return { ok: true, course: pubC(c), units: us, total: us.reduce(function (a, u) { return a + u.n; }, 0), asOf: Date.now(), auth: !!me, myUid: me ? (c.who === 'self' ? me.code : me.uid) : '' };
}
function homeItem(c, e) {
  var rs = entries(c.id).filter(function (r) { return inScope(c, r, e); }), sb = subs(c.id)[scopeKey(c, e)], eligible = true, label = '';
  if (c.who === 'unit') { if (c.type === 'open') label = rs.length ? 'เสนอชื่อแล้ว ' + rs.length + ' คน' : 'ยังไม่ได้เสนอชื่อ'; else { eligible = rs.length > 0; label = eligible ? 'หน่วยงานของท่านมีรายชื่อ ' + rs.length + ' คน' : 'หน่วยงานของท่านไม่มีรายชื่อในหลักสูตรนี้'; } }
  else { if (c.type === 'open') label = rs.length ? 'ท่านสมัครแล้ว' : 'เปิดรับสมัคร'; else { eligible = rs.length > 0; label = eligible ? (c.type === 'confirm' ? 'ท่านมีรายชื่อในหลักสูตรนี้' : 'ท่านอยู่ในรายชื่อผู้มีสิทธิ์สมัคร') : 'ท่านไม่มีรายชื่อในหลักสูตรนี้'; } }
  return { course: pubC(c), eligible: eligible, label: label, submittedAt: sb ? sb.at : 0 };
}
function apiEmpLogin(d) {
  var code = String(d.code || '').trim();
  if (!/^\d{4,6}$/.test(code)) return { ok: false, error: 'กรุณากรอกรหัสพนักงาน 4–6 หลัก' };
  var e = empOf(code); if (!e) return { ok: false, error: 'ไม่พบรหัสพนักงานนี้ในฐานข้อมูลพนักงาน กรุณาตรวจสอบอีกครั้ง' };
  var t = newToken({ k: 'emp', code: e.code }, EMP_TTL);
  return { ok: true, token: t, ttl: EMP_TTL, me: empPub(e), courses: courses().filter(function (c) { return c.status !== 'draft'; }).map(function (c) { return homeItem(c, e); }) };
}
function apiHome(d) { var e = sessEmp(d.token); return { ok: true, me: empPub(e), courses: courses().filter(function (c) { return c.status !== 'draft'; }).map(function (c) { return homeItem(c, e); }) }; }
function apiForm(d) {
  var e = sessEmp(d.token), c = course(d.c); if (!c || c.status === 'draft') return { ok: false, error: 'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิดรับ' };
  var rs = entries(c.id).filter(function (r) { return inScope(c, r, e); }), em = {};
  rs.forEach(function (r) { em[r.code] = empPub(empOf(r.code)); if (r.sub && empOf(r.sub)) em[r.sub] = empPub(empOf(r.sub)); });
  var it = homeItem(c, e);
  return { ok: true, course: pubC(c), me: empPub(e), unit: unitOf(e.uid), rows: rs, emps: em, ctx: ctxFor(c, e), sub: subs(c.id)[scopeKey(c, e)] || null, eligible: it.eligible, label: it.label, group: rs.length && subs(c.id)[scopeKey(c, e)] ? grp(c) : null };
}
function apiAdmLookup(d) { sessUser(d.token); var out = {}; (d.codes || []).slice(0, 2000).forEach(function (k) { k = normCode(k); out[k] = empPub(empOf(k)); }); return { ok: true, emps: out }; }
function apiLookup(d) { sessEmp(d.token); return { ok: true, emp: empPub(empOf(d.code)) }; }
function apiSubmit(d) {
  var e = sessEmp(d.token), lock = LockService.getScriptLock();
  try { lock.waitLock(LOCK_MS); } catch (x) { return { ok: false, error: 'ระบบกำลังบันทึกรายการอื่น กรุณาลองใหม่อีกครั้ง' }; }
  try {
    _cache = {}; var c = course(d.c);
    if (!c || c.status === 'draft') return { ok: false, error: 'ไม่พบหลักสูตร' };
    if (isClosed(c)) return { ok: false, error: 'ปิดรับรายชื่อแล้ว ไม่สามารถส่งได้' };
    var all = entries(c.id), old = all.filter(function (r) { return inScope(c, r, e); }), O = {}; old.forEach(function (r) { O[r.code] = r; });
    var list = (d.rows || []).map(function (r) {
      var code = normCode(r.code), em = empOf(code), ab = r.status === 'absent';
      return { code: code, uid: em ? em.uid : '', status: c.type === 'confirm' ? (r.status === 'attend' || ab ? r.status : '') : '', selected: c.type === 'nominate' ? !!r.selected : false,
        reason: ab && REASONS.indexOf(r.reason) >= 0 ? r.reason : '', note: ab ? String(r.note || '').slice(0, 300) : '', sub: ab ? normCode(r.sub || '') : '', round: String(r.round || ''), preset: O[code] ? !!O[code].preset : false , phone: String(r.phone || '').trim().slice(0, 20), reg: O[code] ? String(O[code].reg || '') : '' };
    });
    if (c.type !== 'open') {
      if (c.type === 'confirm' && list.some(function (r) { return !O[r.code]; })) return { ok: false, error: 'หลักสูตรนี้เพิ่มรายชื่อเองไม่ได้' };
      old.forEach(function (o) { if ((c.type === 'confirm' || o.preset) && !list.some(function (r) { return r.code === o.code; })) list.push(o); });
    }
    var v = validate(c, list, ctxFor(c, e));
    if (!v.ok) return { ok: false, error: v.glob[0] || 'ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบรายการที่แจ้งเตือน', errs: v.errs };
    var ch = diffRows(c, old, list), at = Date.now(), key = scopeKey(c, e);
    // รหัสการสมัคร (หลักสูตรแบบเปิดรับรายชื่อ) — ออกครั้งเดียวต่อคน ไม่เปลี่ยนเมื่อแก้ไข · เลขรันแยกตามหลักสูตร
    if (c.type === 'open' && list.some(function (r) { return !r.reg; })) {
      var P = PropertiesService.getScriptProperties(), rk = 'REG_' + c.id, rq = Number(P.getProperty(rk) || 0);
      list.forEach(function (r) { if (!r.reg) { rq++; r.reg = c.id + '-' + padN(rq, 3); } }); P.setProperty(rk, String(rq));
    }
    setEntries(c.id, all.filter(function (r) { return !inScope(c, r, e); }).concat(list));
    var p = PropertiesService.getScriptProperties(), seq = Number(p.getProperty('SEQ') || 0) + 1; p.setProperty('SEQ', String(seq));
    var ref = 'R2-' + c.id + '-' + pad4(seq);
    setSub(c.id, key, c.who === 'self' && !list.length ? null : { at: at, ref: ref, byCode: e.code, byName: e.name, byPos: e.pos, phone: '' });
    var role = c.who === 'self' ? 'ผู้สมัคร' : 'ผู้เสนอ';
    log(c.id, [{ at: at, uid: e.uid, who: e.name, whoId: e.code, role: role, action: 'ส่งรายชื่อ', detail: 'เลขอ้างอิง ' + ref }].concat((ch.length ? ch : [{ action: 'ส่งรายชื่อ', detail: 'ไม่มีการเปลี่ยนแปลง' }]).map(function (z) { return { at: at, uid: e.uid, who: e.name, whoId: e.code, role: role, action: z.action, detail: z.detail }; })));
    return { ok: true, ref: ref, at: at, count: v.count, group: list.length ? grp(c) : null,
      regs: list.filter(function (r) { return r.reg; }).map(function (r) { var m = empOf(r.code) || {}; return { code: r.code, name: m.name || r.code, reg: r.reg, round: r.round }; }) };
  } finally { lock.releaseLock(); }
}

// ---------- เข้าสู่ระบบผู้ดูแลด้วยรหัสผ่าน (Script Properties: ADMIN_PASSWORD) ----------
function apiPwLogin(d) {
  var pw = prop('ADMIN_PASSWORD'); if (!pw) return { ok: false, error: 'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ใน Script Properties' };
  var c = CacheService.getScriptCache(), fails = Number(c.get('pwfail') || 0);
  if (fails >= 8) return { ok: false, error: 'ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่' };
  if (String(d.password || '') !== pw) { c.put('pwfail', String(fails + 1), 600); Utilities.sleep(800); return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' }; }
  c.remove('pwfail');
  var email = String(Session.getEffectiveUser().getEmail() || 'admin').toLowerCase();
  var user = { email: email, name: 'ผู้ดูแลระบบ', role: 'admin' };
  return { ok: true, token: newToken({ k: 'adm', pw: 1, email: email }, ADM_TTL), ttl: ADM_TTL, user: user };
}

// ---------- admin ----------
function apiAdminLoad(d) {
  var u = sessUser(d.token), cs = courses().filter(function (c) { return u.role === 'admin' || (c.owners || []).indexOf(u.email) >= 0 || !(c.owners || []).length; });
  var en = {}, sb = {}, lg = {}, em = {};
  cs.forEach(function (c) { en[c.id] = entries(c.id); sb[c.id] = subs(c.id); lg[c.id] = logs(c.id, 300); en[c.id].forEach(function (r) { [r.code, r.sub].forEach(function (k) { if (k && empOf(k)) em[k] = empPub(empOf(k)); }); }); });
  var us = rows('Users').map(function (x) { return { email: String(x.email).trim().toLowerCase(), name: String(x.name), role: String(x.role) === 'admin' ? 'admin' : 'staff' }; });
  var un = []; var U = units(); for (var k in U) un.push(U[k]);
  var rg = {}, ck = {}, allR = rows('Regs'), allC = rows('Checkins');
  cs.forEach(function (c) { rg[c.id] = regsOf(c.id, allR); ck[c.id] = cksOf(c.id, allC);
    rg[c.id].forEach(function (r) { if (empOf(r.code)) em[r.code] = empPub(empOf(r.code)); });
    ((c.checkin || {}).roster || []).forEach(function (k) { k = normCode(k); if (empOf(k)) em[k] = empPub(empOf(k)); }); });
  return { ok: true, user: u, courses: cs, entries: en, subs: sb, logs: lg, emps: em, regs: rg, checkins: ck, units: un, users: us };
}
function apiSaveCourse(d) {
  var u = sessUser(d.token), lock = LockService.getScriptLock(); lock.waitLock(LOCK_MS);
  try {
    _cache = {}; var c0 = d.course || {}, id = String(c0.id || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!id) return { ok: false, error: 'กรุณากรอกรหัสหลักสูตร' }; if (!String(c0.title || '').trim()) return { ok: false, error: 'กรุณากรอกชื่อหลักสูตร' };
    var list = courses(), c = list.filter(function (x) { return x.id === id; })[0];
    if (d.isNew && c) return { ok: false, error: 'รหัสหลักสูตร ' + id + ' มีอยู่แล้ว' };
    if (c && !canEdit(u, c)) return { ok: false, error: 'ท่านไม่มีสิทธิ์แก้ไขหลักสูตรนี้' };
    var owners = u.role === 'admin' ? (c0.owners || []) : (c0.owners || []).concat([u.email]).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var nc = {}, k; if (c) for (k in c) nc[k] = c[k]; else { nc.status = 'draft'; nc.created = Date.now(); }
    for (k in c0) nc[k] = c0[k]; nc.id = id; nc.owners = owners; if (!c) nc.status = 'draft';
    list = c ? list.map(function (x) { return x.id === id ? nc : x; }) : [nc].concat(list); saveCourses(list);
    var unknown = [], added = 0, removed = 0;
    if (Array.isArray(d.codes) && nc.type !== 'open' && nc.type !== 'fcfs') {
      var want = []; d.codes.forEach(function (x) { x = normCode(x); if (!x) return; if (!empOf(x)) { unknown.push(x); return; } if (want.indexOf(x) < 0) want.push(x); });
      var cur = entries(id), keep = cur.filter(function (r) { return want.indexOf(r.code) >= 0; }); removed = cur.length - keep.length;
      want.forEach(function (x) { if (!keep.some(function (r) { return r.code === x; })) { keep.push({ code: x, uid: empOf(x).uid, status: '', selected: false, reason: '', note: '', sub: '', round: '', preset: true }); added++; } });
      var RO = d.roundOf || {}; keep.forEach(function (r) { if (RO[r.code]) r.round = String(RO[r.code]); });
      var SO = d.statusOf || {}, OTH = REASONS[REASONS.length - 1];
      if (nc.type === 'confirm') keep.forEach(function (r) { var z = SO[r.code]; if (!z) return; r.status = z.status === 'absent' ? 'absent' : 'attend';
        if (r.status === 'absent') { var t = String(z.reason || '').trim(); if (REASONS.indexOf(t) >= 0) { r.reason = t; r.note = ''; } else { r.reason = t ? OTH : ''; r.note = t; } } else { r.reason = ''; r.note = ''; r.sub = ''; } });
      setEntries(id, keep);
    }
    log(id, [{ at: Date.now(), uid: '', who: u.name, whoId: u.email, role: roleTh(u), action: c ? 'แก้ไขหลักสูตร' : 'สร้างหลักสูตร', detail: (added || removed) ? 'รายชื่อตั้งต้น +' + added + ' / −' + removed : 'ข้อมูลหลักสูตร' }]);
    return { ok: true, id: id, unknown: unknown, added: added, removed: removed };
  } finally { lock.releaseLock(); }
}
function apiSetStatus(d) {
  var u = sessUser(d.token), list = courses(), c = list.filter(function (x) { return x.id === String(d.c || '').toUpperCase(); })[0];
  if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' }; if (!canEdit(u, c)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  if (['draft', 'open', 'closed'].indexOf(d.status) < 0) return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  c.status = d.status; saveCourses(list);
  log(c.id, [{ at: Date.now(), uid: '', who: u.name, whoId: u.email, role: roleTh(u), action: 'เปลี่ยนสถานะ', detail: { draft: 'ร่าง', open: 'เปิดรับ', closed: 'ปิดรับ' }[d.status] }]);
  return { ok: true };
}
function apiDelCourse(d) {
  var u = sessUser(d.token); if (u.role !== 'admin') return { ok: false, error: 'เฉพาะผู้ดูแลระบบ' };
  var id = String(d.c || '').toUpperCase();
  saveCourses(courses().filter(function (c) { return c.id !== id; })); setEntries(id, []);
  writeAll('Regs', rows('Regs').filter(function (r) { return r.courseId !== id; })); writeAll('Checkins', rows('Checkins').filter(function (r) { return r.courseId !== id; }));
  writeAll('Subs', rows('Subs').filter(function (r) { return r.courseId !== id; }));
  return { ok: true };
}
function apiSaveUser(d) {
  var u = sessUser(d.token); if (u.role !== 'admin') return { ok: false, error: 'เฉพาะผู้ดูแลระบบ' };
  var n = d.user || {}, email = String(n.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'อีเมลไม่ถูกต้อง' }; if (!String(n.name || '').trim()) return { ok: false, error: 'กรุณากรอกชื่อ-สกุล' };
  var list = rows('Users').filter(function (x) { return String(x.email).trim().toLowerCase() !== email; });
  list.push({ email: email, name: String(n.name).trim(), role: n.role === 'admin' ? 'admin' : 'staff' }); writeAll('Users', list);
  return { ok: true };
}
function apiDelUser(d) {
  var u = sessUser(d.token); if (u.role !== 'admin') return { ok: false, error: 'เฉพาะผู้ดูแลระบบ' };
  if (String(d.email).toLowerCase() === u.email) return { ok: false, error: 'ลบบัญชีของตนเองไม่ได้' };
  writeAll('Users', rows('Users').filter(function (x) { return String(x.email).trim().toLowerCase() !== String(d.email).toLowerCase(); }));
  return { ok: true };
}
function apiExport(d) {
  var u = sessUser(d.token), c = course(d.c); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  var es = entries(c.id), sb = subs(c.id);
  var cols = ['ลำดับ', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'ชั้น', 'สังกัด', 'หน่วยงาน', 'เขต', 'สถานะ', 'รุ่น', 'เหตุผล', 'ผู้เข้าแทน', 'เบอร์โทรติดต่อ', 'ส่งเมื่อ', 'ผู้ส่ง', 'รหัสการสมัคร'];
  function st(r) { return c.type === 'confirm' ? (r.status === 'absent' ? 'ไม่เข้าอบรม' : r.status === 'attend' ? 'เข้าอบรม' : (c.defaultAttend ? 'เข้าอบรม (ไม่ตอบ)' : 'ยังไม่ระบุ')) : c.type === 'nominate' ? (r.selected ? 'ได้รับเลือก' : 'ไม่ได้รับเลือก') : 'สมัคร/เสนอชื่อ'; }
  es.sort(function (a, b) { var ua = unitOf(a.uid), ub = unitOf(b.uid); return ua.region - ub.region || (ua.id < ub.id ? -1 : ua.id > ub.id ? 1 : 0); });
  var out = es.map(function (r, i) { var e = empOf(r.code) || {}, un = unitOf(r.uid), s = sb[c.who === 'self' ? r.code : r.uid], se = r.sub ? empOf(r.sub) : null;
    return [i + 1, r.code, e.name || '', e.pos || '', e.level || '', e.affil || '', un.short, un.region ? 'เขต ' + un.region : '', st(r), r.round || '', r.status === 'absent' ? reasonText(r) : '', se ? se.name + ' (' + r.sub + ')' : (r.sub || ''), r.phone ? "'" + r.phone : '', s ? new Date(s.at) : '', s ? s.byName : '', r.reg || '']; });
  var ss = SpreadsheetApp.create(c.id + ' · ' + c.title + ' · ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'));
  var s1 = ss.getSheets()[0]; s1.setName('รายชื่อ');
  s1.getRange(1, 1).setValue(c.title + ' รุ่นที่ ' + c.round).setFontWeight('bold').setFontSize(13);
  s1.getRange(3, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#DCE7F4');
  if (out.length) s1.getRange(4, 1, out.length, cols.length).setValues(out);
  s1.setFrozenRows(3); s1.autoResizeColumns(1, cols.length);
  var lg = logs(c.id, 2000), s2 = ss.insertSheet('ประวัติการแก้ไข');
  s2.getRange(1, 1, 1, 6).setValues([['วันเวลา', 'ผู้ดำเนินการ', 'บทบาท', 'หน่วยงาน', 'รายการ', 'รายละเอียด']]).setFontWeight('bold');
  if (lg.length) s2.getRange(2, 1, lg.length, 6).setValues(lg.map(function (l) { return [new Date(l.at), l.who, l.role, l.uid ? unitOf(l.uid).short : 'กฝภ.2', l.action, l.detail]; }));
  try { if (u.email) DriveApp.getFileById(ss.getId()).addEditor(u.email); } catch (e) {}
  return { ok: true, url: ss.getUrl(), cols: cols, rows: [] };
}

// ---------- แบบ 3 สมัครด้วยตนเอง · ใครก่อนได้ก่อน (ที่นั่งรายเขต + รายชื่อสำรอง) ----------
function pad4(n) { return padN(n, 4); }
function maskEmail(e) { e = String(e || ''); var i = e.indexOf('@'); return i < 1 ? e : e.charAt(0) + '***' + e.slice(i); }
function toMs(d, t) { if (!d) return 0; var a = String(d).split('-').map(Number), b = String(t || '00:00').split(':').map(Number); return new Date(a[0], a[1] - 1, a[2], b[0] || 0, b[1] || 0).getTime(); }
function fcfsPhase(c) { if (!c || c.status === 'draft') return 'none'; if (c.status === 'closed' || Date.now() > c.deadline) return 'closed'; if (c.openAt && Date.now() < c.openAt) return 'notyet'; return 'open'; }
function fcfsRegions(c) { var s = c.regionSeats || {}; var O = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '0', '99']; return Object.keys(s).filter(function (k) { return Number(s[k]) > 0; }).sort(function (a, b) { return O.indexOf(a) - O.indexOf(b); }); }
function regsOf(cid, all) { return (all || rows('Regs')).filter(function (r) { return r.courseId === cid; }).map(function (r) {
  return { code: normCode(r.code), uid: String(r.uid), region: Number(r.region), name: String(r.name), email: String(r.email), phone: String(r.phone).replace(/\D/g, ''), at: Number(r.at), ref: String(r.ref), status: String(r.status || ''), wdAt: Number(r.wdAt || 0), first: String(r.first || ''), org: String(r.org || ''), pos: String(r.pos || '') }; }); }
function cksOf(cid, all) { return (all || rows('Checkins')).filter(function (r) { return r.courseId === cid; }).map(function (r) { return { session: String(r.session), code: normCode(r.code), at: Number(r.at) }; }); }
function fcfsRank(c, regs) { var seats = c.regionSeats || {}, by = {};
  return regs.slice().sort(function (a, b) { return a.at - b.at || (a.ref < b.ref ? -1 : 1); }).map(function (r) { var o = {}, k; for (k in r) o[k] = r[k];
    if (r.status === 'withdrawn') { o.st = 'withdrawn'; o.n = 0; return o; } var g = String(r.region), i = (by[g] = (by[g] || 0) + 1), cap = Number(seats[g] || 0); o.cap = cap; o.st = i <= cap ? 'seat' : 'wait'; o.n = i <= cap ? i : i - cap; return o; }); }
function regionSum(c, rk) { return fcfsRegions(c).map(function (k) { var rs = rk.filter(function (r) { return String(r.region) === k; }); return { region: Number(k), seats: Number(c.regionSeats[k]), taken: rs.filter(function (r) { return r.st === 'seat'; }).length, wait: rs.filter(function (r) { return r.st === 'wait'; }).length }; }); }
function resOf(c, o) { return { ref: o.ref, at: o.at, st: o.st, n: o.n, cap: o.cap || Number((c.regionSeats || {})[String(o.region)] || 0), region: o.region, name: o.name, org: o.org || '', email: maskEmail(o.email), first: o.first || '', wdAt: o.wdAt || 0 }; }
function fcfsCourse(id) { var c = course(id); return c && c.type === 'fcfs' ? c : null; }
function thDT(ms) { return Utilities.formatDate(new Date(ms), 'Asia/Bangkok', 'd/M/') + (Number(Utilities.formatDate(new Date(ms), 'Asia/Bangkok', 'yyyy')) + 543) + ' ' + Utilities.formatDate(new Date(ms), 'Asia/Bangkok', 'HH:mm:ss') + ' น.'; }
function placeTxt(c) { var A = { zoom: 'Zoom', teams: 'Microsoft Teams', webex: 'Cisco Webex', meet: 'Google Meet', line: 'LINE Meeting' };
  return c.format === 'online2' ? 'ออนไลน์ · ' + (c.app === 'other' ? (c.appName || 'ประชุมออนไลน์') : (A[c.app] || 'ประชุมออนไลน์')) : c.format === 'elearn' ? 'ออนไลน์ · e-learning' : (c.place || ''); }
function apiFcfsInfo(d) { var c = fcfsCourse(d.c); if (!c || c.status === 'draft') return { ok: false, error: 'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิดรับสมัคร' };
  return { ok: true, course: pubC(c), phase: fcfsPhase(c), regions: regionSum(c, fcfsRank(c, regsOf(c.id))), now: Date.now() }; }
function apiFcfsCheck(d) { var c = fcfsCourse(d.c), code = normCode(d.code); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  if (!/^\d{4,6}$/.test(code)) return { ok: false, error: 'กรุณากรอกรหัสพนักงานเป็นตัวเลข 4–6 หลัก' }; var e = empOf(code); if (!e) return { ok: false, error: 'ไม่พบรหัสพนักงานนี้ในฐานข้อมูลพนักงาน' };
  var rg = fcfsRegions(c), my = String(empRegion(e)); if (rg.indexOf(my) < 0) return { ok: false, notEligible: true, error: 'หลักสูตรนี้เปิดรับเฉพาะ ' + rg.map(regionLabel).join(', ') };
  var L = regsOf(c.id), dup = L.some(function (r) { return r.code === e.code && r.status !== 'withdrawn'; });
  return { ok: true, emp: empPub(e), dup: dup, region: regionSum(c, fcfsRank(c, L)).filter(function (z) { return String(z.region) === my; })[0] }; }
function apiFcfsRegister(d) {
  var c = fcfsCourse(d.c), code = normCode(d.code); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  var ph = fcfsPhase(c); if (ph !== 'open') return { ok: false, error: ph === 'notyet' ? 'ยังไม่ถึงเวลาเปิดรับสมัคร' : 'ปิดรับสมัครแล้ว' };
  var ex = d.ext, e, g;
  if (ex) { var t = function (k) { return String(ex[k] || '').trim(); }, p0 = String(d.phone || '').replace(/\D/g, '');
    if (fcfsRegions(c).indexOf('99') < 0) return { ok: false, error: 'หลักสูตรนี้ไม่เปิดรับบุคคลภายนอก' };
    if (!t('prefix') || !t('first') || !t('last') || !t('org')) return { ok: false, error: 'กรุณากรอกคำนำหน้า ชื่อ นามสกุล และหน่วยงานให้ครบ' };
    e = { code: 'X' + p0, uid: 'EXT', name: t('prefix') + t('first') + ' ' + t('last'), org: t('org'), pos: t('pos') }; g = 99; }
  else { e = empOf(code); if (!e) return { ok: false, error: 'ไม่พบรหัสพนักงานนี้' }; g = empRegion(e);
    if (fcfsRegions(c).indexOf(String(g)) < 0) return { ok: false, error: 'สังกัดของท่านไม่อยู่ในกลุ่มที่เปิดรับ' }; }
  var email = String(d.email || '').trim(), phone = String(d.phone || '').replace(/\D/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'กรุณากรอก E-mail ให้ถูกต้อง' }; if (!/^0\d{9}$/.test(phone)) return { ok: false, error: 'กรุณากรอกเบอร์มือถือ 10 หลัก' };
  var lock = LockService.getScriptLock(); try { lock.waitLock(LOCK_MS); } catch (x) { return { ok: false, error: 'มีผู้สมัครพร้อมกันจำนวนมาก กรุณากดอีกครั้ง (ระบบจะไม่สร้างใบสมัครซ้ำ)' }; }
  try {
    _cache = {}; var L = regsOf(c.id), old = L.filter(function (r) { return r.code === e.code && r.status !== 'withdrawn'; })[0];
    if (old) return { ok: true, dup: true, res: resOf(c, fcfsRank(c, L).filter(function (r) { return r.ref === old.ref; })[0]) };
    var r = { code: e.code, uid: e.uid, region: g, name: e.name, org: ex ? e.org : '', pos: ex ? e.pos : '', email: email, phone: phone, at: Date.now(), ref: c.id + '-' + pad4(L.length + 1), status: '', wdAt: 0, first: '' };
    L.push(r); var o = fcfsRank(c, L).filter(function (z) { return z.ref === r.ref; })[0]; r.first = o.st + ':' + o.n;
    var row = {}; for (var k in r) row[k] = r[k]; row.courseId = c.id; row.phone = "'" + r.phone; append('Regs', [row]);
    log(c.id, [{ at: r.at, uid: e.uid, who: e.name, whoId: e.code, role: 'ผู้สมัคร', action: 'สมัครเข้าอบรม', detail: (o.st === 'seat' ? 'ได้ที่นั่ง ลำดับ ' + o.n : 'สำรอง ลำดับ ' + o.n) + ' · ' + r.ref }]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  o.first = r.first; return { ok: true, res: resOf(c, o) };
}
function apiFcfsMine(d) { var c = fcfsCourse(d.c), code = normCode(d.code), phone = String(d.phone || '').replace(/\D/g, ''); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  var L = regsOf(c.id), m = L.filter(function (r) { return r.code === code && r.phone === phone; }).sort(function (a, b) { return b.at - a.at; })[0];
  if (!m) return { ok: false, error: 'ข้อมูลไม่ตรงกับที่บันทึกไว้ กรุณาตรวจสอบรหัสพนักงานและเบอร์โทรที่ใช้สมัคร' };
  return { ok: true, res: resOf(c, fcfsRank(c, L).filter(function (r) { return r.ref === m.ref; })[0]) }; }
function apiFcfsWithdraw(d) {
  var c = fcfsCourse(d.c), code = normCode(d.code), phone = String(d.phone || '').replace(/\D/g, ''); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  var lock = LockService.getScriptLock(); lock.waitLock(LOCK_MS); var res, promoted = [];
  try {
    _cache = {}; var all = rows('Regs'), L = regsOf(c.id, all), m = L.filter(function (r) { return r.code === code && r.phone === phone && r.status !== 'withdrawn'; })[0];
    if (!m) return { ok: false, error: 'ไม่พบใบสมัครที่ยังมีผล' };
    var before = {}; fcfsRank(c, L).forEach(function (r) { before[r.ref] = r.st; });
    m.status = 'withdrawn'; m.wdAt = Date.now();
    writeAll('Regs', all.map(function (r) { if (r.courseId === c.id && String(r.ref) === m.ref) { r.status = 'withdrawn'; r.wdAt = m.wdAt; } if (r.phone && String(r.phone).charAt(0) !== "'") r.phone = "'" + r.phone; return r; }));
    var after = fcfsRank(c, L); after.forEach(function (r) { if (before[r.ref] === 'wait' && r.st === 'seat') promoted.push(r); });
    log(c.id, [{ at: m.wdAt, uid: m.uid, who: m.name, whoId: m.code, role: 'ผู้สมัคร', action: 'สละสิทธิ์', detail: m.ref + (promoted.length ? ' · เลื่อน ' + promoted.map(function (p) { return p.name; }).join(', ') + ' เป็นผู้ได้ที่นั่ง' : '') }]);
    res = resOf(c, after.filter(function (r) { return r.ref === m.ref; })[0]);
  } finally { lock.releaseLock(); }
  return { ok: true, res: res };
}

// ---------- ระบบเช็คชื่อ (Add-on · Online two-way) ----------
function ciWin(s, now) { var a = toMs(s.date, s.start) - 30 * 60000, b = toMs(s.date, s.end); return now < a ? 'soon' : now > b ? 'done' : 'open'; }
function ciCourse(id) { var c = course(id); return c && c.status !== 'draft' && c.checkin && c.checkin.on ? c : null; }
function inRoster(c, code) { return (c.checkin.roster || []).map(normCode).indexOf(code) >= 0; }
function apiCiInfo(d) { var c = ciCourse(d.c); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร หรือหลักสูตรนี้ไม่ได้เปิดระบบเช็คชื่อ' }; var now = Date.now();
  return { ok: true, course: pubC(c), now: now, sessions: (c.checkin.sessions || []).map(function (s) { return { id: s.id, label: s.label, date: s.date, start: s.start, end: s.end, state: ciWin(s, now) }; }) }; }
function apiCiCheck(d) { var c = ciCourse(d.c), code = normCode(d.code); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  if (!/^\d{4,6}$/.test(code)) return { ok: false, error: 'กรุณากรอกรหัสพนักงาน 4–6 หลัก' };
  if (!inRoster(c, code)) return { ok: false, error: 'ไม่พบรหัสนี้ในรายชื่อผู้เข้าอบรม กรุณาติดต่อผู้ประสานงานหลักสูตร' };
  var e = empOf(code); return { ok: true, emp: e ? empPub(e) : { code: code, name: 'รหัส ' + code, pos: '', unit: '', affil: '' }, done: cksOf(c.id).filter(function (k) { return k.code === code; }) }; }
function apiCiSubmit(d) { var c = ciCourse(d.c), code = normCode(d.code), room = String(d.room || '').trim(); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' };
  if (!inRoster(c, code)) return { ok: false, error: 'ไม่พบรหัสนี้ในรายชื่อผู้เข้าอบรม' };
  var now = Date.now(), open = (c.checkin.sessions || []).filter(function (s) { return ciWin(s, now) === 'open'; }); if (!open.length) return { ok: false, error: 'ขณะนี้ไม่อยู่ในช่วงเวลาเช็คชื่อ' };
  var s = open.filter(function (z) { return String(z.code) === room; })[0]; if (!s) return { ok: false, error: 'รหัสห้องไม่ถูกต้อง กรุณาดูรหัส 4 หลักที่วิทยากรแสดงบนจออีกครั้ง' };
  var lock = LockService.getScriptLock(); lock.waitLock(LOCK_MS);
  try { _cache = {}; var had = cksOf(c.id).filter(function (k) { return k.code === code && k.session === s.id; })[0]; if (had) return { ok: true, already: true, session: s.label, at: had.at };
    append('Checkins', [{ courseId: c.id, session: s.id, code: code, at: now }]); } finally { lock.releaseLock(); }
  return { ok: true, session: s.label, at: now }; }
function apiCiLive(d) { sessUser(d.token); return { ok: true, checkins: cksOf(String(d.c || '').toUpperCase()) }; }
// อัปโหลดภาพปก (JPG/PNG/GIF ≤ 5 MB) → Google Drive แชร์แบบดูได้ → คืน URL ภาพ
function apiUploadCover(d) { sessUser(d.token);
  var mime = String(d.mime || ''); if (['image/jpeg', 'image/png', 'image/gif'].indexOf(mime) < 0) return { ok: false, error: 'รองรับเฉพาะ JPG / PNG / GIF' };
  var bytes = Utilities.base64Decode(String(d.data || '')); if (bytes.length > 5 * 1024 * 1024) return { ok: false, error: 'ไฟล์ใหญ่เกิน 5 MB' };
  var it = DriveApp.getFoldersByName('Nomination Covers'), f = it.hasNext() ? it.next() : DriveApp.createFolder('Nomination Covers');
  var file = f.createFile(Utilities.newBlob(bytes, mime, String(d.name || 'cover'))); file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() }; }

// ---------- ตั้งค่าเริ่มต้น: เลือก setup แล้วกด Run ครั้งเดียว ----------
function setup() {
  Object.keys(HEAD).forEach(sh);
  if (!rows('Users').length) writeAll('Users', [{ email: Session.getActiveUser().getEmail().toLowerCase(), name: 'ผู้ดูแลระบบ', role: 'admin' }]);
  Logger.log('สร้างแท็บเรียบร้อย' + (prop('ADMIN_PASSWORD') ? '' : ' · อย่าลืมตั้ง ADMIN_PASSWORD ใน Project Settings › Script Properties'));
}

function apiAdminEditReg(d) {
  var u = sessUser(d.token), c = fcfsCourse(d.c); if (!c) return { ok: false, error: 'ไม่พบหลักสูตร' }; if (!canEdit(u, c)) return { ok: false, error: 'ไม่มีสิทธิ์แก้ไขหลักสูตรนี้' };
  var p = d.patch || {}, T = function (s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); };
  var name = T(p.name), email = T(p.email), phone = String(p.phone || '').replace(/\D/g, '');
  if (!name) return { ok: false, error: 'กรุณากรอกชื่อ-นามสกุล' }; if (!/^0\d{9}$/.test(phone)) return { ok: false, error: 'เบอร์โทรศัพท์ไม่ถูกต้อง' }; if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'E-mail ไม่ถูกต้อง' };
  var lock = LockService.getScriptLock(); lock.waitLock(LOCK_MS);
  try {
    _cache = {}; var all = rows('Regs'), L = regsOf(c.id, all), m = L.filter(function (r) { return r.ref === String(d.ref); })[0];
    if (!m) return { ok: false, error: 'ไม่พบใบสมัคร' };
    var ext = /^X/.test(m.code), code = m.code, uid = m.uid, region = m.region;
    if (ext) code = 'X' + phone; else { code = normCode(p.code); if (code !== m.code) { var e = empOf(code); if (!e) return { ok: false, error: 'ไม่พบรหัสพนักงาน ' + code + ' ในฐานข้อมูล' };
      var g = String(empRegion(e)); if (fcfsRegions(c).indexOf(g) < 0) return { ok: false, error: 'รหัส ' + code + ' สังกัด ' + regionLabel(g) + ' ซึ่งไม่อยู่ในเขตที่เปิดรับ' }; uid = e.uid; region = Number(g); } }
    if (m.status !== 'withdrawn' && L.some(function (r) { return r.ref !== m.ref && r.code === code && r.status !== 'withdrawn'; })) return { ok: false, error: 'รหัสนี้มีใบสมัครที่ยังมีผลอยู่แล้ว' };
    var nv = { code: code, name: name, phone: phone, email: email, org: ext ? T(p.org) : (m.org || ''), pos: ext ? T(p.pos) : (m.pos || '') }, LB = { code: 'รหัส', name: 'ชื่อ', phone: 'เบอร์', email: 'E-mail', org: 'หน่วยงาน', pos: 'ตำแหน่ง' }, ch = [];
    for (var k in nv) if (String(nv[k]) !== String(m[k] || '') && !(ext && k === 'code')) ch.push(LB[k] + ' ' + (m[k] || '—') + ' → ' + (nv[k] || '—'));
    if (!ch.length) return { ok: true, changed: 0 };
    writeAll('Regs', all.map(function (r) { if (r.courseId === c.id && String(r.ref) === m.ref) { for (var q in nv) r[q] = nv[q]; r.uid = uid; r.region = region; }
      if (r.phone && String(r.phone).charAt(0) !== "'") r.phone = "'" + r.phone; return r; }));
    log(c.id, [{ at: Date.now(), uid: '', who: u.name, whoId: u.email, role: roleTh(u), action: 'แก้ไขข้อมูลผู้สมัคร', detail: m.ref + ' · ' + ch.join(' · ') }]);
    SpreadsheetApp.flush(); return { ok: true, changed: ch.length };
  } finally { lock.releaseLock(); }
}
