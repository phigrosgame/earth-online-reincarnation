/* ═══════════════════════════════════════════════════════════
   輪迴模擬器 — 超凡之路
   隱藏數值 / 章節批次生成 / 詞條抽卡經濟 / 混世界 / 續玩存檔
   ═══════════════════════════════════════════════════════════ */

// ── 存檔 ──
const SAVE_KEY = 'multilife_v3';
const DEFAULT_SAVE = {
  aCoin: 300, bCoin: 0,
  ownedRealms: ['mortal'],
  carryCap: 3,                 // 詞條攜帶格上限
  inventory: {},               // { traitId: {count, level, equipped} }
  baseTalents: {},             // 魂魄轉化的永久基礎數值 { statKey: level }
  lifeRecords: [],
  activeLife: null             // 中途存檔（本世完整狀態）
};
let save = loadSave();
function loadSave() {
  let s; try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){ s = null; }
  s = Object.assign({}, DEFAULT_SAVE, s || {});
  for (const k in DEFAULT_SAVE) if (s[k] === undefined) s[k] = (typeof DEFAULT_SAVE[k]==='object' && DEFAULT_SAVE[k]!==null) ? (Array.isArray(DEFAULT_SAVE[k])?[]:{}) : DEFAULT_SAVE[k];
  return s;
}
function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }

// ── 世界設定 ──
// 隱藏數值（hidden）：玩家平常看不到，靠事件/詞條才窺見。health 決定壽命。
// 顯性數值（shown）：現實看得到的（錢、名聲…），直接顯示。
const REALMS = {
  mortal: {
    name:'現代凡人', badge:'現代', emoji:'🌆', bgClass:'realm-mortal',
    shown:['財富','聲望'], shownInit:[0,0], shownUnit:['$',''],
    hidden:['健康','智慧','運氣','心性','人脈','體魄'], hiddenInit:[80,40,40,40,30,55],
    startAge:0, lifespan:78,
    context:'二十一世紀的現代都市，機遇與內捲並存。求學、就業、買房、婚戀、養老，平凡人在系統裡掙扎與微小的閃光。',
    moneyName:'財富', moneyMax:99999999,
  },
  rich: {
    name:'豪門世家', badge:'豪門', emoji:'💎', bgClass:'realm-rich',
    shown:['家產','聲望'], shownInit:[30000000,40], shownUnit:['$',''],
    hidden:['健康','城府','運氣','膽識','人脈','權位'], hiddenInit:[75,55,45,40,70,30],
    startAge:0, lifespan:80,
    context:'錦衣玉食的豪門大族，金山銀山卻暗藏家族傾軋、商戰與聯姻。出身即是起跑線，但守業比創業更難。',
    moneyName:'家產', moneyMax:9999999999,
  },
  noble: {
    name:'古代王朝', badge:'王朝', emoji:'⚔️', bgClass:'realm-noble',
    shown:['官品','功勳'], shownInit:[0,0], shownUnit:['',''],
    hidden:['健康','武藝','謀略','運氣','民心','忠義'], hiddenInit:[70,45,45,40,30,60],
    startAge:0, lifespan:62,
    context:'烽煙四起的封建王朝。寒門書生、將門之後或市井草莽，於朝堂、沙場、江湖之間求一條生路與功名。世道艱險，性命如草芥。',
    moneyName:'官品', moneyMax:9,
  },
  cultivator: {
    name:'修仙境界', badge:'修仙', emoji:'🌀', bgClass:'realm-cultivator',
    shown:['境界','靈石'], shownInit:[0,10], shownUnit:['',''],
    hidden:['壽元','悟性','根骨','運氣','道心','靈力'], hiddenInit:[100,55,50,40,60,20],
    startAge:0, lifespan:300,
    context:'靈氣復甦的修真世界，分練氣、築基、金丹、元嬰、化神、合體、大乘、渡劫。資質決定上限，機緣決定下限，逆天而行九死一生。',
    moneyName:'靈石', moneyMax:99999999, healthKey:'壽元',
  },
  immortal: {
    name:'神明境域', badge:'神明', emoji:'☀️', bgClass:'realm-immortal',
    shown:['神格','信徒'], shownInit:[1,0], shownUnit:['',''],
    hidden:['法則','因果','運氣','道行','權柄','混沌'], hiddenInit:[50,40,40,60,30,20],
    startAge:0, lifespan:1000000,
    context:'超脫輪迴的神明境域。你執掌某種天地法則，於諸神博弈、信仰興滅、宇宙存續之間做出抉擇，一念可動蒼生。',
    moneyName:'信徒', moneyMax:9999999999, healthKey:'法則',
  },
  chaos: {
    name:'混世界', badge:'混沌', emoji:'🌌', bgClass:'realm-chaos',
    shown:['命運值'], shownInit:[0], shownUnit:[''],
    hidden:['健康','悟性','運氣','心性','人脈','異力'], hiddenInit:[70,50,50,45,40,30],
    startAge:0, lifespan:120,
    context:'規則崩壞、諸界交融的混沌之境。多個世界的法則同時運作，現代都市可能一夜靈氣復甦，王朝戰場或闖入神明。一切皆有可能。',
    moneyName:'命運值', moneyMax:9999999, isChaos:true,
  },
};
const REALM_ORDER = ['mortal','rich','noble','cultivator','immortal','chaos'];
const REALM_COST = { rich:24, noble:56, cultivator:120, immortal:300, chaos:40 }; // 道果解鎖（原價/5）
 
function healthKeyOf(r){ return r.healthKey || '健康'; }

// ── 數值分類 ──
// 金錢類：以「元/單位」計，數值大、無上限（現實財富）
const MONEY_STATS = new Set(['財富','家產']);
// 抽象貨幣/位階類：各自尺度、無上限（非現實元）
const CURRENCY_STATS = new Set(['靈石','信徒','命運值','官品','境界','神格','神格','靈石']);
// 名聲類：無上限，但越高越難漲（邊際遞減）
const FAME_STATS = new Set(['名聲','聲望','功勳','名望','民心']);
const HEALTH_CAP = 120;   // 健康/壽元類上限（避免不死）

function isMoneyStat(k){ return MONEY_STATS.has(k); }
function isFameStat(k){ return FAME_STATS.has(k); }
// 財富成就分數 0~320：元世界用 log10（百萬≈120、千萬≈180、億≈240、十億≈300）；其餘貨幣用相對 moneyMax
function wealthAchievement(wealth, r){
  if(isMoneyStat(r.moneyName)) return clamp(Math.round((Math.log10(Math.max(wealth,1))-4)*60), 0, 320);
  const mx = r.moneyMax||1;
  return clamp(Math.round(Math.sqrt(Math.min(wealth,mx)/mx)*250), 0, 300);
}

// 聲望（身分地位）邊際效應：越高越難再漲，但仍能隨成就攀到數百（溫和衰減）
function addFame(current, gain) {
  if(gain<=0) return Math.max(0, current+gain);
  return current + gain * (90 / (90 + Math.max(0,current)));
}
// 統一的數值增減：依分類套用不同規則（金錢/名聲/健康/一般隱藏）
function bumpStat(stats, k, delta, hk){
  if(stats[k]===undefined) return;
  delta = Number(delta||0);
  if(isMoneyStat(k) || CURRENCY_STATS.has(k)){ stats[k]=Math.max(0, stats[k]+delta); return; } // 無上限
  if(isFameStat(k)){ stats[k]=Math.max(0, delta>0 ? addFame(stats[k],delta) : stats[k]+delta); return; } // 邊際遞減、無上限
  let v = stats[k]+delta;
  if(k===hk) v = clamp(v, 0, HEALTH_CAP);   // 健康類有上限
  else v = Math.max(0, v);                  // 其餘隱藏數值無上限
  stats[k]=v;
}
function levelWord(v){
  if (v>=300) return '超凡入聖（已非凡人所能企及，遠勝世間絕頂高手）';
  if (v>=200) return '驚世駭俗（萬中無一的恐怖天賦，舉世罕見）';
  if (v>=140) return '登峰造極（當世頂尖，宗師級別）';
  if (v>=100) return '出類拔萃（遠超常人，一流好手）';
  if (v>=80) return '極高'; if (v>=62) return '很高'; if (v>=48) return '偏高';
  if (v>=36) return '中等'; if (v>=22) return '偏低'; if (v>=10) return '很低'; return '幾近於無';
}
function healthWord(v){
  if (v>=85) return '硬朗康健'; if (v>=65) return '身體無恙'; if (v>=45) return '略有小恙';
  if (v>=28) return '體弱多病'; if (v>=12) return '油盡燈枯'; return '命懸一線';
}
 
// ── 詞條庫（5階稀有度）──
// kind: passive(被動改隱藏數值/壽命) / trigger(寫進提示詞讓AI生成專屬劇情) / both
// rarity: N R SR SSR UR
const TRAITS = [
  // ── N（10）──
  {id:'diligent', name:'勤奮', emoji:'📚', rarity:'N', desc:'做事踏實，智慧/悟性類緩慢增長。', passive:{智慧:6,悟性:6,道行:6}},
  {id:'healthy_body', name:'底子好', emoji:'🥦', rarity:'N', desc:'健康衰減略慢。', passive:{健康:8,壽元:8,體魄:6}},
  {id:'optimist', name:'樂天', emoji:'🙂', rarity:'N', desc:'心性穩定，逆境較不易崩。', passive:{心性:8,道心:8}},
  {id:'frugal', name:'節儉', emoji:'🪙', rarity:'N', desc:'財商略高，更懂得累積資產。', passive:{財商:6,運氣:4}},
  {id:'sociable', name:'好相處', emoji:'😀', rarity:'N', desc:'人脈累積更容易。', passive:{人脈:10,民心:8}},
  {id:'streetwise', name:'街頭智慧', emoji:'🛣️', rarity:'N', desc:'對底層社會的運作特別熟悉，城府/運氣略升。', passive:{城府:6,運氣:6,膽識:6}},
  {id:'patient', name:'耐心', emoji:'⏳', rarity:'N', desc:'不急躁、肯等，心性/悟性略升。', passive:{心性:6,悟性:6,道心:6}},
  {id:'curious', name:'好奇心', emoji:'🧐', rarity:'N', desc:'愛探索新知，智慧略升。', passive:{智慧:8,悟性:4}},
  {id:'tall_strong', name:'體格健壯', emoji:'💪', rarity:'N', desc:'身體底子好，體魄/武藝/根骨略升。', passive:{體魄:8,武藝:6,根骨:6}},
  {id:'charming', name:'討喜', emoji:'😊', rarity:'N', desc:'親和力略升，更容易遇貴人。', passive:{人脈:6,民心:6,信徒:0}},
  // ── R（12）──
  {id:'lucky', name:'幸運體質', emoji:'🍀', rarity:'R', desc:'運氣顯著提升，好結果機率增加，偶有意外之喜。', passive:{運氣:18}, trigger:'此人運氣極佳，偶爾應安排意外的好運（撿到機會、貴人相助）。'},
  {id:'iron_will', name:'鋼鐵意志', emoji:'🔥', rarity:'R', desc:'心性大增，重大打擊也壓得住。', passive:{心性:18,道心:18,忠義:10}},
  {id:'quick_mind', name:'機敏', emoji:'⚡', rarity:'R', desc:'智慧/謀略提升，危機中反應快。', passive:{智慧:14,謀略:14,悟性:10,城府:10}},
  {id:'strong_root', name:'天生神力', emoji:'💪', rarity:'R', desc:'體魄/武藝/根骨提升。', passive:{體魄:16,武藝:16,根骨:16}},
  {id:'silver_tongue', name:'伶牙俐齒', emoji:'🗣️', rarity:'R', desc:'能言善道，魅力/人脈/謀略提升。', passive:{人脈:12,民心:10,謀略:8}},
  {id:'night_owl', name:'夜貓子', emoji:'🌙', rarity:'R', desc:'在暗處行事更順，城府/運氣提升。', passive:{城府:14,運氣:10,膽識:8}},
  {id:'bookworm', name:'書蟲', emoji:'📖', rarity:'R', desc:'博覽群書，智慧/道行/悟性大幅提升。', passive:{智慧:18,道行:12,悟性:12}},
  {id:'war_veteran', name:'沙場老兵', emoji:'🗡️', rarity:'R', desc:'武藝/膽識/民心/忠義皆強，戰場常勝。', passive:{武藝:16,膽識:12,民心:8,忠義:8}},
  {id:'wealth_sense', name:'財商敏銳', emoji:'📈', rarity:'R', desc:'對金錢流向有直覺，財商/運氣/智慧提升。', passive:{財商:18,運氣:8,智慧:8}},
  {id:'vitality', name:'旺盛精力', emoji:'⚡', rarity:'R', desc:'健康/壽元/體魄皆提升，過勞耐受高。', passive:{健康:12,壽元:14,體魄:12}},
  {id:'meditation', name:'禪定', emoji:'🧘', rarity:'R', desc:'心如止水，悟性/道心/心性提升。', passive:{悟性:14,道心:14,心性:14}},
  {id:'face_reader', name:'察言觀色', emoji:'👁️', rarity:'R', desc:'看人精準，城府/智慧/人脈提升。', passive:{城府:14,智慧:10,人脈:10}},
  // ── SR（12）──
  {id:'rich_born', name:'富貴命', emoji:'💰', rarity:'SR', desc:'財運亨通，賺錢機會多。', passive:{運氣:12,財商:14}, trigger:'此人財運亨通，賺錢機會應比常人多，但也易招人覬覦。'},
  {id:'noble_blood', name:'貴人緣', emoji:'🎩', rarity:'SR', desc:'人脈/權位提升，常遇提攜。', passive:{人脈:20,權位:15,權柄:15,聲望:10}, trigger:'此人總能遇到願意提攜他的貴人。'},
  {id:'genius', name:'天縱奇才', emoji:'🧠', rarity:'SR', desc:'智慧/悟性大幅提升，學什麼都快。', passive:{智慧:22,悟性:22,謀略:18,道行:18}, trigger:'此人天賦異稟，學習與頓悟遠超常人。'},
  {id:'tough_fate', name:'大難不死', emoji:'🛡️', rarity:'SR', desc:'健康下限托底，瀕死有機會挺過。', passive:{健康:10,壽元:15}, trigger:'此人命硬，瀕死的危機往往能死裡逃生。'},
  {id:'midas_touch', name:'點石成金', emoji:'✨', rarity:'SR', desc:'財商/運氣/權位/信徒皆升，做什麼都賺。', passive:{財商:22,運氣:12,權位:10,信徒:0}, trigger:'此人投資眼光極準，常有神來一筆的獲利；亦善於以錢滾錢。'},
  {id:'silver_hand', name:'翻雲覆雨（兵）', emoji:'⚔️', rarity:'SR', desc:'武藝/謀略/權柄並強，兵家大將之才。', passive:{武藝:22,謀略:18,權柄:14,膽識:10}, trigger:'此人善於用兵，戰場上算無遺策，常以少勝多。'},
  {id:'wise_old', name:'大智慧者', emoji:'🦉', rarity:'SR', desc:'智慧/道行/悟性/因果皆升，近乎覺者。', passive:{智慧:22,道行:22,悟性:20,因果:14}, trigger:'此人看穿世事本質，常有驚人之語讓人恍然大悟。'},
  {id:'ruler_breath', name:'王者氣息', emoji:'🦁', rarity:'SR', desc:'權柄/聲望/人心/信徒/民心皆強，領袖風範。', passive:{權柄:18,聲望:18,民心:14,信徒:14}, trigger:'此人走到哪裡都有人追隨，自帶領袖光環，讓人願意聽命。'},
  {id:'heaven_eye', name:'天眼通', emoji:'🌀', rarity:'SR', desc:'悟性/因果/道行提升，第六感極強。', passive:{悟性:22,因果:18,道行:18}, trigger:'此人常能預感危險與機緣，提前做出最佳選擇。'},
  {id:'sword_saint', name:'劍道宗師', emoji:'⚔️', rarity:'SR', desc:'武藝/根骨/體魄/膽識皆強，劍術入神。', passive:{武藝:24,根骨:18,體魄:14,膽識:10}, trigger:'此人在劍道上前無古人，一劍可破萬法。'},
  {id:'poison_immunity', name:'百毒不侵', emoji:'🐍', rarity:'SR', desc:'健康/壽元/體魄提升，免疫毒物。', passive:{健康:20,壽元:18,體魄:14}, trigger:'此人對毒物有抗性，仇家難以暗殺。'},
  {id:'ghost_step', name:'鬼影步', emoji:'👻', rarity:'SR', desc:'城府/運氣/膽識提升，善於潛行。', passive:{城府:18,運氣:14,膽識:14}, trigger:'此人在暗處行動如鬼神，難以被追蹤。'},
  // ── SSR（10）──
  {id:'phoenix', name:'浴火重生', emoji:'🦅', rarity:'SSR', desc:'每逢人生谷底，反而能觸底反彈、東山再起。', passive:{心性:15,運氣:12}, trigger:'此人有逆天改命之相，越是絕境越能爆發，安排絕處逢生的轉折。'},
  {id:'world_favor', name:'氣運之子', emoji:'🌟', rarity:'SSR', desc:'運氣極高，天地似乎都偏袒於他。', passive:{運氣:30}, trigger:'此人是天地氣運所鍾，重大關頭總有奇跡眷顧，但也可能引來嫉恨與劫難。'},
  {id:'mastermind', name:'翻雲覆雨', emoji:'🎭', rarity:'SSR', desc:'城府/謀略登峰，可操弄局勢。', passive:{謀略:28,城府:28,權位:20,權柄:20}, trigger:'此人深諳人心權謀，可設計安排他佈局翻盤、掌控他人命運的情節。'},
  {id:'immortal_root', name:'仙風道骨', emoji:'🌸', rarity:'SSR', desc:'修仙向極品，根骨/悟性/道心/靈力皆強。', passive:{根骨:25,悟性:25,道心:20,靈力:18}, trigger:'此人資質曠世，修行一日千里，機緣不絕。'},
  {id:'dragon_vein', name:'龍脈加身', emoji:'🐉', rarity:'SSR', desc:'王朝向極品，權柄/民心/功勳/忠義並強。', passive:{權柄:25,民心:22,忠義:18,膽識:14}, trigger:'此人帶天命而降，麾下將士如雲，戰無不勝。'},
  {id:'infinite_gold', name:'富可敵國', emoji:'💎', rarity:'SSR', desc:'財商/權位/信徒並強，理財之術天下無雙。', passive:{財商:30,權位:18,信徒:14,運氣:12}, trigger:'此人掌管的財富可敵一國，連動天下經濟。'},
  {id:'oracle', name:'神諭者', emoji:'🌌', rarity:'SSR', desc:'神明向，因果/道行/智慧/法則皆強。', passive:{因果:25,道行:25,智慧:20,法則:18}, trigger:'此人能聽見神諭、看見命運的絲線，常做出不可思議的精準判斷。'},
  {id:'sage_king', name:'聖君', emoji:'🏛️', rarity:'SSR', desc:'心性/道行/權柄/民心/信仰並強，治世之君。', passive:{心性:25,道行:20,權柄:22,民心:20,信徒:16}, trigger:'此人治下國泰民安、四海歸心，是百姓心中的聖君。'},
  {id:'demon_lord', name:'魔尊之姿', emoji:'😈', rarity:'SSR', desc:'城府/權柄/膽識/靈力並強，威壓群雄。', passive:{城府:25,權柄:22,膽識:18,靈力:20}, trigger:'此人霸道絕倫，手段鐵血，敵人聞風喪膽。'},
  {id:'fortune_child', name:'財神轉世', emoji:'🪙', rarity:'SSR', desc:'財商/運氣/信徒並強，金錢主動上門。', passive:{財商:32,運氣:18,信徒:14}, trigger:'此人無論做什麼都能賺錢，彷彿財神親自眷顧。'},
  // ── UR（10）──
  {id:'transmigrator', name:'重生者', emoji:'🔮', rarity:'UR', desc:'帶著前世記憶重活，洞悉未來走向。', passive:{智慧:20,運氣:20,悟性:15}, trigger:'此人擁有前世記憶，隱約知道未來大事，可借此趨吉避凶、提前布局，但歷史可能因他而改變。'},
  {id:'chosen_one', name:'天命主角', emoji:'👑', rarity:'UR', desc:'主角威能，絕境必有轉機，氣運滔天。', passive:{運氣:40,心性:20,健康:15,壽元:30}, trigger:'此人是天命所歸的主角，重大危機必有轉機與機緣，氣運凌駕眾生，但越強的命格越招致越強的敵手與天劫。'},
  {id:'system_host', name:'金手指', emoji:'📱', rarity:'UR', desc:'腦中有神秘係統相助，扮豬吃老虎。', passive:{智慧:25,運氣:25,悟性:20}, trigger:'此人綁定了一個神秘「係統」，會在關鍵時刻給予提示、獎勵或任務，使其能扮豬吃老虎、彎道超車。'},
  {id:'god_incarnate', name:'神降之身', emoji:'☀️', rarity:'UR', desc:'神明向極品，法則/信仰/權柄/因果並強。', passive:{法則:30,信徒:25,權柄:25,因果:22,道行:20}, trigger:'此人即神行走於世，言出法隨，能改寫世界規則，眾生皆向其頂禮。'},
  {id:'immortal_emperor', name:'仙帝之姿', emoji:'🌌', rarity:'UR', desc:'修仙向極品，根骨/悟性/道心/靈力/壽元並強。', passive:{根骨:28,悟性:28,道心:25,靈力:25,壽元:20}, trigger:'此人終將飛昇成仙、統御諸天，一路降妖除魔、證道不朽。'},
  {id:'hegemon', name:'千古一霸', emoji:'🐲', rarity:'UR', desc:'王朝向極品，權柄/民心/膽識/功勳並強。', passive:{權柄:30,民心:25,膽識:22,忠義:18,武藝:18}, trigger:'此人雄才大略、氣吞山河，必能一統天下、流芳千古。'},
  {id:'billionaire', name:'鈔票締造者', emoji:'💵', rarity:'UR', desc:'財富向極品，財商/權位/信徒/運氣並強。', passive:{財商:35,權位:22,信徒:18,運氣:18}, trigger:'此人所到之處皆是商機，其名即是品牌，其意志可撼動整個市場。'},
  {id:'prophet', name:'先知', emoji:'🔯', rarity:'UR', desc:'因果/智慧/悟性/法則並強，預知未來。', passive:{因果:30,智慧:28,悟性:25,法則:20}, trigger:'此人能看見未來的片段，憑預感避開諸多劫難，關鍵時刻指引眾人方向。'},
  {id:'demon_god', name:'魔神', emoji:'👹', rarity:'UR', desc:'城府/權柄/靈力/混沌並強，毀天滅地。', passive:{城府:30,權柄:28,靈力:28,混沌:22,膽識:20}, trigger:'此人行於黑暗，行事不拘一格，動輒傾國傾城、伏屍百萬。'},
  {id:'creator', name:'世界之子', emoji:'🌍', rarity:'UR', desc:'全屬性小幅提升，適應任何世界。', passive:{運氣:18,智慧:18,體魄:18,心性:18,人脈:15,財商:15}, trigger:'此人是世界意志的寵兒，無論投生到何種世界都能順應規則、開創局面。'},
];
const RARITY = {
  N:  {label:'N',   rate:0.55, word:'普通', color:'r-N'},
  R:  {label:'R',   rate:0.28, word:'稀有', color:'r-R'},
  SR: {label:'SR',  rate:0.12, word:'史詩', color:'r-SR'},
  SSR:{label:'SSR', rate:0.04, word:'傳說', color:'r-SSR'},
  UR: {label:'UR',  rate:0.01, word:'神話', color:'r-UR'},
};
const RARITY_ORDER = ['N','R','SR','SSR','UR'];
const UPGRADE_NEED = 5;   // 同詞條 5 張升一級
const MAX_TRAIT_LV = Infinity;   // 無上限
function traitById(id){ return TRAITS.find(t=>t.id===id); }
function traitsByRarity(r){ return TRAITS.filter(t=>t.rarity===r); }
 
// 基礎天賦（魂魄轉化永久數值）
const BASE_TALENTS = [
  {key:'健康', name:'強健根基', emoji:'❤️', desc:'所有世界起始健康/壽元 +', per:5, cost:150, max:8},
  {key:'運氣', name:'天生好命', emoji:'🍀', desc:'所有世界起始運氣 +', per:5, cost:200, max:8},
  {key:'智慧', name:'慧根', emoji:'🧠', desc:'起始智慧/悟性 +', per:5, cost:180, max:8},
  {key:'心性', name:'定力', emoji:'🧘', desc:'起始心性/道心 +', per:5, cost:160, max:8},
];
 
// ── 道果商店 ──
function bShopItems(){
  return [
    {id:'cap', name:'擴充攜帶格', emoji:'🎒', desc:`目前 ${save.carryCap} 格 → ${save.carryCap+1} 格`, cost: 2 + Math.max(0, save.carryCap-3), can: true, act:()=>{ save.carryCap++; } },
    {id:'premium', name:'高階祈願（保底SSR）', emoji:'✨', desc:'必得一張 SSR 以上詞條', cost:5, can:true, act:()=>{ const t=pullOne('SSRUP'); applyPull([t]); renderGachaResult([t]); showToast(`✨ 獲得 ${RARITY[t.rarity].label} ${traitById(t.id).name}`); } },
  ];
}

// ── API KEY（支援多把金鑰輪替）──
const KEY_STORE = 'multilife_gemini_key';     // 舊：單把（相容）
const KEYS_STORE = 'multilife_gemini_keys';   // 新：多把（JSON 陣列）
let keyCursor = 0;                            // 目前使用第幾把
const keyCooldown = {};                      // 金鑰 -> 冷卻到期時間戳（429 後暫時跳過）

function getKeys(){
  let arr=[];
  try { arr = JSON.parse(localStorage.getItem(KEYS_STORE)||'[]'); } catch(e){ arr=[]; }
  if(!Array.isArray(arr)) arr=[];
  // 相容舊單把
  const old = localStorage.getItem(KEY_STORE);
  if(old && !arr.includes(old)) arr.unshift(old);
  return arr.filter(Boolean);
}
function setKeys(arr){
  arr = [...new Set(arr.filter(Boolean))];
  localStorage.setItem(KEYS_STORE, JSON.stringify(arr));
  localStorage.setItem(KEY_STORE, arr[0]||'');   // 同步單把供相容
}
function getSavedKey(){ return getKeys()[0] || ''; }   // 沿用舊呼叫
// 取下一把「未在冷卻」的金鑰
function pickKey(){
  const keys=getKeys(); if(keys.length===0) return null;
  const now=Date.now();
  for(let i=0;i<keys.length;i++){
    const idx=(keyCursor+i)%keys.length; const k=keys[idx];
    if(!keyCooldown[k] || keyCooldown[k]<now){ keyCursor=idx; return {key:k, idx, total:keys.length}; }
  }
  // 全部冷卻中 → 回傳冷卻最快結束的
  let best=keys[0], bt=Infinity;
  keys.forEach(k=>{ const t=keyCooldown[k]||0; if(t<bt){bt=t;best=k;} });
  return {key:best, idx:keys.indexOf(best), total:keys.length, allCooling:true, readyAt:bt};
}
function showKeyModal(){ openModal('key-modal'); document.getElementById('key-input').value = getKeys().join('\n'); renderKeyCount(); }
function renderKeyCount(){ const el=document.getElementById('key-count'); if(el){ const n=getKeys().length; el.textContent = n? `目前已存 ${n} 把金鑰，將輪流使用（撞額度自動換下一把）` : ''; } }
function confirmKey(){
  const raw=document.getElementById('key-input').value||'';
  const arr=raw.split(/[\n,\s]+/).map(s=>s.trim()).filter(Boolean);
  if(arr.length===0){ showToast('請輸入至少一把 API Key'); return; }
  setKeys(arr); keyCursor=0;
  closeModal('key-modal'); showToast(`✅ 已儲存 ${arr.length} 把金鑰`);
}

// ── AI ──
const AI_MODEL = 'gemini-3.1-flash-lite';
const AI_COOLDOWN_MS = 60000;   // 金鑰撞 429 後冷卻 60 秒
async function callAI(prompt, maxTokens=8192){
  const keys = getKeys();
  if(keys.length===0){ console.warn('[AI] 尚未設定 API Key'); showKeyModal(); return null; }
  const reqId = Math.random().toString(36).slice(2,7);
  console.groupCollapsed(`%c[AI ${reqId}] 請求 → ${AI_MODEL}（${keys.length} 把金鑰）`, 'color:#7c6af7');
  console.log('prompt:', prompt);

  const maxAttempts = Math.max(keys.length, 1) + 2;   // 每把試一次 + 退避重試
  let backoff = 2000;
  let rawText = null;

  for(let attempt=0; attempt<maxAttempts; attempt++){
    const pk = pickKey();
    if(!pk){ break; }
    // 全部金鑰都在冷卻 → 等到最快可用者
    if(pk.allCooling){
      const wait = Math.max(1000, (pk.readyAt||Date.now()+backoff) - Date.now());
      console.warn(`[AI ${reqId}] 所有金鑰冷卻中，等待 ${Math.round(wait/1000)}s`);
      showToast(`⏳ 額度限流中，${Math.round(wait/1000)} 秒後自動重試…`);
      await sleep(Math.min(wait, 12000));
    }
    const key = pk.key;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${key}`;
    let res, data;
    try {
      res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:1.0, maxOutputTokens:maxTokens, responseMimeType:'application/json'} }) });
    } catch(e){
      console.error(`[AI ${reqId}] fetch 失敗（網路/CORS）金鑰#${pk.idx+1}:`, e);
      await sleep(backoff); backoff=Math.min(backoff*2, 10000); continue;
    }
    console.log(`[AI ${reqId}] 金鑰#${pk.idx+1}/${pk.total} HTTP`, res.status, res.statusText);
    try { data = await res.json(); }
    catch(e){ console.error(`[AI ${reqId}] 回應非 JSON:`, e); await sleep(backoff); backoff=Math.min(backoff*2,10000); continue; }

    if(data.error){
      const code=data.error.code;
      console.error(`[AI ${reqId}] API 錯誤 code=${code} status=${data.error.status} 金鑰#${pk.idx+1}:`, data.error.message);
      if(code===429){
        keyCooldown[key]=Date.now()+AI_COOLDOWN_MS;   // 此金鑰冷卻
        keyCursor=(pk.idx+1)%pk.total;                // 換下一把
        const remain = keys.filter(k=>!keyCooldown[k]||keyCooldown[k]<Date.now()).length;
        console.warn(`[AI ${reqId}] 金鑰#${pk.idx+1} 撞 429，冷卻 ${AI_COOLDOWN_MS/1000}s，剩 ${remain} 把可用`);
        showToast(remain>0?`⚠️ 金鑰#${pk.idx+1} 限流，換下一把…`:`⏳ 金鑰皆限流，稍候自動重試…`);
        if(remain===0){ await sleep(backoff); backoff=Math.min(backoff*2,12000); }
        continue;   // 換金鑰重試
      }
      if(code===400||code===403){ console.groupEnd(); showToast('⚠️ 金鑰#'+(pk.idx+1)+' 無效或被拒：'+data.error.message); showKeyModal(); return null; }
      if(code===404){ console.groupEnd(); showToast('⚠️ 模型不存在（'+AI_MODEL+'）'); return null; }
      if(code===503){ console.warn(`[AI ${reqId}] 服務過載 503，退避重試`); await sleep(backoff); backoff=Math.min(backoff*2,12000); continue; }
      console.groupEnd(); showToast('AI 錯誤：'+data.error.message); return null;
    }

    const cand=data.candidates?.[0]; const finish=cand?.finishReason;
    if(finish && finish!=='STOP'){
      console.warn(`[AI ${reqId}] finishReason=${finish}`, cand?.safetyRatings||'');
      if(finish==='MAX_TOKENS') showToast('⚠️ 回應被截斷（MAX_TOKENS）');
      if(finish==='SAFETY'){ showToast('⚠️ 內容被安全機制阻擋（SAFETY）'); }
    }
    rawText = cand?.content?.parts?.[0]?.text || null;
    if(rawText){ console.log(`[AI ${reqId}] ✅ 成功（金鑰#${pk.idx+1}）:`, rawText); console.groupEnd(); return rawText; }
    console.error(`[AI ${reqId}] 空回應 finishReason=${finish}，重試`);
    await sleep(backoff); backoff=Math.min(backoff*2,10000);
  }
  console.error(`[AI ${reqId}] 重試耗盡，放棄`); console.groupEnd();
  showToast('⚠️ 多次重試後仍失敗，請看 Console 或稍後再試');
  return null;
}
function parseJSON(raw){
  if(!raw){ console.warn('[parseJSON] 輸入為空'); return null; }
  try{ const s=raw.replace(/```json?/g,'').replace(/```/g,'').trim(); const a=s.indexOf('{'); const b=s.lastIndexOf('}'); if(a<0||b<0){ console.error('[parseJSON] 找不到 JSON 物件邊界，原文:', raw); return null; } return JSON.parse(s.slice(a,b+1)); }
  catch(e){ console.error('[parseJSON] JSON.parse 失敗:', e, '\n原文:', raw); return null; }
}

// ── 遊戲狀態 ──
let gs = null;

function buildContextLine(){
  const r = gs.realm;
  // 顯性給數字，隱性給文字分級
  const shownStr = r.shown.map(s=>`${s}:${fmtMoney(gs.stats[s], s, r)}`).join('，');
  const hk = healthKeyOf(r);
  const hiddenStr = r.hidden.map(s=> s===hk ? `${s}(身體狀態:${healthWord(gs.stats[s])})` : `${s}:${levelWord(gs.stats[s])}`).join('，');
  return { shownStr, hiddenStr };
}
// 大額金錢以「萬/億」呈現，易讀
function moneyText(v){
  v = Math.round(v);
  if(v>=1e8) return (v/1e8).toFixed(v>=1e9?0:2).replace(/\.00$/,'')+'億';
  if(v>=1e4) return (v/1e4).toFixed(v>=1e6?0:1).replace(/\.0$/,'')+'萬';
  return v.toLocaleString();
}
function fmtMoney(v, key, r){
  v = Math.round(v);
  const i = r.shown.indexOf(key);
  const unit = (r.shownUnit&&i>=0)?r.shownUnit[i]:'';
  if(unit==='$') return '$'+moneyText(v);            // 元：用萬/億
  if(isFameStat(key)) return Math.round(v).toLocaleString();
  return v.toLocaleString();
}

function initLife(realmId, gender, mixRealms, mixRandom){
  const r = REALMS[realmId];
  const equipped = equippedTraits();
  let stats = {};
  r.shown.forEach((s,i)=> stats[s]=r.shownInit[i]);
  r.hidden.forEach((s,i)=> stats[s]=r.hiddenInit[i]);
  // 基礎天賦永久加成
  for(const k in save.baseTalents){
    const bt = BASE_TALENTS.find(b=>b.key===k); if(!bt) continue;
    const add = bt.per * save.baseTalents[k];
    // 套到同義數值
    applySynonym(stats, k, add);
  }
  // 詞條被動（只加隱藏數值，不再給「出生現金」）
  const hk0 = healthKeyOf(r);
  equipped.forEach(({t,level})=>{
    const scale = 1 + (level-1)*0.4;
    if(t.passive) for(const k in t.passive){ bumpStat(stats, k, t.passive[k]*scale, hk0); }
  });
  // 起始財富一律從世界基準開始（新生兒＝0，不因詞條出生即暴富）。
  // 「富貴命」等改以被動數值＋劇情(trigger，財運亨通、機會多)體現，而非出生送現金。

  const g = (gender==='male'||gender==='female')?gender:(Math.random()<0.5?'male':'female');
  gs = {
    realmId, realm:r, gender:g, name: randomName(realmId,g),
    age: r.startAge, alive:true,
    stats,
    mixRealms: mixRealms||[], mixRandom: !!mixRandom,
    traits: equipped.map(e=>({id:e.t.id, name:e.t.name, emoji:e.t.emoji, level:e.level, rarity:e.t.rarity, trigger:e.t.trigger||''})),
    history: [],          // 大事件選擇紀錄
    flow: [],             // 日常小事件流（{age,text,peek}）
    chapter: 0,
    pendingMajor: null,   // 當前大事件
    branchCache: null,    // 預生成的各選項後續（map: choiceIndex -> nextChapter）
    choosing: false,
    aLifeEarned: 0,
    bigEvents: 0,
    setbacks: 0,          // 本世已遭遇重大挫折次數（限 1~3）
    threat: 0,            // 仇敵/威脅值：越高越可能被報復、暗殺（非自然死亡）
    threatNote: '',       // 最近結怨的對象描述（給 AI 用）
    years: 0,             // 本世已過年數（純意外死亡用）
    seed: Math.floor(Math.random()*1e9),
  };
}
function applySynonym(stats, key, add){
  const groups = [['健康','壽元'],['運氣'],['智慧','悟性','道行'],['心性','道心']];
  const g = groups.find(gr=>gr.includes(key)) || [key];
  // 同義健康鍵以 HEALTH_CAP 為上限，其餘無上限
  g.forEach(k=>{ if(stats[k]!==undefined){ let v=stats[k]+add; stats[k]=(k==='健康'||k==='壽元'||k==='法則')?clamp(v,0,HEALTH_CAP):Math.max(0,v); } });
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

const NAME_POOLS = {
  mortal:{male:['林建宏','王志豪','張宗翰','陳冠廷','黃柏睿'],female:['陳雅婷','李淑芬','黃怡君','林思妤','吳佳穎']},
  rich:{male:['文景瑞','霍天行','傅珩宇','顧亦深','慕容軒'],female:['沈璧瑤','顧晴嵐','薛霜月','慕容雪','蘇沁雪']},
  noble:{male:['蕭戰羽','燕清風','韓玉書','楚離塵','趙無極'],female:['沈醉夢','白卿雲','蘇晚晴','柳如煙','蕭楚楚']},
  cultivator:{male:['蒼玄子','雲霄逸','冥淵','靈虛子','葉孤鴻'],female:['夜明珠','碧落','凌霜雪','月華','蘇紫嫣']},
  immortal:{male:['太初','永恆之燭','法則化身','終焉','鴻濛'],female:['虛無','混沌之源','星辰之母','寂滅','太陰']},
  chaos:{male:['無名','歸墟','錯位','拾光','逆旅'],female:['無名','歸墟','錯位','拾光','逆旅']},
};
function randomName(realm,gender){ const pool=NAME_POOLS[realm]||NAME_POOLS.mortal; let g=gender; if(g!=='male'&&g!=='female')g=Math.random()<0.5?'male':'female'; const l=pool[g]; return l[Math.floor(Math.random()*l.length)]; }
function genderLabel(g){ return g==='male'?'男':g==='female'?'女':'隨機'; }

// ── 詞條/背包 ──
function equippedTraits(){
  const out=[];
  for(const id in save.inventory){ const it=save.inventory[id]; if(it.equipped){ const t=traitById(id); if(t) out.push({t, level:it.level||1}); } }
  return out;
}
function equippedCount(){ let n=0; for(const id in save.inventory) if(save.inventory[id].equipped) n++; return n; }

// 抽卡
function rollRarity(forceMin){
  const order = RARITY_ORDER;
  let pool = order;
  if(forceMin){ pool = order.slice(order.indexOf(forceMin)); }
  // 依機率
  let total = pool.reduce((a,r)=>a+RARITY[r].rate,0);
  let x = Math.random()*total;
  for(const r of pool){ x-=RARITY[r].rate; if(x<=0) return r; }
  return pool[pool.length-1];
}
function pullOne(mode){
  let rarity;
  if(mode==='SSRUP') rarity = Math.random()<0.5?'SSR':(Math.random()<0.8?'SSR':'UR');
  else if(mode==='SRUP') rarity = rollRarity('SR');
  else rarity = rollRarity();
  const cands = traitsByRarity(rarity);
  const t = cands[Math.floor(Math.random()*cands.length)];
  return {id:t.id, rarity};
}
function applyPull(pulls){
  pulls.forEach(p=>{
    if(!save.inventory[p.id]) save.inventory[p.id]={count:0, level:1, equipped:false};
    save.inventory[p.id].count++;
  });
  persist();
}
let lastPullMode=1;
function doPull(n){
  lastPullMode=n;
  const cost = n===1?100:900;
  if(save.aCoin<cost){ showToast('🔹 魂魄不足'); return; }
  save.aCoin-=cost;
  let pulls=[];
  for(let i=0;i<n;i++) pulls.push(pullOne());
  if(n===10 && !pulls.some(p=>RARITY_ORDER.indexOf(p.rarity)>=2)){ pulls[9]=pullOne('SRUP'); } // 十連保底SR+
  applyPull(pulls);
  renderGachaResult(pulls);
  updateWallet();
}
function renderGachaResult(pulls){
  const box=document.getElementById('gacha-result');
  box.innerHTML = pulls.map(p=>{
    const t=traitById(p.id); const it=save.inventory[p.id];
    const dup = it.count>1 ? `<span class="dup-note">＋1（持有${it.count}，集滿${UPGRADE_NEED}可升級）</span>` : '<span class="dup-note">新獲得！</span>';
    return `<div class="pull-card"><span class="rarity-badge ${RARITY[p.rarity].color}">${RARITY[p.rarity].label}</span>
      <span style="font-size:18px">${t.emoji}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:500">${t.name}</div><div style="font-size:11px;color:var(--text2)">${t.desc}</div>${dup}</div></div>`;
  }).join('');
}

// 合成升級
function upgradeTrait(id){
  const it=save.inventory[id]; if(!it) return;
  if((it.level||1)>=MAX_TRAIT_LV){ showToast('已達最高等級'); return; }
  if(it.count<UPGRADE_NEED){ showToast(`需要 ${UPGRADE_NEED} 張，目前 ${it.count}`); return; }
  it.count-=UPGRADE_NEED; it.level=(it.level||1)+1;
  persist(); renderInventory();
  showToast(`⬆️ ${traitById(id).name} 升至 Lv.${it.level}`);
}
// 詞條轉基礎數值（消耗 1 張該詞條 + 魂魄? 這裡用消耗張數轉化 baseTalents）
function dissolveTrait(id){
  const it=save.inventory[id]; if(!it||it.count<1) return;
  const t=traitById(id);
  // 依稀有度給 A 幣
  const refund = {N:30,R:80,SR:200,SSR:500,UR:1500}[t.rarity];
  it.count--; if(it.count<=0 && !it.equipped){ /* 保留條目以記錄 level */ }
  save.aCoin+=refund; persist(); renderInventory(); updateWallet();
  showToast(`♻️ 分解 ${t.name}，獲得 🔹${refund} 魂魄`);
}
function toggleEquip(id){
  const it=save.inventory[id]; if(!it) return;
  if(it.equipped){ it.equipped=false; }
  else { if(equippedCount()>=save.carryCap){ showToast(`攜帶格已滿（${save.carryCap}）`); return; } it.equipped=true; }
  persist(); renderInventory();
}

// 基礎天賦購買
function buyBaseTalent(key){
  const bt=BASE_TALENTS.find(b=>b.key===key); if(!bt) return;
  const lv=save.baseTalents[key]||0;          // 無上限
  const cost=bt.cost*(lv+1);                   // 成本隨等級遞增
  if(save.aCoin<cost){ showToast('🔹 魂魄不足'); return; }
  save.aCoin-=cost; save.baseTalents[key]=lv+1; persist(); renderInventory(); updateWallet();
  showToast(`${bt.name} → Lv.${lv+1}`);
}

// ── 渲染 HUB ──
function renderHub(){
  updateWallet();
  // realms
  const grid=document.getElementById('realm-grid');
  grid.innerHTML = REALM_ORDER.map(id=>{
    const r=REALMS[id]; const owned=save.ownedRealms.includes(id);
    const isChaos=id==='chaos';
    const chaosReady = save.ownedRealms.length>=3;
    let unlockHtml, cls='', click='';
    if(owned){ unlockHtml=`<div class="realm-unlock" style="color:var(--teal)">✓ 已解鎖</div>`; click=`onclick="startGame('${id}')"`; }
    else if(isChaos && !chaosReady){ unlockHtml=`<div class="realm-unlock">解鎖任意 3 個世界後開放</div>`; cls='locked'; }
    else { unlockHtml=`<div class="realm-unlock"><span>🔸</span> ${REALM_COST[id]} 道果解鎖</div>`; cls='locked'; click=`onclick="tryUnlock('${id}')"`; }
    return `<div class="realm-card ${cls}" data-realm="${id}" ${click}>
      <div class="realm-icon">${r.emoji}</div><div class="realm-name">${r.name}</div>
      <div class="realm-desc">${r.context.slice(0,46)}…</div>${unlockHtml}</div>`;
  }).join('');
  // continue banner
  const cb=document.getElementById('continue-banner');
  if(save.activeLife){ cb.style.display='flex'; const L=save.activeLife;
    document.getElementById('cb-detail').textContent=`${REALMS[L.realmId].name} · ${L.name}（${genderLabel(L.gender)}）· ${L.age}歲`;
  } else cb.style.display='none';
  // records
  const recs=document.getElementById('life-records');
  if(save.lifeRecords.length===0){ recs.textContent='尚未開始任何人生。'; }
  else { const total=save.lifeRecords.length;
    recs.innerHTML = save.lifeRecords.map((r,i)=>({r,i})).reverse().slice(0,8).map(({r,i})=>
      `<div class="rec-row" onclick="showLifeReview(${i})"><span>第${i+1}世 · ${r.realm} · ${r.name}${r.gender?'（'+genderLabel(r.gender)+'）':''} · ${r.age}歲${r.earlyDeath?' ⚰️':''}</span><span style="color:var(--acoin);font-size:12px">+🔹${r.aCoin}${r.bCoin?` 🔸${r.bCoin}`:''} ›</span></div>`
    ).join('') + (total>8?`<div style="padding:6px 0;color:var(--text2);font-size:12px">共 ${total} 世，僅顯示最近 8 世</div>`:'');
  }
}
function updateWallet(){ document.getElementById('w-a').textContent=save.aCoin; document.getElementById('w-b').textContent=save.bCoin; }

// ── MODALS ──
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

function showGacha(){
  document.getElementById('gacha-rates').innerHTML = RARITY_ORDER.map(r=>`${RARITY[r].label}（${RARITY[r].word}）${(RARITY[r].rate*100).toFixed(0)}%`).join('　');
  document.getElementById('gacha-result').innerHTML='';
  document.getElementById('pull1').disabled = save.aCoin<100;
  document.getElementById('pull10').disabled = save.aCoin<900;
  updateWallet(); openModal('gacha-modal');
}
function showInventory(){ renderInventory(); openModal('inv-modal'); }
function renderInventory(){
  document.getElementById('inv-cap').textContent=save.carryCap;
  document.getElementById('inv-cap2').textContent=save.carryCap;
  document.getElementById('inv-equipped-n').textContent=equippedCount();
  const grid=document.getElementById('inv-grid');
  // 基礎天賦區
  let html = `<div class="section-label" style="margin-top:4px">永久基礎天賦（魂魄轉化）</div>`;
  html += BASE_TALENTS.map(bt=>{ const lv=save.baseTalents[bt.key]||0; const cost=bt.cost*(lv+1);
    return `<div class="inv-item"><span style="font-size:18px">${bt.emoji}</span><div class="inv-main"><div class="inv-name">${bt.name} <span class="lv">Lv.${lv}</span></div><div class="inv-desc">${bt.desc}${bt.per*lv}（下一級 +${bt.per}）</div></div><div class="inv-ops"><button class="mini-btn" ${save.aCoin<cost?'disabled':''} onclick="buyBaseTalent('${bt.key}')">🔹${cost}</button></div></div>`;
  }).join('');
  // 詞條區
  html += `<div class="section-label" style="margin-top:14px">詞條（裝備 / 升級 / 分解）</div>`;
  const owned = Object.keys(save.inventory).filter(id=>save.inventory[id].count>0 || save.inventory[id].equipped);
  if(owned.length===0){ html+=`<div style="color:var(--text2);font-size:13px;padding:8px 0">尚無詞條，去「詞條抽取所」抽取。</div>`; }
  else {
    owned.sort((a,b)=> RARITY_ORDER.indexOf(traitById(b).rarity)-RARITY_ORDER.indexOf(traitById(a).rarity));
    html += owned.map(id=>{ const it=save.inventory[id]; const t=traitById(id); const lv=it.level||1;
      const canUp = it.count>=UPGRADE_NEED && lv<MAX_TRAIT_LV;
      const prog = lv<MAX_TRAIT_LV ? Math.min(it.count/UPGRADE_NEED,1) : 1;
      return `<div class="inv-item ${it.equipped?'equipped':''}">
        <span class="rarity-badge ${RARITY[t.rarity].color}">${RARITY[t.rarity].label}</span>
        <div class="inv-main"><div class="inv-name">${t.emoji} ${t.name} <span class="lv">Lv.${lv}</span> <span style="color:var(--text3);font-size:11px">×${it.count}</span></div>
          <div class="inv-desc">${t.desc}</div>
          ${lv<MAX_TRAIT_LV?`<div class="upgrade-bar"><i style="width:${prog*100}%"></i></div>`:''}</div>
        <div class="inv-ops">
          <button class="mini-btn ${it.equipped?'on':''}" onclick="toggleEquip('${id}')">${it.equipped?'已裝備':'裝備'}</button>
          <button class="mini-btn" ${canUp?'':'disabled'} onclick="upgradeTrait('${id}')">升級</button>
          <button class="mini-btn" ${it.count<1?'disabled':''} onclick="dissolveTrait('${id}')">分解</button>
        </div></div>`;
    }).join('');
  }
  grid.innerHTML=html;
}
function showBShop(){
  const grid=document.getElementById('bshop-grid');
  grid.innerHTML = bShopItems().map(it=>
    `<div class="inv-item"><span style="font-size:18px">${it.emoji}</span><div class="inv-main"><div class="inv-name">${it.name}</div><div class="inv-desc">${it.desc}</div></div><div class="inv-ops"><button class="mini-btn" ${(!it.can||save.bCoin<it.cost)?'disabled':''} onclick="buyBItem('${it.id}')">🔸${it.cost}</button></div></div>`
  ).join('') + `<div style="font-size:11px;color:var(--text2);margin-top:8px">解鎖新世界請在主畫面點該世界卡片（消耗 道果）。</div>`;
  updateWallet(); openModal('bshop-modal');
}
function buyBItem(id){
  const it=bShopItems().find(x=>x.id===id); if(!it) return;
  if(!it.can){ showToast('無法購買'); return; }
  if(save.bCoin<it.cost){ showToast('🔸 道果不足'); return; }
  save.bCoin-=it.cost; it.act(); persist(); showBShop(); updateWallet();
  if(id==='cap') showToast(`🎒 攜帶格 → ${save.carryCap}`);
}
function tryUnlock(realmId){
  const cost=REALM_COST[realmId];
  if(realmId==='chaos' && save.ownedRealms.length<3){ showToast('需先解鎖任意 3 個世界'); return; }
  if(save.bCoin<cost){ showToast(`需要 🔸${cost} 道果`); return; }
  if(!confirm(`花費 ${cost} 道果解鎖「${REALMS[realmId].name}」？`)) return;
  save.bCoin-=cost; save.ownedRealms.push(realmId); persist(); renderHub();
  showToast(`解鎖世界：${REALMS[realmId].emoji} ${REALMS[realmId].name}`);
}

// ── 開始遊戲（先選性別 / 混世界設定）──
let pendingRealm=null, mixSel={realms:[], random:false};
function startGame(realmId){
  pendingRealm=realmId; mixSel={realms:[], random:false};
  const r=REALMS[realmId];
  document.getElementById('start-realm-name').textContent=`${r.emoji} ${r.name}`;
  const mixCfg=document.getElementById('mix-config');
  if(realmId==='chaos'){
    mixCfg.style.display='block';
    const others=save.ownedRealms.filter(x=>x!=='chaos');
    document.getElementById('mix-realm-list').innerHTML = others.map(x=>
      `<div class="mix-realm-opt" data-r="${x}" onclick="toggleMixRealm('${x}')"><div class="chk"></div><div>${REALMS[x].emoji} ${REALMS[x].name}</div></div>`
    ).join('') || '<div style="color:var(--text2);font-size:12px">尚無其他已解鎖世界</div>';
    document.getElementById('mix-random').classList.remove('sel');
    document.getElementById('mix-random').querySelector('.chk').textContent='';
  } else mixCfg.style.display='none';
  openModal('start-modal');
}
function toggleMixRealm(x){ const el=document.querySelector(`.mix-realm-opt[data-r="${x}"]`); const i=mixSel.realms.indexOf(x); if(i>=0){mixSel.realms.splice(i,1); el.classList.remove('sel'); el.querySelector('.chk').textContent='';} else {mixSel.realms.push(x); el.classList.add('sel'); el.querySelector('.chk').textContent='✓';} }
function toggleMixRandom(){ mixSel.random=!mixSel.random; const el=document.getElementById('mix-random'); el.classList.toggle('sel',mixSel.random); el.querySelector('.chk').textContent=mixSel.random?'✓':''; }
function pickGender(g){ closeModal('start-modal'); const realmId=pendingRealm; pendingRealm=null; if(!realmId) return; beginLife(realmId,g,mixSel.realms.slice(),mixSel.random); }

function beginLife(realmId,gender,mixRealms,mixRandom){
  if(save.activeLife && !confirm('開始新的一世將覆蓋上一個未完成的人生，確定？')) return;
  save.activeLife=null;
  initLife(realmId,gender,mixRealms,mixRandom);
  enterGameScreen();
  document.getElementById('flow-container').innerHTML='';
  document.getElementById('scene-container').innerHTML='';
  document.getElementById('choices-container').innerHTML='';
  nextChapter(true);
}
function enterGameScreen(){
  const r=gs.realm;
  document.getElementById('hub').classList.remove('active');
  const g=document.getElementById('game'); g.className='screen active '+r.bgClass;
  document.getElementById('realm-badge').textContent=r.badge;
  document.getElementById('g-name').textContent=gs.name;
  updateGameHeader(); renderStats(); switchTab('story');
}
function updateGameHeader(){ const r=gs.realm; document.getElementById('g-info').textContent=`${r.name} · ${genderLabel(gs.gender)} · ${gs.age}歲`; }
function renderStats(){
  const r=gs.realm; const el=document.getElementById('g-shown');
  if(!el) return;
  // 顯性數值顯示在名字下方（文字式，像名字一樣的位置）；隱性數值不顯示
  el.innerHTML = r.shown.map(s=>`<span class="gs-item"><span class="gs-k">${s}</span> <span class="gs-v">${fmtMoney(gs.stats[s],s,r)}</span></span>`).join('<span class="gs-sep">·</span>');
}
function renderCurrentTraits(){
  const ct=document.getElementById('current-traits');
  ct.innerHTML = gs.traits.length? gs.traits.map(t=>`<div class="active-trait">${t.emoji} ${t.name}${t.level>1?` Lv.${t.level}`:''}</div>`).join('') : '<span style="color:var(--text2);font-size:13px">本世未攜帶詞條</span>';
}

// ═══ 章節批次生成 ═══
// 每個大事件選完 → 一次生成「接下來幾年日常小事件(暗調隱藏數值) + 下一個大事件(4選+1手輸)」
// 為省等待：一次只生成『實際走到的那條線』。手輸時才另外生成。
function chapterPrompt(prevChoiceText){
  const r=gs.realm;
  const {shownStr,hiddenStr}=buildContextLine();
  const recentBig = gs.history.slice(-3).map(h=>`${h.age}歲:${h.choice}`).join('；')||'剛出生';
  // 詞條：附稀有度與等級，等級越高效果越強，並明確要求 AI 把效果演出來
  const traitDesc = gs.traits.length? gs.traits.map(t=>{
    const lv=t.level||1; const strong = lv>=5?'（已修煉至大成，效果應極為顯著、凌駕常人）':lv>=3?'（效果強烈）':'';
    return `「${t.name}」[${t.rarity}・Lv.${lv}]${strong}：${t.trigger||'（被動天賦，融入角色能力）'}`;
  }).join('\n  ') : '無';
  // 觸發型詞條（有 trigger 的）—— 要求佔據重大事件、明顯演出
  const triggerTraits = gs.traits.filter(t=>t.trigger);
  const traitPowerLine = triggerTraits.length ? `【詞條威能・重要】角色擁有特殊詞條，你必須讓它們「明顯地」影響劇情，而非一筆帶過：\n  - 每隔一段時間，就應該有「一個重大事件」是直接由某個詞條的能力主導觸發的（例如「金手指」係統發布任務或獎勵、「重生者」憑前世記憶提前布局、「天命主角」絕境逢生）。這種事件要寫得具體、有存在感，讓玩家清楚感受到詞條在發揮作用。\n  - 等級(Lv)越高，效果越誇張、越頻繁。Lv.5 的詞條應該是改變人生走向等級的強大力量。\n  - 多個詞條可以疊加聯動。切勿讓帶著神話級(UR)詞條的角色過著毫無波瀾的平凡人生。` : '';
  let mixDesc='';
  if(r.isChaos){
    const mixed=gs.mixRealms.map(x=>REALMS[x].name);
    if(gs.mixRandom) mixed.push('隨機未知世界');
    mixDesc = mixed.length? `這是混世界，融合了以下世界觀的元素，請讓它們交織出現、彼此衝突或融合：${mixed.join('、')}。` : '這是混世界，世界觀混亂多變。';
  }
  const hk=healthKeyOf(r);
  const toneLine = lifeToneLine();
  const setbackLine = `目前這一生已遭遇重大挫折 ${gs.setbacks||0} 次。重大挫折（如重病、破產、親人離世、事業崩盤、牢獄之災）必須非常稀少：一輩子大約只發生 1~3 次，且每個章節出現的機率很低（約一兩成以下）。${(gs.setbacks||0)>=3?'此生已達上限，請勿再安排重大挫折，讓人生平穩推進。':'若這個章節不是適合的時機，就不要安排重大挫折，維持平凡日常即可。'}`;
  const hpVal = gs.stats[hk];
  const healthLine = (hpVal!==undefined && hpVal<45) ? `【健康提醒】主角目前身體狀態「${healthWord(hpVal)}」。請在 daily 中自然透出病徵（咳嗽、易疲倦、白髮、舊疾發作、就醫等），讓玩家感覺到健康在走下坡。` : '';
  const threatLine = (gs.threat||0)>=8 ? `【暗流】主角因過往選擇已結下仇怨（${gs.threatNote||'有人記恨在心'}，威脅程度${levelWord(gs.threat)}）。可在劇情中讓這股敵意若隱若現（被跟蹤、收到威脅、暗中使絆），但是否釀成致命報復由遊戲擲骰決定，你不要擅自寫死主角。` : '';
  return `你是沉浸式人生模擬遊戲的敘事引擎。用繁體中文。
【世界觀】${r.context}${mixDesc}
【角色】${gs.name}（${genderLabel(gs.gender)}性），現在${gs.age}歲。所在世界壽命約${r.lifespan}年。
【可見狀態】${shownStr}
【隱藏狀態】${hiddenStr}
　（這些是角色的天賦底蘊，旁人無法得知精確值，但會從其表現感受到。「超凡」級別的數值代表此人在該方面是世間頂尖乃至非人的存在，劇情中必須明確體現出這種碾壓性的天賦差距——例如智慧超凡者一眼看穿騙局、過目不忘、運籌帷幄；運氣超凡者屢屢逢凶化吉、撿到天大機緣。切勿把天賦超凡的人寫得跟普通人一樣平庸。）
【攜帶詞條】
  ${traitDesc}
【近期重大經歷】${recentBig}
【上一個選擇】${prevChoiceText||'（人生剛開始）'}

【人生基調】${toneLine}
【挫折節制】${setbackLine}
${traitPowerLine}
${healthLine}
${threatLine}
${gs.age===0?'【特別說明】角色剛出生，這是人生的起點。daily 應從嬰幼兒時期寫起（出生、普通家庭、牙牙學語、上幼稚園、童年點滴），年齡從 0 或 1 歲開始遞增。預設是一個再普通不過的家庭，按部就班地長大、升學。':''}
請生成「一個人生章節」，包含：
1. daily：接下來 2~5 年的日常小事（每則20~40字，生動具體，平實寫普通人的生活：上學、考試、打工、交友、戀愛、工作、瑣事）。年齡要從目前年齡往後遞增、合理。
   - 每則可暗中微調隱藏數值（effects，範圍小 -5~+5）。
   - 其中「約一半」的日常小事可附帶 2 個輕量選項（opts），屬於無關緊要的生活小抉擇（例如早餐吃什麼、週末怎麼過、要不要回老同學訊息）。這些 opts 影響極小（effects 範圍 -2~+2，甚至可為空），每個 opt 要有一句簡短的 reply。沒有選項的日常就不要放 opts。
2. major：一個需要玩家慎重抉擇的重大事件（場景描述70~120字），發生在這些日常之後。提供「正好4個」分量十足的選項。

重要規則：
- 平凡是常態，飛黃騰達是難得的例外。一個普通人要變有錢、出人頭地非常困難，需要長期積累、正確抉擇加上一點運氣，單一選擇「絕不可」讓人一步登天暴富。多數章節就是平實的人生推進。
- 家庭關係、出身好壞是「機率事件」而非預設：大多數角色擁有普通和睦的家庭。只有在少數情況才安排家庭不睦、原生家庭問題，不要每一世都把主角寫成出身悲慘或家庭破碎。
- 【成敗由遊戲擲骰決定，不是你】：凡是「成敗未定」的選項——創業、投資、考試、打官司、比武、表白、賭一把、與人對抗——請標 "gamble":true，並用 "key" 指出主導成敗的隱藏數值（例如創業用"財商"或"智慧"、打官司用"謀略"、比武用"武藝"）。你「不要自己假定成功」，outcome 只寫「嘗試去做」的中性描述即可，真正結果（大成功/小成功/失敗/慘敗）由遊戲擲骰後再請你描寫。
- 風險選項（risky=true）：代表「可能危及生命或身體」的冒險（飆車、極限運動、涉險、鋌而走險、火拼）。加 "danger"（"low"/"mid"/"high"）。慘敗時遊戲會依危險度判定是否橫死/重傷。
- 結怨選項（makesEnemy=true）：若某選項會得罪危險人物（黑道、權貴、仇家），標 makesEnemy 並用 "enemyNote" 簡述結了什麼仇。這會累積「威脅值」，日後可能招致報復橫死（由遊戲判定）。
- 隱藏數值門檻：好處應「需要某種隱藏狀態足夠」才容易成功，不足則代價慘重。
- 多描寫與他人（家人、同學、同事、對手、貴人、愛人）的互動細節與情感。
${isMoneyStat(r.moneyName)?`- 【金錢尺度，極重要】「${r.moneyName}」以「元」計。請用符合現實且「夠大」的數字，並體現「財富會隨事業規模加速累積（規模效應）」：受薪族年存數萬~數十萬；做小生意年賺數十萬~數百萬；開公司有成，一筆就該進帳數百萬到數千萬，事業壯大後年收上看千萬至上億；打贏大官司、賣掉公司、上市可一次數千萬到數億。普通上班族一輩子約累積百萬；千萬是成功的生意人；上億是頂級富豪。effects 量級範例：小生意 +800000、公司獲利 +5000000、賣公司 +80000000、破產 -10000000。不要因為謹慎而給太小的數字——玩家「開公司、打官司好幾次」就應該明顯往千萬、上億邁進。其餘隱藏數值仍用小數字（-8~+8）。`:`- 「${r.moneyName}」等貨幣/位階用合理且夠大的量級增減（成功的大事一次要給足）。其餘隱藏數值用小數字（-8~+8）。`}
- 聲望（身分地位象徵，非虛名）：當角色取得實質地位（升遷、創業有成、當上主管/老闆、揚名）時，聲望應「明顯提升」（可給較大正值，遊戲內部會自動套用邊際遞減）；落魄、醜聞才下降。別讓有成就的人聲望卻很低。
- effects 的鍵必須是這些狀態之一：${[...r.shown,...r.hidden].join('、')}。${hk}歸零代表死亡。長期過勞、拼命應扣${hk}。
- 所有選項與日常文字都「不要出現任何數字或屬性名」。
- 若這個 major 是一次重大挫折，請在 major 加上 "setback":true（遵守上面的挫折節制）。
- 每個重大事件最好有 1 個 gamble 或 risky 選項，但不必全部都是；也要有平穩的選項。

嚴格只輸出 JSON（不要markdown）：
{
 "daily":[
   {"age":數字,"text":"日常小事","effects":{}},
   {"age":數字,"text":"帶選擇的日常","opts":[{"text":"輕量選項","reply":"選後一句旁白","effects":{}},{"text":"另一選項","reply":"旁白","effects":{}}]}
 ],
 "major":{
   "age":數字,
   "scene":"重大事件場景描述",
   "setback":false,
   "choices":[
     {"text":"平穩的選項(不含數字)","effects":{"狀態名":數值},"outcome":"選後簡短結果(25字內)"},
     {"text":"成敗未定的選項(如創業/打官司)","gamble":true,"key":"主導的隱藏數值名","outcome":"嘗試去做(中性，不要假定成功)"},
     {"text":"冒險犯難的選項","risky":true,"danger":"mid","outcome":"放手一搏"},
     {"text":"得罪危險人物的選項","makesEnemy":true,"enemyNote":"結了什麼仇","outcome":"..."}
   ]
 }
}`;
}
// 依「第幾世 + 攜帶詞條強度」決定人生基調：越前期/越弱越平凡
function lifeToneLine(){
  const lifeNo = (save.lifeRecords?.length||0) + 1;
  const power = gs.traits.reduce((a,t)=>a + (['N','R','SR','SSR','UR'].indexOf(t.rarity)+1)*(t.level||1), 0);
  if(lifeNo===1 && power<3){
    return '這是玩家的「第一世」，且沒有強力詞條加持。請務必把他寫成一個再普通不過的人：普通家庭、正常上學升學、平凡的煩惱與快樂。這一生的核心難題，是如何在平凡中抓住機會、突破階級翻身（極不容易）。不要安排任何天降橫財、神秘力量或主角威能。';
  }
  if(power<6){
    return '這一世詞條加持有限，整體仍應是「普通人」的人生，腳踏實地。出人頭地很難，需要長期努力與機運。';
  }
  if(power<15){
    return '這一世帶有一定的詞條優勢，主角比常人更有潛力，但仍需努力與抉擇才能成就一番事業。';
  }
  return '這一世詞條強大，主角天賦異稟、氣運不凡，可以有較多突破常人的際遇與超凡發展，但越強也越容易招致強敵與劫難。';
}

async function nextChapter(first, prevChoiceText){
  gs.choosing=false;
  const choicesCont=document.getElementById('choices-container');
  const sceneCont=document.getElementById('scene-container');
  sceneCont.innerHTML='';
  choicesCont.innerHTML=`<div class="loading-scene"><div class="loading-dots"><span></span><span></span><span></span></div> 命運正在編織你的人生…</div>`;

  const data = parseJSON(await callAI(chapterPrompt(prevChoiceText)));
  if(!data || !data.major || !data.major.choices){
    console.error('[nextChapter] 章節資料無效，data =', data, '（需含 major.choices）');
    choicesCont.innerHTML=`<div style="color:var(--coral);font-size:13px;padding:8px 0">⚠️ 生成失敗（詳情見 F12 Console）<button class="mini-btn" style="margin-left:8px" onclick="nextChapter(${!!first}, ${JSON.stringify(prevChoiceText||'')})">重試</button></div>`;
    return;
  }
  gs.chapter++;
  // 播放日常小事件（逐條淡入，暗中套用 effects；部分附輕量選項，但「不阻擋」流程）
  const daily = Array.isArray(data.daily)?data.daily:[];
  for(const d of daily){
    const prevAge=gs.age;
    if(typeof d.age==='number') gs.age=d.age;
    // 流逝的年數：自然健康衰減 + 純意外死亡判定
    const dead = await tickYears(prevAge, gs.age);
    if(dead) return;
    applyEffects(d.effects, true);
    const lineEl = addFlowLine(d.age??gs.age, d.text, false);
    gs.flow.push({age:d.age??gs.age, text:d.text});
    if(Array.isArray(d.opts) && d.opts.length) renderDailyOpts(lineEl, d.opts);
    renderStats(); updateGameHeader();
    if(checkDeath()) return;
    await sleep(420);
  }
  // 偶發：窺見一項當前隱藏數值（提高顯示機率）
  maybeRevealHidden();
  // 疾病死亡判定（健康過低可能病死）
  if(rollIllnessDeath()){ await sleep(500); endLife(true,'illness'); return; }
  // 小事件播完 → 顯示大事件
  const mj=data.major;
  if(typeof mj.age==='number'){ const dead2=await tickYears(gs.age, mj.age); if(dead2) return; gs.age=mj.age; }
  gs.pendingMajor=mj;
  updateGameHeader();
  await showMajor(mj);
  autoSaveActive();
}

// 每過 N 年：自然健康衰減（年老加速）+ 純意外（天災人禍）判定
const ACCIDENT_PER_YEAR = 0.0007;   // 約 0.07%/年 → 一生(~75年)累積≈5%
async function tickYears(fromAge, toAge){
  const r=gs.realm; const hk=healthKeyOf(r);
  let yrs = Math.max(0, Math.round((toAge||0)-(fromAge||0)));
  for(let i=0;i<yrs;i++){
    gs.years++;
    // 自然衰減：壯年後逐年加速
    const a = (fromAge||0)+i+1;
    const ratio = a/r.lifespan;
    let decay = 0.15 + Math.max(0, ratio-0.55)*7;   // 0.55倍壽命後明顯衰老
    if(gs.stats[hk]!==undefined) gs.stats[hk]=clamp(gs.stats[hk]-decay,0,120);
    // 純意外（與行為無關的橫禍）
    if(Math.random()<ACCIDENT_PER_YEAR){
      await accidentDeath();
      return true;
    }
    if(gs.stats[hk]!==undefined && gs.stats[hk]<=0){ endLife(true,'aging'); return true; }
  }
  renderStats();
  return false;
}
async function accidentDeath(){
  const causes=['一場猝不及防的車禍','突如其來的地震','一次空難','失足墜落的意外','一場無情的天災','搶救無效的急症'];
  const cause=causes[Math.floor(Math.random()*causes.length)];
  addFlowMajor(gs.age, `${gs.age}歲這年，命運沒有任何預兆。`, '——', `${cause}，奪走了你的生命。世事無常，誰也料想不到。`);
  gs.flow.push({age:gs.age, major:true, scene:'命運沒有任何預兆。', choice:'——', outcome:`${cause}，奪走了你的生命。`});
  gs.history.push({age:gs.age, scene:'意外', choice:'——', outcome:`${cause}，橫死。`});
  await sleep(700); endLife(true,'accident');
}
// 疾病死亡：健康越低、年紀越大，病死機率越高
function rollIllnessDeath(){
  const hk=healthKeyOf(gs.realm); const hp=gs.stats[hk]; if(hp===undefined) return false;
  if(hp>35) return false;
  const p = (35-hp)/35 * 0.18;   // 健康0時約18%/章 病死
  return Math.random()<p;
}
// 窺見隱藏數值：以一句日常情境顯示某項當前實際分級
function maybeRevealHidden(){
  if(Math.random()>0.4) return;   // 提高到 40% 機率
  const r=gs.realm; const hk=healthKeyOf(r);
  const hid=r.hidden.filter(k=>gs.stats[k]!==undefined);
  if(!hid.length) return;
  const k=hid[Math.floor(Math.random()*hid.length)];
  const v=gs.stats[k];
  let line;
  if(k===hk){ line=`🔍 一次健康檢查：醫生說你目前「${healthWord(v)}」。`; }
  else if(k==='智慧'||k==='悟性'||k==='謀略'||k==='道行'){ line=`🔍 一場考核顯示，你的${k}「${levelWord(v)}」。`; }
  else if(k==='運氣'||k==='因果'){ line=`🔍 路邊算命先生端詳片刻：「你近來的${k}，${levelWord(v)}。」`; }
  else { line=`🔍 你隱約意識到，自己的${k}「${levelWord(v)}」。`; }
  addFlowLine(gs.age, line, true);
  gs.flow.push({age:gs.age, text:line, peek:true});
}

// 日常輕量選項：內嵌渲染，點選套用微小影響並顯示旁白；不阻擋流程、無跳過鈕
function renderDailyOpts(lineEl, opts){
  const wrap=document.createElement('div'); wrap.className='daily-opts';
  opts.slice(0,3).forEach(o=>{
    const b=document.createElement('button'); b.className='daily-opt'; b.textContent=o.text;
    b.onclick=()=>{
      if(wrap.dataset.done) return; wrap.dataset.done='1';
      applyEffects(o.effects,true); renderStats();
      wrap.remove();
      if(o.reply){ const r=document.createElement('div'); r.className='daily-reply'; r.style.marginTop='4px'; r.textContent='— '+o.reply; lineEl.querySelector('.year-txt').appendChild(r); }
    };
    wrap.appendChild(b);
  });
  lineEl.querySelector('.year-txt').appendChild(wrap);
}

function addFlowLine(age, text, peek){
  const flow=document.getElementById('flow-container');
  const div=document.createElement('div');
  div.className='year-line'+(peek?' peek':'');
  div.innerHTML=`<div class="year-age">${age}歲</div><div class="year-txt">${peek?'🔍 ':''}${text}</div>`;
  flow.appendChild(div);
  document.querySelector('.game-content').scrollTop = document.querySelector('.game-content').scrollHeight;
  return div;
}
// 把已決定的大事件寫進「人生」時間流，永久保留
function addFlowMajor(age, scene, choiceText, outcome){
  const flow=document.getElementById('flow-container');
  const div=document.createElement('div'); div.className='flow-major';
  div.innerHTML=`<div class="fm-tag">${gs.realm.emoji} ${age}歲 · 重大抉擇</div>
    <div class="fm-scene">${scene||''}</div>
    <div class="fm-choice">▸ 你的選擇：<b>${choiceText}</b>${outcome?`<div class="fm-outcome">↳ ${outcome}</div>`:''}</div>`;
  flow.appendChild(div);
  document.querySelector('.game-content').scrollTop = document.querySelector('.game-content').scrollHeight;
}

async function showMajor(mj){
  const sceneCont=document.getElementById('scene-container');
  const box=document.createElement('div'); box.className='scene-box major';
  box.innerHTML=`<div class="scene-age-tag">${gs.realm.emoji} ${mj.age??gs.age}歲 · 抉擇</div><div class="scene-text scene-typing" id="typing-text"></div>`;
  sceneCont.innerHTML=''; sceneCont.appendChild(box);
  const textEl=box.querySelector('#typing-text'); const text=mj.scene||'';
  await typeText(textEl, text);
  // choices
  const cont=document.getElementById('choices-container');
  const letters=['A','B','C','D','E','F'];
  let html=`<div class="choices-label">你的選擇</div><div class="choices-grid">`;
  mj.choices.forEach((c,idx)=>{
    let hint='';
    if(c.risky){
      const dw={low:'有些風險，或許有意外',mid:'⚠ 此舉危險，可能傷身甚至喪命',high:'☠ 極度危險，恐有性命之憂'}[c.danger]||'⚠ 充滿變數，成敗難料';
      hint=`<div class="choice-hint hint-risk">${dw}</div>`;
    } else if(c.gamble){
      hint=`<div class="choice-hint hint-gate">🎲 成敗未知，全看你的本事與運氣</div>`;
    } else if(c.makesEnemy){
      hint=`<div class="choice-hint hint-risk">⚠ 此舉恐結下危險的仇家</div>`;
    }
    html+=`<button class="choice-btn ${(c.risky||c.makesEnemy)?'risky-tag':''}" onclick="pickMajor(${idx})"><div class="choice-letter">${letters[idx]}</div><div><div>${c.text}</div>${hint}</div></button>`;
  });
  html+=`</div><div class="choices-label">或，自己決定</div><div class="choice-custom"><input id="custom-input" placeholder="輸入你想採取的行動…" onkeydown="if(event.key==='Enter')pickCustom()"><button onclick="pickCustom()">執行</button></div>`;
  cont.innerHTML=html;
  gs.choosing=true;
  document.querySelector('.game-content').scrollTop = document.querySelector('.game-content').scrollHeight;
}

function applyEffects(effects, silent){
  if(!effects) return;
  const hk=healthKeyOf(gs.realm);
  for(const k in effects){ bumpStat(gs.stats, k, effects[k], hk); }
}
function checkDeath(){
  const hk=healthKeyOf(gs.realm);
  if(gs.stats[hk]!==undefined && gs.stats[hk]<=0){ endLife(true,'illness'); return true; }
  if(gs.age>=gs.realm.lifespan){ endLife(false,'old'); return true; }
  return false;
}

async function pickMajor(idx){
  if(!gs.choosing) return; gs.choosing=false;
  const c=gs.pendingMajor.choices[idx];
  document.querySelectorAll('.choice-btn').forEach((b,i)=>{ b.onclick=null; if(i===idx) b.classList.add('picked'); });
  await resolveChoice(c.text, c);
}
async function pickCustom(){
  if(!gs.choosing) return;
  const inp=document.getElementById('custom-input'); const txt=(inp.value||'').trim();
  if(!txt){ showToast('請輸入你的行動'); return; }
  gs.choosing=false;
  document.querySelectorAll('.choice-btn').forEach(b=>b.onclick=null);
  // 手輸：請 AI 裁定這個自由行動的後果
  const cont=document.getElementById('choices-container');
  cont.innerHTML=`<div class="loading-scene"><div class="loading-dots"><span></span><span></span><span></span></div> 推演你的選擇…</div>`;
  const c = await judgeCustom(txt);
  await resolveChoice(txt, c);
}
async function judgeCustom(actionText){
  const r=gs.realm; const {shownStr,hiddenStr}=buildContextLine(); const hk=healthKeyOf(r);
  const prompt=`沉浸式人生模擬。角色${gs.name}（${genderLabel(gs.gender)}），${gs.age}歲。世界：${r.name}。
可見狀態：${shownStr}。隱藏狀態：${hiddenStr}。
此刻場景：${gs.pendingMajor.scene}
玩家選擇自由行動：「${actionText}」
判斷此行動屬於哪種：
- 若是「成敗未定」的行動（創業、投資、打官司、表白、比試、賭一把…），設 "gamble":true 並用 "key" 指出主導成敗的隱藏數值名。成敗交給遊戲擲骰，你不要假定成功，outcome 只寫中性的「嘗試去做」。
- 若是「危及生命/身體」的冒險，設 "risky":true 與 "danger"（low/mid/high）。
- 若會得罪危險人物，設 "makesEnemy":true 與 "enemyNote"。
- 若只是平常行動，直接給 effects 與 outcome 結果即可。
普通人不可能因單一行動一步登天暴富。effects 鍵須為：${[...r.shown,...r.hidden].join('、')}。${hk}歸零代表死亡。
只輸出JSON：{"effects":{"狀態名":數值},"outcome":"結果或嘗試描述(40字內)","gamble":false,"key":"","risky":false,"danger":"low","makesEnemy":false,"enemyNote":""}`;
  const d=parseJSON(await callAI(prompt, 1024));
  return d || {effects:{}, outcome:'你的選擇沒有激起太多波瀾。'};
}

// ═══ 危機骰子：程式先擲出四級結果，再交給 Gemini 照結果生成劇情 ═══
// 適用 risky（冒險，含死亡）或 gamble（成敗未定，如創業/打官司/對抗）的選項。
const TIER_LABEL = { crit:'大成功', win:'小成功', fail:'失敗', disaster:'慘敗' };
function rollTier(c){
  const r=gs.realm;
  const key = (c.key && gs.stats[c.key]!==undefined) ? c.key : '運氣';
  const stat = gs.stats[key] ?? 40;
  const luck = gs.stats['運氣'] ?? 40;
  // 成功基準：受主導數值與運氣影響；danger 越高越難成功
  const dangerPenalty = {low:0.05, mid:0.12, high:0.22}[c.danger] || 0;
  let succ = clamp(0.12 + stat*0.0065 + luck*0.003 - dangerPenalty, 0.06, 0.92);
  const x = Math.random();
  const critP = succ*0.22;
  const winP  = succ;
  const failP = succ + (1-succ)*0.62;
  let tier = x<critP?'crit' : x<winP?'win' : x<failP?'fail' : 'disaster';
  return {tier, key, succ};
}
// 結怨/威脅累加（被報復、暗殺的非自然死亡來源）
function addThreat(amount, note){
  gs.threat = clamp((gs.threat||0)+amount, 0, 100);
  if(note) gs.threatNote = note;
}
// 每章：依威脅值判定是否遭報復橫死（非自然死亡，與行為相關）
function rollRetaliation(){
  if((gs.threat||0)<8) return false;
  const luck = gs.stats['運氣'] ?? 40;
  let p = gs.threat*0.0035 * (1 - luck/250);   // 威脅100、運氣低時約 0.35%? 太低→放大
  p = clamp(gs.threat*0.004 - luck*0.0006, 0, 0.4);
  return Math.random()<p;
}

async function resolveChoice(choiceText, c){
  document.querySelectorAll('#flow-container .daily-opts').forEach(el=>el.remove());
  const scene=gs.pendingMajor.scene;
  const hk=healthKeyOf(gs.realm);
  if(gs.pendingMajor.setback) gs.setbacks=(gs.setbacks||0)+1;

  const staked = !!(c.risky || c.gamble);
  let finalOutcome = c.outcome||'';
  let fatal=false, fatalCause='';

  if(staked){
    // 1) 程式擲骰決定四級結果
    const {tier} = rollTier(c);
    // 2) 冒險(risky)且慘敗 → 可能當場橫死（非自然死亡，由情境決定）
    if(c.risky && tier==='disaster'){
      const danger = c.danger||'mid';
      const dieP = {low:0.35, mid:0.55, high:0.78}[danger];
      if(Math.random()<dieP){ fatal=true; fatalCause='risk'; }
    }
    // 3) 結怨選項累加威脅
    if(c.makesEnemy){ addThreat({low:8,mid:16,high:26}[c.danger||'mid']||16, c.enemyNote||'你樹立了危險的敵人'); }
    // 4) 交給 Gemini 照「擲出的結果」生成劇情與數值
    const loadCont=document.getElementById('choices-container');
    loadCont.innerHTML=`<div class="loading-scene"><div class="loading-dots"><span></span><span></span><span></span></div> 命運的骰子已落定…</div>`;
    const narr = await narrateTiered(choiceText, c, tier, fatal, fatalCause);
    finalOutcome = `【${TIER_LABEL[tier]}】${narr.outcome||c.outcome||''}`;
    if(fatal){ gs.stats[hk]=0; } else { applyEffects(narr.effects||c.effects, false); }
  } else {
    applyEffects(c.effects, false);
  }

  // 與行為無關之外：本章報復橫死判定（高威脅時）
  if(!fatal && rollRetaliation()){ fatal=true; fatalCause='retaliation'; gs.stats[hk]=0;
    finalOutcome += `${finalOutcome?'　':''}${retaliationFlavor()}`; }

  addFlowMajor(gs.age, scene, choiceText, finalOutcome);
  document.getElementById('scene-container').innerHTML='';
  document.getElementById('choices-container').innerHTML='';
  gs.flow.push({age:gs.age, major:true, scene, choice:choiceText, outcome:finalOutcome});
  gs.history.push({age:gs.age, scene, choice:choiceText, outcome:finalOutcome});
  gs.bigEvents++;
  renderStats(); updateGameHeader(); renderHistory();
  autoSaveActive();
  if(fatal){ await sleep(800); endLife(true, fatalCause==='retaliation'?'retaliation':'risk'); return; }
  if(checkDeath()) return;
  await sleep(900);
  nextChapter(false, `${choiceText}（結果：${finalOutcome}）`);
}
// 叫 Gemini 照「程式擲出的結果等級」生成劇情，不准它自己改成功/失敗
async function narrateTiered(choiceText, c, tier, fatal, fatalCause){
  const r=gs.realm; const {shownStr,hiddenStr}=buildContextLine(); const hk=healthKeyOf(r);
  const tierDesc = {
    crit:'大成功：結果遠超預期，帶來明顯正面收穫。',
    win:'小成功：大致順利，有一些正面收穫但有限。',
    fail:'失敗：事與願違，付出代價、招致損失或挫折。',
    disaster:'慘敗：徹底失敗，後果嚴重（重大損失／重傷／結仇／名譽掃地等）。'
  }[tier];
  const deathLine = fatal ? `\n【重要】本次結果為「致命」：主角在這次事件中${fatalCause==='retaliation'?'遭仇敵報復而身亡':'遭遇致命變故而死亡'}。請寫出符合情境的橫死經過（例如被黑惡勢力滅口、車禍、鬥爭中喪命、被陷害致死等），語氣沉重。` : '';
  const prompt=`沉浸式人生模擬。角色${gs.name}（${genderLabel(gs.gender)}），${gs.age}歲。世界：${r.name}。
可見狀態：${shownStr}。隱藏狀態：${hiddenStr}。
場景：${gs.pendingMajor.scene}
玩家的選擇：「${choiceText}」
【骰子已判定結果等級】${tierDesc}${deathLine}
請「嚴格依照上述判定的結果等級」生成這次選擇的後果，絕對不可以擅自把失敗寫成成功、或把慘敗寫成圓滿。
給出符合該等級的數值變化（effects，鍵須為：${[...r.shown,...r.hidden].join('、')}；慘敗/失敗應有負面變化，成功則正面）。
${isMoneyStat(r.moneyName)?`若這是關於金錢/事業的抉擇，「${r.moneyName}」（以元計）的變化要「夠大且符合規模效應」：大成功＝賺進數百萬到數億（如創業大成 +5000000~+50000000、賣公司/上市 +數千萬到數億）；小成功＝數十萬到數百萬；失敗＝損失數十萬到數百萬；慘敗＝重大虧損、可能破產（-數百萬到-數千萬）。別給太小的金額。成功取得地位時聲望也明顯提升。`:''}
只輸出JSON：{"effects":{"狀態名":數值},"outcome":"結果描述(45字內，符合判定等級)"}`;
  const d=parseJSON(await callAI(prompt, 1024));
  return d || {effects:c.effects||{}, outcome:c.outcome||TIER_LABEL[tier]};
}
function retaliationFlavor(){
  const f=['多年的恩怨終於找上門——你死於仇敵的報復。','一顆子彈，了結了你樹敵太多的一生。','你低估了敵人的狠辣，最終橫死他手。','黑暗中的清算如約而至，你沒能逃過。'];
  return f[Math.floor(Math.random()*f.length)];
}

function renderHistory(){
  const list=document.getElementById('history-list');
  list.innerHTML=[...gs.history].reverse().map(h=>`<div class="history-entry"><div class="age">${h.age}歲</div><div>${(h.scene||'').slice(0,70)}…</div><div class="choice-made">→ ${h.choice}${h.outcome?` <span style="color:var(--teal)">↳ ${h.outcome}</span>`:''}</div></div>`).join('') || '<div style="color:var(--text2);font-size:13px">尚無重大事件。</div>';
}

// ── 死亡 / 結算 ──
const DEATH_TITLE = { accident:'天有不測', retaliation:'死於仇敵', risk:'命喪冒險', illness:'病逝', aging:'油盡燈枯', old:'壽終正寢' };
async function endLife(earlyDeath, cause){
  if(!gs || !gs.alive) return;   // 防重入（多個死亡管道同時觸發）
  gs.alive=false; gs.choosing=false; gs.choosing=false; gs.deathCause=cause||'';  save.activeLife=null;
  document.getElementById('choices-container').innerHTML='';
  const r=gs.realm;
  const moneyKey=r.moneyName; const wealth=gs.stats[moneyKey]||0;
  const ach = wealthAchievement(wealth, r);   // 財富成就 0~320（百萬≈120、千萬≈180、億≈240、十億≈300）
  const ageRatio = clamp(gs.age/r.lifespan, 0, 1);
  // 魂魄（常用幣，較慷慨）：基礎 + 抉擇 + 財富成就 + 壽命
  let aCoin = 50 + gs.bigEvents*14 + ach + Math.round(ageRatio*50);
  aCoin = Math.min(aCoin, 4000);
  // 道果（稀有幣）：依財富階層 + 聲望(身分地位) + 善終給予，無上限
  let bCoin = 0;
  if(ach>=120) bCoin += 1;   // 達百萬（小有積蓄）
  if(ach>=180) bCoin += 1;   // 達千萬級富人
  if(ach>=240) bCoin += 1;   // 達億級富豪
  if(ach>=300) bCoin += 1;   // 達十億級首富/巔峰
  // 聲望（身分地位）來源：找出本世的聲望類顯性數值
  const repKey = r.shown.find(s=>isFameStat(s));
  const rep = repKey ? (gs.stats[repKey]||0) : 0;
  if(rep>=60)  bCoin += 1;    // 小有名望
  if(rep>=150) bCoin += 1;    // 一方人物
  if(rep>=300) bCoin += 1;    // 名動天下
  if(!earlyDeath && gs.age>=r.lifespan*0.85) bCoin += 1;   // 善終
  // 無上限（移除 cap）
  gs.aLifeEarned=aCoin;

  // 結語
  const summary = await deathSummary(earlyDeath, cause);
  save.aCoin+=aCoin; save.bCoin+=bCoin;
  save.lifeRecords.push({
    realm:r.name, realmId:gs.realmId, name:gs.name, gender:gs.gender, age:gs.age,
    earlyDeath, cause, aCoin, bCoin, summary,
    shown:r.shown.map(s=>({name:s,val:fmtMoney(gs.stats[s],s,r)})),
    log:gs.history.map(h=>({age:h.age,choice:h.choice,outcome:h.outcome})),
    flow:gs.flow.slice(-40),
  });
  persist();

  const emojis={mortal:'🕊️',rich:'💰',noble:'⚔️',cultivator:'🌀',immortal:'✨',chaos:'🌌'};
  document.getElementById('end-emoji').textContent=emojis[gs.realmId]||'🕊️';
  document.getElementById('end-title').textContent=(cause&&DEATH_TITLE[cause])?DEATH_TITLE[cause]:(earlyDeath?'英年早逝':'走完一生');
  document.getElementById('end-story').textContent=summary;
  document.getElementById('end-rewards').innerHTML=`
    <div class="reward-row"><span class="reward-label">享年</span><span class="reward-val">${gs.age}歲</span></div>
    <div class="reward-row"><span class="reward-label">重大抉擇</span><span class="reward-val">${gs.bigEvents} 次</span></div>
    ${r.shown.map(s=>`<div class="reward-row"><span class="reward-label">${s}</span><span class="reward-val">${fmtMoney(gs.stats[s],s,r)}</span></div>`).join('')}
    <div class="reward-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px"><span class="reward-label">獲得</span><span class="reward-val" style="color:var(--acoin)">🔹 ${aCoin} 魂魄${bCoin?`　🔸 ${bCoin} 道果`:''}</span></div>`;
  document.getElementById('end-btns').innerHTML=`<button class="end-btn" onclick="backToHub()">返回轉世所</button><button class="end-btn primary" onclick="reincarnate()">立即輪迴 →</button>`;
  document.getElementById('end-overlay').style.display='flex';
}
async function deathSummary(earlyDeath, cause){
  const r=gs.realm; const hist=gs.history.map(h=>`${h.age}歲${h.choice}`).join('；')||'平淡一生';
  const causeText = {accident:'死於一場無常的意外（天災人禍）',retaliation:'因樹敵太多，遭仇敵報復而身亡',risk:'因一次冒險而命喪',illness:'積勞成疾、health耗盡而病逝',aging:'油盡燈枯而終',old:'壽終正寢'}[cause]||'';
  const prompt=`為這段人生寫結語（繁體中文，80~120字，詩意不做作，依走向可感慨/豁達/悲壯）：
世界：${r.name}；角色：${gs.name}（${genderLabel(gs.gender)}）；終年：${gs.age}歲；死因：${causeText||(earlyDeath?'死於非命/早逝':'壽終')}。
人生大事：${hist}。
請讓結語呼應其死因與一生經歷。只輸出結語文字。`;
  return await callAI(prompt,512) || `${gs.name}走完了這一生，在${gs.age}歲時${causeText||'悄然落幕'}，留下屬於自己的印記。`;
}
function backToHub(){ document.getElementById('end-overlay').style.display='none'; document.getElementById('game').classList.remove('active'); document.getElementById('hub').classList.add('active'); renderHub(); }
function reincarnate(){ document.getElementById('end-overlay').style.display='none'; const rid=gs.realmId; backToHub(); startGame(rid); }

// ── 中途存檔 / 續玩 ──
function autoSaveActive(){
  if(!gs || !gs.alive) return;
  save.activeLife = {
    realmId:gs.realmId, gender:gs.gender, name:gs.name, age:gs.age,
    stats:gs.stats, traits:gs.traits, history:gs.history, flow:gs.flow,
    chapter:gs.chapter, pendingMajor:gs.pendingMajor, bigEvents:gs.bigEvents, setbacks:gs.setbacks,
    threat:gs.threat, threatNote:gs.threatNote, years:gs.years,
    mixRealms:gs.mixRealms, mixRandom:gs.mixRandom,
  };
  persist();
}
function resumeLife(){
  const L=save.activeLife; if(!L) return;
  const r=REALMS[L.realmId];
  gs={ realmId:L.realmId, realm:r, gender:L.gender, name:L.name, age:L.age, alive:true,
    stats:L.stats, traits:L.traits||[], history:L.history||[], flow:L.flow||[],
    chapter:L.chapter||0, pendingMajor:L.pendingMajor, branchCache:null, choosing:false,
    bigEvents:L.bigEvents||0, setbacks:L.setbacks||0, threat:L.threat||0, threatNote:L.threatNote||'', years:L.years||0,
    mixRealms:L.mixRealms||[], mixRandom:L.mixRandom||false, aLifeEarned:0 };
  enterGameScreen();
  // 重建畫面
  const flow=document.getElementById('flow-container'); flow.innerHTML='';
  gs.flow.slice(-16).forEach(f=> f.major ? addFlowMajor(f.age,f.scene,f.choice,f.outcome) : addFlowLine(f.age,f.text,f.peek));
  renderHistory();
  if(gs.pendingMajor){ document.getElementById('scene-container').innerHTML=''; document.getElementById('choices-container').innerHTML=''; showMajor(gs.pendingMajor); }
  else nextChapter(false);
  showToast('已載入上一世進度');
}
function confirmBack(){
  if(gs && gs.alive){ autoSaveActive(); showToast('已暫存本世，可從主畫面繼續'); }
  document.getElementById('game').classList.remove('active');
  document.getElementById('hub').classList.add('active'); renderHub();
}

// ── 回顧 ──
function showLifeReview(idx){
  const L=save.lifeRecords[idx]; if(!L) return;
  const emojis={mortal:'🕊️',rich:'💰',noble:'⚔️',cultivator:'🌀',immortal:'✨',chaos:'🌌'};
  document.getElementById('end-emoji').textContent=emojis[L.realmId]||'🕊️';
  document.getElementById('end-title').textContent=`第${idx+1}世 · ${L.name}`;
  document.getElementById('end-story').textContent=L.summary||'（無結語）';
  const shownStr=(L.shown||[]).map(s=>`${s.name} ${s.val}`).join('　');
  const logStr=(L.log||[]).map(h=>`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:12px;text-align:left"><span style="color:var(--text2)">${h.age}歲</span>　${h.choice}${h.outcome?`<span style="color:var(--teal)"> ↳ ${h.outcome}</span>`:''}</div>`).join('')||'<span style="color:var(--text2)">無重大事件</span>';
  document.getElementById('end-rewards').innerHTML=`
    <div class="reward-row"><span class="reward-label">世界 / 性別</span><span class="reward-val">${L.realm} · ${genderLabel(L.gender)}</span></div>
    <div class="reward-row"><span class="reward-label">享年</span><span class="reward-val">${L.age}歲${L.earlyDeath?'（早逝）':''}</span></div>
    <div class="reward-row"><span class="reward-label">獲得</span><span class="reward-val">🔹${L.aCoin} 魂魄${L.bCoin?` 🔸${L.bCoin} 道果`:''}</span></div>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;color:var(--text2);text-align:left">最終：${shownStr}</div>
    <div style="margin-top:8px;max-height:200px;overflow-y:auto">${logStr}</div>`;
  document.getElementById('end-btns').innerHTML=`<button class="end-btn primary" onclick="closeReview()">關閉</button>`;
  document.getElementById('end-overlay').style.display='flex';
}
function closeReview(){ document.getElementById('end-overlay').style.display='none'; }

// ── tabs / utils ──
function switchTab(name){
  ['story','history','traits'].forEach(t=>{ document.getElementById('tab-'+t).classList.toggle('active',t===name); document.getElementById('tab-'+t+'-content').style.display=t===name?'':'none'; });
  if(name==='traits') renderCurrentTraits();
  if(name==='history') renderHistory();
}
function showToast(msg,dur=2500){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),dur); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function typeText(el,text){ return new Promise(res=>{ let i=0; const iv=setInterval(()=>{ el.textContent=text.slice(0,++i); if(i>=text.length){ clearInterval(iv); el.classList.remove('scene-typing'); res(); } },16); }); }

// ── 開發者指令（Console 用）──
// 用法：grant(魂魄, 道果)。例：grant(100000, 500) 給 10萬魂魄 + 500道果。
// 省略參數預設各給一批：grant() = +100000 魂魄 +1000 道果。也可只給一種：grant(50000) / grant(0, 200)。
function grant(a, b){
  a = (a===undefined) ? 100000 : Number(a)||0;
  b = (b===undefined) ? 1000   : Number(b)||0;
  save.aCoin += a; save.bCoin += b;
  persist(); updateWallet(); if(typeof renderHub==='function') renderHub();
  const msg = `已給予　🔹魂魄 +${a}（共 ${save.aCoin}）　🔸道果 +${b}（共 ${save.bCoin}）`;
  if(typeof showToast==='function') showToast(msg);
  console.log('%c'+msg, 'color:#5bb8ff;font-weight:bold');
  return {魂魄:save.aCoin, 道果:save.bCoin};
}
window.grant = grant;

// 調整「永久基礎天賦」等級。用法：setTalent('健康', 50) 或 setTalent() 列出所有可用 key。
function setTalent(key, level){
  const keys = BASE_TALENTS.map(b=>b.key);
  if(key===undefined){ console.log('可用天賦 key：', keys.join(' / '), '\n用法 setTalent(key, 等級)，例 setTalent("運氣", 30)'); return keys; }
  if(!keys.includes(key)){ console.warn('找不到天賦：'+key+'，可用：'+keys.join('/')); return; }
  save.baseTalents[key] = Math.max(0, Math.floor(Number(level)||0));
  persist(); if(typeof renderInventory==='function') renderInventory();
  const msg = `天賦「${key}」設為 Lv.${save.baseTalents[key]}（下世起始生效）`;
  if(typeof showToast==='function') showToast(msg);
  console.log('%c'+msg,'color:#f0c040;font-weight:bold');
  return save.baseTalents;
}
// 調整「詞條」等級（並確保已擁有）。用法：setTrait('genius', 10) 或 setTrait() 列出所有詞條 id。
function setTrait(id, level){
  if(id===undefined){ console.log('可用詞條 id：\n'+TRAITS.map(t=>`  ${t.id}  (${t.rarity}) ${t.name}`).join('\n')+'\n用法 setTrait(id, 等級)，例 setTrait("system_host", 20)'); return TRAITS.map(t=>t.id); }
  const t = traitById(id);
  if(!t){ console.warn('找不到詞條 id：'+id+'。輸入 setTrait() 查看清單'); return; }
  const lv = Math.max(1, Math.floor(Number(level)||1));
  if(!save.inventory[id]) save.inventory[id] = {count:0, level:lv, equipped:false};
  save.inventory[id].level = lv;
  persist(); if(typeof renderInventory==='function') renderInventory();
  const msg = `詞條「${t.name}」設為 Lv.${lv}（去背包裝備後生效）`;
  if(typeof showToast==='function') showToast(msg);
  console.log('%c'+msg,'color:#a99ff7;font-weight:bold');
  return save.inventory[id];
}
window.setTalent = setTalent;
window.setTrait = setTrait;

// ── init ──
renderHub();
if(!getSavedKey()) setTimeout(showKeyModal, 600);
