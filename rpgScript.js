
/* === Unified Backend Setup === */
const PLAYER_ID = "player123";
const BASE_URL = "https://rpg-storage-server.onrender.com/players";

/* === Base Stats === */
const PLAYER_MAX_HP = 200;
const PLAYER_BASE_MP = 50;
const MAX_MP = PLAYER_BASE_MP;
const SPECIAL_COST = 30;
const HEAL_COST = 20;
const HEAL_HP = 20;

/* === Game State === */
let attackUpgrade = 0;
let specialUpgrade = 0;

let gameState = {
  scores: { player: 0, enemy: 0, score: 0 },
  player: { hp: PLAYER_MAX_HP, mp: PLAYER_BASE_MP },
  enemy: { hp: 200, mp: 50, maxHP: 200, maxMP: 50, iq: 0 },
  wallet: { tokens: 1000 },
  upgrades: { attack: attackUpgrade, special: specialUpgrade },
  roundOver: false
};

/* === Load/Save from backend === */
async function loadPlayerData(){
  try{
    const res = await fetch(`${BASE_URL}/${PLAYER_ID}`);
    const data = await res.json();

    gameState.wallet.tokens = data.tokens ?? 1000;
    gameState.player.hp = data.hp ?? PLAYER_MAX_HP;
    gameState.player.mp = data.mp ?? PLAYER_BASE_MP;
    gameState.enemy.hp = data.enemyHp ?? 200;
    gameState.enemy.mp = data.enemyMp ?? 50;
    gameState.enemy.maxHP = data.enemyMaxHP ?? 200;
    gameState.enemy.maxMP = data.enemyMaxMP ?? 50;
    gameState.enemy.iq = data.enemyIQ ?? 0;

    attackUpgrade = data.attackUpgrade ?? 0;
    specialUpgrade = data.specialUpgrade ?? 0;
    applyUpgrades();
    updateScoreboard();
    updateBars();
  } catch(err){ console.error("Error loading player data:", err); }
}

async function savePlayerData(){
  try{
    const payload = {
      tokens: gameState.wallet.tokens,
      hp: gameState.player.hp,
      mp: gameState.player.mp,
      attackUpgrade,
      specialUpgrade,
      enemyHp: gameState.enemy.hp,
      enemyMp: gameState.enemy.mp,
      enemyMaxHP: gameState.enemy.maxHP,
      enemyMaxMP: gameState.enemy.maxMP,
      enemyIQ: gameState.enemy.iq
    };
    await fetch(`${BASE_URL}/${PLAYER_ID}`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
  } catch(err){ console.error("Error saving player data:", err); }
}

/* === Utilities === */
const clamp = (v, lo, hi)=>Math.max(lo,Math.min(hi,v));
const randInt=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const log=t=>{const p=document.createElement("p");p.innerText=t;battleLog.appendChild(p);battleLog.scrollTop=battleLog.scrollHeight;};
function showAlert(msg){const box=document.getElementById("alertBox");box.textContent=msg;box.classList.add("show");setTimeout(()=>box.classList.remove("show"),1500);}
function applyUpgrades(){gameState.upgrades.attack=attackUpgrade;gameState.upgrades.special=specialUpgrade;}

/* === Bars & Scoreboard Updates === */
function updateBars(){
  playerHealthBar.style.width = (gameState.player.hp/PLAYER_MAX_HP*100)+'%';
  playerManaBar.style.width = (gameState.player.mp/MAX_MP*100)+'%';
  enemyHealthBar.style.width = (gameState.enemy.hp/gameState.enemy.maxHP*100)+'%';
  enemyManaBar.style.width = (gameState.enemy.mp/gameState.enemy.maxMP*100)+'%';
  enemyIntelligenceBar.style.width = Math.min(gameState.enemy.iq,100)+'%';
  playerHealthText.innerText = `${gameState.player.hp}/${PLAYER_MAX_HP}`;
  playerManaText.innerText = `${gameState.player.mp}/${MAX_MP}`;
  enemyHealthText.innerText = `${gameState.enemy.hp}/${gameState.enemy.maxHP}`;
  enemyManaText.innerText = `${gameState.enemy.mp}/${gameState.enemy.maxMP}`;
  enemyIntelligenceText.innerText = `IQ ${gameState.enemy.iq.toFixed(1)}`;
}

function updateScoreboard(){
  playerWins.innerText = gameState.scores.player;
  enemyWins.innerText = gameState.scores.enemy;
  score.innerText = gameState.scores.score;
  aiIQ.innerText = gameState.enemy.iq.toFixed(1);
  walletBalance.innerText = gameState.wallet.tokens;
}

/* === Enemy Scaling === */
function increaseEnemyStatsPerWin(){
  gameState.enemy.iq = +(gameState.enemy.iq+1.5).toFixed(1);
  gameState.enemy.maxHP += 100;
  gameState.enemy.maxMP += 20;
  gameState.enemy.hp = gameState.enemy.maxHP;
  gameState.enemy.mp = gameState.enemy.maxMP;
}

/* === Player Actions === */
let aiInterval=null, aiActive=false, regenInterval=null;

function playerAction(act){
  if(gameState.roundOver) return;
  if(!aiActive){ aiActive=true; startAI(); log("AI engages after your first move!"); }
  if(act==='Attack'){
    const dmg=Math.floor(randInt(12,28)*(1+attackUpgrade/100));
    gameState.enemy.hp=clamp(gameState.enemy.hp-dmg,0,gameState.enemy.maxHP);
    showAlert(`You attacked for ${dmg}!`);
    log(`Player attacks → ${dmg} dmg.`);
  } else if(act==='Defend'){ showAlert("You defend!"); log("Player defends."); }
  else if(act==='Special'){
    if(gameState.player.mp<SPECIAL_COST){ showAlert('Not enough mana.'); return; }
    gameState.player.mp -= SPECIAL_COST;
    const dmg=Math.floor(randInt(30,50)*Math.pow(2,specialUpgrade||0));
    gameState.enemy.hp=clamp(gameState.enemy.hp-dmg,0,gameState.enemy.maxHP);
    showAlert(`You used Special → ${dmg}!`);
    log(`Player Special → ${dmg} dmg.`);
  } else if(act==='Heal'){
    if(gameState.player.hp>=PLAYER_MAX_HP){ showAlert('HP full.'); return; }
    if(gameState.player.mp<HEAL_COST){ showAlert('Not enough mana.'); return; }
    const heal=Math.min(HEAL_HP,PLAYER_MAX_HP-gameState.player.hp);
    gameState.player.mp -= HEAL_COST;
    gameState.player.hp = clamp(gameState.player.hp+heal,0,PLAYER_MAX_HP);
    showAlert(`Healed +${heal} HP (-${HEAL_COST} MP).`);
    log(`Player heals +${heal} HP.`);
  }
  updateBars(); checkEnd(); savePlayerData();
}

/* === Enemy AI === */
function decideAction(){const r=Math.random();if(r<0.5)return 'Attack';if(r<0.65)return 'Defend';if(r<0.85)return 'Heal';return 'Special';}
function enemyAction(){
  if(!aiActive||gameState.player.hp<=0||gameState.enemy.hp<=0||gameState.roundOver)return;
  const act=decideAction();
  if(act==='Attack'){let dmg=randInt(18,35);gameState.player.hp=clamp(gameState.player.hp-dmg,0,PLAYER_MAX_HP);showAlert(`Enemy attacks ${dmg}!`);log(`Enemy attacks → ${dmg} dmg.`);}
  else if(act==='Special'&&gameState.enemy.mp>=SPECIAL_COST){gameState.enemy.mp-=SPECIAL_COST;let dmg=randInt(30,50);gameState.player.hp=clamp(gameState.player.hp-dmg,0,PLAYER_MAX_HP);showAlert(`Enemy Special → ${dmg}!`);log(`Enemy Special → ${dmg} dmg.`);}
  else if(act==='Heal'&&gameState.enemy.mp>=HEAL_COST&&gameState.enemy.hp<gameState.enemy.maxHP){const heal=Math.min(HEAL_HP,gameState.enemy.maxHP-gameState.enemy.hp);gameState.enemy.mp-=HEAL_COST;gameState.enemy.hp=clamp(gameState.enemy.hp+heal,0,gameState.enemy.maxHP);showAlert(`Enemy heals +${heal} HP.`);log(`Enemy heals +${heal} HP.`);}
  updateBars(); checkEnd(); savePlayerData();
}

/* === Intervals === */
function startAI(){clearInterval(aiInterval);aiInterval=setInterval(enemyAction,600);}
function startRegen(){
  clearInterval(regenInterval);
  regenInterval = setInterval(()=>{
    gameState.player.mp = clamp(gameState.player.mp + 2, 0, MAX_MP);
    gameState.enemy.mp = clamp(gameState.enemy.mp + 2, 0, gameState.enemy.maxMP);
    updateBars();
  }, 1000);
}

/* === Check End of Round === */
function checkEnd(){
  if(gameState.roundOver) return;
  if(gameState.player.hp <= 0 || gameState.enemy.hp <= 0){
    gameState.roundOver = true;
    clearInterval(aiInterval);
    clearInterval(regenInterval);
    aiActive = false;

    if(gameState.enemy.hp <= 0 && gameState.player.hp <= 0){
      showAlert('Double KO!');
      log('Double KO — no changes.');
    } else if(gameState.enemy.hp <= 0){
      showAlert('You Win!');
      gameState.scores.player++;
      gameState.scores.score += 50;
      const reward = 100 + randInt(0,50);
      gameState.wallet.tokens += reward;
      increaseEnemyStatsPerWin();
      log(`🏆 You earned ${reward} tokens! Wallet: ${gameState.wallet.tokens}`);
    } else {
      showAlert('You Lose!');
      gameState.scores.enemy++;
      gameState.scores.score = Math.max(0, gameState.scores.score - 30);
      log('You lost this round.');
    }
    updateScoreboard();
    savePlayerData();
    setTimeout(()=>{
      gameState.roundOver = false;
      newRound();
    }, 1200);
  }
}

/* === Start New Round === */
function newRound(){
  gameState.player.hp = PLAYER_MAX_HP;
  gameState.player.mp = MAX_MP;
  gameState.enemy.hp = gameState.enemy.maxHP;
  gameState.enemy.mp = gameState.enemy.maxMP;
  aiActive = false;
  updateBars();
  updateScoreboard();
  log('New round — AI waits for your move.');
  startRegen();
  savePlayerData();
}

/* === Reset Game === */
function resetGame(){
  gameState.scores = { player:0, enemy:0, score:0 };
  gameState.wallet.tokens = 1000;
  gameState.enemy.iq = 0;
  gameState.enemy.maxHP = 200;
  gameState.enemy.maxMP = 50;
  gameState.enemy.hp = 200;
  gameState.enemy.mp = 50;
  attackUpgrade = 0;
  specialUpgrade = 0;
  applyUpgrades();
  savePlayerData();
  newRound();
  updateScoreboard();
  log('Game reset — Wallet restored and enemy stats reset.');
}

/* === On Page Load === */
window.addEventListener("DOMContentLoaded", () => {
  loadPlayerData();
  updateBars();
  updateScoreboard();
  startRegen();
});
