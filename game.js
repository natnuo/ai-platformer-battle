// ============================================
// AI PLATFORMER BATTLE - Game Engine
// ============================================

// Game Constants
const GRID_SIZE = 100;
const TILE_SIZE = 5; // Canvas pixels per grid unit
const CANVAS_SIZE = 500;
const PLAYER_SIZE = 5; // 5x5 grid units
const TICK_RATE = 10; // 10 ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE; // 100ms
const AI_TIMEOUT = 100; // 100ms timeout for AI
const FINISH_COUNTDOWN = 10; // 10 seconds after first player finishes

// Physics Constants
const GRAVITY = 50; // Grid units per second squared
const MAX_HORIZONTAL_FORCE = 80; // Max horizontal acceleration
const JUMP_FORCE = 35; // Jump impulse
const FRICTION = 0.95; // Horizontal friction when grounded (was 0.85 - too strong)
const AIR_RESISTANCE = 0.98; // Horizontal friction when airborne
const MAX_VELOCITY_X = 40; // Max horizontal velocity
const MAX_VELOCITY_Y = 60; // Max vertical velocity (falling)

// Colors
const COLORS = {
    background: '#1a1a2e',
    platform: '#8b7355',
    platformHighlight: '#a08060',
    lava: '#ff4444',
    lavaGlow: '#ff6666',
    goal: '#ffd700',
    goalGlow: '#ffed4a',
    player1: '#ff6b6b',
    player2: '#4ecdc4',
    air: '#0f0f1a'
};

// Game State
let gameState = 'setup'; // 'setup', 'playing', 'finished'
let players = [];
let globalTick = 0;
let globalStartTime = 0;
let countdownStartTime = null;
let firstFinisher = null;
let animationFrameId = null;
let lastTickTime = 0;

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const codeEditor1 = document.getElementById('code-editor-1');
const codeEditor2 = document.getElementById('code-editor-2');
const canvas1 = document.getElementById('canvas-1');
const canvas2 = document.getElementById('canvas-2');
const ctx1 = canvas1.getContext('2d');
const ctx2 = canvas2.getContext('2d');
const elapsedTimeEl = document.getElementById('elapsed-time');
const tickCountEl = document.getElementById('tick-count');
const countdownEl = document.getElementById('countdown');
const p1LevelEl = document.getElementById('p1-level');
const p2LevelEl = document.getElementById('p2-level');

// Player Class
class Player {
    constructor(id, code, canvas, ctx) {
        this.id = id;
        this.code = code;
        this.canvas = canvas;
        this.ctx = ctx;
        this.aiFunction = null;
        this.memory = {};
        this.currentLevel = 0;
        this.position = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 };
        this.isGrounded = false;
        this.levelData = null;
        this.levelStartTime = 0;
        this.levelTicks = 0;
        this.totalTime = 0;
        this.totalTicks = 0;
        this.finished = false;
        this.finishTime = null;
        
        this.compileAI();
        this.loadLevel(0);
    }
    
    compileAI() {
        try {
            // Create a sandboxed function from the code
            // The function should be named 'ai' in the code
            const wrappedCode = `
                ${this.code}
                return ai;
            `;
            this.aiFunction = new Function(wrappedCode)();
        } catch (e) {
            console.error(`Player ${this.id} AI compilation error:`, e);
            // Default AI that does nothing
            this.aiFunction = () => ({ forceX: 0, forceY: 0, memory: {} });
        }
    }
    
    loadLevel(levelIndex) {
        this.currentLevel = levelIndex; // Update level count first
        
        if (levelIndex >= PARSED_LEVELS.length) {
            this.finished = true;
            this.finishTime = performance.now();
            return;
        }
        this.levelData = PARSED_LEVELS[levelIndex];
        
        // Safety check for missing start position
        if (!this.levelData.startPos) {
            console.error(`Level ${levelIndex + 1} is missing a start position (S)`);
            this.levelData.startPos = { x: 5, y: 10 }; // Fallback
        }
        
        this.position = { 
            x: this.levelData.startPos.x, 
            y: this.levelData.startPos.y + 1 // Start slightly above the start tile
        };
        this.velocity = { x: 0, y: 0 };
        this.isGrounded = false;
        this.memory = {}; // Reset memory per level
        this.levelStartTime = performance.now();
        this.levelTicks = 0;
    }
    
    resetToStart() {
        this.position = { 
            x: this.levelData.startPos.x, 
            y: this.levelData.startPos.y + 1
        };
        this.velocity = { x: 0, y: 0 };
        this.isGrounded = false;
    }
    
    update(deltaTime) {
        if (this.finished) return;
        
        // Apply gravity
        this.velocity.y -= GRAVITY * deltaTime;
        
        // Apply friction/air resistance
        if (this.isGrounded) {
            this.velocity.x *= Math.pow(FRICTION, deltaTime * 60);
        } else {
            this.velocity.x *= Math.pow(AIR_RESISTANCE, deltaTime * 60);
        }
        
        // Clamp velocities
        this.velocity.x = Math.max(-MAX_VELOCITY_X, Math.min(MAX_VELOCITY_X, this.velocity.x));
        this.velocity.y = Math.max(-MAX_VELOCITY_Y, Math.min(MAX_VELOCITY_Y, this.velocity.y));
        
        // Store old position for collision resolution
        const oldX = this.position.x;
        const oldY = this.position.y;
        
        // Apply velocity
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        
        // Collision detection and resolution
        this.handleCollisions(oldX, oldY);
        
        // Check for lava
        if (this.checkLavaCollision()) {
            this.resetToStart();
            return;
        }
        
        // Check for goal
        if (this.checkGoalCollision()) {
            this.totalTime += (performance.now() - this.levelStartTime) / 1000;
            this.totalTicks += this.levelTicks;
            this.loadLevel(this.currentLevel + 1);
        }
    }
    
    handleCollisions(oldX, oldY) {
        const playerLeft = this.position.x;
        const playerRight = this.position.x + PLAYER_SIZE;
        const playerBottom = this.position.y;
        const playerTop = this.position.y + PLAYER_SIZE;
        
        this.isGrounded = false;
        
        // Check all tiles the player might be touching
        const minTileX = Math.floor(playerLeft);
        const maxTileX = Math.floor(playerRight);
        const minTileY = Math.floor(playerBottom);
        const maxTileY = Math.floor(playerTop);
        
        for (let tx = minTileX; tx <= maxTileX; tx++) {
            for (let ty = minTileY; ty <= maxTileY; ty++) {
                if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;
                
                const tile = this.levelData.grid[tx][ty];
                if (tile !== 'platform') continue;
                
                // Tile bounds
                const tileLeft = tx;
                const tileRight = tx + 1;
                const tileBottom = ty;
                const tileTop = ty + 1;
                
                // Check overlap
                const overlapLeft = playerRight - tileLeft;
                const overlapRight = tileRight - playerLeft;
                const overlapBottom = playerTop - tileBottom;
                const overlapTop = tileTop - playerBottom;
                
                if (overlapLeft > 0 && overlapRight > 0 && overlapBottom > 0 && overlapTop > 0) {
                    // Find minimum overlap
                    const minOverlapX = Math.min(overlapLeft, overlapRight);
                    const minOverlapY = Math.min(overlapBottom, overlapTop);
                    
                    if (minOverlapY < minOverlapX) {
                        // Vertical collision
                        if (overlapBottom < overlapTop) {
                            // Hitting from below (head bump)
                            this.position.y = tileBottom - PLAYER_SIZE;
                            this.velocity.y = Math.min(0, this.velocity.y);
                        } else {
                            // Landing on top
                            this.position.y = tileTop;
                            this.velocity.y = Math.max(0, this.velocity.y);
                            this.isGrounded = true;
                        }
                    } else {
                        // Horizontal collision
                        if (overlapLeft < overlapRight) {
                            // Hitting from the left
                            this.position.x = tileLeft - PLAYER_SIZE;
                            this.velocity.x = Math.min(0, this.velocity.x);
                        } else {
                            // Hitting from the right
                            this.position.x = tileRight;
                            this.velocity.x = Math.max(0, this.velocity.x);
                        }
                    }
                }
            }
        }
        
        // Boundary checks
        if (this.position.x < 0) {
            this.position.x = 0;
            this.velocity.x = Math.max(0, this.velocity.x);
        }
        if (this.position.x + PLAYER_SIZE > GRID_SIZE) {
            this.position.x = GRID_SIZE - PLAYER_SIZE;
            this.velocity.x = Math.min(0, this.velocity.x);
        }
        if (this.position.y < 0) {
            this.position.y = 0;
            this.velocity.y = Math.max(0, this.velocity.y);
            this.isGrounded = true;
        }
        if (this.position.y + PLAYER_SIZE > GRID_SIZE) {
            this.position.y = GRID_SIZE - PLAYER_SIZE;
            this.velocity.y = Math.min(0, this.velocity.y);
        }
    }
    
    checkLavaCollision() {
        const playerLeft = Math.floor(this.position.x);
        const playerRight = Math.floor(this.position.x + PLAYER_SIZE);
        const playerBottom = Math.floor(this.position.y);
        const playerTop = Math.floor(this.position.y + PLAYER_SIZE);
        
        for (let tx = playerLeft; tx <= playerRight; tx++) {
            for (let ty = playerBottom; ty <= playerTop; ty++) {
                if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;
                if (this.levelData.grid[tx][ty] === 'lava') {
                    return true;
                }
            }
        }
        return false;
    }
    
    checkGoalCollision() {
        const playerLeft = Math.floor(this.position.x);
        const playerRight = Math.floor(this.position.x + PLAYER_SIZE);
        const playerBottom = Math.floor(this.position.y);
        const playerTop = Math.floor(this.position.y + PLAYER_SIZE);
        
        for (let tx = playerLeft; tx <= playerRight; tx++) {
            for (let ty = playerBottom; ty <= playerTop; ty++) {
                if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;
                if (this.levelData.grid[tx][ty] === 'end') {
                    return true;
                }
            }
        }
        return false;
    }
    
    executeAI(tick, elapsedTime) {
        if (this.finished) return;
        
        this.levelTicks++;
        
        // Prepare data for AI
        const levelDataCopy = {
            grid: this.levelData.grid,
            startPos: { ...this.levelData.startPos },
            endPos: { ...this.levelData.endPos }
        };
        
        // Create position object with all reference points
        const positionCopy = {
            bottomLeft: { x: this.position.x, y: this.position.y },
            bottomRight: { x: this.position.x + PLAYER_SIZE, y: this.position.y },
            topLeft: { x: this.position.x, y: this.position.y + PLAYER_SIZE },
            topRight: { x: this.position.x + PLAYER_SIZE, y: this.position.y + PLAYER_SIZE },
            center: { x: this.position.x + PLAYER_SIZE / 2, y: this.position.y + PLAYER_SIZE / 2 }
        };
        const velocityCopy = { ...this.velocity };
        
        // Execute AI with timeout
        let result = null;
        const startTime = performance.now();
        
        try {
            // Create a promise that resolves with the AI result
            result = this.aiFunction(
                levelDataCopy,
                positionCopy,
                this.memory,
                this.isGrounded,
                velocityCopy,
                tick,
                elapsedTime
            );
            
            const endTime = performance.now();
            if (endTime - startTime > AI_TIMEOUT) {
                console.warn(`Player ${this.id} AI exceeded time limit`);
                result = null;
            }
        } catch (e) {
            console.error(`Player ${this.id} AI error:`, e);
            result = null;
        }
        
        // Apply AI output
        if (result) {
            // Update memory
            if (result.memory !== undefined) {
                this.memory = result.memory;
            }
            
            // Apply horizontal force
            let forceX = parseFloat(result.forceX) || 0;
            forceX = Math.max(-1, Math.min(1, forceX));
            this.velocity.x += forceX * MAX_HORIZONTAL_FORCE * (TICK_INTERVAL / 1000);
            
            // Apply jump force (only when grounded)
            if (this.isGrounded) {
                let forceY = parseFloat(result.forceY) || 0;
                forceY = Math.max(0, Math.min(1, forceY));
                if (forceY > 0) {
                    this.velocity.y = forceY * JUMP_FORCE;
                    this.isGrounded = false;
                }
            }
        }
    }
    
    render() {
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.fillStyle = COLORS.air;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // Draw grid tiles
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                const tile = this.levelData.grid[x][y];
                const screenX = x * TILE_SIZE;
                const screenY = CANVAS_SIZE - (y + 1) * TILE_SIZE; // Flip Y for screen coords
                
                switch (tile) {
                    case 'platform':
                        // Platform with pixel art style
                        ctx.fillStyle = COLORS.platform;
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                        // Highlight
                        ctx.fillStyle = COLORS.platformHighlight;
                        ctx.fillRect(screenX, screenY, TILE_SIZE, 1);
                        break;
                        
                    case 'lava':
                        // Animated lava
                        const lavaTime = performance.now() / 200;
                        const lavaOffset = Math.sin(lavaTime + x * 0.5) * 0.3;
                        ctx.fillStyle = COLORS.lava;
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                        // Lava glow effect
                        ctx.fillStyle = `rgba(255, 100, 100, ${0.3 + lavaOffset * 0.2})`;
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE * 0.3);
                        break;
                        
                    case 'start':
                        // Start position marker
                        ctx.fillStyle = '#44ff44';
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                        break;
                        
                    case 'end':
                        // Goal with pulsing effect
                        const goalTime = performance.now() / 300;
                        const goalPulse = 0.7 + Math.sin(goalTime) * 0.3;
                        ctx.fillStyle = COLORS.goal;
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                        ctx.fillStyle = `rgba(255, 237, 74, ${goalPulse * 0.5})`;
                        ctx.fillRect(screenX - 1, screenY - 1, TILE_SIZE + 2, TILE_SIZE + 2);
                        break;
                }
            }
        }
        
        // Draw player
        if (!this.finished) {
            const playerScreenX = this.position.x * TILE_SIZE;
            const playerScreenY = CANVAS_SIZE - (this.position.y + PLAYER_SIZE) * TILE_SIZE;
            const playerColor = this.id === 1 ? COLORS.player1 : COLORS.player2;
            
            // Player glow
            ctx.shadowColor = playerColor;
            ctx.shadowBlur = 10;
            
            // Player body
            ctx.fillStyle = playerColor;
            ctx.fillRect(playerScreenX, playerScreenY, PLAYER_SIZE * TILE_SIZE, PLAYER_SIZE * TILE_SIZE);
            
            // Player highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(playerScreenX, playerScreenY, PLAYER_SIZE * TILE_SIZE, TILE_SIZE);
            
            // Eyes
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            const eyeSize = TILE_SIZE * 0.8;
            const eyeY = playerScreenY + TILE_SIZE * 1.5;
            ctx.fillRect(playerScreenX + TILE_SIZE * 0.8, eyeY, eyeSize, eyeSize);
            ctx.fillRect(playerScreenX + TILE_SIZE * 2.8, eyeY, eyeSize, eyeSize);
            
            // Pupils (look in direction of movement)
            ctx.fillStyle = '#000';
            const pupilOffset = this.velocity.x > 0 ? 2 : (this.velocity.x < 0 ? -2 : 0);
            const pupilSize = TILE_SIZE * 0.4;
            ctx.fillRect(playerScreenX + TILE_SIZE * 1 + pupilOffset, eyeY + 2, pupilSize, pupilSize);
            ctx.fillRect(playerScreenX + TILE_SIZE * 3 + pupilOffset, eyeY + 2, pupilSize, pupilSize);
            
            ctx.shadowBlur = 0;
        } else {
            // Show "FINISHED!" text
            ctx.fillStyle = this.id === 1 ? COLORS.player1 : COLORS.player2;
            ctx.font = '20px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText('FINISHED!', CANVAS_SIZE / 2, CANVAS_SIZE / 2);
        }
    }
}

// Game Functions
function showScreen(screenId) {
    [setupScreen, gameScreen, resultsScreen].forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function startGame() {
    // Reset game state
    gameState = 'playing';
    globalTick = 0;
    globalStartTime = performance.now();
    countdownStartTime = null;
    firstFinisher = null;
    lastTickTime = performance.now();
    
    // Create players
    players = [
        new Player(1, codeEditor1.value, canvas1, ctx1),
        new Player(2, codeEditor2.value, canvas2, ctx2)
    ];
    
    // Update UI
    updateUI();
    showScreen('game-screen');
    
    // Start game loop
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    gameLoop();
}

function gameLoop() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTickTime) / 1000;
    
    // Check if it's time for a new tick
    const elapsedSinceStart = currentTime - globalStartTime;
    const expectedTick = Math.floor(elapsedSinceStart / TICK_INTERVAL);
    
    if (expectedTick > globalTick) {
        // Execute tick
        globalTick = expectedTick;
        const elapsedTime = elapsedSinceStart / 1000;
        
        players.forEach(player => {
            player.executeAI(globalTick, elapsedTime);
        });
    }
    
    // Update physics (every frame for smooth movement)
    players.forEach(player => {
        player.update(deltaTime);
    });
    
    // Check for first finisher
    players.forEach(player => {
        if (player.finished && !firstFinisher) {
            firstFinisher = player;
            countdownStartTime = performance.now();
        }
    });
    
    // Check countdown
    if (countdownStartTime) {
        const countdownElapsed = (performance.now() - countdownStartTime) / 1000;
        if (countdownElapsed >= FINISH_COUNTDOWN || players.every(p => p.finished)) {
            endGame();
            return;
        }
    }
    
    // Render
    players.forEach(player => {
        player.render();
    });
    
    // Update UI
    updateUI();
    
    lastTickTime = currentTime;
    animationFrameId = requestAnimationFrame(gameLoop);
}

function updateUI() {
    const elapsedTime = (performance.now() - globalStartTime) / 1000;
    elapsedTimeEl.textContent = elapsedTime.toFixed(2) + 's';
    tickCountEl.textContent = `Tick: ${globalTick}`;
    
    if (countdownStartTime) {
        const remaining = FINISH_COUNTDOWN - (performance.now() - countdownStartTime) / 1000;
        countdownEl.textContent = `Finishing in: ${Math.max(0, remaining).toFixed(1)}s`;
        countdownEl.classList.remove('hidden');
    } else {
        countdownEl.classList.add('hidden');
    }
    
    p1LevelEl.textContent = players[0] ? `Level ${players[0].currentLevel + 1}` : 'Level 1';
    p2LevelEl.textContent = players[1] ? `Level ${players[1].currentLevel + 1}` : 'Level 1';
}

function endGame() {
    gameState = 'finished';
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Determine winner
    const p1 = players[0];
    const p2 = players[1];
    
    let winnerText = 'TIE!';
    if (p1.currentLevel > p2.currentLevel) {
        winnerText = 'PLAYER 1 WINS!';
    } else if (p2.currentLevel > p1.currentLevel) {
        winnerText = 'PLAYER 2 WINS!';
    } else if (p1.finished && p2.finished) {
        // Both finished same levels, compare time
        if (p1.totalTime < p2.totalTime) {
            winnerText = 'PLAYER 1 WINS!';
        } else if (p2.totalTime < p1.totalTime) {
            winnerText = 'PLAYER 2 WINS!';
        }
    } else if (p1.finished) {
        winnerText = 'PLAYER 1 WINS!';
    } else if (p2.finished) {
        winnerText = 'PLAYER 2 WINS!';
    }
    
    // Update results screen
    document.getElementById('winner-text').textContent = winnerText;
    document.getElementById('p1-levels-completed').textContent = p1.currentLevel;
    document.getElementById('p2-levels-completed').textContent = p2.currentLevel;
    document.getElementById('p1-total-time').textContent = p1.totalTime.toFixed(2) + 's';
    document.getElementById('p2-total-time').textContent = p2.totalTime.toFixed(2) + 's';
    document.getElementById('p1-total-ticks').textContent = p1.totalTicks;
    document.getElementById('p2-total-ticks').textContent = p2.totalTicks;
    
    showScreen('results-screen');
}

function resetGame() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    gameState = 'setup';
    players = [];
    showScreen('setup-screen');
}

// Event Listeners
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);
playAgainBtn.addEventListener('click', resetGame);

// Tab handling for textareas
[codeEditor1, codeEditor2].forEach(editor => {
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
        }
    });
});

// Initialize
showScreen('setup-screen');
