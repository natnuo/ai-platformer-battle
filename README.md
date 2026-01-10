# AI Platformer Battle

A multiplayer AI programming game where two players write JavaScript code to control characters racing through platformer levels.

## How to Play

1. Open `index.html` in a web browser
2. Each player writes their AI code in their respective code editor
3. Click "START BATTLE" to begin the race
4. Watch your AIs compete to finish all 10 levels first!

## AI Interface

Your AI function receives the following parameters:

```javascript
function ai(levelData, position, memory, isGrounded, velocity, tick, elapsedTime) {
    // levelData: {
    //     grid: 2D array [100][100] of tile types: 'air', 'lava', 'platform', 'start', 'end'
    //     startPos: { x, y } - starting position
    //     endPos: { x, y } - goal position
    // }
    // position: {
    //     bottomLeft: { x, y },  - bottom-left corner of character
    //     bottomRight: { x, y }, - bottom-right corner of character
    //     topLeft: { x, y },     - top-left corner of character
    //     topRight: { x, y },    - top-right corner of character
    //     center: { x, y }       - center of character
    // }
    // memory: any - persistent data between ticks (starts as {})
    // isGrounded: boolean - true if standing on a platform
    // velocity: { x, y } - current velocity
    // tick: number - current tick count
    // elapsedTime: number - seconds since level start

    return {
        forceX: 0.5,    // [-1.0, 1.0] horizontal force (right is positive)
        forceY: 0.8,    // [0.0, 1.0] jump force (only works when grounded)
        memory: memory  // data to persist to next tick
    };
}
```

## Game Rules

- **Grid Size**: 100x100 tiles
- **Character Size**: 5x5 tiles
- **Tick Rate**: 10 ticks per second (100ms per tick)
- **AI Timeout**: 100ms - if your AI takes longer, that tick is skipped
- **Lava**: Touching lava resets you to the start of the level
- **Goal**: Touch the goal to advance to the next level
- **Winning**: First to complete all 10 levels wins. If one player finishes, the other has 10 seconds to catch up.

## Physics

- Gravity is constantly applied
- Y force (jumping) only works when grounded
- Momentum and inertia exist - you can't instantly stop
- Collision with platforms stops movement in that direction

## Level Format

Levels are defined in `levels.js` as text grids:
- `.` = air
- `#` = platform
- `~` = lava
- `S` = start position
- `E` = end position

## Sample AI Strategies

### Basic Right-Moving Jumper
```javascript
function ai(levelData, position, memory, isGrounded, velocity, tick, elapsedTime) {
    return {
        forceX: 1.0,
        forceY: isGrounded ? 1.0 : 0,
        memory: memory
    };
}
```

### Goal-Seeking AI
```javascript
function ai(levelData, position, memory, isGrounded, velocity, tick, elapsedTime) {
    const goal = levelData.endPos;
    const dx = goal.x - position.center.x;
    const dy = goal.y - position.center.y;
    
    let forceX = dx > 0 ? 1.0 : -1.0;
    let forceY = 0;
    
    // Jump if goal is above or if we need to clear obstacles
    if (isGrounded && (dy > 2 || velocity.x < 0.1)) {
        forceY = 1.0;
    }
    
    return { forceX, forceY, memory };
}
```

## Tips for Writing Good AIs

1. **Use memory** to track state between ticks (e.g., stuck detection)
2. **Check velocity** to detect if you're stuck against a wall
3. **Analyze the grid** at level start to plan a path
4. **Time your jumps** - jumping at the edge of platforms gives more distance
5. **Handle edge cases** - what if you overshoot the goal?

## Files

- `index.html` - Main game page
- `styles.css` - Retro pixel art styling
- `game.js` - Game engine and physics
- `levels.js` - Level definitions and parser

Enjoy coding your AI!
