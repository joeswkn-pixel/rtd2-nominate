// ระบบเสนอรายชื่อผู้เข้าฝึกอบรม v2 — helpers + กติกาตรวจสอบ + backend จำลอง (โหมดทดลอง)
// backend จำลองมีคำสั่งเหมือน apps-script/Code-v2.gs ทุกตัว — หน้าเว็บเรียกผ่าน NOM2.api(action, data)
(function(){
const CFG=window.NOM2_CONFIG||{};
const DEMO_Q=(()=>{try{const q=new URL(location.href).searchParams;return q.has('demo')||q.has('mock');}catch(e){return false;}})();
const LIVE=!!String(CFG.API_URL||'').trim()&&!DEMO_Q; // ?demo = ทดลองด้วยข้อมูลตัวอย่างแม้ตั้ง API_URL แล้ว
const DBK='pwa-r2-nom2-db-v2';
const TH_M=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_D=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const pad=n=>String(n).padStart(2,'0');
const fmtD=ms=>{const d=new Date(ms);return d.getDate()+' '+TH_M[d.getMonth()]+' '+(d.getFullYear()+543);};
const fmtDw=ms=>{const d=new Date(ms);return TH_D[d.getDay()]+' '+fmtD(ms);};
const fmtDs=ms=>{const d=new Date(ms);return d.getDate()+' '+TH_M[d.getMonth()]+' '+String(d.getFullYear()+543).slice(2);};
const hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes());};
const fmtDT=ms=>fmtD(ms)+' '+hm(ms)+' น.';
const fmtRange=(a,b)=>{if(!a)return '';const x=new Date(a),y=new Date(b||a);if(!b||x.toDateString()===y.toDateString())return fmtD(a);if(x.getMonth()===y.getMonth()&&x.getFullYear()===y.getFullYear())return x.getDate()+'–'+y.getDate()+' '+TH_M[y.getMonth()]+' '+(y.getFullYear()+543);return fmtDs(a)+' – '+fmtDs(b);};
const leftText=ms=>{const d=ms-Date.now();if(d<=0)return 'ปิดรับแล้ว';const h=d/36e5;if(h<24)return 'เหลือ '+Math.max(1,Math.floor(h))+' ชม.';return 'เหลือ '+Math.ceil(h/24)+' วัน';};
const iso=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const toMs=(d,t)=>{if(!d)return 0;const [y,m,dd]=d.split('-').map(Number);const [h,mi]=(t||'00:00').split(':').map(Number);return new Date(y,m-1,dd,h||0,mi||0).getTime();};
const REASONS=['ติดภารกิจ','ติดอบรมหลักสูตรอื่น','ลา','ติดขัดเรื่องการเดินทาง','อื่นๆ'];
const TYPES={
  confirm:{k:'แบบ 1',title:'ยืนยันรายชื่อ',desc:'ผู้จัดกำหนดรายชื่อไว้แล้ว ผู้กรอกยืนยันเข้าอบรม หรือแจ้งไม่เข้า พร้อมเหตุผลและผู้เข้าแทน'},
  nominate:{k:'แบบ 2',title:'เลือกจากรายชื่อ',desc:'ผู้จัดกำหนดรายชื่อผู้มีสิทธิ์ ผู้กรอกเลือกผู้เข้าอบรมไม่เกินโควตา'},
  fcfs:{k:'แบบ 3',title:'สมัครด้วยตนเอง · ใครก่อนได้ก่อน',desc:'พนักงานสมัครเองด้วยรหัสพนักงาน กำหนดที่นั่งรายเขต เมื่อเต็มแล้วรับเป็นรายชื่อสำรองอัตโนมัติ'},
  open:{k:'เดิม',title:'เปิดรับรายชื่อ',desc:'ไม่มีรายชื่อตั้งต้น ผู้กรอกเพิ่มรายชื่อด้วยรหัสพนักงานเอง'}
};
const WHO={
  unit:{title:'เสนอชื่อในหน่วยงาน',desc:'ผู้กรอก 1 คน จัดการรายชื่อทั้งหน่วยงานของตน'},
  self:{title:'สมัครด้วยตนเอง',desc:'พนักงานสมัครเองด้วยรหัสพนักงาน · ใครก่อนได้ก่อน'}
};
const FORMATS={onsite:'Onsite (ในสถานที่)',online2:'Online two-way',elearn:'Online e-learning'};
const APPS={zoom:'Zoom',teams:'Microsoft Teams',webex:'Cisco Webex',meet:'Google Meet',line:'LINE Meeting',other:'อื่นๆ'};
const appName=c=>c.app==='other'?(c.appName||'อื่นๆ'):(APPS[c.app]||'');
const placeText=c=>c.format==='online2'?'ออนไลน์ · '+(appName(c)||'ประชุมออนไลน์'):c.format==='elearn'?'ออนไลน์ · e-learning':(c.place||'—');
const pad4=n=>String(n).padStart(4,'0');
const maskEmail=e=>{e=String(e||'');const i=e.indexOf('@');return i<1?e:e[0]+'***'+e.slice(i);};
const fcfsPhase=c=>{if(!c||c.status==='draft')return 'none';if(c.status==='closed'||Date.now()>c.deadline)return 'closed';if(c.openAt&&Date.now()<c.openAt)return 'notyet';return 'open';};
const fcfsRank=(c,regs)=>{const seats=c.regionSeats||{},by={};return (regs||[]).slice().sort((a,b)=>a.at-b.at||String(a.ref).localeCompare(String(b.ref))).map(r=>{const o=Object.assign({},r);
  if(r.status==='withdrawn'){o.st='withdrawn';o.n=0;return o;}const k=String(r.region),i=(by[k]=(by[k]||0)+1),cap=+seats[k]||0;o.cap=cap;o.st=i<=cap?'seat':'wait';o.n=i<=cap?i:i-cap;return o;});};
const AFFILS=['1','2','3','4','5','6','7','8','9','10','0','99'].map(k=>({key:k,label:k==='0'?'สำนักงานใหญ่':k==='99'?'บุคคลภายนอก':'กปภ.เขต '+k}));
const regionLabel=k=>{const a=AFFILS.find(x=>x.key===String(k));return a?a.label:'กปภ.เขต '+k;};
const affOrd=k=>{const i=AFFILS.findIndex(x=>x.key===String(k));return i<0?999:i;};
const fcfsRegions=c=>Object.keys(c.regionSeats||{}).filter(k=>+c.regionSeats[k]>0).sort((a,b)=>affOrd(a)-affOrd(b));
const regionSum=(c,ranked)=>fcfsRegions(c).map(k=>{const rs=ranked.filter(r=>String(r.region)===k);return {region:+k,seats:+c.regionSeats[k],taken:rs.filter(r=>r.st==='seat').length,wait:rs.filter(r=>r.st==='wait').length};});
const ciWin=(s,now)=>{const a=toMs(s.date,s.start)-30*6e4,b=toMs(s.date,s.end);return now<a?'soon':now>b?'done':'open';};
const normCode=c=>{c=String(c==null?'':c).trim();return /^\d+$/.test(c)?String(Number(c)):c;};
const isClosed=c=>!c||c.status!=='open'||Date.now()>c.deadline;
const active=(c,r)=>c.type==='fcfs'?r.status!=='withdrawn':c.type==='confirm'?(r.status==='absent'?!!r.sub:(r.status==='attend'||!!c.defaultAttend)):c.type==='nominate'?!!r.selected:true;
const scopeKey=(c,emp)=>c.who==='self'?emp.code:emp.uid;
const reasonText=r=>r.reason==='อื่นๆ'?'อื่นๆ: '+(r.note||''):(r.reason||'');

// ---------- ข้อมูลตัวอย่าง ----------
function rng(seed){let s=seed%2147483647;if(s<=0)s+=2147483646;return()=>(s=s*16807%2147483647)/2147483647;}
const FM=['สมชาย','ธนพล','วรวุฒิ','กิตติพงษ์','ณัฐวุฒิ','อนุชา','ประเสริฐ','สุรเชษฐ์','ชัยวัฒน์','พงศกร','วีระพงษ์','ศักดิ์ชัย','อภิชาติ','ธีรวัฒน์','เอกชัย','ปิยะพงษ์'];
const FF=['สุภาวดี','กนกพร','พรทิพย์','วิภาวรรณ','ศิริพร','อรุณี','จิราภรณ์','นภาพร','รัตนา','ปวีณา','มณีรัตน์','สุนิสา','ชุติมา','ดารุณี'];
const LN=['ใจงาม','ศรีสุขใส','แก้วประเสริฐ','บุญมาก','ทองดีวงศ์','สายบุญมี','พรหมมาศ','วงศ์สวัสดิ์','จันทร์เพ็ญศรี','มั่นคงดี','รุ่งเรืองกิจ','ประเสริฐสุข','คำแก้วมูล','ภูผาทอง','สิทธิชัยกุล','นาคสวัสดิ์','อินทร์แก้ว'];
const BR={6:['ขอนแก่น','บ้านไผ่','ชุมแพ','มหาสารคาม','กาฬสินธุ์'],7:['อุดรธานี','หนองคาย','เลย','สกลนคร','บึงกาฬ'],8:['อุบลราชธานี','ศรีสะเกษ','ยโสธร','มุกดาหาร','นครพนม']};
function buildBase(){
  const r=rng(11),pick=a=>a[Math.floor(r()*a.length)],used=new Set(),units=[],emps=[];
  const mk=()=>{let c;do{c=String(r()<.35?9000+Math.floor(r()*999):10000+Math.floor(r()*89999));}while(used.has(c));used.add(c);return c;};
  const nm=()=>{const f=r()<.5;return (f?pick(['นางสาว','นาง']):'นาย')+(f?pick(FF):pick(FM))+' '+pick(LN);};
  const E=(u,pos,level,affil)=>emps.push({code:mk(),name:nm(),pos,level:String(level),affil,uid:u.id,region:u.region});
  [6,7,8].forEach(g=>{
    const o={id:'R0'+g,short:'กปภ.เขต '+g,full:'การประปาส่วนภูมิภาคเขต '+g,region:g};units.push(o);
    E(o,'ผู้อำนวยการกองบริหารทั่วไป',9,'กบท.'+g);E(o,'หัวหน้างานธุรการ',7,'กบท.'+g);E(o,'นักทรัพยากรบุคคล',6,'กบท.'+g);E(o,'พนักงานธุรการ',4,'กบท.'+g);E(o,'นักวิชาการคอมพิวเตอร์',5,'กบท.'+g);
    const q={id:'Q0'+g,short:'งคน.'+g,full:'งานควบคุมคุณภาพน้ำ กปภ.เขต '+g,region:g};units.push(q);
    E(q,'หัวหน้างานควบคุมคุณภาพน้ำ',7,q.full);E(q,'นักวิทยาศาสตร์',6,q.full);E(q,'นักวิทยาศาสตร์',5,q.full);E(q,'พนักงานวิเคราะห์น้ำ',4,q.full);
    BR[g].forEach((b,i)=>{
      const u={id:'B'+g+pad(i+1),short:'กปภ.สาขา'+b,full:'การประปาส่วนภูมิภาคสาขา'+b,region:g};units.push(u);
      E(u,'ผู้จัดการสาขา',8,u.full);E(u,'หัวหน้างานผลิต',7,u.short);E(u,'ช่างผลิต',5,u.short);E(u,'พนักงานผลิตน้ำ',4,u.short);E(u,'พนักงานการเงินและบัญชี',5,u.short);
    });
  });
  [['H01','กองฝึกอบรม','กองฝึกอบรม ฝ่ายพัฒนาทรัพยากรบุคคล'],['H02','กองระบบสารสนเทศ','กองระบบสารสนเทศ ฝ่ายเทคโนโลยีสารสนเทศ']].forEach(([id,s,f])=>{const u={id,short:s,full:f,region:0};units.push(u);
    E(u,'ผู้อำนวยการกอง',9,f);E(u,'นักทรัพยากรบุคคล',6,f);E(u,'นักวิชาการคอมพิวเตอร์',5,f);E(u,'พนักงานธุรการ',4,f);});
  return {units,emps};
}
const BASE=buildBase();
const EMP=new Map(BASE.emps.map(e=>[e.code,e]));
const UNIT=new Map(BASE.units.map(u=>[u.id,u]));
const byPos=(uid,pos)=>BASE.emps.find(e=>e.uid===uid&&e.pos===pos);
const DEMO={
  mgr:byPos('B601','ผู้จัดการสาขา'),mgr2:byPos('B702','ผู้จัดการสาขา'),
  staff:byPos('B601','พนักงานการเงินและบัญชี'),qc:byPos('Q06','นักวิทยาศาสตร์')
};
function seed(){
  const now=Date.now(),D=864e5,day=(n,h)=>{const d=new Date(now+n*D);d.setHours(h==null?16:h,30,0,0);return d.getTime();};
  const coord={name:'นางสาวกนกพร ศรีสุขใส',phone:'1204',email:'training.r2@pwa.co.th'};
  const courses=[
    {id:'CHEM69-5',title:'การใช้สารเคมีในระบบผลิตน้ำอย่างปลอดภัย',round:'5',format:'onsite',start:day(21,9),end:day(23,16),place:'ศูนย์ฝึกอบรม กปภ.เขต 6 จ.ขอนแก่น',target:'หัวหน้างานผลิตและนักวิทยาศาสตร์',deadline:day(5),capacity:40,quota:0,status:'open',type:'confirm',who:'unit',defaultAttend:false,rounds:[],instructions:'กรุณายืนยันการเข้าอบรมของผู้มีรายชื่อ หากไม่สามารถเข้าอบรมได้ ให้ระบุเหตุผลและรหัสพนักงานผู้เข้าแทน (ถ้ามี)',owners:['kanokporn.s@pwa.co.th'],coord,created:now-6*D},
    {id:'LEAD69-2',title:'การพัฒนาภาวะผู้นำสำหรับหัวหน้างานระดับต้น',round:'2',format:'onsite',start:day(30,9),end:day(32,16),place:'โรงแรมเจริญธานี จ.ขอนแก่น',target:'พนักงานระดับ 5–7',deadline:day(3),capacity:24,quota:2,status:'open',type:'nominate',who:'unit',defaultAttend:false,rounds:[],instructions:'เลือกผู้เข้าอบรมจากรายชื่อผู้มีสิทธิ์ หน่วยงานละไม่เกิน 2 คน',owners:[],coord,created:now-4*D},
    {id:'AIPM69-1',title:'AI Prompt Mastery: ออกแบบคำสั่งอย่างมืออาชีพ',round:'1',start:day(14,9),end:day(15,16),place:'',format:'online2',app:'teams',appName:'',target:'พนักงานทุกระดับ',openAt:now-D,deadline:day(9),capacity:0,quota:0,status:'open',type:'fcfs',who:'self',defaultAttend:false,rounds:[],
      regionSeats:{'6':5,'8':2},cover:'',instructions:'ใครส่งก่อนได้ที่นั่งก่อน ที่นั่งเต็มแล้วยังสมัครต่อได้ในรายชื่อสำรอง',owners:['kanokporn.s@pwa.co.th'],coord,created:now-2*D,
      checkin:{on:true,sessions:[{id:'t0',label:'ทดสอบระบบเช็คชื่อ',date:iso(now),start:'00:00',end:'23:59',code:'2468'},{id:'d1am',label:'วันที่ 1 · เช้า',date:iso(now+14*D),start:'08:30',end:'12:00',code:'4821'},{id:'d1pm',label:'วันที่ 1 · บ่าย',date:iso(now+14*D),start:'13:00',end:'16:30',code:'7305'},{id:'d2am',label:'วันที่ 2 · เช้า',date:iso(now+15*D),start:'08:30',end:'12:00',code:'1597'},{id:'d2pm',label:'วันที่ 2 · บ่าย',date:iso(now+15*D),start:'13:00',end:'16:30',code:'6042'}],roster:[]}},
    {id:'SAFE69-3',title:'ความปลอดภัยในการปฏิบัติงานกับระบบไฟฟ้า',round:'3',start:day(40,9),end:day(41,16),place:'ศูนย์ฝึกอบรม กปภ.เขต 7 จ.อุดรธานี',format:'onsite',target:'ช่างผลิตและพนักงานผลิตน้ำ',deadline:day(12),capacity:45,quota:3,status:'draft',type:'nominate',who:'unit',defaultAttend:false,rounds:[],instructions:'',owners:[],coord,created:now-D}
  ];
  const entries={},subs={},logs={};courses.forEach(c=>{entries[c.id]=[];subs[c.id]={};logs[c.id]=[];});
  const row=(e,o)=>Object.assign({code:e.code,uid:e.uid,status:'',selected:false,reason:'',note:'',sub:'',round:'',preset:true,phone:'',reg:''},o||{});
  BASE.emps.filter(e=>(e.pos==='หัวหน้างานผลิต'&&e.region<8)||(e.uid.startsWith('Q')&&e.pos==='นักวิทยาศาสตร์'&&e.level==='6')).forEach(e=>entries['CHEM69-5'].push(row(e)));
  BASE.emps.filter(e=>e.uid.startsWith('B')&&e.region===6&&+e.level>=5&&+e.level<=7).forEach(e=>entries['LEAD69-2'].push(row(e)));
  // หน่วยงานที่ส่งแล้วบางส่วน
  const tel=()=>'08'+String(10000000+Math.floor(Math.random()*8e7));
  const mark=(cid,uid,fn,by,ago)=>{const at=now-ago*36e5;entries[cid].filter(r=>r.uid===uid).forEach((r,i)=>{fn(r,i);r.phone=tel();});const b=byPos(uid,'ผู้จัดการสาขา')||by;
    subs[cid][uid]={at,ref:'R2-'+cid+'-'+pad(Object.keys(subs[cid]).length+1).padStart(4,'0'),byCode:b.code,byName:b.name,byPos:b.pos,phone:''};
    logs[cid].push({at,uid,who:b.name,whoId:b.code,role:'ผู้เสนอ',action:'ส่งรายชื่อ',detail:'เลขอ้างอิง '+subs[cid][uid].ref});};
  mark('CHEM69-5','B602',r=>{r.status='attend';},null,30);
  mark('CHEM69-5','B703',r=>{r.status='absent';r.reason='ติดภารกิจ';r.sub=(byPos('B703','ช่างผลิต')||{}).code||'';},null,8);
  mark('LEAD69-2','B603',(r,i)=>{r.selected=i<2;},null,5);
  const regs={'AIPM69-1':[]},cks={'AIPM69-1':[]};let rs=0;
  const pool=BASE.emps.filter(e=>(e.region===6||e.region===8)&&e.code!==DEMO.staff.code&&e.code!==DEMO.mgr.code&&e.code!==DEMO.qc.code);
  [6,6,8,6,8,6,8,8].forEach((g,i)=>{const e=pool.filter(x=>x.region===g)[i+3];const at=now-D+(i+1)*7*6e4+i*1371;rs++;
    regs['AIPM69-1'].push({code:e.code,uid:e.uid,region:g,name:e.name,email:'user'+(i+1)+'@gmail.com',phone:tel(),at,ref:'AIPM69-1-'+pad4(rs),status:i===2?'withdrawn':'',wdAt:i===2?at+36e5:0,first:''});});
  regs['AIPM69-1'].forEach(r=>{const x=fcfsRank(courses[2],regs['AIPM69-1'].filter(z=>z.at<=r.at)).find(z=>z.ref===r.ref);r.first=x.st==='withdrawn'?'seat:0':x.st+':'+x.n;});
  courses[2].checkin.roster=fcfsRank(courses[2],regs['AIPM69-1']).filter(r=>r.st==='seat').map(r=>r.code).concat([DEMO.staff.code,DEMO.mgr.code]);
  courses[2].checkin.roster.slice(0,2).forEach((k,i)=>cks['AIPM69-1'].push({session:'t0',code:k,at:now-(i+1)*9e5}));
  logs['AIPM69-1']=[];regs['AIPM69-1'].forEach(r=>logs['AIPM69-1'].push({at:r.at,uid:r.uid,who:r.name,whoId:r.code,role:'ผู้สมัคร',action:'สมัครเข้าอบรม',detail:'เลขที่รับสมัคร '+r.ref}));
  logs['CHEM69-5'].push({at:now-6*D,uid:'',who:'นางสาวกนกพร ศรีสุขใส',whoId:'kanokporn.s@pwa.co.th',role:'เจ้าหน้าที่',action:'สร้างหลักสูตร',detail:entries['CHEM69-5'].length+' รายชื่อตั้งต้น'});
  Object.values(logs).forEach(l=>l.sort((a,b)=>b.at-a.at));
  const users=[{email:'admin.rtc2@pwa.co.th',name:'ผู้ดูแลระบบ กฝภ.2',role:'admin'},{email:'kanokporn.s@pwa.co.th',name:'นางสาวกนกพร ศรีสุขใส',role:'staff'},{email:'thanapon.b@pwa.co.th',name:'นายธนพล บุญมาก',role:'staff'}];
  return {v:1,courses,entries,subs,logs,users,regs,cks,sess:{},seq:6,regSeq:{'AIPM69-1':rs}};
}

// ---------- กติกาตรวจสอบ (ใช้ทั้งหน้าเว็บและ backend) ----------
// ctx: {who, scope(uid|code), selfCode, uid, taken:{code:unitShort}, othersTotal, unitOthers}
function validate(c,rows,ctx,empOf){
  const errs={},glob=[],add=(k,m)=>{(errs[k]=errs[k]||[]).push(m);};
  const seen={},subSeen={},mult=(c.rounds||[]).length>1;
  rows.forEach(r=>{
    const e=empOf(r.code);
    if(!e){add(r.code,'ไม่พบรหัสพนักงานนี้');return;}
    if(ctx.who==='self'&&r.code!==ctx.selfCode)add(r.code,'สมัครได้เฉพาะตนเอง');
    if(ctx.who==='unit'&&e.uid!==ctx.uid)add(r.code,'ไม่ใช่บุคลากรในหน่วยงานของท่าน');
    if(seen[r.code])add(r.code,'รหัสซ้ำในรายการ');seen[r.code]=1;
    if(ctx.taken[r.code])add(r.code,'มีรายชื่อแล้วใน '+ctx.taken[r.code]);
    if(c.type==='confirm'){
      if(!r.status&&!c.defaultAttend)add(r.code,'กรุณาเลือก เข้าอบรม หรือ ไม่สามารถเข้าอบรม');
      if(r.status==='absent'){
        if(!r.reason)add(r.code,'กรุณาเลือกเหตุผลที่ไม่สามารถเข้าอบรม');
        else if(r.reason==='อื่นๆ'&&!String(r.note||'').trim())add(r.code,'กรุณาระบุรายละเอียดเหตุผล');
        if(r.sub){const s=empOf(r.sub);
          if(!s)add(r.code,'ไม่พบรหัสพนักงานผู้เข้าแทน');
          else if(seen[r.sub]||rows.some(x=>x.code===r.sub))add(r.code,'ผู้เข้าแทนมีรายชื่ออยู่ในรายการแล้ว');
          else if(ctx.taken[r.sub])add(r.code,'ผู้เข้าแทนมีรายชื่อแล้วใน '+ctx.taken[r.sub]);
          else if(subSeen[r.sub])add(r.code,'ผู้เข้าแทนซ้ำกับรายการอื่น');
          subSeen[r.sub]=1;}
      }
    }
    if(mult&&active(c,r)&&!r.round)add(r.code,'กรุณาเลือกรุ่นที่เข้าอบรม');
    if(active(c,r)&&String(r.phone||'').replace(/\D/g,'').length<4)add(r.code,r.status==='absent'?'กรุณากรอกเบอร์โทรติดต่อผู้เข้าแทน':'กรุณากรอกเบอร์โทรติดต่อผู้เข้าอบรม');
  });
  const n=rows.filter(r=>active(c,r)).length;
  if(c.quota>0&&c.type!=='confirm'&&n+(ctx.unitOthers||0)>c.quota)glob.push('เกินโควตาหน่วยงาน '+c.quota+' คน'+(ctx.unitOthers?' (หน่วยงานของท่านมีผู้สมัครแล้ว '+ctx.unitOthers+' คน)':''));
  if(c.capacity>0&&c.type!=='confirm'&&n+(ctx.othersTotal||0)>c.capacity)glob.push('จำนวนรับเต็มแล้ว (รับ '+c.capacity+' คน · เหลือ '+Math.max(0,c.capacity-(ctx.othersTotal||0))+' ที่นั่ง)');
  return {errs,glob,ok:!glob.length&&!Object.keys(errs).length,count:n};
}
function diffRows(c,oldR,newR,empOf){
  const out=[],nm=k=>{const e=empOf(k);return e?e.name:k;},O={};oldR.forEach(r=>O[r.code]=r);const N={};newR.forEach(r=>N[r.code]=r);
  newR.forEach(r=>{const o=O[r.code];
    if(!o){out.push({action:c.who==='self'?'สมัครเข้าอบรม':'เพิ่มรายชื่อ',detail:nm(r.code)+(r.round?' · '+r.round:'')});return;}
    if(c.type==='confirm'&&o.status!==r.status)out.push(r.status==='absent'?{action:'แจ้งไม่เข้าอบรม',detail:nm(r.code)+' · '+reasonText(r)+(r.sub?' · ผู้เข้าแทน '+nm(r.sub):'')}:{action:'ยืนยันเข้าอบรม',detail:nm(r.code)});
    else if(c.type==='confirm'&&r.status==='absent'&&(o.sub!==r.sub||o.reason!==r.reason||o.note!==r.note))out.push({action:'แก้ไขเหตุผล/ผู้เข้าแทน',detail:nm(r.code)+' · '+reasonText(r)+(r.sub?' · ผู้เข้าแทน '+nm(r.sub):'')});
    if(c.type==='nominate'&&!!o.selected!==!!r.selected)out.push({action:r.selected?'เลือกเข้าอบรม':'ยกเลิกการเลือก',detail:nm(r.code)});
    if((o.round||'')!==(r.round||'')&&o.round)out.push({action:'เปลี่ยนรุ่น',detail:nm(r.code)+' · '+o.round+' → '+r.round});
  });
  oldR.forEach(r=>{if(!N[r.code])out.push({action:c.who==='self'?'ยกเลิกการสมัคร':'ลบรายชื่อ',detail:nm(r.code)});});
  return out;
}
function exportTable(c,rows,subs,empOf,unitOf){
  const cols=['ลำดับ','รหัสพนักงาน','ชื่อ-นามสกุล','ตำแหน่ง','ชั้น','สังกัด','หน่วยงาน','เขต','สถานะ','รุ่น','เหตุผล','ผู้เข้าแทน','เบอร์โทรติดต่อ','ส่งเมื่อ','ผู้ส่ง','รหัสการสมัคร'];
  const st=r=>c.type==='confirm'?(r.status==='absent'?'ไม่เข้าอบรม':r.status==='attend'?'เข้าอบรม':(c.defaultAttend?'เข้าอบรม (ไม่ตอบ)':'ยังไม่ระบุ')):c.type==='nominate'?(r.selected?'ได้รับเลือก':'ไม่ได้รับเลือก'):'สมัคร/เสนอชื่อ';
  const sorted=rows.slice().sort((a,b)=>{const ua=unitOf(a.uid)||{},ub=unitOf(b.uid)||{};return (ua.region||0)-(ub.region||0)||String(ua.id).localeCompare(String(ub.id))||String(a.code).localeCompare(String(b.code));});
  const out=sorted.map((r,i)=>{const e=empOf(r.code)||{},u=unitOf(r.uid)||{},s=subs[c.who==='self'?r.code:r.uid],se=r.sub?empOf(r.sub):null;
    return [i+1,r.code,e.name||'',e.pos||'',e.level||'',e.affil||'',u.short||'',u.region?'เขต '+u.region:'',st(r),r.round||'',r.status==='absent'?reasonText(r):'',se?se.name+' ('+r.sub+')':(r.sub||''),r.phone||'',s?fmtDT(s.at):'',s?s.byName:'',r.reg||''];});
  return {cols,rows:out};
}

// ---------- backend จำลอง ----------
const MOCK=(function(){
  let MEM=null;const IS_MOCK=(()=>{try{return new URL(location.href).searchParams.has('mock');}catch(e){return false;}})();
  const load=()=>{if(IS_MOCK){if(!MEM)MEM=seed();return MEM;}try{const d=JSON.parse(localStorage.getItem(DBK)||'null');if(d&&d.v===1)return d;}catch(e){}const d=seed();save(d);return d;};
  const save=d=>{if(IS_MOCK){MEM=d;return;}try{localStorage.setItem(DBK,JSON.stringify(d));}catch(e){}};
  const empOf=k=>EMP.get(normCode(k))||null,unitOf=id=>UNIT.get(id)||null;
  const resOf=(c,o)=>({ref:o.ref,at:o.at,st:o.st,n:o.n,cap:o.cap||(+(c.regionSeats||{})[String(o.region)]||0),region:o.region,name:o.name,org:o.org||'',email:maskEmail(o.email),first:o.first||'',wdAt:o.wdAt||0});
  const empPub=e=>e&&{code:e.code,name:e.name,pos:e.pos,level:e.level,affil:e.affil,uid:e.uid,region:e.region,unit:(unitOf(e.uid)||{}).short||''};
  const tok=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
  const C=(d,id)=>d.courses.find(c=>c.id===String(id||'').toUpperCase());
  const pubC=c=>{const o=Object.assign({},c);delete o.owners;delete o.groupQr;delete o.groupLink;if(o.checkin)o.checkin={on:!!o.checkin.on,sessions:(o.checkin.sessions||[]).map(x=>({id:x.id,label:x.label,date:x.date,start:x.start,end:x.end}))};return o;};
  const grp=c=>c.groupQr||c.groupLink?{qr:c.groupQr||'',link:c.groupLink||''}:null;
  const sessEmp=(d,t)=>{const s=d.sess[t];if(!s||s.k!=='emp'||s.exp<Date.now())throw new Error('SESSION');return empOf(s.code);};
  const sessUser=(d,t)=>{const s=d.sess[t];if(!s||s.k!=='adm'||s.exp<Date.now())throw new Error('SESSION');const u=d.users.find(x=>x.email===s.email);if(!u)throw new Error('SESSION');return u;};
  const canEdit=(u,c)=>u.role==='admin'||(c.owners||[]).indexOf(u.email)>=0;
  const inScope=(c,r,emp)=>c.who==='self'?r.code===emp.code:r.uid===emp.uid;
  const ctxFor=(d,c,emp)=>{const rows=d.entries[c.id]||[],taken={};let others=0,unitOthers=0;
    rows.forEach(r=>{if(inScope(c,r,emp))return;const us=(unitOf(r.uid)||{}).short||r.uid;taken[r.code]=us;if(r.sub)taken[r.sub]=us;if(active(c,r)){others++;if(r.uid===emp.uid)unitOthers++;}});
    return {who:c.who,uid:emp.uid,selfCode:emp.code,taken,othersTotal:others,unitOthers:c.who==='self'?unitOthers:0};};
  const homeItem=(d,c,emp)=>{const rows=(d.entries[c.id]||[]).filter(r=>inScope(c,r,emp)),sb=(d.subs[c.id]||{})[scopeKey(c,emp)];
    let eligible=true,label='';
    if(c.who==='unit'){if(c.type==='open')label=rows.length?'เสนอชื่อแล้ว '+rows.length+' คน':'ยังไม่ได้เสนอชื่อ';else{eligible=rows.length>0;label=eligible?'หน่วยงานของท่านมีรายชื่อ '+rows.length+' คน':'หน่วยงานของท่านไม่มีรายชื่อในหลักสูตรนี้';}}
    else{if(c.type==='open')label=rows.length?'ท่านสมัครแล้ว':'เปิดรับสมัคร';else{eligible=rows.length>0;label=eligible?(c.type==='confirm'?'ท่านมีรายชื่อในหลักสูตรนี้':'ท่านอยู่ในรายชื่อผู้มีสิทธิ์สมัคร'):'ท่านไม่มีรายชื่อในหลักสูตรนี้';}}
    return {course:pubC(c),eligible,label,submittedAt:sb?sb.at:0,total:(d.entries[c.id]||[]).filter(r=>active(c,r)).length};};
  const A={
    open(){const d=load();return {ok:true,courses:d.courses.filter(c=>c.status!=='draft').map(c=>({course:pubC(c),total:(d.entries[c.id]||[]).filter(r=>active(c,r)).length}))};},
    pub(x){const d=load(),c=C(d,x.c);let me=null;try{if(x.token)me=sessEmp(d,x.token);}catch(e){}if(!c||c.status==='draft')return {ok:false,error:'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิดรับ'};
      const m={};(d.entries[c.id]||[]).forEach(r=>{const u=unitOf(r.uid)||{id:r.uid,short:r.uid,region:0};const o=m[u.id]=m[u.id]||{uid:u.id,short:u.short,region:u.region,n:0,rows:0,at:0};o.rows++;if(active(c,r))o.n++;
        {const em=empOf(r.code)||{},se=r.sub?empOf(r.sub):null;(o.people=o.people||[]).push({code:me?r.code:'',name:em.name||r.code,pos:em.pos||'',level:em.level||'',status:r.status,selected:!!r.selected,reason:r.reason,note:me?r.note:'',sub:r.sub,subName:se?se.name:'',round:r.round});}
        const sb=d.subs[c.id][c.who==='self'?r.code:r.uid];if(sb&&sb.at>o.at)o.at=sb.at;});
      const units=Object.values(m).map(o=>Object.assign(o,{submitted:c.who==='self'?o.rows>0:!!d.subs[c.id][o.uid]})).sort((a,b)=>a.region-b.region||a.uid.localeCompare(b.uid));
      return {ok:true,course:pubC(c),units,total:units.reduce((a,u)=>a+u.n,0),asOf:Date.now(),auth:!!me,myUid:me?(c.who==='self'?me.code:me.uid):''};},
    empLogin(x){const d=load(),e=empOf(x.code);if(!/^\d{4,6}$/.test(String(x.code||'').trim()))return {ok:false,error:'กรุณากรอกรหัสพนักงาน 4–6 หลัก'};
      if(!e)return {ok:false,error:'ไม่พบรหัสพนักงานนี้ในฐานข้อมูลพนักงาน กรุณาตรวจสอบอีกครั้ง'};
      const t=tok();d.sess[t]={k:'emp',code:e.code,exp:Date.now()+8*36e5};save(d);
      return {ok:true,token:t,ttl:8*3600,me:empPub(e),courses:d.courses.filter(c=>c.status!=='draft').map(c=>homeItem(d,c,e))};},
    home(x){const d=load(),e=sessEmp(d,x.token);return {ok:true,me:empPub(e),courses:d.courses.filter(c=>c.status!=='draft').map(c=>homeItem(d,c,e))};},
    form(x){const d=load(),e=sessEmp(d,x.token),c=C(d,x.c);if(!c||c.status==='draft')return {ok:false,error:'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิดรับ'};
      const rows=(d.entries[c.id]||[]).filter(r=>inScope(c,r,e)),emps={};rows.forEach(r=>{emps[r.code]=empPub(empOf(r.code));if(r.sub&&empOf(r.sub))emps[r.sub]=empPub(empOf(r.sub));});
      const it=homeItem(d,c,e);
      return {ok:true,course:pubC(c),me:empPub(e),unit:unitOf(e.uid),rows,emps,ctx:ctxFor(d,c,e),sub:(d.subs[c.id]||{})[scopeKey(c,e)]||null,eligible:it.eligible,label:it.label,group:rows.length&&(d.subs[c.id]||{})[scopeKey(c,e)]?grp(c):null};},
    admLookup(x){const d=load();sessUser(d,x.token);const emps={};(x.codes||[]).slice(0,2000).forEach(k=>{k=normCode(k);const e=empOf(k);emps[k]=e?empPub(e):null;});return {ok:true,emps};},
    lookup(x){const d=load();sessEmp(d,x.token);const e=empOf(x.code);return {ok:true,emp:e?empPub(e):null};},
    submit(x){const d=load(),e=sessEmp(d,x.token),c=C(d,x.c);
      if(!c||c.status==='draft')return {ok:false,error:'ไม่พบหลักสูตร'};
      if(isClosed(c))return {ok:false,error:'ปิดรับรายชื่อแล้ว ไม่สามารถส่งได้'};
      const all=d.entries[c.id]||[],old=all.filter(r=>inScope(c,r,e)),O={};old.forEach(r=>O[r.code]=r);
      let rows=(x.rows||[]).map(r=>{const code=normCode(r.code),em=empOf(code),o=O[code];
        return {code,uid:em?em.uid:'',status:c.type==='confirm'?(r.status==='attend'||r.status==='absent'?r.status:''):'',selected:c.type==='nominate'?!!r.selected:false,
          reason:r.status==='absent'?String(r.reason||''):'',note:r.status==='absent'?String(r.note||'').slice(0,300):'',sub:r.status==='absent'?normCode(r.sub||''):'',round:String(r.round||''),preset:o?!!o.preset:false,phone:String(r.phone||'').trim().slice(0,20),reg:o?String(o.reg||''):''};});
      if(c.type!=='open'){const extra=rows.filter(r=>!O[r.code]);if(extra.length&&c.type==='confirm')return {ok:false,error:'หลักสูตรนี้เพิ่มรายชื่อเองไม่ได้'};
        old.forEach(o=>{if((c.type==='confirm'||o.preset)&&!rows.find(r=>r.code===o.code))rows.push(o);});}
      const v=validate(c,rows,ctxFor(d,c,e),empOf);
      if(!v.ok)return {ok:false,error:v.glob[0]||'ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบรายการที่มีเครื่องหมายแจ้งเตือน',errs:v.errs};
      const ch=diffRows(c,old,rows,empOf),at=Date.now(),key=scopeKey(c,e);
      if(c.type==='open'){d.regSeq=d.regSeq||{};rows.forEach(r=>{if(!r.reg){d.regSeq[c.id]=(d.regSeq[c.id]||0)+1;r.reg=c.id+'-'+String(d.regSeq[c.id]).padStart(3,'0');}});}
      d.entries[c.id]=all.filter(r=>!inScope(c,r,e)).concat(rows);
      d.seq=(d.seq||0)+1;const ref='R2-'+c.id+'-'+String(d.seq).padStart(4,'0');
      d.subs[c.id][key]={at,ref,byCode:e.code,byName:e.name,byPos:e.pos,phone:''};
      if(c.who==='self'&&!rows.length)delete d.subs[c.id][key];
      const role=c.who==='self'?'ผู้สมัคร':'ผู้เสนอ';
      (ch.length?ch:[{action:'ส่งรายชื่อ',detail:'ไม่มีการเปลี่ยนแปลง'}]).forEach(z=>d.logs[c.id].unshift({at,uid:e.uid,who:e.name,whoId:e.code,role,action:z.action,detail:z.detail}));
      d.logs[c.id].unshift({at,uid:e.uid,who:e.name,whoId:e.code,role,action:'ส่งรายชื่อ',detail:'เลขอ้างอิง '+ref});
      save(d);return {ok:true,ref,at,count:v.count,group:rows.length?grp(c):null,regs:rows.filter(r=>r.reg).map(r=>({code:r.code,name:(empOf(r.code)||{}).name||r.code,reg:r.reg,round:r.round}))};},
    gLogin(x){const d=load(),id=String(x.idToken||'');const email=id.indexOf('demo:')===0?id.slice(5).toLowerCase():'';
      const u=d.users.find(z=>z.email===email);if(!u)return {ok:false,error:'บัญชี Google นี้ไม่มีสิทธิ์เข้าใช้งาน',email};
      const t=tok();d.sess[t]={k:'adm',email:u.email,exp:Date.now()+6*36e5};save(d);return {ok:true,token:t,ttl:6*3600,user:u};},
    adminLoad(x){const d=load(),u=sessUser(d,x.token);const cs=d.courses.filter(c=>u.role==='admin'||(c.owners||[]).indexOf(u.email)>=0||!(c.owners||[]).length);
      const emps={},entries={},subs={},logs={};cs.forEach(c=>{entries[c.id]=d.entries[c.id]||[];subs[c.id]=d.subs[c.id]||{};logs[c.id]=(d.logs[c.id]||[]).slice(0,300);entries[c.id].forEach(r=>{[r.code,r.sub].forEach(k=>{if(k&&empOf(k))emps[k]=empPub(empOf(k));});});});
      const regs={},checkins={};cs.forEach(c=>{regs[c.id]=(d.regs||{})[c.id]||[];checkins[c.id]=(d.cks||{})[c.id]||[];regs[c.id].forEach(r=>{if(empOf(r.code))emps[r.code]=empPub(empOf(r.code));});((c.checkin||{}).roster||[]).forEach(k=>{if(empOf(k))emps[normCode(k)]=empPub(empOf(k));});});
      return {ok:true,user:u,courses:cs,entries,subs,logs,emps,regs,checkins,units:BASE.units,users:d.users.map(z=>({email:z.email,name:z.name,role:z.role}))};},
    saveCourse(x){const d=load(),u=sessUser(d,x.token),c0=x.course||{},id=String(c0.id||'').toUpperCase().replace(/[^A-Z0-9-]/g,'');
      if(!id)return {ok:false,error:'กรุณากรอกรหัสหลักสูตร (A–Z, 0–9, -)'};if(!String(c0.title||'').trim())return {ok:false,error:'กรุณากรอกชื่อหลักสูตร'};
      let c=C(d,id);if(x.isNew&&c)return {ok:false,error:'รหัสหลักสูตร '+id+' มีอยู่แล้ว'};
      if(c&&!canEdit(u,c)&&(c.owners||[]).length)return {ok:false,error:'ท่านไม่มีสิทธิ์แก้ไขหลักสูตรนี้'};
      const owners=u.role==='admin'?(c0.owners||[]):Array.from(new Set((c0.owners||[]).concat([u.email])));
      const nc=Object.assign({},c||{status:'draft',created:Date.now()},c0,{id,owners});
      if(c)d.courses=d.courses.map(z=>z.id===id?nc:z);else{d.courses.unshift(nc);d.entries[id]=[];d.subs[id]={};d.logs[id]=[];}
      if(nc.type==='fcfs'){d.regs=d.regs||{};d.regs[id]=d.regs[id]||[];}
      const unknown=[];let added=0,removed=0;
      if(Array.isArray(x.codes)&&nc.type!=='open'&&nc.type!=='fcfs'){const want=[];x.codes.forEach(k=>{k=normCode(k);if(!k)return;if(!empOf(k)){unknown.push(k);return;}if(want.indexOf(k)<0)want.push(k);});
        const cur=d.entries[id]||[],keep=cur.filter(r=>want.indexOf(r.code)>=0);removed=cur.length-keep.length;
        const RO=x.roundOf||{};want.forEach(k=>{if(!keep.find(r=>r.code===k)){const em=empOf(k);keep.push({code:k,uid:em.uid,status:'',selected:false,reason:'',note:'',sub:'',round:'',preset:true});added++;}});
        keep.forEach(r=>{if(RO[r.code])r.round=String(RO[r.code]);});
        const SO=x.statusOf||{},OTH=REASONS[REASONS.length-1];if(nc.type==='confirm')keep.forEach(r=>{const z=SO[r.code];if(!z)return;r.status=z.status==='absent'?'absent':'attend';
          if(r.status==='absent'){const t=String(z.reason||'').trim();if(REASONS.indexOf(t)>=0){r.reason=t;r.note='';}else{r.reason=t?OTH:'';r.note=t;}}else{r.reason='';r.note='';r.sub='';}});d.entries[id]=keep;}
      d.logs[id].unshift({at:Date.now(),uid:'',who:u.name,whoId:u.email,role:u.role==='admin'?'ผู้ดูแลระบบ':'เจ้าหน้าที่',action:c?'แก้ไขหลักสูตร':'สร้างหลักสูตร',detail:(added||removed)?'รายชื่อตั้งต้น +'+added+' / −'+removed:'ข้อมูลหลักสูตร'});
      save(d);return {ok:true,id,unknown,added,removed};},
    setStatus(x){const d=load(),u=sessUser(d,x.token),c=C(d,x.c);if(!c)return {ok:false,error:'ไม่พบหลักสูตร'};if(!canEdit(u,c)&&(c.owners||[]).length)return {ok:false,error:'ไม่มีสิทธิ์'};
      c.status=x.status;d.logs[c.id].unshift({at:Date.now(),uid:'',who:u.name,whoId:u.email,role:u.role==='admin'?'ผู้ดูแลระบบ':'เจ้าหน้าที่',action:'เปลี่ยนสถานะ',detail:{draft:'ร่าง',open:'เปิดรับ',closed:'ปิดรับ'}[x.status]||x.status});save(d);return {ok:true};},
    delCourse(x){const d=load(),u=sessUser(d,x.token);if(u.role!=='admin')return {ok:false,error:'เฉพาะผู้ดูแลระบบ'};const id=String(x.c||'').toUpperCase();
      d.courses=d.courses.filter(c=>c.id!==id);delete d.entries[id];delete d.subs[id];delete d.logs[id];save(d);return {ok:true};},
    saveUser(x){const d=load(),u=sessUser(d,x.token);if(u.role!=='admin')return {ok:false,error:'เฉพาะผู้ดูแลระบบ'};const n=x.user||{},email=String(n.email||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return {ok:false,error:'อีเมลไม่ถูกต้อง'};if(!String(n.name||'').trim())return {ok:false,error:'กรุณากรอกชื่อ-สกุล'};
      const o={email,name:String(n.name).trim(),role:n.role==='admin'?'admin':'staff'};const i=d.users.findIndex(z=>z.email===email);if(i>=0)d.users[i]=o;else d.users.push(o);save(d);return {ok:true};},
    delUser(x){const d=load(),u=sessUser(d,x.token);if(u.role!=='admin')return {ok:false,error:'เฉพาะผู้ดูแลระบบ'};if(x.email===u.email)return {ok:false,error:'ลบบัญชีของตนเองไม่ได้'};
      d.users=d.users.filter(z=>z.email!==x.email);save(d);return {ok:true};},
    fcfsInfo(x){const d=load(),c=C(d,x.c);if(!c||c.status==='draft'||c.type!=='fcfs')return {ok:false,error:'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิดรับสมัคร'};
      const rk=fcfsRank(c,(d.regs||{})[c.id]);return {ok:true,course:pubC(c),phase:fcfsPhase(c),regions:regionSum(c,rk),now:Date.now()};},
    fcfsCheck(x){const d=load(),c=C(d,x.c),code=normCode(x.code);if(!c||c.type!=='fcfs')return {ok:false,error:'ไม่พบหลักสูตร'};
      if(!/^\d{4,6}$/.test(code))return {ok:false,error:'กรุณากรอกรหัสพนักงานเป็นตัวเลข 4–6 หลัก'};const e=empOf(code);if(!e)return {ok:false,error:'ไม่พบรหัสพนักงานนี้ในฐานข้อมูลพนักงาน'};
      const rgs=fcfsRegions(c);if(rgs.indexOf(String(e.region))<0)return {ok:false,error:'หลักสูตรนี้เปิดรับเฉพาะพนักงานสังกัด '+rgs.map(regionLabel).join(', '),notEligible:true};
      const mine=((d.regs||{})[c.id]||[]).find(r=>r.code===e.code&&r.status!=='withdrawn');const rk=fcfsRank(c,(d.regs||{})[c.id]);
      return {ok:true,emp:empPub(e),dup:!!mine,region:regionSum(c,rk).find(z=>String(z.region)===String(e.region))};},
    fcfsRegister(x){const d=load(),c=C(d,x.c),code=normCode(x.code);if(!c||c.type!=='fcfs')return {ok:false,error:'ไม่พบหลักสูตร'};
      const ph=fcfsPhase(c);if(ph!=='open')return {ok:false,error:ph==='notyet'?'ยังไม่ถึงเวลาเปิดรับสมัคร':'ปิดรับสมัครแล้ว'};
      const ex=x.ext;let e;
      if(ex){const p0=String(x.phone||'').replace(/\D/g,''),t=k=>String(ex[k]||'').trim();if(fcfsRegions(c).indexOf('99')<0)return {ok:false,error:'หลักสูตรนี้ไม่เปิดรับบุคคลภายนอก'};
        if(!t('prefix')||!t('first')||!t('last')||!t('org'))return {ok:false,error:'กรุณากรอกคำนำหน้า ชื่อ นามสกุล และหน่วยงานให้ครบ'};if(!/^0\d{9}$/.test(p0))return {ok:false,error:'กรุณากรอกเบอร์มือถือ 10 หลัก'};
        e={code:'X'+p0,uid:'EXT',region:99,name:t('prefix')+t('first')+' '+t('last'),org:t('org'),pos:t('pos')};}
      else{e=empOf(code);if(!e)return {ok:false,error:'ไม่พบรหัสพนักงานนี้'};if(fcfsRegions(c).indexOf(String(e.region))<0)return {ok:false,error:'สังกัดของท่านไม่อยู่ในกลุ่มที่เปิดรับ'};}
      const email=String(x.email||'').trim(),phone=String(x.phone||'').replace(/\D/g,'');
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return {ok:false,error:'กรุณากรอก E-mail ให้ถูกต้อง'};if(!/^0\d{9}$/.test(phone))return {ok:false,error:'กรุณากรอกเบอร์มือถือ 10 หลัก'};
      d.regs=d.regs||{};const L=d.regs[c.id]=d.regs[c.id]||[];const old=L.find(r=>r.code===e.code&&r.status!=='withdrawn');
      if(old){const o=fcfsRank(c,L).find(r=>r.ref===old.ref);return {ok:true,dup:true,res:resOf(c,o)};}
      d.regSeq=d.regSeq||{};d.regSeq[c.id]=(d.regSeq[c.id]||0)+1;const r={code:e.code,uid:e.uid,region:e.region,name:e.name,org:ex?e.org:'',pos:ex?e.pos:'',email,phone,at:Date.now(),ref:c.id+'-'+pad4(d.regSeq[c.id]),status:'',wdAt:0,first:''};
      L.push(r);const o=fcfsRank(c,L).find(z=>z.ref===r.ref);r.first=o.st+':'+o.n;
      (d.logs[c.id]=d.logs[c.id]||[]).unshift({at:r.at,uid:e.uid,who:e.name,whoId:e.code,role:'ผู้สมัคร',action:'สมัครเข้าอบรม',detail:(o.st==='seat'?'ได้ที่นั่ง ลำดับ '+o.n:'สำรอง ลำดับ '+o.n)+' · '+r.ref});
      save(d);return {ok:true,res:resOf(c,Object.assign({},o,{first:r.first}))};},
    fcfsMine(x){const d=load(),c=C(d,x.c),code=normCode(x.code),phone=String(x.phone||'').replace(/\D/g,'');if(!c||c.type!=='fcfs')return {ok:false,error:'ไม่พบหลักสูตร'};
      const L=(d.regs||{})[c.id]||[],m=L.filter(r=>r.code===code&&r.phone===phone).sort((a,b)=>b.at-a.at)[0];
      if(!m)return {ok:false,error:'ข้อมูลไม่ตรงกับที่บันทึกไว้ กรุณาตรวจสอบรหัสพนักงานและเบอร์โทรที่ใช้สมัคร'};return {ok:true,res:resOf(c,fcfsRank(c,L).find(r=>r.ref===m.ref))};},
    fcfsWithdraw(x){const d=load(),c=C(d,x.c),code=normCode(x.code),phone=String(x.phone||'').replace(/\D/g,'');if(!c||c.type!=='fcfs')return {ok:false,error:'ไม่พบหลักสูตร'};
      const L=(d.regs||{})[c.id]||[],m=L.find(r=>r.code===code&&r.phone===phone&&r.status!=='withdrawn');if(!m)return {ok:false,error:'ไม่พบใบสมัครที่ยังมีผล'};
      m.status='withdrawn';m.wdAt=Date.now();d.logs[c.id].unshift({at:m.wdAt,uid:m.uid,who:m.name,whoId:m.code,role:'ผู้สมัคร',action:'สละสิทธิ์',detail:m.ref});save(d);
      return {ok:true,res:resOf(c,fcfsRank(c,L).find(r=>r.ref===m.ref))};},
    ciInfo(x){const d=load(),c=C(d,x.c);if(!c||c.status==='draft'||!c.checkin||!c.checkin.on)return {ok:false,error:'ไม่พบหลักสูตร หรือหลักสูตรนี้ไม่ได้เปิดระบบเช็คชื่อ'};
      const now=Date.now();return {ok:true,course:pubC(c),sessions:(c.checkin.sessions||[]).map(s=>({id:s.id,label:s.label,date:s.date,start:s.start,end:s.end,state:ciWin(s,now)})),now};},
    ciCheck(x){const d=load(),c=C(d,x.c),code=normCode(x.code);if(!c||!c.checkin||!c.checkin.on)return {ok:false,error:'ไม่พบหลักสูตร'};
      if(!/^\d{4,6}$/.test(code))return {ok:false,error:'กรุณากรอกรหัสพนักงาน 4–6 หลัก'};
      if((c.checkin.roster||[]).map(normCode).indexOf(code)<0)return {ok:false,error:'ไม่พบรหัสนี้ในรายชื่อผู้เข้าอบรม กรุณาติดต่อผู้ประสานงานหลักสูตร'};
      const e=empOf(code);return {ok:true,emp:e?empPub(e):{code,name:'รหัส '+code,pos:'',unit:'',affil:''},done:((d.cks||{})[c.id]||[]).filter(k=>k.code===code).map(k=>({session:k.session,at:k.at}))};},
    ciSubmit(x){const d=load(),c=C(d,x.c),code=normCode(x.code),room=String(x.room||'').trim();if(!c||!c.checkin||!c.checkin.on)return {ok:false,error:'ไม่พบหลักสูตร'};
      if((c.checkin.roster||[]).map(normCode).indexOf(code)<0)return {ok:false,error:'ไม่พบรหัสนี้ในรายชื่อผู้เข้าอบรม'};
      const now=Date.now(),open=(c.checkin.sessions||[]).filter(s=>ciWin(s,now)==='open');if(!open.length)return {ok:false,error:'ขณะนี้ไม่อยู่ในช่วงเวลาเช็คชื่อ'};
      const s=open.find(z=>String(z.code)===room);if(!s)return {ok:false,error:'รหัสห้องไม่ถูกต้อง กรุณาดูรหัส 4 หลักที่วิทยากรแสดงบนจออีกครั้ง'};
      d.cks=d.cks||{};const L=d.cks[c.id]=d.cks[c.id]||[];const had=L.find(k=>k.code===code&&k.session===s.id);
      if(had)return {ok:true,already:true,session:s.label,at:had.at};L.push({session:s.id,code,at:now});save(d);return {ok:true,session:s.label,at:now};},
    ciLive(x){const d=load();sessUser(d,x.token);return {ok:true,checkins:((d.cks||{})[String(x.c||'').toUpperCase()]||[])};},
    uploadCover(x){const d=load();sessUser(d,x.token);return {ok:true,url:'data:'+x.mime+';base64,'+x.data};},
    adminEditReg(x){const d=load(),u=sessUser(d,x.token),c=C(d,x.c);if(!c||c.type!=='fcfs')return {ok:false,error:'ไม่พบหลักสูตร'};
      if(!canEdit(u,c)&&(c.owners||[]).length)return {ok:false,error:'ไม่มีสิทธิ์แก้ไขหลักสูตรนี้'};
      const L=(d.regs||{})[c.id]||[],m=L.find(r=>r.ref===x.ref);if(!m)return {ok:false,error:'ไม่พบใบสมัคร'};
      const p=x.patch||{},ext=/^X/.test(m.code),T=s=>String(s==null?'':s).trim().replace(/\s+/g,' ');
      const name=T(p.name),email=T(p.email),phone=String(p.phone||'').replace(/\D/g,'');
      if(!name)return {ok:false,error:'กรุณากรอกชื่อ-นามสกุล'};if(!/^0\d{9}$/.test(phone))return {ok:false,error:'เบอร์โทรศัพท์ไม่ถูกต้อง'};if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return {ok:false,error:'E-mail ไม่ถูกต้อง'};
      let code=m.code,uid=m.uid,region=m.region;
      if(ext)code='X'+phone;else{code=normCode(p.code);if(code!==m.code){const e=empOf(code);if(!e)return {ok:false,error:'ไม่พบรหัสพนักงาน '+code+' ในฐานข้อมูล'};
        if(fcfsRegions(c).indexOf(String(e.region))<0)return {ok:false,error:'รหัส '+code+' สังกัด '+regionLabel(e.region)+' ซึ่งไม่อยู่ในเขตที่เปิดรับ'};uid=e.uid;region=e.region;}}
      if(m.status!=='withdrawn'&&L.some(r=>r!==m&&r.code===code&&r.status!=='withdrawn'))return {ok:false,error:'รหัสนี้มีใบสมัครที่ยังมีผลอยู่แล้ว'};
      const nv={code,name,phone,email,org:ext?T(p.org):m.org||'',pos:ext?T(p.pos):m.pos||''},LB={code:'รหัส',name:'ชื่อ',phone:'เบอร์',email:'E-mail',org:'หน่วยงาน',pos:'ตำแหน่ง'};
      const ch=Object.keys(nv).filter(k=>String(nv[k])!==String(m[k]||'')&&!(ext&&k==='code')).map(k=>LB[k]+' '+(m[k]||'—')+' → '+(nv[k]||'—'));
      if(!ch.length)return {ok:true,changed:0};
      Object.assign(m,nv,{uid,region});d.logs[c.id]=d.logs[c.id]||[];
      d.logs[c.id].unshift({at:Date.now(),uid:'',who:u.name,whoId:u.email,role:u.role==='admin'?'ผู้ดูแลระบบ':'เจ้าหน้าที่',action:'แก้ไขข้อมูลผู้สมัคร',detail:m.ref+' · '+ch.join(' · ')});
      save(d);return {ok:true,changed:ch.length};},
    export(x){const d=load();sessUser(d,x.token);const c=C(d,x.c);if(!c)return {ok:false,error:'ไม่พบหลักสูตร'};const t=exportTable(c,d.entries[c.id]||[],d.subs[c.id]||{},empOf,unitOf);return {ok:true,url:'',cols:t.cols,rows:t.rows};}
  };
  return {A,reset(){const d=seed();save(d);},empOf};
})();

const api=(action,data)=>{
  if(LIVE)return fetch(CFG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action},data||{})),redirect:'follow'}).then(r=>r.json());
  return new Promise(res=>setTimeout(()=>{let out;try{out=MOCK.A[action]?MOCK.A[action](data||{}):{ok:false,error:'ไม่รู้จักคำสั่ง '+action};}catch(e){out=String(e.message)==='SESSION'?{ok:false,error:'SESSION'}:{ok:false,error:String(e.message||e)};}res(JSON.parse(JSON.stringify(out)));},180+Math.random()*160));
};
const formUrl=(cid,view)=>{let b=String(CFG.FORM_URL||'').trim();if(!b)b=location.href;b=b.split('#')[0].split('?')[0];return b+(cid?'?c='+encodeURIComponent(cid)+(view?'&view='+view:''):'');};

const sib=(file,cid)=>{let b=String(CFG.FORM_URL||'').trim()||location.href;b=b.split('#')[0].split('?')[0];b=b.slice(0,b.lastIndexOf('/')+1)+encodeURIComponent(file);const q=[];if(cid)q.push('c='+encodeURIComponent(cid));if(DEMO_Q){try{const p=new URL(location.href).searchParams;q.push(p.has('mock')?'mock':'demo');}catch(e){}}return b+(q.length?'?'+q.join('&'):'');};
const fcfsUrl=cid=>sib(CFG.FCFS_PAGE||'Self Registration FCFS.dc.html',cid),checkinUrl=cid=>sib(CFG.CHECKIN_PAGE||'Check-in.dc.html',cid);
window.NOM2={CFG,LIVE,api,formUrl,fcfsUrl,checkinUrl,FORMATS,APPS,appName,placeText,maskEmail,fcfsPhase,fcfsRank,fcfsRegions,AFFILS,regionLabel,regionSum,ciWin,pad4,fmtD,fmtDw,fmtDs,fmtDT,fmtRange,hm,iso,toMs,leftText,REASONS,TYPES,WHO,normCode,isClosed,active,reasonText,validate,
  demoCodes:[{code:DEMO.mgr.code,label:'ผจก.สาขาขอนแก่น'},{code:DEMO.mgr2.code,label:'ผจก.สาขาหนองคาย'},{code:DEMO.staff.code,label:'พนักงาน สาขาขอนแก่น'},{code:DEMO.qc.code,label:'นักวิทย์ งคน.6'},{code:BASE.emps.find(e=>e.region===0).code,label:'พนักงาน สนญ.'}],
  demoUsers:[{email:'admin.rtc2@pwa.co.th',label:'ผู้ดูแลระบบ'},{email:'kanokporn.s@pwa.co.th',label:'เจ้าหน้าที่'}],
  resetDemo:()=>MOCK.reset(),UNITS:BASE.units};
})();
