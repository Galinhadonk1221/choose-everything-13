const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 25000 });
app.use(express.static(path.join(__dirname, "public")));

const categories = JSON.parse(fs.readFileSync(path.join(__dirname,"cards.json"),"utf8"));
const animeImageManifest = JSON.parse(fs.readFileSync(path.join(__dirname,"anime-images.json"),"utf8"));
const canonLocks = JSON.parse(fs.readFileSync(path.join(__dirname,"canon-locks.json"),"utf8"));
const allCards = categories.flatMap(c=>c.cards);
const cardMap = new Map(allCards.map(c=>[c.id,c]));
const IMAGE_CACHE_VERSION = "portraits-v44";
const imageCache = new Map();
const imageBinaryCache = new Map();
const rooms = new Map();


// Private guidance used only by the final battle judge. These notes are never sent to the browser.
// For generic character cards, the judge uses the strongest canon version reached in the primary source.
// If the card explicitly names a form, that exact form/version takes priority.
const BATTLE_GUIDANCE = {
  "Rimuru Tempest": "Treat as peak canonical light-novel Rimuru. Extremely high-tier: Ciel-level analysis/support, Azathoth, soul/energy absorption, Imaginary Space, space-time abilities, very high regeneration/defenses and broad resistance/hax. Do not treat Rimuru like only the early-anime version.",
  "Anos Voldigoad": "Treat as peak canonical main-source Anos. Extremely high-tier with source-based existence, resurrection, magic negation/destruction, Venuzdnor-related effects and resistance to many conventional kill conditions.",
  "Zeno": "Dragon Ball Super Zeno. Universe/timeline-scale erasure is his defining win condition, but do not automatically equate erasure with combat speed or resistance to every cross-verse hax.",
  "Grand Priest": "Dragon Ball Super Grand Priest; among the setting's highest known combat authorities. Scale well above ordinary Gods of Destruction and most mortals, while avoiding invented feats.",
  "Whis": "Dragon Ball Super Whis; angel-tier speed, reactions, martial skill and temporal utility. Scale above Beerus in ordinary combat portrayal.",
  "Beerus": "Dragon Ball Super Beerus; God of Destruction with Hakai and very high speed/power. Consider Hakai interactions with immortality/resistance instead of assuming it always works.",
  "Goku Ultra Instinct": "Use the Ultra Instinct form named on the card and current canon-relevant feats for that form. Prioritize combat speed, reactions, adaptation and ki scale; do not grant unrelated noncanon abilities.",
  "Black Frieza": "Use Black Frieza from Dragon Ball Super manga. Treat as above contemporary Goku/Vegeta forms by his demonstrated portrayal, without inventing unknown techniques.",
  "Saitama": "Use current manga-canon Saitama. Account for extreme physical growth, speed and durability shown against Cosmic Garou; do not use pure gag/NLF reasoning as an automatic win against abstract hax.",
  "Cosmic Garou": "Use Cosmic Fear Mode Garou with copying, radiation/energy effects, portals and high-end Saitama-fight feats, but respect limits shown in canon.",
  "Gojo Satoru": "Infinity, Six Eyes, Unlimited Void and Hollow Purple are central. Do not award a win merely for higher raw strength if the opponent lacks a demonstrated way around Infinity/domain effects.",
  "Ryomen Sukuna": "Use peak manga-canon Sukuna. Consider Malevolent Shrine, World-Cutting Slash and domain/combat skill; do not scale him to unrelated cosmic tiers.",
  "Naruto Six Paths": "Use Six Paths-era Naruto as named. Consider clones, sensory abilities, Truth-Seeking interactions where applicable, speed and large-scale chakra attacks.",
  "Kaguya Otsutsuki": "Consider dimensional shifting, regeneration/immortality traits, expansive Truth-Seeking Ball and kill/seal requirements rather than raw damage only.",
  "Monkey D. Luffy Gear 5": "Use Gear 5 as named. Consider advanced Haki, awakening/body freedom, stamina limits and current manga feats; avoid literal omnipotent 'toon force' assumptions.",
  "Ichigo Kurosaki TYBW": "Use endgame TYBW Ichigo. High spiritual pressure, speed and attack potency; account for soul/spiritual interaction in cross-verse comparison.",
  "Aizen Sosuke": "Use late-series Aizen with Hogyoku evolution/immortality and Kyoka Suigetsu. Perfect hypnosis is a major matchup factor unless the opponent has a credible counter.",
  "Yhwach": "Use endgame Yhwach with The Almighty. Future perception/alteration is a major hax advantage; compare counters to precognition/fate/future manipulation explicitly.",
  "Lucius Zogratis": "Use manga-canon Lucius from Black Clover. Account for Soul Magic, Time Magic and his late-series magical toolkit/Paladin creation; do not confuse him with similarly named characters.",
  "Giorno Giovanna GER": "Use Gold Experience Requiem as named. Return to Zero is the central defensive/causal ability; do not reduce the matchup to physical stats alone.",
  "Johnny Joestar Tusk Act 4": "Use Tusk Act 4 as named. Infinite Rotation and its persistence/cross-dimensional pursuit are the key win conditions, with setup requirements considered.",
  "Funny Valentine D4C Love Train": "Use D4C Love Train as named. Misfortune redirection/dimensional defense is central; consider whether the opponent has a canon-like bypass rather than raw force only.",
  "Enrico Pucci Made in Heaven": "Use Made in Heaven as named. Universal time acceleration and rapidly increasing effective speed are central, but account for initial setup and direct vulnerability.",
  "Dio Over Heaven": "This card explicitly names the licensed game version Heaven Ascension DIO. Use that version's reality-overwrite abilities rather than standard canon DIO.",
  "Sung Jinwoo": "Use peak canonical main-source Sung Jinwoo. Consider Shadow Monarch powers, army, regeneration/immortality-like survivability and late-series scale rather than only early anime feats.",
  "Saiki Kusuo": "Use his established psychic toolkit and limiters. Consider teleportation, mind/physical manipulation and other psychic hax; avoid treating comedy scenes as limitless omnipotence.",
  "Alucard Hellsing": "Use endgame Hellsing Alucard appropriate to the card name. Consider regeneration, souls/familiars and unusual existence conditions; if Schrodinger is relevant, explain why rather than assuming it silently.",
  "Meruem Post-Rose": "Use post-Rose Meruem as named. Superior aura, physical stats, intelligence and evolved abilities versus Hunter x Hunter tiers, without inflating him to cosmic scales."
};

const MODES = {
  "1v1": {label:"1v1", players:2, teams:2, teamSize:1},
  "1v1v1": {label:"1v1v1", players:3, teams:3, teamSize:1},
  "1v1v1v1": {label:"1v1v1v1", players:4, teams:4, teamSize:1},
  "2v2": {label:"2v2", players:4, teams:2, teamSize:2},
  "3v3": {label:"3v3", players:6, teams:2, teamSize:3},
};

const AUCTION_SECONDS = 10;
const BID_RESET_SECONDS = 10;
const BETWEEN_SECONDS = 3;
const AI_TIMEOUT_MS = 150000; // A análise final da IA pode demorar em modelos gratuitos
const NARRATION_TIMEOUT_MS = 90000;

function sanitizeName(v){return String(v||"Player").trim().slice(0,18)||"Player";}
function code(){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<5;i++)s+=a[Math.floor(Math.random()*a.length)];return s;}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function getRoom(socket){return rooms.get(socket.data.roomCode);}
function modeInfo(room){return MODES[room.settings.mode]||MODES["1v1"];}
function player(room,id){return room.players.find(p=>p.id===id);}
function clearTimers(room){if(room.auctionTimer)clearTimeout(room.auctionTimer);if(room.nextTimer)clearTimeout(room.nextTimer);}
function teamPublic(room,t){return {id:t.id,name:t.name,memberIds:t.memberIds};}
function publicCard(card,power=null){
 if(!card)return null;
 const out={id:card.id,name:card.name,categoryId:card.categoryId,categoryName:card.categoryName,categoryIcon:card.categoryIcon,image:card.image||null,paid:card.paid};
 if(power!=null)out.power=power;
 return out;
}
function revealedPower(room,card){
 if(!card||room.phase!=="results")return null;
 const ai=room.finalPowers?.[card.id];
 if(Number.isFinite(Number(ai)))return Math.max(1,Math.min(10000,Math.round(Number(ai))));
 return null;
}
function publicWinner(room,w){return w?{id:w.id,name:w.name,bid:w.bid,card:publicCard(w.card,revealedPower(room,w.card))}:null;}
function publicRoom(room){return {
 code:room.code,hostId:room.hostId,phase:room.phase,settings:room.settings,round:room.round,
 currentCard:publicCard(room.currentCard,null),auctionEndsAt:room.auctionEndsAt,highBid:room.highBid,highBidderId:room.highBidderId,
 passedIds:[...room.passed],lastWinner:publicWinner(room,room.lastWinner),teams:room.teams.map(t=>teamPublic(room,t)),judge:room.judge,judgeError:room.judgeError||null,judgingStartedAt:room.judgingStartedAt||null,
 players:room.players.map(p=>({id:p.id,name:p.name,cash:p.cash,inventory:p.inventory.map(c=>publicCard(c,revealedPower(room,c))),teamId:p.teamId}))
};}
function emitRoom(room){io.to(room.code).emit("room",publicRoom(room));}
function sound(room,type){io.to(room.code).emit("sound",type);}

function placeholder(label){const s=String(label||"?").replace(/[<>&'\"]/g,"").slice(0,28);const init=s.split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500"><defs><linearGradient id="g"><stop stop-color="#2b3043"/><stop offset="1" stop-color="#131720"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="350" cy="210" r="112" fill="#414860"/><text x="350" y="244" text-anchor="middle" font-family="Arial" font-weight="700" font-size="82" fill="white">${init}</text><text x="350" y="405" text-anchor="middle" font-family="Arial" font-size="29" fill="#d4d7e3">${s}</text></svg>`);}

function normalizeText(v){
 return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
}
function scoreName(candidate, wanted){
 const a=normalizeText(candidate), b=normalizeText(wanted);
 if(!a||!b)return 0;if(a===b)return 100;if(a.includes(b)||b.includes(a))return 82;
 const aa=new Set(a.split(" ")), bb=new Set(b.split(" "));let same=0;for(const x of aa)if(bb.has(x))same++;
 return Math.round((same/Math.max(aa.size,bb.size))*70);
}
function tokenScore(candidate, parts){
 const a=normalizeText(candidate);if(!a)return 0;let score=0;
 for(const p of parts||[]){const n=normalizeText(p);if(n&&a.includes(n))score+=Math.min(35,10+n.split(" ").length*6);}
 return score;
}
function mediaMatches(nodes, hints){
 const hs=(hints||[]).map(normalizeText).filter(Boolean);if(!hs.length)return true;
 for(const m of nodes||[]){for(const t of [m?.title?.romaji,m?.title?.english,m?.title?.native]){const n=normalizeText(t);if(n&&hs.some(h=>n.includes(h)||h.includes(n)))return true;}}
 return false;
}
async function fetchJson(url, options={}){
 try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(options.timeout||6500)});if(!r.ok)return null;return await r.json();}catch(e){return null;}
}
async function anilistPortrait(meta){
 try{
  const gql=`query($search:String){Page(page:1,perPage:8){characters(search:$search,sort:[FAVOURITES_DESC]){name{full native alternative} image{large medium} media(perPage:12){nodes{title{romaji english native}}}}}}`;
  const d=await fetchJson("https://graphql.anilist.co",{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"ChooseEverything/3.9"},body:JSON.stringify({query:gql,variables:{search:meta.baseName}}),timeout:7000});
  const list=Array.isArray(d?.data?.Page?.characters)?d.data.Page.characters:[];
  const ranked=list.map(x=>{const names=[x?.name?.full,x?.name?.native,...(x?.name?.alternative||[])];const ns=Math.max(0,...names.map(n=>scoreName(n,meta.baseName)));const franchise=mediaMatches(x?.media?.nodes,meta.mediaHints);return {x,score:ns+(franchise?55:-80),ns,franchise};}).sort((a,b)=>b.score-a.score);
  const top=ranked[0];if(!top||top.ns<60||!top.franchise)return null;
  const url=top.x?.image?.large||top.x?.image?.medium;if(!url)return null;
  return {url,source:"anilist",confidence:Math.min(100,top.score)};
 }catch(e){return null;}
}
async function jikanPortrait(meta){
 try{
  const u=new URL("https://api.jikan.moe/v4/characters");u.searchParams.set("q",meta.baseName);u.searchParams.set("limit","8");
  const d=await fetchJson(u,{headers:{"User-Agent":"ChooseEverything/3.9"},timeout:6500});const list=Array.isArray(d?.data)?d.data:[];
  const ranked=list.map(x=>{const ns=Math.max(scoreName(x?.name,meta.baseName),...(x?.nicknames||[]).map(n=>scoreName(n,meta.baseName)));return {x,ns};}).sort((a,b)=>b.ns-a.ns);
  const top=ranked[0];
  // Single-word/generic names are too ambiguous without franchise validation. Fail closed.
  if(!top||top.ns<82||(normalizeText(meta.baseName).split(" ").length<2 && top.ns<100))return null;
  const url=top.x?.images?.webp?.large_image_url||top.x?.images?.jpg?.large_image_url||top.x?.images?.webp?.image_url||top.x?.images?.jpg?.image_url;
  return url?{url,source:"jikan",confidence:top.ns}:null;
 }catch(e){return null;}
}
function fandomApi(domain, params){const u=new URL(`https://${domain}/api.php`);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u;}
async function fandomSearchPages(meta, query){
 const u=fandomApi(meta.fandomDomain,{action:"query",generator:"search",gsrsearch:query,gsrlimit:8,prop:"pageimages",piprop:"thumbnail",pithumbsize:900,format:"json",origin:"*"});
 const d=await fetchJson(u,{headers:{"User-Agent":"ChooseEverything/3.9"},timeout:7000});
 return Object.values(d?.query?.pages||{});
}
function fandomPageScore(title, meta, query, requireForm=false){
 const n=normalizeText(title),base=normalizeText(meta.baseName),q=normalizeText(query);if(!n)return -999;
 let s=scoreName(title,meta.baseName)+Math.floor(scoreName(title,query)*0.65);
 const baseTokens=base.split(" ").filter(x=>x.length>=4);if(baseTokens.some(t=>n.includes(t)))s+=30;
 if(requireForm){const fs=(meta.formAliases||[]).map(normalizeText).filter(Boolean);if(fs.some(f=>n.includes(f)))s+=45;else if(meta.form&&n.includes(normalizeText(meta.form)))s+=35;}
 for(const bad of ["voice actor","actor","cosplay","live action","real life","stage play"])if(n.includes(bad))s-=200;
 return s;
}
async function fandomBasePage(meta){
 const pages=await fandomSearchPages(meta,meta.baseName);if(!pages.length)return null;
 const ranked=pages.map(p=>({p,score:fandomPageScore(p.title,meta,meta.baseName,false)})).sort((a,b)=>b.score-a.score);
 const top=ranked[0];if(!top||top.score<65)return null;return top.p;
}
async function fandomExactForm(meta){
 if(!meta.form)return null;
 // 1) Search exact form pages inside the CORRECT franchise wiki.
 for(const q of meta.queries||[]){
  const pages=await fandomSearchPages(meta,q);if(!pages.length)continue;
  const ranked=pages.map(p=>({p,score:fandomPageScore(p.title,meta,q,true)})).sort((a,b)=>b.score-a.score);
  const top=ranked[0];
  // Only trust a search-page thumbnail at high confidence.
  if(top&&top.score>=115&&top.p?.thumbnail?.source)return {url:top.p.thumbnail.source,source:"fandom-form-page",confidence:Math.min(100,Math.round(top.score/1.5))};
 }
 // 2) Find the verified character page, inspect its image filenames, and choose one containing the form name/aliases.
 const page=await fandomBasePage(meta);if(!page)return null;
 let cont=null,best=null;
 for(let pass=0;pass<3;pass++){
  const params={action:"query",titles:page.title,prop:"images",imlimit:100,format:"json",origin:"*"};if(cont)params.imcontinue=cont;
  const d=await fetchJson(fandomApi(meta.fandomDomain,params),{headers:{"User-Agent":"ChooseEverything/3.9"},timeout:7000});
  const pg=Object.values(d?.query?.pages||{})[0];
  for(const im of pg?.images||[]){const title=im?.title||"";const n=normalizeText(title);let sc=0;for(const a of meta.formAliases||[]){const x=normalizeText(a);if(x&&n.includes(x))sc+=60;}if(meta.form&&n.includes(normalizeText(meta.form)))sc+=55;const bt=normalizeText(meta.baseName).split(" ").filter(x=>x.length>=4);if(bt.some(t=>n.includes(t)))sc+=20;for(const bad of ["icon","logo","symbol","gameplay","episode","chapter","card back","voice actor"])if(n.includes(bad))sc-=40;if(!best||sc>best.score)best={title,score:sc};}
  cont=d?.continue?.imcontinue;if(!cont)break;
 }
 if(!best||best.score<55)return null;
 const info=await fetchJson(fandomApi(meta.fandomDomain,{action:"query",titles:best.title,prop:"imageinfo",iiprop:"url",iiurlwidth:900,format:"json",origin:"*"}),{headers:{"User-Agent":"ChooseEverything/3.9"},timeout:7000});
 const pg=Object.values(info?.query?.pages||{})[0];const ii=pg?.imageinfo?.[0];const url=ii?.thumburl||ii?.url;
 return url?{url,source:"fandom-form-file",confidence:95}:null;
}
async function fandomPortrait(meta){
 const page=await fandomBasePage(meta);const url=page?.thumbnail?.source;return url?{url,source:"fandom-character",confidence:90}:null;
}
async function wikipediaImage(query){
 // Used ONLY for non-anime categories. Anime is intentionally blocked from generic web/Wikipedia matching.
 try{const u=new URL("https://en.wikipedia.org/w/api.php");u.searchParams.set("action","query");u.searchParams.set("generator","search");u.searchParams.set("gsrsearch",query);u.searchParams.set("gsrlimit","5");u.searchParams.set("prop","pageimages");u.searchParams.set("piprop","thumbnail");u.searchParams.set("pithumbsize","900");u.searchParams.set("format","json");u.searchParams.set("origin","*");const d=await fetchJson(u,{headers:{"User-Agent":"ChooseEverything/3.9"},timeout:6000});const pages=Object.values(d?.query?.pages||{});pages.sort((a,b)=>scoreName(b?.title,query)-scoreName(a?.title,query));return pages.find(x=>x?.thumbnail?.source)?.thumbnail?.source||null;}catch(e){return null;}
}
async function resolveImage(card){
 if(card.image)return {url:card.image,source:"card",confidence:100};
 const key=`${IMAGE_CACHE_VERSION}:${card.id}`;if(imageCache.has(key))return imageCache.get(key);
 let result=null;
 if(card.categoryId==="anime"){
  const meta=animeImageManifest[card.id];
  if(meta?.local){result={url:meta.local,source:"local",confidence:100};}
  if(!result&&meta){
   // IMPORTANT: form cards never use generic Wikipedia. First try to locate the exact form inside that franchise's wiki.
   if(meta.form){
    result=await fandomExactForm(meta);
    // FORM-SPECIFIC CARDS FAIL CLOSED: if the exact transformation cannot be verified,
    // use the named placeholder instead of silently showing the base/wrong form.
   }else{
    if(!result)result=await anilistPortrait(meta);
    if(!result&&meta.fandomDomain)result=await fandomPortrait(meta);
    if(!result)result=await jikanPortrait(meta);
   }
  }
 }else{
  const url=await wikipediaImage(card.query||card.name);if(url)result={url,source:"wikipedia-non-anime",confidence:70};
 }
 imageCache.set(key,result||null);return result;
}
async function imagePayload(card){
 const key=`${IMAGE_CACHE_VERSION}:${card.id}`;if(imageBinaryCache.has(key))return imageBinaryCache.get(key);
 const result=await resolveImage(card);const u=result?.url;
 if(u){
  if(u.startsWith("/")){
   try{const p=path.join(__dirname,"public",u.replace(/^\/+/,""));const buf=await fs.promises.readFile(p);const ext=path.extname(p).toLowerCase();const contentType=ext===".png"?"image/png":ext===".webp"?"image/webp":"image/jpeg";const payload={contentType,buffer:buf,source:result.source,confidence:result.confidence};imageBinaryCache.set(key,payload);return payload;}catch(e){}
  }
  try{const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 ChooseEverything/3.9","Accept":"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"},signal:AbortSignal.timeout(9000)});if(r.ok){const contentType=r.headers.get("content-type")||"image/jpeg";if(!contentType.startsWith("image/"))throw new Error("not image");const buffer=Buffer.from(await r.arrayBuffer());if(buffer.length>800){const payload={contentType,buffer,source:result.source,confidence:result.confidence};imageBinaryCache.set(key,payload);return payload;}}}catch(e){}
 }
 const payload={contentType:"image/svg+xml",buffer:placeholder(card.name),source:"placeholder",confidence:0};imageBinaryCache.set(key,payload);return payload;
}
async function prewarmCardImage(card){if(!card)return;try{await imagePayload(card);}catch(e){}}
app.get("/api/card-image/:id",async(req,res)=>{
 const c=cardMap.get(req.params.id);if(!c)return res.status(404).end();
 // No immutable week-long cache: old bad photos must disappear after an update.
 res.set("Cache-Control","public, max-age=3600");res.set("X-Choose-Image-Version",IMAGE_CACHE_VERSION);
 const payload=await imagePayload(c);res.set("X-Choose-Image-Source",payload.source||"unknown");res.set("X-Choose-Image-Confidence",String(payload.confidence??0));res.type(payload.contentType).send(payload.buffer);
});
app.get("/api/image-debug/:id",async(req,res)=>{const c=cardMap.get(req.params.id);if(!c)return res.status(404).json({ok:false});const meta=animeImageManifest[c.id]||null;const result=await resolveImage(c);res.json({ok:true,imageVersion:IMAGE_CACHE_VERSION,card:{id:c.id,name:c.name,categoryId:c.categoryId},meta,result:result?{source:result.source,confidence:result.confidence,url:result.url}:null});});
app.get("/api/catalog",(req,res)=>res.json(categories.map(c=>({id:c.id,name:c.name,icon:c.icon,count:c.cards.length}))));
app.get("/api/health",(req,res)=>{
 const providers=aiProviders();
 res.json({
  ok:true,
  cards:allCards.length,
  categories:categories.length,
  animeImageMappings:Object.keys(animeImageManifest).length,
  ai:providers.length>0,
  aiProvider:providers[0]?.id||"none",
  aiModel:providers[0]?.model||null,
  aiFallbackAvailable:providers.length>1,
  aiFallbackProvider:providers[1]?.id||null,
  judgeVersion:"4.6-groq-openrouter-fallback",
  canonLocks:canonLocks.length,
  imageVersion:IMAGE_CACHE_VERSION,
  strictAnimeMappings:Object.keys(animeImageManifest).length
 });
});


function clearLobbyTeams(room){
 for(const p of room.players)p.teamId=null;
 room.teams=[];
}
function randomizeLobbyTeams(room){
 clearLobbyTeams(room);
 const m=modeInfo(room);
 if(m.teamSize<=1)return;
 const ids=shuffle(room.players.map(p=>p.id));
 for(let i=0;i<m.teams;i++){
  const slice=ids.slice(i*m.teamSize,(i+1)*m.teamSize);
  for(const id of slice){
   const p=player(room,id);
   if(p)p.teamId=`T${i+1}`;
  }
 }
}
function lobbyTeamsReady(room){
 const m=modeInfo(room);
 if(m.teamSize<=1)return true;
 const counts={};
 for(let i=1;i<=m.teams;i++)counts[`T${i}`]=0;
 for(const p of room.players){
  if(!counts.hasOwnProperty(p.teamId||""))return false;
  counts[p.teamId]++;
 }
 return Object.values(counts).every(v=>v===m.teamSize);
}

function assignTeams(room){
 const m=modeInfo(room);
 room.teams=[];
 if(m.teamSize===1){
  const ids=shuffle(room.players.map(p=>p.id));
  ids.forEach((id,i)=>room.teams.push({id:`T${i+1}`,name:`Time ${i+1}`,memberIds:[id]}));
  for(const t of room.teams)for(const id of t.memberIds){const p=player(room,id);if(p)p.teamId=t.id;}
  return;
 }
 if(!lobbyTeamsReady(room))randomizeLobbyTeams(room);
 for(let i=0;i<m.teams;i++){
  const tid=`T${i+1}`;
  room.teams.push({id:tid,name:`Time ${i+1}`,memberIds:room.players.filter(p=>p.teamId===tid).map(p=>p.id)});
 }
 for(const t of room.teams)for(const id of t.memberIds){const p=player(room,id);if(p)p.teamId=t.id;}
}
function buildDeck(room){let pool;if(room.settings.categoryId==="mixed")pool=allCards;else pool=(categories.find(c=>c.id===room.settings.categoryId)?.cards||allCards);return shuffle(pool);}
function activeForAuction(room,p){return !room.passed.has(p.id);}
function everyoneDone(room){
 const bidder=room.highBidderId;
 return room.players.every(p=>room.passed.has(p.id)||p.id===bidder);
}
async function beginAuction(room){
 if(room.round>=room.settings.rounds||room.deckIndex>=room.deck.length){return beginJudging(room);}
 room.phase="loadingCard";room.currentCard=room.deck[room.deckIndex++];room.highBid=0;room.highBidderId=null;room.lastWinner=null;room.passed=new Set();room.auctionEndsAt=null;emitRoom(room);
 await prewarmCardImage(room.currentCard);
 if(room.phase!=="loadingCard")return;
 room.phase="auction";room.round++;room.auctionEndsAt=Date.now()+AUCTION_SECONDS*1000;emitRoom(room);sound(room,"round");scheduleEnd(room);
 // Enquanto a rodada atual acontece, prepara a próxima foto em segundo plano.
 prewarmCardImage(room.deck[room.deckIndex]);
}
function resetAuctionClock(room){room.auctionEndsAt=Date.now()+BID_RESET_SECONDS*1000;scheduleEnd(room);}
function scheduleEnd(room){if(room.auctionTimer)clearTimeout(room.auctionTimer);room.auctionTimer=setTimeout(()=>finishAuction(room),Math.max(50,room.auctionEndsAt-Date.now()));}
function finishAuction(room){
 if(room.phase!=="auction")return;const w=player(room,room.highBidderId);if(w&&room.highBid>0){w.cash-=room.highBid;w.inventory.push({...room.currentCard,paid:room.highBid});room.lastWinner={id:w.id,name:w.name,bid:room.highBid,card:room.currentCard};}else room.lastWinner={id:null,name:"Ninguém",bid:0,card:room.currentCard};
 room.phase="between";room.auctionEndsAt=null;emitRoom(room);sound(room,w?"win":"miss");room.nextTimer=setTimeout(()=>beginAuction(room),BETWEEN_SECONDS*1000);
}
function teamRoster(room,t){return t.memberIds.flatMap(id=>{const p=player(room,id);return (p?.inventory||[]).map(c=>({id:c.id,owner:p.name,name:c.name,category:c.categoryName,paid:c.paid}));});}
function normalizeRanking(room, proposed, winnerTeamId){
 const valid=new Set(room.teams.map(t=>t.id));
 const out=[];
 const add=id=>{if(valid.has(id)&&!out.includes(id))out.push(id);};
 if(Array.isArray(proposed))for(const id of proposed)add(String(id));
 if(winnerTeamId){const w=String(winnerTeamId);if(valid.has(w)){const i=out.indexOf(w);if(i>=0)out.splice(i,1);out.unshift(w);}}
 for(const t of room.teams)add(t.id);
 return out.slice(0,room.teams.length);
}

// Provider configuration is server-only. API keys must never be sent to the browser.
// Groq is preferred; OpenRouter is the automatic fallback on timeouts, 429s,
// provider outages, missing keys, malformed JSON or incomplete final results.
// Old GEMINI_API_KEY values are intentionally ignored in this version.
function aiProviders(){
 const providers=[];
 if(process.env.GROQ_API_KEY){
  providers.push({id:"groq",label:"Groq",model:process.env.GROQ_MODEL||"openai/gpt-oss-120b"});
 }
 if(process.env.OPENROUTER_API_KEY){
  providers.push({id:"openrouter",label:"OpenRouter",model:process.env.OPENROUTER_MODEL||"nvidia/nemotron-3-ultra-550b-a55b:free"});
 }
 return providers;
}
function makeAIClient(provider,timeout){
 const OpenAI=require("openai");
 if(provider.id==="groq"){
  return new OpenAI({
   apiKey:process.env.GROQ_API_KEY,
   baseURL:"https://api.groq.com/openai/v1",
   timeout,
   maxRetries:0
  });
 }
 const headers={"X-Title":"Choose Everything!"};
 if(process.env.RAILWAY_PUBLIC_DOMAIN)headers["HTTP-Referer"]=`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
 return new OpenAI({
  apiKey:process.env.OPENROUTER_API_KEY,
  baseURL:"https://openrouter.ai/api/v1",
  defaultHeaders:headers,
  timeout,
  maxRetries:0
 });
}
// Only add Groq-specific parameters to the GPT-OSS models, which support them.
function groqModelOptions(provider,stage){
 if(provider.id!=="groq")return {};
 if(!/^openai\/gpt-oss-(120b|20b)$/.test(provider.model))return {};
 return {
  reasoning_effort:stage==="judge"?"medium":"low",
  include_reasoning:false
 };
}
function providerTimeout(provider,stage){
 return provider.id==="groq"?(stage==="judge"?30000:22000):(stage==="judge"?65000:40000);
}
function aiErrorMessage(error){
 const status=Number(error?.status||0);
 if(status===429)return "limite de requisições atingido (429)";
 if(status===401||status===403)return "chave de API inválida ou sem permissão";
 if(status===404)return "modelo não encontrado ou indisponível";
 if(status>=500)return `servidor da IA indisponível (${status})`;
 if(/timeout|timed out|abort/i.test(String(error?.message||"")))return "tempo de resposta excedido";
 return String(error?.message||"falha na IA").slice(0,120);
}
function modelResponseText(content){
 return typeof content==="string"?content:
  Array.isArray(content)?content.map(x=>typeof x==="string"?x:(x?.text||"")).join(""):"";
}
async function aiJudge(room,runId){
 const providers=aiProviders();
 if(!providers.length)throw new Error("Configure GROQ_API_KEY ou OPENROUTER_API_KEY no Railway.");
 const teams=room.teams.map(t=>({
  id:t.id,
  name:t.name,
  members:t.memberIds.map(id=>player(room,id)?.name),
  roster:teamRoster(room,t).map(c=>({
   id:c.id,
   owner:c.owner,
   name:c.name,
   category:c.category
  }))
 }));

 const prompt=`Você é o ÚNICO juiz de força do jogo "Choose Everything!".
Responda APENAS com JSON válido, sem markdown, sem texto fora do JSON.

IMPORTANTE:
- O resultado, o ranking e TODOS os Powers devem ser decididos por você.
- NÃO existe tabela numérica pré-definida.
- NÃO use preço pago, score escondido, popularidade ou raridade.
- Avalie SOMENTE a força/capacidade real da versão do personagem indicada na carta, com base no material canônico/oficial.

MODO: ${room.settings.mode}
CATEGORIA: ${room.settings.categoryId}

REGRAS PARA PERSONAGENS/FICÇÃO:
1. Se a carta especifica uma forma, transformação, estado ou versão, use EXATAMENTE essa versão.
   Exemplos: Ultra Instinct, Ultra Ego, Gear 5, Beast, GER, Tusk Act 4, Post-Rose, TYBW, Devil Union, Ultimate Madoka.
2. Se a carta contém apenas o nome do personagem, use a versão canônica mais forte já alcançada na obra principal oficial.
3. Não use fanfic, composite de fã, memes ou NLF.
4. Uma versão oficial/licenciada explicitamente escrita na carta pode ser usada exatamente como nomeada.
5. Para determinar força, considere em conjunto:
   - attack potency / poder destrutivo
   - velocidade e reação
   - durabilidade
   - resistência e stamina
   - regeneração / ressurreição / imortalidade
   - alcance
   - inteligência e experiência
   - hax
   - alma
   - espaço
   - tempo
   - causalidade
   - destino
   - realidade
   - conceitos
   - existência
   - resistências e imunidades
   - condições de vitória
   - counters
6. Hax pode superar força física. Não trate AP bruto como único critério.
7. Não assuma que uma habilidade funciona sem limite. Respeite feats e resistências canônicas.
8. Em batalhas de equipe, analise sinergia, suporte, counters e condições de vitória do grupo.
9. Se o confronto for debatível, escolha o lado mais provável e reduza confidence.
10. Ranqueie TODOS os times do mais forte ao mais fraco, sem empates.

POWER ABSOLUTO:
11. Dê a CADA carta um Power inteiro de 1 a 10000.
12. O Power é ABSOLUTO: o mesmo personagem/forma deve ficar aproximadamente no mesmo nível independentemente de quem caiu contra ele.
13. O Power representa a ameaça geral de combate, não apenas força física.
14. NÃO amontoe personagens de escalas totalmente diferentes em números próximos.
15. Primeiro determine mentalmente o tier cosmológico/geral do personagem e suas principais condições de vitória; só depois converta para o número.
16. Use a escala abaixo apenas como régua global:
   - 1–999: humano/super-humano/ameaça local
   - 1000–2499: cidade/montanha
   - 2500–3999: país/continente
   - 4000–5499: planetário
   - 5500–6999: estelar/sistema solar
   - 7000–8199: galáctico/multi-galáctico
   - 8200–8999: universal
   - 9000–9499: multiversal
   - 9500–9799: multiversal extremo / higher-dimensional / hax equivalente
   - 9800–10000: topo excepcional, reservado a pouquíssimos personagens
17. Hax pode colocar alguém acima do tier destrutivo aparente quando ele oferece condições de vitória reais contra seres muito superiores fisicamente.
18. Não dê Power parecido só porque dois personagens são protagonistas ou famosos.

VALIDAÇÃO:
19. O objeto "powers" DEVE conter exatamente um valor para CADA ID de carta recebido abaixo.
20. Todos os Powers devem ser inteiros entre 1 e 10000.
21. O ranking deve conter todos os IDs de time exatamente uma vez.
22. winnerTeamId deve ser o primeiro ID do ranking.

Para categorias que NÃO são combate/fantasia, interprete "força" como desempenho/qualidade geral relevante daquela categoria, mas ainda gere Power de 1 a 10000.

TIMES:
${JSON.stringify(teams)}

FORMATO EXATO:
{"winnerTeamId":"T1","ranking":["T1","T2"],"confidence":0.85,"summary":"explicação curta e específica","reasons":["motivo 1","motivo 2","motivo 3"],"powers":{"id-da-carta-1":8500,"id-da-carta-2":4300}}`;

 const errors=[];
 for(const provider of providers){
  if(room.phase!=="judging"||room.judgeRunId!==runId)throw new Error("Análise interrompida: sala alterada.");
  io.to(room.code).emit("judgeLiveStatus",{runId,message:`${provider.label} (${provider.model}) calculando o ranking e os Powers...`});
  const abortController=new AbortController();
  const timeout=providerTimeout(provider,"judge");
  const abortTimer=setTimeout(()=>abortController.abort(),timeout);
  try{
   const client=makeAIClient(provider,timeout);
   const resp=await client.chat.completions.create({
    model:provider.model,
    messages:[
     {role:"system",content:"Você é um juiz de powerscaling. Siga rigorosamente as regras do usuário e responda somente com JSON válido."},
     {role:"user",content:prompt}
    ],
    temperature:0.15,
    max_tokens:provider.id==="groq"?4000:6000,
    ...(provider.id==="groq"?{response_format:{type:"json_object"}}:{}),
    ...groqModelOptions(provider,"judge")
   },{signal:abortController.signal});
   const txt=modelResponseText(resp?.choices?.[0]?.message?.content);
   const a=txt.indexOf("{"),b=txt.lastIndexOf("}");
   if(a<0||b<a)throw new Error("A IA não retornou JSON.");
   const out=JSON.parse(txt.slice(a,b+1));
   if(!room.teams.some(t=>t.id===String(out.winnerTeamId)))throw new Error("winnerTeamId inválido.");
   const ranking=normalizeRanking(room,out.ranking,out.winnerTeamId);
   if(ranking.length!==room.teams.length)throw new Error("Ranking incompleto.");
   const expectedCards=room.players.flatMap(p=>p.inventory);
   const powers={};
   for(const c of expectedCards){
    const v=Number(out?.powers?.[c.id]);
    if(!Number.isFinite(v))throw new Error(`Power ausente para ${c.name}.`);
    powers[c.id]=Math.max(1,Math.min(10000,Math.round(v)));
   }
   return {
    source:provider.id,
    model:provider.model,
    winnerTeamId:ranking[0],
    ranking,
    confidence:Math.max(0,Math.min(1,Number(out.confidence)||0.7)),
    summary:String(out.summary||""),
    reasons:Array.isArray(out.reasons)?out.reasons.slice(0,6).map(String):[],
    powers
   };
  }catch(e){
   const message=aiErrorMessage(e);
   console.warn(`[AI ${provider.id}] julgamento falhou: ${message}`);
   errors.push(`${provider.label}: ${message}`);
   const index=providers.indexOf(provider);
   if(index<providers.length-1){
    io.to(room.code).emit("judgeLiveStatus",{runId,message:`${provider.label} indisponível (${message}). Mudando automaticamente para ${providers[index+1].label}...`});
   }
  }finally{
   clearTimeout(abortTimer);
  }
 }
 throw new Error("Nenhuma IA conseguiu concluir o julgamento. "+errors.join(" | "));
}

// Derive the character pairings WITHOUT predicting a result; the LLM supplies every narrated outcome.
function liveMatchups(room){
 const teams=room.teams.map(t=>({team:t,roster:teamRoster(room,t)})).filter(x=>x.roster.length);
 const pairs=[];
 for(let x=0;x<teams.length;x++)for(let y=x+1;y<teams.length;y++){
  const a=teams[x],b=teams[y],count=Math.min(3,Math.max(a.roster.length,b.roster.length));
  for(let i=0;i<count;i++){
   const ca=a.roster[i%a.roster.length],cb=b.roster[i%b.roster.length];
   if(pairs.some(p=>p.a.id===ca.id&&p.b.id===cb.id))continue;
   pairs.push({a:{...ca,teamName:a.team.name,teamId:a.team.id},b:{...cb,teamName:b.team.name,teamId:b.team.id}});
  }
 }
 return pairs.slice(0,6);
}
async function aiLiveNarration(room,runId){
 const providers=aiProviders();
 if(!providers.length)throw new Error("Configure GROQ_API_KEY ou OPENROUTER_API_KEY primeiro.");
 const duels=liveMatchups(room);
 io.to(room.code).emit("judgeLiveStart",{runId,duels});
 if(!duels.length){io.to(room.code).emit("judgeLiveStatus",{runId,message:"Não há cartas adversárias suficientes para narrar um 1v1."});return;}
 const roster=room.teams.map(t=>({team:t.name,roster:teamRoster(room,t).map(c=>c.name)}));
 const prompt=`Crie um RELATO FICCIONAL E PÚBLICO DE BATALHAS 1v1 para o jogo Choose Everything!.
 Não descreva seu raciocínio interno, seus pensamentos privados ou cadeia de pensamento; entregue APENAS a narração final da luta, pronta para mostrar aos jogadores.
 Escreva somente em PORTUGUÊS brasileiro, de forma empolgante, mas baseada nas habilidades CANÔNICAS/OFICIAIS das personagens e na versão exata citada na carta.
 Cada duelo deve ter um parágrafo de 50 a 85 palavras explicando: abertura do combate, golpes/habilidades específicas, reação/resistência/counter, resultado provável e causa do desfecho. Não invente poderes canônicos.
 Respeite rigorosamente os seguintes PARES já escolhidos; não troque personagens. Os pares são 1v1 ilustrativos do confronto maior. O resultado FINAL por equipes será calculado à parte.
 Mantenha este padrão, com um título separado para cada luta:
 CONFRONTO 1 — Nome A vs Nome B
 narrativa...
 CONFRONTO 2 — ...
 Sem texto antes do primeiro título e sem JSON.
 PARES: ${JSON.stringify(duels.map((d,i)=>({numero:i+1,a:d.a.name,b:d.b.name,owners:[d.a.owner,d.b.owner]})))}
 COMPOSIÇÃO COMPLETA DAS EQUIPES (contexto): ${JSON.stringify(roster)}
 Se a categoria não envolve combate literal, narre uma comparação de desempenho em vez de violência.`;
 let errors=[];
 for(let i=0;i<providers.length;i++){
  const provider=providers[i];
  if(room.phase!=="judging"||room.judgeRunId!==runId)return;
  // A partial stream from a failed model must not mix with the next model's text.
  if(i>0)io.to(room.code).emit("judgeLiveReset",{runId});
  io.to(room.code).emit("judgeLiveStatus",{runId,message:`${provider.label} (${provider.model}) narrando confrontos 1v1 ao vivo...`});
  let all="",queue="",lastEmit=Date.now();
  let stream;
  const abortController=new AbortController();
  const timeout=providerTimeout(provider,"narration");
  const abortTimer=setTimeout(()=>abortController.abort(),timeout);
  const flush=()=>{if(queue){io.to(room.code).emit("judgeLiveDelta",{runId,text:queue});queue="";lastEmit=Date.now();}};
  try{
   const client=makeAIClient(provider,timeout);
   stream=await client.chat.completions.create({
    model:provider.model,stream:true,
    messages:[{role:"system",content:"Produza a narração fictícia final, nunca pensamentos privados. Texto público em português."},{role:"user",content:prompt}],
    temperature:0.5,max_tokens:provider.id==="groq"?1750:1900,
    ...groqModelOptions(provider,"narration")
   },{signal:abortController.signal});
   for await(const chunk of stream){
    if(room.phase!=="judging"||room.judgeRunId!==runId)return;
    const txt=modelResponseText(chunk?.choices?.[0]?.delta?.content);
    if(!txt)continue;
    const allowed=txt.slice(0,Math.max(0,18000-all.length));
    all+=allowed;queue+=allowed;
    if(queue.length>=140||Date.now()-lastEmit>120||allowed.includes("\n"))flush();
    if(all.length>=18000)break;
   }
   flush();
   if(!all.trim())throw new Error("A IA não retornou texto para a narração.");
   io.to(room.code).emit("judgeLiveStatus",{runId,message:`Narração feita por ${provider.label}. Agora será calculado o ranking e os Powers finais...`});
   return;
  }catch(e){
   flush();
   const message=aiErrorMessage(e);
   errors.push(`${provider.label}: ${message}`);
   console.warn(`[AI ${provider.id}] narração falhou: ${message}`);
   if(i<providers.length-1){
    io.to(room.code).emit("judgeLiveStatus",{runId,message:`Narração por ${provider.label} falhou (${message}). Tentando ${providers[i+1].label} automaticamente...`});
   }
  }finally{
   clearTimeout(abortTimer);
   if(stream?.controller?.abort){try{stream.controller.abort();}catch(_){}}
  }
 }
 throw new Error("Narração indisponível: "+errors.join(" | "));
}

async function beginJudging(room){
 const runId=(room.judgeRunId||0)+1;
 room.judgeRunId=runId;
 room.phase="judging";
 room.currentCard=null;
 room.judge=null;
 room.finalPowers=null;
 room.judgeError=null;
 room.judgingStartedAt=Date.now();
 emitRoom(room);
 sound(room,"judge");
 try{
  const narrate=aiLiveNarration(room,runId);
  try{
   await Promise.race([narrate,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Narração excedeu o tempo limite.")),NARRATION_TIMEOUT_MS))]);
  }catch(e){
   // A failing free-tier stream does not prevent the real final judge from judging.
   console.warn("Narração indisponível:",e.message);
   io.to(room.code).emit("judgeLiveStatus",{runId,message:`Narração ao vivo indisponível (${String(e.message).slice(0,90)}). A IA está preparando o veredito final.`});
  }
  if(room.phase!=="judging"||room.judgeRunId!==runId)return;
  io.to(room.code).emit("judgeLiveStatus",{runId,message:"IA julgando todos os times, personagens, poderes e condições de vitória..."});
  const result=await Promise.race([
   aiJudge(room,runId),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error("A IA demorou demais para responder. Tente novamente ou troque o modelo.")),AI_TIMEOUT_MS))
  ]);
  if(room.phase!=="judging"||room.judgeRunId!==runId)return;
  room.judge=result;
  room.finalPowers=result.powers;
  room.phase="results";
  emitRoom(room);
  sound(room,"final");
 }catch(e){
  if(room.phase!=="judging"||room.judgeRunId!==runId)return;
  room.judge=null;
  room.finalPowers=null;
  room.judgeError=String(e?.message||"Falha desconhecida da IA.");
  room.phase="judgingError";
  emitRoom(room);
 }
}

io.on("connection",socket=>{
 socket.emit("catalog",categories.map(c=>({id:c.id,name:c.name,icon:c.icon,count:c.cards.length})));
 socket.on("createRoom",({name},cb)=>{if(getRoom(socket))return cb?.({ok:false,error:"Você já está em uma sala."});let c;do{c=code();}while(rooms.has(c));const room={code:c,hostId:socket.id,phase:"lobby",settings:{categoryId:"anime",rounds:12,startingCash:100,mode:"1v1"},round:0,players:[{id:socket.id,name:sanitizeName(name),cash:100,inventory:[],teamId:null}],teams:[],deck:[],deckIndex:0,currentCard:null,highBid:0,highBidderId:null,passed:new Set(),lastWinner:null,judge:null,finalPowers:null,judgeError:null,judgingStartedAt:null};rooms.set(c,room);socket.join(c);socket.data.roomCode=c;cb?.({ok:true,code:c});emitRoom(room);});
 socket.on("joinRoom",({name,code:raw},cb)=>{if(getRoom(socket))return cb?.({ok:false,error:"Você já está em uma sala."});const c=String(raw||"").toUpperCase().trim(),room=rooms.get(c);if(!room)return cb?.({ok:false,error:"Sala não encontrada."});if(room.phase!=="lobby")return cb?.({ok:false,error:"A partida já começou."});if(room.players.length>=6)return cb?.({ok:false,error:"Sala cheia (máximo 6)."});room.players.push({id:socket.id,name:sanitizeName(name),cash:room.settings.startingCash,inventory:[],teamId:null});socket.join(c);socket.data.roomCode=c;cb?.({ok:true,code:c});emitRoom(room);});
 socket.on("retryJudge",()=>{
  const room=getRoom(socket);
  if(!room||room.hostId!==socket.id||room.phase!=="judgingError")return;
  beginJudging(room);
 });
 socket.on("deleteRoom",async()=>{const room=getRoom(socket);if(!room||room.hostId!==socket.id||room.phase!=="lobby")return socket.emit("toast","Somente o host pode excluir a sala no lobby.");clearTimers(room);const roomCode=room.code;io.to(roomCode).emit("roomDeleted",{message:"A sala foi excluída pelo host."});rooms.delete(roomCode);try{const members=await io.in(roomCode).fetchSockets();for(const s of members){s.data.roomCode=null;s.leave(roomCode);}}catch(e){};});
 socket.on("settings",data=>{
 const room=getRoom(socket);
 if(!room||room.hostId!==socket.id||room.phase!=="lobby")return;
 const prevMode=room.settings.mode;
 const m=MODES[data?.mode]?data.mode:room.settings.mode;
 const cat=(data?.categoryId==="mixed"||categories.some(c=>c.id===data?.categoryId))?data.categoryId:room.settings.categoryId;
 const rounds=Math.floor(Number(data?.rounds));
 const startingCash=Math.floor(Number(data?.startingCash));
 room.settings={mode:m,categoryId:cat,rounds:Number.isFinite(rounds)?Math.max(1,Math.min(500,rounds)):12,startingCash:Number.isFinite(startingCash)?Math.max(1,Math.min(1000000000,startingCash)):100};
 room.players.forEach(p=>p.cash=room.settings.startingCash);
 if(prevMode!==m)clearLobbyTeams(room);
 emitRoom(room);
});
 
socket.on("setLobbyTeam",({playerId,teamId})=>{
 const room=getRoom(socket);
 if(!room||room.hostId!==socket.id||room.phase!=="lobby")return;
 const mode=modeInfo(room);
 if(mode.teamSize<=1)return;
 const p=player(room,playerId);
 if(!p)return;
 const allowed=new Set(Array.from({length:mode.teams},(_,i)=>`T${i+1}`));
 p.teamId=allowed.has(teamId)?teamId:null;
 emitRoom(room);
});
socket.on("randomizeLobbyTeams",()=>{
 const room=getRoom(socket);
 if(!room||room.hostId!==socket.id||room.phase!=="lobby")return;
 const mode=modeInfo(room);
 if(mode.teamSize<=1)return;
 randomizeLobbyTeams(room);
 emitRoom(room);
});
socket.on("startGame",()=>{const room=getRoom(socket);if(!room||room.hostId!==socket.id||room.phase!=="lobby")return;const mode=modeInfo(room);const need=mode.players;if(room.players.length!==need)return socket.emit("toast",`O modo ${room.settings.mode} precisa de exatamente ${need} jogadores. Agora há ${room.players.length}.`);if(mode.teamSize>1&&!lobbyTeamsReady(room))return socket.emit("toast",`Escolha os times primeiro. Cada Time precisa ter ${mode.teamSize} jogador(es).`);clearTimers(room);assignTeams(room);room.players.forEach(p=>{p.cash=room.settings.startingCash;p.inventory=[];});room.deck=buildDeck(room);room.deckIndex=0;room.round=0;room.judge=null;room.finalPowers=null;room.judgeError=null;room.judgingStartedAt=null;beginAuction(room);});
 socket.on("bid",({amount})=>{const room=getRoom(socket);if(!room||room.phase!=="auction")return;const p=player(room,socket.id);if(!p||room.passed.has(p.id))return socket.emit("toast","Você passou este item.");amount=Math.floor(Number(amount));if(!Number.isFinite(amount))return;const min=room.highBid+1;if(amount<min)return socket.emit("toast",`Lance mínimo: ${min}.`);if(amount>p.cash)return socket.emit("toast","Moedas insuficientes.");room.highBid=amount;room.highBidderId=p.id;resetAuctionClock(room);emitRoom(room);sound(room,"bid");if(everyoneDone(room)){clearTimeout(room.auctionTimer);setTimeout(()=>finishAuction(room),500);}});
 socket.on("cover",()=>{const room=getRoom(socket);if(!room||room.phase!=="auction")return;const p=player(room,socket.id);if(!p||room.passed.has(p.id))return;if(room.highBidderId===p.id)return socket.emit("toast","Você já tem o maior lance.");const amount=room.highBid+1;if(amount>p.cash)return socket.emit("toast","Você não tem moedas para cobrir.");room.highBid=amount;room.highBidderId=p.id;resetAuctionClock(room);emitRoom(room);sound(room,"bid");if(everyoneDone(room)){clearTimeout(room.auctionTimer);setTimeout(()=>finishAuction(room),500);}});
 socket.on("pass",()=>{const room=getRoom(socket);if(!room||room.phase!=="auction")return;if(room.highBidderId===socket.id)return socket.emit("toast","Você está com o maior lance e não pode retirar esse lance.");room.passed.add(socket.id);emitRoom(room);sound(room,"pass");if(everyoneDone(room)){clearTimeout(room.auctionTimer);setTimeout(()=>finishAuction(room),500);}});
 socket.on("backToLobby",()=>{const room=getRoom(socket);if(!room||room.hostId!==socket.id||room.phase!=="results")return;clearTimers(room);room.phase="lobby";room.round=0;room.currentCard=null;room.judge=null;room.teams=[];room.players.forEach(p=>{p.cash=room.settings.startingCash;p.inventory=[];p.teamId=null;});emitRoom(room);});
 socket.on("disconnect",()=>{const room=getRoom(socket);if(!room)return;room.passed.delete(socket.id);room.players=room.players.filter(p=>p.id!==socket.id);if(!room.players.length){clearTimers(room);rooms.delete(room.code);return;}if(room.hostId===socket.id)room.hostId=room.players[0].id;if(room.highBidderId===socket.id){room.highBid=0;room.highBidderId=null;}emitRoom(room);});
});

const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log(`Choose Everything V4.4 em http://localhost:${PORT} | ${allCards.length} cartas`));
