const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../server.js','utf8');
const providerBlock=src.slice(src.indexOf('// Provider configuration is server-only.'),src.indexOf('// Derive the character pairings'));
const narrationBlock=src.slice(src.indexOf('// Derive the character pairings'),src.indexOf('async function beginJudging(room){'));
assert(providerBlock.includes('Groq is preferred'));

function sandbox(env,fakeCall){
 const calls=[],events=[];
 class MockOpenAI{
  constructor(config){
   this.config=config;
   this.chat={completions:{create:async(args,requestOptions)=>{
    calls.push({url:config.baseURL,model:args.model,stream:Boolean(args.stream),args,requestOptions});
    return fakeCall(args,config);
   }}};
  }
 }
 const ctx={console,process:{env},require:id=>{assert.equal(id,'openai');return MockOpenAI;},
  AbortController,setTimeout,clearTimeout,Date,JSON,String,Math,Number,Set,Array,Error,
  io:{to:code=>({emit:(event,payload)=>events.push({code,event,payload})})},
  teamRoster:(room,team)=>room.players.filter(p=>team.memberIds.includes(p.id)).flatMap(p=>p.inventory.map(c=>({id:c.id,name:c.name,owner:p.name,category:'Anime',paid:1}))),
  player:(room,id)=>room.players.find(p=>p.id===id),
  normalizeRanking:(room,ranking,winner)=>ranking
 };
 vm.createContext(ctx);vm.runInContext(providerBlock+'\n'+narrationBlock,ctx);
 const room={code:'ABCDE',phase:'judging',judgeRunId:1,settings:{mode:'1v1',categoryId:'anime'},teams:[{id:'T1',name:'Time 1',memberIds:['P1']},{id:'T2',name:'Time 2',memberIds:['P2']}],players:[{id:'P1',name:'Ana',inventory:[{id:'c1',name:'Zeno'}]},{id:'P2',name:'Bob',inventory:[{id:'c2',name:'Goku'}]}]};
 return {ctx,calls,events,room};
}
function error(status,message){const e=new Error(message||`Erro HTTP ${status}`);e.status=status;return e;}
const env={GROQ_API_KEY:'groq-secret',GROQ_MODEL:'openai/gpt-oss-120b',OPENROUTER_API_KEY:'router-secret',OPENROUTER_MODEL:'nvidia/nemotron-3-ultra-550b-a55b:free',GEMINI_API_KEY:'ignored'};
const verdict={winnerTeamId:'T1',ranking:['T1','T2'],confidence:0.8,summary:'Zeno venceu.',reasons:['Apagamento'],powers:{c1:9900,c2:9000}};
const response={choices:[{message:{content:JSON.stringify(verdict)}}]};
const chunks=(chunks)=>async function*(){for(const x of chunks)yield {choices:[{delta:{content:x}}]};};

(async()=>{
 // Free Groq wins: the fallback is never called and Groq-specific options are set.
 const groq=sandbox(env,async(args,settings)=>args.stream?chunks(['CONFRONTO 1 — Zeno vs Goku\n','Zeno vence.'])():response);
 const narrated=await groq.ctx.aiLiveNarration(groq.room,1);
 assert.equal(narrated,undefined);
 assert(groq.events.some(e=>e.event==='judgeLiveDelta'&&e.payload.text.includes('Zeno')));
 const final=await groq.ctx.aiJudge(groq.room,1);
 assert.equal(final.source,'groq');
 assert.equal(final.model,'openai/gpt-oss-120b');
 assert.equal(final.powers.c1,9900);
 assert(groq.calls.every(c=>c.url==='https://api.groq.com/openai/v1'));
 assert(groq.calls.find(c=>c.stream).args.reasoning_effort==='low');
 assert(groq.calls.find(c=>!c.stream).args.reasoning_effort==='medium');
 assert.equal(groq.calls.find(c=>!c.stream).args.response_format.type,'json_object');
 assert(groq.calls.every(c=>c.args.include_reasoning===false));
 assert.equal(groq.ctx.aiProviders().length,2);

 // 429 during Groq stream, even after partial content, must switch and reset.
 const ratelimited=sandbox(env,async(args,config)=>{
  const isGroq=config.baseURL.includes('groq.com');
  if(args.stream){
   return (async function*(){
    yield {choices:[{delta:{content:isGroq?'PARCIAL Groq':'CONFRONTO 1 — Zeno vs Goku: OpenRouter vence.'}}]};
    if(isGroq)throw error(429,'rate limit');
   })();
  }
  if(isGroq)throw error(429,'rate limit');
  return response;
 });
 await ratelimited.ctx.aiLiveNarration(ratelimited.room,1);
 assert(ratelimited.events.some(e=>e.event==='judgeLiveReset'));
 assert(ratelimited.events.filter(e=>e.event==='judgeLiveDelta').length>=2);
 assert(ratelimited.events.some(e=>e.event==='judgeLiveStatus'&&e.payload.message.includes('OpenRouter')));
 assert.equal((await ratelimited.ctx.aiJudge(ratelimited.room,1)).source,'openrouter');
 assert(ratelimited.calls.some(c=>c.url==='https://openrouter.ai/api/v1'));
 assert(!ratelimited.calls.filter(c=>c.url.includes('openrouter')).some(c=>c.args.reasoning_effort!==undefined));

 // Invalid Groq JSON falls back, as do outages.
 const badJson=sandbox(env,async(args,settings)=>settings.baseURL.includes('groq.com')?{choices:[{message:{content:'no-json'}}]}:response);
 assert.equal((await badJson.ctx.aiJudge(badJson.room,1)).source,'openrouter');
 const outage=sandbox(env,async(args,settings)=>{if(settings.baseURL.includes('groq.com'))throw error(503);return response;});
 assert.equal((await outage.ctx.aiJudge(outage.room,1)).source,'openrouter');

 // Backward compatibility: OpenRouter alone, no Groq credentials.
 const routerOnly=sandbox({OPENROUTER_API_KEY:'router-secret'},async()=>response);
 assert.equal((await routerOnly.ctx.aiJudge(routerOnly.room,1)).source,'openrouter');
 assert.equal(routerOnly.calls.length,1);

 // A leftover Google variable must never become primary.
 const googleOnly=sandbox({GEMINI_API_KEY:'old-google-secret'},async()=>response);
 assert.equal(googleOnly.ctx.aiProviders().length,0);
 await assert.rejects(()=>googleOnly.ctx.aiJudge(googleOnly.room,1),/GROQ_API_KEY/);

 // Neither provider may fabricate a result.
 const noKey=sandbox({},async()=>response);
 await assert.rejects(()=>noKey.ctx.aiJudge(noKey.room,1),/GROQ_API_KEY/);

 // Both unavailable -> error for user to retry; never generate local scores.
 const fail=sandbox(env,async()=>{throw error(429);});
 await assert.rejects(()=>fail.ctx.aiJudge(fail.room,1),/Nenhuma IA conseguiu/);
 console.log('PASS: Groq preferred, GPT-OSS options, narration streaming, 429 reset & fallback, invalid JSON, outage, router-only, ignored Gemini, missing keys, both unavailable.');
})().catch(e=>{console.error(e);process.exitCode=1});
