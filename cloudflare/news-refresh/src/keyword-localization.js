// Deterministic common topics first; one bounded call to the EXISTING translation
// binding for other terms. Translation failure must never disable news search.
const MODEL = '@cf/meta/m2m100-1.2b';
export const LOCALIZATION_TIMEOUT_MS = 1200;
const TOPICS = [
  {en:'election',zh:'選舉',ja:'選挙',ko:'선거',fr:'élection',de:'Wahl',es:'elecciones',it:'elezioni',pt:'eleições',nl:'verkiezingen',sv:'val',no:'valg',da:'valg',fi:'vaalit',pl:'wybory',cs:'volby',el:'εκλογές',tr:'seçim',he:'בחירות',ar:'انتخابات',id:'pemilu',th:'การเลือกตั้ง',vi:'bầu cử',aliases:['elections']},
  {en:'earthquake',zh:'地震',ja:'地震',ko:'지진',fr:'séisme',de:'Erdbeben',es:'terremoto',it:'terremoto',pt:'terremoto',nl:'aardbeving',sv:'jordbävning',no:'jordskjelv',da:'jordskælv',fi:'maanjäristys',pl:'trzęsienie ziemi',cs:'zemětřesení',el:'σεισμός',tr:'deprem',he:'רעידת אדמה',ar:'زلزال',id:'gempa bumi',th:'แผ่นดินไหว',vi:'động đất',aliases:['earthquakes']},
  {en:'World Cup',zh:'世界盃',ja:'ワールドカップ',ko:'월드컵',fr:'Coupe du monde',de:'Weltmeisterschaft',es:'Copa del Mundo',it:'Coppa del Mondo',pt:'Copa do Mundo',nl:'Wereldbeker',sv:'världscup',no:'verdenscup',da:'verdensmesterskab',fi:'maailmancup',pl:'Puchar Świata',cs:'Světový pohár',el:'Παγκόσμιο Κύπελλο',tr:'Dünya Kupası',he:'גביע העולם',ar:'كأس العالم',id:'Piala Dunia',th:'ฟุตบอลโลก',vi:'World Cup',aliases:[]},
  {en:'AI',zh:'人工智慧',ja:'人工知能',ko:'인공지능',fr:'intelligence artificielle',de:'künstliche Intelligenz',es:'inteligencia artificial',it:'intelligenza artificiale',pt:'inteligência artificial',nl:'kunstmatige intelligentie',sv:'artificiell intelligens',no:'kunstig intelligens',da:'kunstig intelligens',fi:'tekoäly',pl:'sztuczna inteligencja',cs:'umělá inteligence',el:'τεχνητή νοημοσύνη',tr:'yapay zekâ',he:'בינה מלאכותית',ar:'الذكاء الاصطناعي',id:'kecerdasan buatan',th:'ปัญญาประดิษฐ์',vi:'trí tuệ nhân tạo',aliases:['artificial intelligence','人工智能']},
  {en:'semiconductor',zh:'半導體',ja:'半導体',ko:'반도체',fr:'semi-conducteur',de:'Halbleiter',es:'semiconductor',it:'semiconduttore',pt:'semicondutor',aliases:['semiconductors']},
  {en:'inflation',zh:'通膨',ja:'インフレ',ko:'인플레이션',fr:'inflation',de:'Inflation',es:'inflación',it:'inflazione',pt:'inflação',aliases:['通貨膨脹']},
  {en:'typhoon',zh:'颱風',ja:'台風',ko:'태풍',fr:'typhon',de:'Taifun',es:'tifón',it:'tifone',pt:'tufão',aliases:['typhoons']},
  {en:'baseball',zh:'棒球',ja:'野球',ko:'야구',fr:'baseball',de:'Baseball',es:'béisbol',it:'baseball',pt:'beisebol',aliases:[]}
];
const PROPER_NAMES = new Set(['amd','nvidia','nvda','intel','ibm','asml','tsmc','apple','microsoft','google','meta','amazon','openai','tesla','bitcoin','btc','trump']);
const SUPPORTED = new Set(['en','zh','ja','ko','fr','de','es','it','pt','nl','sv','no','da','fi','pl','cs','el','tr','he','ar','id','th','vi']);
function norm(s){ return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim(); }
function sourceLanguage(text, hint) {
  if(SUPPORTED.has(hint)) return hint;
  if(/[\u3040-\u30ff]/u.test(text)) return 'ja';
  if(/[\uac00-\ud7af]/u.test(text)) return 'ko';
  if(/[\u4e00-\u9fff]/u.test(text)) return 'zh';
  if(/[\u0e00-\u0e7f]/u.test(text)) return 'th';
  if(/[\u0590-\u05ff]/u.test(text)) return 'he';
  if(/[\u0600-\u06ff]/u.test(text)) return 'ar';
  if(/[\u0370-\u03ff]/u.test(text)) return 'el';
  // This is a heuristic, not a general language detector. Unknown scripts and
  // ambiguous accented Latin terms are preserved unless source_language is set.
  if(/^[\x20-\x7e]+$/.test(text)) return 'en';
  return '';
}
export async function localizeKeyword(text, target, env, options = {}) {
  const input=String(text||'').trim().slice(0,80);
  target=String(target||'en').split('-')[0];
  const base={term:input,target_language:target,source_language:'',method:'original',status:'unchanged'};
  const key=norm(input);
  const topic=TOPICS.find(row=>Object.entries(row).some(([lang,value])=>lang==='aliases'?value.some(v=>norm(v)===key):norm(value)===key));
  if(topic?.[target]) return {...base,term:topic[target],method:'dictionary',status:topic[target]===input?'unchanged':'translated'};
  if(PROPER_NAMES.has(key) || /^[A-Z0-9][A-Z0-9.\-]{1,11}$/.test(input)) return {...base,reason:'proper-name-or-acronym'};
  const source=topic?'en':sourceLanguage(input,options.sourceLanguage);
  const result={...base,source_language:source};
  if(source===target) return {...result,reason:'same-language'};
  if(!source || !SUPPORTED.has(target)) return {...result,status:'fallback',reason:'language-uncertain'};
  if(!env?.AI?.run) return {...result,status:'fallback',reason:'translation-unavailable'};
  let timer;
  try {
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('translation-timeout')),options.timeoutMs ?? LOCALIZATION_TIMEOUT_MS);});
    const output=await Promise.race([
      Promise.resolve().then(()=>env.AI.run(MODEL,{text:topic?.en || input,source_lang:source,target_lang:target})),
      deadline
    ]);
    const translated=String(output?.translated_text||'').trim();
    if(!translated || translated.length>120 || /[\r\n<>]/.test(translated)) throw new Error('invalid-translation');
    return {...result,term:translated,method:'workers-ai',status:translated===input?'unchanged':'translated'};
  } catch(error) {
    const reason=/quota|3036|5035|paid plan|allocation/i.test(String(error?.message))?'translation-quota':error?.message==='translation-timeout'?'translation-timeout':'translation-failed';
    return {...result,status:'fallback',reason};
  } finally { clearTimeout(timer); }
}
