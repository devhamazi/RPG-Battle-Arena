
/* === Unified Backend Setup (Keep these for persistence) === */
const PLAYER_ID = "player123";
const BASE_URL = "https://rpg-storage-server.onrender.com/players";

/* === Base Stats & Costs === */
const BASE_STATS = {
    PLAYER_MAX_HP: 200,
    PLAYER_BASE_MP: 50,
    PLAYER_BASE_DEFENSE: 10,
    PLAYER_BASE_CRIT_CHANCE: 0.10, // 10%
    PLAYER_CRIT_MULTIPLIER: 1.5,
    SPECIAL_COST: 30,
    HEAL_COST: 20,
    HEAL_AMOUNT: 40, 
    MP_REGEN_PER_SEC: 3, 
    AI_LEARNING_RATE: 0.15, // Q-Learning rate
    BLEED_DURATION: 3,
    BLEED_DAMAGE: 8
};

/* === Enemy Templates (Tiered System) === */
const ENEMY_TEMPLATES = {
    // Tier 1: Standard Grunt (0-2 Player Wins)
    GRUNT: {
        maxHP: 200, maxMP: 50, defense: 5, iqStart: 0,
        name: "Standard Grunt", tier: 1
    },
    // Tier 2: The Bruiser (3-5 Player Wins)
    BRUISER: {
        maxHP: 350, maxMP: 80, defense: 15, iqStart: 20,
        name: "The Bruiser", tier: 2
    },
    // Tier 3: The Enforcer (6-8 Player Wins)
    ENFORCER: {
        maxHP: 500, maxMP: 120, defense: 25, iqStart: 40,
        name: "The Enforcer", tier: 3
    },
    // BOSS: The Adaptive Core (9+ Player Wins)
    BOSS_CORE: {
        maxHP: 1000, maxMP: 200, defense: 40, iqStart: 60,
        name: "The Adaptive Core (BOSS)", tier: 4
    }
};

/* === Game State === */
let gameState = {
    scores: { player: 0, enemy: 0, score: 0 },
    player: { 
        hp: BASE_STATS.PLAYER_MAX_HP, 
        mp: BASE_STATS.PLAYER_BASE_MP, 
        defense: BASE_STATS.PLAYER_BASE_DEFENSE,
        critChance: BASE_STATS.PLAYER_BASE_CRIT_CHANCE,
        status: { stunned: false }
    },
    enemy: { 
        hp: 200, mp: 50, maxHP: 200, maxMP: 50, iq: 0, defense: 5,
        status: { bleed: 0, stunned: false },
        currentTemplate: 'GRUNT' // Tracks the current enemy template name
    },
    wallet: { tokens: 1000 },
    upgrades: { attack: 0, special: 0, defense: 0, passiveRegen: 0 },
    
    // Q-Learning AI State
    actionMemory: {
        Attack: { Attack: 0, Defend: 0, Special: 0, Heal: 0 },
        Defend: { Attack: 0, Defend: 0, Special: 0, Heal: 0 },
        Special: { Attack: 0, Defend: 0, Special: 0, Heal: 0 },
        Heal: { Attack: 0, Defend: 0, Special: 0, Heal: 0 }
    },
    lastPlayerAction: null,
    
    roundOver: false
};

/* === Intervals & Control === */
let regenInterval = null;
let statusInterval = null;


/* === Load/Save from backend === */
async function loadPlayerData(){
    try{
        const res = await fetch(`${BASE_URL}/${PLAYER_ID}`);
        const data = await res.json();

        // Restore core state
        gameState.wallet.tokens = data.tokens ?? 1000;
        gameState.player.hp = data.hp ?? BASE_STATS.PLAYER_MAX_HP;
        gameState.player.mp = data.mp ?? BASE_STATS.PLAYER_BASE_MP;
        gameState.enemy.hp = data.enemyHp ?? 200;
        gameState.enemy.mp = data.enemyMp ?? 50;
        gameState.enemy.maxHP = data.enemyMaxHP ?? 200;
        gameState.enemy.maxMP = data.enemyMaxMP ?? 50;
        gameState.enemy.iq = data.enemyIQ ?? 0;
        gameState.scores.player = data.playerWins ?? 0;
        gameState.scores.enemy = data.enemyWins ?? 0;
        gameState.enemy.currentTemplate = data.currentEnemyTemplate ?? 'GRUNT'; // Restore current enemy type

        // Restore Upgrades
        gameState.upgrades.attack = data.attackUpgrade ?? 0;
        gameState.upgrades.special = data.specialUpgrade ?? 0;
        gameState.upgrades.defense = data.defenseUpgrade ?? 0;
        gameState.upgrades.passiveRegen = data.passiveRegen ?? 0;

        // Restore AI Memory (critical for advanced AI)
        if (data.actionMemory) {
            gameState.actionMemory = JSON.parse(data.actionMemory);
        }

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
            enemyHp: gameState.enemy.hp,
            enemyMp: gameState.enemy.mp,
            enemyMaxHP: gameState.enemy.maxHP,
            enemyMaxMP: gameState.enemy.maxMP,
            enemyIQ: gameState.enemy.iq,
            playerWins: gameState.scores.player,
            enemyWins: gameState.scores.enemy,
            currentEnemyTemplate: gameState.enemy.currentTemplate,

            // Upgrades
            attackUpgrade: gameState.upgrades.attack,
            specialUpgrade: gameState.upgrades.special,
            defenseUpgrade: gameState.upgrades.defense,
            passiveRegen: gameState.upgrades.passiveRegen,

            // AI Memory (stringified)
            actionMemory: JSON.stringify(gameState.actionMemory)
        };
        await fetch(`${BASE_URL}/${PLAYER_ID}`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(payload)
        });
    } catch(err){ console.error("Error saving player data:", err); }
}

/* === Utilities === */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const log = t => { 
    const battleLog = document.getElementById('battleLog'); 
    if (battleLog) {
        const p = document.createElement("p"); 
        p.innerHTML = t; 
        battleLog.appendChild(p); 
        battleLog.scrollTop = battleLog.scrollHeight; 
    }
};

// Intentionally empty function to disable the alert box.
function showAlert(msg){
    // Removed alert functionality.
} 

function applyUpgrades(){
    // Player Defense increases with upgrade (2 defense per level)
    gameState.player.defense = BASE_STATS.PLAYER_BASE_DEFENSE + (gameState.upgrades.defense * 2); 
}

/* === Damage & Status Logic === */
function calculateDamage(attacker, defender, baseDamage) {
    let damage = baseDamage;
    let isCrit = false;

    // 1. Critical Hit Check (Player only for now)
    if (attacker === gameState.player && Math.random() < gameState.player.critChance) {
        damage *= BASE_STATS.PLAYER_CRIT_MULTIPLIER;
        isCrit = true;
    }
    
    // 2. Defense Reduction (Max damage taken is 1)
    const reduction = defender.defense / 2;
    damage = Math.max(1, Math.floor(damage - reduction));
    
    // 3. Apply Damage
    const maxHP = defender === gameState.enemy ? defender.maxHP : BASE_STATS.PLAYER_MAX_HP;
    defender.hp = clamp(defender.hp - damage, 0, maxHP);

    let logMsg = `<strong class="text-red-300">${damage} dmg</strong>.`;
    if (isCrit) {
        logMsg = `<span class="text-yellow-400">🔥 CRIT!</span> ${logMsg}`;
    }
    
    return { damage, logMsg };
}


/* === AI Learning Logic (Q-Learning Lite) === */
function updateActionMemory(enemyAction, hpChange) {
    if (!gameState.lastPlayerAction) return;
    
    const reward = hpChange; 
    const currentQ = gameState.actionMemory[gameState.lastPlayerAction][enemyAction];
    
    // Q-Learning update formula:
    const newQ = currentQ + BASE_STATS.AI_LEARNING_RATE * (reward - currentQ);
    
    gameState.actionMemory[gameState.lastPlayerAction][enemyAction] = newQ;
    
    // Slowly increase AI IQ for learning
    gameState.enemy.iq = clamp(gameState.enemy.iq + 0.05, 0, 100);
}

/* === Player Actions === */
function playerAction(act){
    if(gameState.roundOver) return;
    
    // Stun check: Player is stunned, skips turn
    if(gameState.player.status.stunned) {
        log("⚡ Player is <span class='text-yellow-400'>stunned</span> and skips turn!");
        gameState.player.status.stunned = false;
        log("Player turn ends.");
        setTimeout(() => enemyAction(), 600); 
        return; 
    }
    
    let playerActionSuccess = true;

    if(act === 'Attack'){
        const baseDmg = randInt(12, 28) * (1 + gameState.upgrades.attack / 100);
        const { damage, logMsg } = calculateDamage(gameState.player, gameState.enemy, baseDmg);
        log(`⚔️ Player attacks the Enemy for ${logMsg}`);
    } else if(act === 'Defend'){ 
        gameState.player.mp = clamp(gameState.player.mp + 5, 0, BASE_STATS.PLAYER_BASE_MP);
        log("🛡️ Player defends and regains <span class='text-blue-400'>5 MP</span>."); 
    } else if(act === 'Special'){
        if(gameState.player.mp < BASE_STATS.SPECIAL_COST){ 
            log("🚫 <span class='text-red-400'>Fail:</span> Not enough Mana for Special.");
            playerActionSuccess = false; 
        } else {
            gameState.player.mp -= BASE_STATS.SPECIAL_COST;
            const baseDmg = randInt(30, 50) * Math.pow(1.5, gameState.upgrades.special);
            const { damage, logMsg } = calculateDamage(gameState.player, gameState.enemy, baseDmg);
            log(`✨ Player uses <span class='text-red-400'>Special</span> on Enemy for ${logMsg}`);

            // 10% chance to apply Bleed
            if (Math.random() < 0.10) {
                gameState.enemy.status.bleed = BASE_STATS.BLEED_DURATION;
                log("🩸 Enemy is now <span class='text-red-400'>Bleeding</span>!");
            }
        }
    } else if(act === 'Heal'){
        const healAmount = BASE_STATS.HEAL_AMOUNT;
        const maxHP = BASE_STATS.PLAYER_MAX_HP;
        
        if(gameState.player.hp >= maxHP){ 
            log("🚫 <span class='text-red-400'>Fail:</span> HP is already full.");
            playerActionSuccess = false; 
        } else if(gameState.player.mp < BASE_STATS.HEAL_COST){ 
            log("🚫 <span class='text-red-400'>Fail:</span> Not enough Mana for Heal.");
            playerActionSuccess = false; 
        } else {
            gameState.player.mp -= BASE_STATS.HEAL_COST;
            const heal = Math.min(healAmount, maxHP - gameState.player.hp);
            gameState.player.hp = clamp(gameState.player.hp + heal, 0, maxHP);
            log(`🩹 Player <span class='text-green-400'>heals +${heal} HP</span>.`);
        }
    }
    
    if (playerActionSuccess) {
        gameState.lastPlayerAction = act;
        updateBars(); 
        checkEnd(); 
        savePlayerData();
        
        if (!gameState.roundOver) {
             setTimeout(() => enemyAction(), 600); 
        }
    }
}

/* === Enemy AI & Action === */
function enemyAction() {
    if(gameState.roundOver) return;

    const playerHPBefore = gameState.player.hp;
    const lastPlayerAct = gameState.lastPlayerAction;
    let enemyActionTaken = null;

    const act = decideAction();
    enemyActionTaken = act;

    if (act === 'Attack') {
        const baseDmg = randInt(18, 35);
        const { damage, logMsg } = calculateDamage(gameState.enemy, gameState.player, baseDmg);
        log(`💀 Enemy attacks Player for ${logMsg}`);
    } else if (act === 'Special') {
        gameState.enemy.mp -= BASE_STATS.SPECIAL_COST;
        const baseDmg = randInt(30, 50);
        const { damage, logMsg } = calculateDamage(gameState.enemy, gameState.player, baseDmg);
        log(`💥 Enemy uses <span class='text-red-400'>Special</span> on Player for ${logMsg}`);
        
        // 5% chance to apply Stun
        if (Math.random() < 0.05) {
            gameState.player.status.stunned = true;
            log("⚡ Player is <span class='text-yellow-400'>stunned</span> and skips next turn!");
        }
    } else if (act === 'Heal') {
        const heal = Math.min(BASE_STATS.HEAL_AMOUNT, gameState.enemy.maxHP - gameState.enemy.hp);
        gameState.enemy.mp -= BASE_STATS.HEAL_COST;
        gameState.enemy.hp = clamp(gameState.enemy.hp + heal, 0, gameState.enemy.maxHP);
        log(`🤖 Enemy <span class='text-green-400'>heals +${heal} HP</span>.`);
    } else if (act === 'Defend') {
        gameState.enemy.mp = clamp(gameState.enemy.mp + 5, 0, gameState.enemy.maxMP);
        log("🛡️ Enemy defends and regains <span class='text-blue-400'>5 MP</span>.");
    }
    
    const playerHPChange = playerHPBefore - gameState.player.hp; 

    // AI LEARNING STEP
    if (lastPlayerAct && enemyActionTaken) {
         updateActionMemory(enemyActionTaken, playerHPChange);
    }

    updateBars(); checkEnd(); savePlayerData();
}


/* === Advanced Enemy AI Decision (Q-Learning) === */
function decideAction() {
    const actions = ['Attack', 'Defend', 'Special', 'Heal'];
    
    const epsilon = 1.0 - Math.min(gameState.enemy.iq / 100, 0.9); 

    // Filter out invalid actions based on current MP/HP
    let validActions = actions.filter(action => {
        if (action === 'Special' && gameState.enemy.mp < BASE_STATS.SPECIAL_COST) return false;
        if (action === 'Heal' && (gameState.enemy.mp < BASE_STATS.HEAL_COST || gameState.enemy.hp === gameState.enemy.maxHP)) return false;
        return true;
    });

    if (validActions.length === 0) return 'Defend';

    // 1. Exploration (Random choice among valid moves)
    if (!gameState.lastPlayerAction || Math.random() < epsilon) {
        return validActions[randInt(0, validActions.length - 1)];
    }

    // 2. Exploitation (Choose the best known action against the last player move)
    const memory = gameState.actionMemory[gameState.lastPlayerAction];
    let bestAction = validActions[0]; 
    let maxQ = -Infinity;

    for (const action of validActions) {
        const qValue = memory[action];
        if (qValue > maxQ) {
            maxQ = qValue;
            bestAction = action;
        }
    }
    
    return bestAction;
}


/* === Intervals: Regen & Status Effects === */
function startRegen(){
    clearInterval(regenInterval);
    regenInterval = setInterval(()=>{
        // Player Regen (Base + Upgrade)
        const playerRegen = BASE_STATS.MP_REGEN_PER_SEC + gameState.upgrades.passiveRegen;
        gameState.player.mp = clamp(gameState.player.mp + playerRegen, 0, BASE_STATS.PLAYER_BASE_MP);
        
        // Enemy Regen
        gameState.enemy.mp = clamp(gameState.enemy.mp + BASE_STATS.MP_REGEN_PER_SEC, 0, gameState.enemy.maxMP);
        updateBars();
    }, 1000);
}

function startStatusEffects(){
    clearInterval(statusInterval);
    statusInterval = setInterval(()=>{
        let statusApplied = false;
        // Bleed Check
        if (gameState.enemy.status.bleed > 0) {
            gameState.enemy.hp = clamp(gameState.enemy.hp - BASE_STATS.BLEED_DAMAGE, 0, gameState.enemy.maxHP);
            gameState.enemy.status.bleed--;
            log(`🩸 Enemy takes <span class='text-red-400'>${BASE_STATS.BLEED_DAMAGE}</span> damage from Bleed.`);
            statusApplied = true;
        }

        if (statusApplied) {
            updateBars();
            checkEnd();
            savePlayerData();
        }
    }, 3000); // Ticks every 3 seconds
}


/* === Check End of Round === */
function checkEnd(){
    if(gameState.roundOver) return;

    if(gameState.player.hp <= 0 || gameState.enemy.hp <= 0){
        gameState.roundOver = true;
        
        clearInterval(regenInterval);
        clearInterval(statusInterval);

        let roundResult = '';
        let reward = 0;

        if(gameState.enemy.hp <= 0 && gameState.player.hp <= 0){
            roundResult = '<span class="text-yellow-400">DOUBLE KO!</span>';
            log(`⚔️ Round Ends: ${roundResult} — Enemy stats slightly increased.`);
            gameState.enemy.iq = clamp(gameState.enemy.iq + 0.5, 0, 100);
        } else if(gameState.enemy.hp <= 0){
            roundResult = '<span class="text-green-400">PLAYER WINS!</span>';
            gameState.scores.player++;
            gameState.scores.score += 50;
            reward = 100 + randInt(0,50);
            gameState.wallet.tokens += reward;
            increaseEnemyStatsPerWin(); // NEW TIER LOGIC APPLIED HERE
            log(`🏆 Round Ends: ${roundResult} — Earned ${reward} tokens.`);
        } else {
            roundResult = '<span class="text-red-400">ENEMY WINS!</span>';
            gameState.scores.enemy++;
            gameState.scores.score = Math.max(0, gameState.scores.score - 30);
            log(`💀 Round Ends: ${roundResult}`);
            gameState.enemy.iq = clamp(gameState.enemy.iq - 0.5, 0, 100); 
        }
        
        log(`--- ${roundResult} ---`); 
        updateScoreboard();
        savePlayerData();
        
        setTimeout(()=>{
            gameState.roundOver = false;
            newRound();
        }, 1500); 
    }
}

/* === Enemy Scaling (MODIFIED FOR TIERED SYSTEM) === */
function increaseEnemyStatsPerWin(){
    // Check if we are at the threshold for the next enemy type
    const nextWins = gameState.scores.player; // Already incremented in checkEnd()
    const isTransitioning = (nextWins === 3 || nextWins === 6 || nextWins === 9);
    
    if (!isTransitioning) {
        // Apply incremental scaling within the current tier
        gameState.enemy.iq = clamp(gameState.enemy.iq + 1.5, 0, 100);
        gameState.enemy.maxHP += 100;
        gameState.enemy.maxMP += 20;
        gameState.enemy.defense += 5;
        
        log(`📈 Enemy stats increased! Max HP: ${gameState.enemy.maxHP}, Defense: ${gameState.enemy.defense}`);
    } else {
        log(`⏳ Preparing for new enemy Tier at ${nextWins} wins...`);
    }

    // Always reset HP/MP to max for the next round based on current scaled stats
    gameState.enemy.hp = gameState.enemy.maxHP;
    gameState.enemy.mp = gameState.enemy.maxMP;
}

/* === Start New Round (MODIFIED FOR TIERED SYSTEM) === */
function newRound(){
    // Determine the next enemy template based on player wins
    let templateKey;
    const wins = gameState.scores.player;

    if (wins < 3) {
        templateKey = 'GRUNT';
    } else if (wins < 6) {
        templateKey = 'BRUISER';
    } else if (wins < 9) {
        templateKey = 'ENFORCER';
    } else {
        templateKey = 'BOSS_CORE';
    }
    
    const template = ENEMY_TEMPLATES[templateKey];
    
    // Check if we are starting a NEW enemy type
    if (gameState.enemy.currentTemplate !== templateKey) {
        gameState.enemy.currentTemplate = templateKey;
        gameState.enemy.maxHP = template.maxHP;
        gameState.enemy.maxMP = template.maxMP;
        gameState.enemy.defense = template.defense;
        gameState.enemy.iq = template.iqStart; // Set base IQ for the new type
        log(`📢 New Foe: <span class="text-red-400">${template.name}</span>! Prepare for Tier ${template.tier}.`);
        
        // Reset AI memory when transitioning to a new tier
        gameState.actionMemory = { 
             Attack: { Attack: 0, Defend: 0, Special: 0, Heal: 0 }, 
             Defend: { Attack: 0, Defend: 0, Special: 0, Heal: 0 }, 
             Special: { Attack: 0, Defend: 0, Special: 0, Heal: 0 }, 
             Heal: { Attack: 0, Defend: 0, Special: 0, Heal: 0 } 
        };
    }

    // Reset player to max stats
    gameState.player.hp = BASE_STATS.PLAYER_MAX_HP;
    gameState.player.mp = BASE_STATS.PLAYER_BASE_MP;
    
    // Reset enemy to current max stats (HP/MP)
    gameState.enemy.hp = gameState.enemy.maxHP;
    gameState.enemy.mp = gameState.enemy.maxMP;
    
    // Clear status effects
    gameState.enemy.status.bleed = 0;
    gameState.enemy.status.stunned = false;
    gameState.player.status.stunned = false; 

    gameState.lastPlayerAction = null;
    
    updateBars();
    updateScoreboard();
    log('--- <span class="text-green-400">NEW ROUND</span> ---');
    log('AI waits for your move.');
    startRegen();
    startStatusEffects(); 
    savePlayerData();
}

/* === Reset Game === */
function resetGame(){
    gameState.scores = { player:0, enemy:0, score:0 };
    gameState.wallet.tokens = 1000;
    
    // Reset all enemy scaling stats
    gameState.enemy.iq = 0;
    gameState.enemy.maxHP = 200;
    gameState.enemy.maxMP = 50;
    gameState.enemy.defense = 5; 
    gameState.enemy.currentTemplate = 'GRUNT'; // Reset enemy type to default
    
    // Reset all upgrades
    gameState.upgrades = { attack: 0, special: 0, defense: 0, passiveRegen: 0 };
    
    // Reset AI Memory
    gameState.actionMemory = {
        Attack: { Attack: 0, Defend: 0, Special: 0, Heal: 0 },
        Defend: { Attack: 0, Defend: 0, Special: 0, Heal: 0 },
        Special: { Attack: 0, Defend: 0, Special: 0, Heal: 0 },
        Heal: { Attack: 0, Defend: 0, Special: 0, Heal: 0 }
    };

    applyUpgrades();
    savePlayerData();
    
    newRound();
    updateScoreboard();
    
    const battleLog = document.getElementById("battleLog");
    if (battleLog) {
        battleLog.innerHTML = ''; 
    }
    log('**<span class="text-red-400">GAME HARD RESET</span>** — Tokens/Enemy/Upgrades cleared.');
}

/* === Bars & Scoreboard Updates === */
function updateBars(){
  const playerMaxHP = BASE_STATS.PLAYER_MAX_HP;
  const playerMaxMP = BASE_STATS.PLAYER_BASE_MP;
  
  const playerHealthBar = document.getElementById('playerHealthBar');
  const playerManaBar = document.getElementById('playerManaBar');
  const enemyHealthBar = document.getElementById('enemyHealthBar');
  const enemyManaBar = document.getElementById('enemyManaBar');
  const enemyIntelligenceBar = document.getElementById('enemyIntelligenceBar');
  
  const playerHealthText = document.getElementById('playerHealthText');
  const playerManaText = document.getElementById('playerManaText');
  const enemyHealthText = document.getElementById('enemyHealthText');
  const enemyManaText = document.getElementById('enemyManaText');
  const enemyIntelligenceText = document.getElementById('enemyIntelligenceText');
  
  // 1. Update Bar Widths
  playerHealthBar.style.width = (gameState.player.hp / playerMaxHP * 100) + '%';
  playerManaBar.style.width = (gameState.player.mp / playerMaxMP * 100) + '%';
  enemyHealthBar.style.width = (gameState.enemy.hp / gameState.enemy.maxHP * 100) + '%';
  enemyManaBar.style.width = (gameState.enemy.mp / gameState.enemy.maxMP * 100) + '%';
  
  // Intelligence bar now displays enemy IQ (progress to 100)
  enemyIntelligenceBar.style.width = Math.min(gameState.enemy.iq, 100) + '%';
  
  // 2. Update Text Overlays
  playerHealthText.innerText = `${gameState.player.hp}/${playerMaxHP}`;
  playerManaText.innerText = `${gameState.player.mp}/${playerMaxMP}`;
  enemyHealthText.innerText = `${gameState.enemy.hp}/${gameState.enemy.maxHP}`;
  enemyManaText.innerText = `${gameState.enemy.mp}/${gameState.enemy.maxMP}`;
  
  // Use intelligence text for enemy IQ and Defense stat
  enemyIntelligenceText.innerText = `IQ ${gameState.enemy.iq.toFixed(1)} / DEF ${gameState.enemy.defense}`;
} 

function updateScoreboard(){
  const playerWins = document.getElementById('playerWins');
  const enemyWins = document.getElementById('enemyWins');
  const score = document.getElementById('score');
  const aiIQ = document.getElementById('aiIQ');
  const walletBalance = document.getElementById('walletBalance');

  playerWins.innerText = gameState.scores.player;
  enemyWins.innerText = gameState.scores.enemy;
  score.innerText = gameState.scores.score;
  aiIQ.innerText = gameState.enemy.iq.toFixed(1);
  walletBalance.innerText = gameState.wallet.tokens;
}


/* === On Page Load (MANDATORY) === */
window.addEventListener("DOMContentLoaded", () => {
    // Initial call to load and start intervals
    loadPlayerData().then(() => {
        updateBars();
        updateScoreboard();
        startRegen();
        startStatusEffects();
        log('Game loaded. Ready to engage the Adaptive AI!');
        
        // Log the current enemy type on load
        const template = ENEMY_TEMPLATES[gameState.enemy.currentTemplate];
        log(`Current Foe: <span class="text-red-400">${template.name}</span> (Tier ${template.tier})`);
    });
});