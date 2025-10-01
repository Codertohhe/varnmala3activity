// Game variables
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playButton = document.getElementById('playButton');
const correctSound = document.getElementById('correctSound');
const wrongSound = document.getElementById('wrongSound');

// Game settings
let gameRunning = false;
let showGameScreen = false; // New state for showing game screen with small button
let score = 0;
let currentTargetLetter;
let letters = [];
let targetDisplay = {
    visible: false,
    text: ''
};

// Parachute management
let parachutesSpawned = 0;
let maxParachutesAtOnce = 3;
let canSpawnNewParachutes = true;

// Tune how close a parachute must get to the slate before counting as a hit
// This reduces the visual gap caused by image padding
const PARACHUTE_TOUCH_OFFSET_PX = 35;

// Characters collected on the slate
let collectedCharacters = [];
const MAX_CHARACTERS = 4;

// Slate object (controlled by player)
const slate = {
    x: canvas.width / 2 - 50,
    y: canvas.height * 0.57 - 10, // Slightly higher above the water
    width: 100,
    height: 20,
    speed: 5,
    showCharacter: false
};

// Hindi letters for the game
const hindiLetters = [
    { letter: 'अ', sound: 'a' },
    { letter: 'आ', sound: 'aa' },
    { letter: 'इ', sound: 'i' },
    { letter: 'ई', sound: 'ee' },
    { letter: 'उ', sound: 'u' },
    { letter: 'ऊ', sound: 'oo' },
    { letter: 'ए', sound: 'e' },
    { letter: 'ऐ', sound: 'ai' },
    { letter: 'ओ', sound: 'o' },
    { letter: 'औ', sound: 'au' },
    { letter: 'क', sound: 'ka' },
    { letter: 'ख', sound: 'kha' },
    { letter: 'ग', sound: 'ga' },
    { letter: 'घ', sound: 'gha' },
    { letter: 'च', sound: 'cha' },
    { letter: 'छ', sound: 'chha' },
    { letter: 'ज', sound: 'ja' },
    { letter: 'झ', sound: 'jha' },
    { letter: 'ट', sound: 'ta' },
    { letter: 'ठ', sound: 'tha' },
    { letter: 'ड', sound: 'da' },
    { letter: 'ढ', sound: 'dha' },
    { letter: 'त', sound: 'ta_soft' },
    { letter: 'थ', sound: 'tha_soft' },
    { letter: 'द', sound: 'da_soft' },
    { letter: 'ध', sound: 'dha_soft' },
    { letter: 'न', sound: 'na' },
    { letter: 'प', sound: 'pa' },
    { letter: 'फ', sound: 'pha' },
    { letter: 'ब', sound: 'ba' },
    { letter: 'भ', sound: 'bha' },
    { letter: 'म', sound: 'ma' },
    { letter: 'य', sound: 'ya' },
    { letter: 'र', sound: 'ra' },
    { letter: 'ल', sound: 'la' },
    { letter: 'व', sound: 'va' },
    { letter: 'श', sound: 'sha' },
    { letter: 'ष', sound: 'sha_hard' },
    { letter: 'स', sound: 'sa' },
    { letter: 'ह', sound: 'ha' }
];

// Track misses (wrong attempts)
let misses = 0;
const MAX_MISSES = 4;

// Audio control
let soundInterval = null;
let currentAudio = null;
// Prefer female TTS for letter pronunciation
let preferFemaleTTS = true;
let selectedHindiFemaleVoice = null;

// Get audio elements from DOM
const headingSound = document.getElementById('headingSound');
const waterDropSound = new Audio('sounds/water.mp3');

// Track if heading sound has been played
let headingSoundPlayed = false;

// Load and select a female Hindi voice if available
function pickHindiFemaleVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const hindiVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('hi'));
    // Heuristics for female-sounding voices by common names/labels
    const femaleHints = ['female', 'woman', 'kalpana', 'swara', 'neerja', 'shruti', 'ananya', 'pallavi', 'indraja'];
    let preferred = null;
    for (const v of hindiVoices) {
        const name = (v.name || '').toLowerCase();
        if (femaleHints.some(h => name.includes(h))) {
            preferred = v; break;
        }
    }
    // Fallback to Google Hindi or first Hindi voice
    if (!preferred) {
        preferred = hindiVoices.find(v => (v.name || '').toLowerCase().includes('google')) || hindiVoices[0] || null;
    }
    return preferred || null;
}

function ensureVoiceSelected() {
    if (!selectedHindiFemaleVoice) {
        selectedHindiFemaleVoice = pickHindiFemaleVoice();
    }
}

if ('speechSynthesis' in window) {
    // Some browsers populate voices asynchronously
    window.speechSynthesis.onvoiceschanged = () => {
        selectedHindiFemaleVoice = pickHindiFemaleVoice();
    };
}

// Water splash effects
let waterSplashes = [];
let splashAnimations = []; // Track splash gif animations
let wrongLetterAnimations = []; // Track wrong letter animations
let rocks = []; // Track falling rocks
let slateBroken = false; // Track if slate is broken
let slateRepairTime = 0; // Track slate repair timing
let slatePieces = []; // Track broken slate pieces
// Hide game bodies during reset sequence after a wrong collection
let hideBodiesDuringReset = false;
let restartScheduled = false;
// Control whether the game auto-restarts after a wrong collection
const AUTO_RESTART_ON_WRONG = false;

// Update octopus chances display and wooden slates
function updateOctopusChances() {
    const octopusChances = document.getElementById('octopusChances');
    if (octopusChances) {
        octopusChances.textContent = misses;
    }
    updateChancesBar();
}

function updateChancesBar() {
    const slates = document.querySelectorAll('.chance-slate');
    slates.forEach((slate, idx) => {
        // If this miss has occurred, replace the wooden slate with woodenslatecancel image
        if (idx < misses) {
            slate.src = 'images/woodenslatecancel.png';
        } else {
            // Reset to normal wooden slate if no miss
            slate.src = 'images/woodenslate.png';
        }
    });
}

// Load images
const slateImage = new Image();
slateImage.src = 'images/slate.svg';

const parachuteImage = new Image();
parachuteImage.src = 'images/parachute.png';

const characterImage = new Image();
characterImage.src = 'images/character.png';

const backgroundImage = new Image();
backgroundImage.src = 'images/background.svg';
// Ensure the first screen redraws with the background once it loads
backgroundImage.onload = () => {
    // Only redraw the idle screen; gameplay has its own loop
    if (!gameRunning) {
        drawGame();
    }
};

const turtleImage = new Image();
turtleImage.src = 'images/turtleimg.png';

const chapakGif = new Image();
chapakGif.src = 'images/chapak-unscreen.gif';

const waterGif = new Image();
waterGif.src = 'images/water.gif';

// Key states for movement
const keys = {
    ArrowLeft: false,
    ArrowRight: false
};

// Event listeners
playButton.addEventListener('click', startGame);

// Add canvas click event listener for the small start button
canvas.addEventListener('click', (e) => {
    if (showGameScreen && !gameRunning && window.smallButtonCoords) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if click is within the small button area
        if (x >= window.smallButtonCoords.x && 
            x <= window.smallButtonCoords.x + window.smallButtonCoords.width &&
            y >= window.smallButtonCoords.y && 
            y <= window.smallButtonCoords.y + window.smallButtonCoords.height) {
            startGame(); // This will call actuallyStartGame() since showGameScreen is true
        }
    }
});

// Replay sound button removed as requested

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

// Add event listeners for movement arrows
window.addEventListener('DOMContentLoaded', () => {
    const leftArrow = document.getElementById('leftArrow');
    const rightArrow = document.getElementById('rightArrow');
    if (leftArrow) {
        leftArrow.addEventListener('mousedown', () => {
            keys.ArrowLeft = true;
        });
        leftArrow.addEventListener('mouseup', () => {
            keys.ArrowLeft = false;
        });
        leftArrow.addEventListener('mouseleave', () => {
            keys.ArrowLeft = false;
        });
        leftArrow.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys.ArrowLeft = true;
        });
        leftArrow.addEventListener('touchend', () => {
            keys.ArrowLeft = false;
        });
    }
    if (rightArrow) {
        rightArrow.addEventListener('mousedown', () => {
            keys.ArrowRight = true;
        });
        rightArrow.addEventListener('mouseup', () => {
            keys.ArrowRight = false;
        });
        rightArrow.addEventListener('mouseleave', () => {
            keys.ArrowRight = false;
        });
        rightArrow.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys.ArrowRight = true;
        });
        rightArrow.addEventListener('touchend', () => {
            keys.ArrowRight = false;
        });
    }
});

// Play heading sound when page loads (NOT when Play button is clicked)
function playHeadingSound() {
    // Don't play heading sound if game is running
    if (gameRunning) {
        console.log('Game is running, skipping heading sound');
        return;
    }

    if (headingSoundPlayed) return; // Don't play if already played

    console.log('Attempting to play heading sound...');
    try {
        if (!headingSound) {
            console.log('Heading sound element not found');
            return;
        }
        headingSound.currentTime = 0; // Reset to beginning
        headingSound.play().then(() => {
            console.log('Heading sound played successfully');
            headingSoundPlayed = true;
        }).catch(e => {
            console.log('Could not play heading sound automatically:', e);
            // If automatic play fails, set up click handler for first user interaction
            setupClickToPlayAnywhere();
        });
    } catch (e) {
        console.log('Heading sound not available:', e);
        setupClickToPlayAnywhere();
    }
}

// Setup click/touch handler to play heading sound on first user interaction
function setupClickToPlayAnywhere() {
    if (headingSoundPlayed || gameRunning || !headingSound) return;

    const playOnInteraction = () => {
        // Don't play heading sound if game is running
        if (gameRunning) {
            console.log('Game is running, removing interaction handler for heading sound');
            cleanupHandlers();
            return;
        }

        if (!headingSoundPlayed) {
            headingSound.play().then(() => {
                console.log('Heading sound played on first interaction');
                headingSoundPlayed = true;
                cleanupHandlers();
            }).catch(e => {
                console.log('Still could not play heading sound:', e);
            });
        }
    };

    const cleanupHandlers = () => {
        document.removeEventListener('click', playOnInteraction);
        document.removeEventListener('touchstart', playOnInteraction);
        document.removeEventListener('keydown', playOnInteraction);
    };

    // Add multiple event listeners to capture any user interaction
    document.addEventListener('click', playOnInteraction);
    document.addEventListener('touchstart', playOnInteraction);
    document.addEventListener('keydown', playOnInteraction);

    // Remove handlers after some time if not triggered
    setTimeout(cleanupHandlers, 30000); // 30 seconds
}

// Game functions
function startGame() {
    if (!gameRunning && !showGameScreen) {
        // First click on Play button - play heading sound and show game screen
        playHeadingSound();
        showGameScreen = true;
        playButton.textContent = 'Restart';
        console.log('Heading sound played, showing game screen with small button');
        drawGame(); // Redraw to show the game screen
    } else if (showGameScreen && !gameRunning) {
        // Click on the small start button - actually start the game
        actuallyStartGame();
    } else if (gameRunning) {
        // Restart the game - but prevent infinite loop
        gameRunning = false;
        showGameScreen = false;
        stopRepeatingSound(); // Stop sounds when restarting
        setTimeout(() => {
            startGame();
        }, 100);
    }
}

function actuallyStartGame() {
    // Stop any existing sounds
    stopRepeatingSound();

    gameRunning = true;
    showGameScreen = false;
    score = 0;
    letters = [];
    collectedCharacters = [];
    targetDisplay.visible = false;
    misses = 0; // Reset misses to 0
    parachutesSpawned = 0; // Reset parachute count
    canSpawnNewParachutes = true; // Allow spawning new parachutes
    splashAnimations = []; // Reset splash animations
    wrongLetterAnimations = []; // Reset wrong letter animations
    rocks = []; // Reset rocks
    slateBroken = false; // Reset slate state
    slateRepairTime = 0; // Reset repair time
    slatePieces = []; // Reset slate pieces

    // Debug canvas dimensions
    console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}, water level: ${canvas.height * 0.7}`);

    updateOctopusChances();
    // Target letter will be selected when first parachute is created
    gameLoop();
}

function generateNewTargetLetter() {
    const randomIndex = Math.floor(Math.random() * hindiLetters.length);
    currentTargetLetter = hindiLetters[randomIndex];

    // Update the target display
    targetDisplay.visible = true;
    targetDisplay.text = `Listen and collect: ${currentTargetLetter.letter}`;

    // Voice will be played when the first parachute of the batch is created
    console.log(`Target letter set: ${currentTargetLetter.sound} (${currentTargetLetter.letter})`);
}

function playLetterSound(sound, devanagari) {
    // Stop any existing sound
    stopRepeatingSound();

    // Prefer TTS with a female voice when possible
    if (preferFemaleTTS && 'speechSynthesis' in window) {
        ensureVoiceSelected();
        startRepeatingSpeech(sound, devanagari);
        return;
    }

    try {
        // Try to play the audio file for the letter sound
        currentAudio = new Audio(`sounds/${sound}.mp3`);
        // Make the pronunciation faster without changing pitch significantly
        try { currentAudio.playbackRate = 1.5; } catch (e) {}
        if ('preservesPitch' in currentAudio) {
            try { currentAudio.preservesPitch = false; } catch (e) {}
        }
        // Repeat the audio more frequently by looping continuously
        currentAudio.loop = true;
        currentAudio.play().catch(e => {
            console.log('Audio file not found, using text-to-speech fallback');
            // Fallback to text-to-speech if audio file doesn't exist
            startRepeatingSpeech(sound, devanagari);
        });

    } catch (e) {
        console.log('Audio not available, using text-to-speech');
        startRepeatingSpeech(sound, devanagari);
    }
}

function startRepeatingSpeech(sound, devanagari) {
    // Repeat speech more frequently (every 1.5 seconds)
    soundInterval = setInterval(() => {
        if (gameRunning) {
            speakLetter(sound, devanagari);
        }
    }, 1500);

    // Play immediately
    speakLetter(sound, devanagari);
}

function stopRepeatingSound() {
    // Stop audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }

    // Stop speech interval
    if (soundInterval) {
        clearInterval(soundInterval);
        soundInterval = null;
    }
}

function speakLetter(sound, devanagari) {
    // Use Web Speech API as fallback
    if ('speechSynthesis' in window) {
        // Use Devanagari letter for TTS if available
        const utterance = new SpeechSynthesisUtterance(devanagari || sound.replace(/_/g, ' '));
        utterance.lang = 'hi-IN'; // Hindi language
        // Speak faster to reduce time per repetition
        utterance.rate = 1.3;
        utterance.pitch = 1.0;
        if (selectedHindiFemaleVoice) {
            utterance.voice = selectedHindiFemaleVoice;
        }
        speechSynthesis.speak(utterance);
    } else {
        console.log('Speech synthesis not supported');
    }
}

function createLetter() {
    if (!gameRunning || !canSpawnNewParachutes) return;

    // Create three different letters for the batch
    let letterObj;
    if (parachutesSpawned === 0) {
        // First parachute - random letter
        const randomIndex1 = Math.floor(Math.random() * hindiLetters.length);
        letterObj = hindiLetters[randomIndex1];
    } else if (parachutesSpawned === 1) {
        // Second parachute - different random letter
        let randomIndex2;
        do {
            randomIndex2 = Math.floor(Math.random() * hindiLetters.length);
        } while (hindiLetters[randomIndex2].letter === letters[0].letter);
        letterObj = hindiLetters[randomIndex2];
    } else {
        // Third parachute - different random letter
        let randomIndex3;
        do {
            randomIndex3 = Math.floor(Math.random() * hindiLetters.length);
        } while (hindiLetters[randomIndex3].letter === letters[0].letter ||
            hindiLetters[randomIndex3].letter === letters[1].letter);
        letterObj = hindiLetters[randomIndex3];
    }

    let newX;
    const parachuteWidth = 160;
    const minGap = 400; // Much larger gap - 400 pixels between parachutes
    const margin = 100; // Much larger margin from screen edges

    if (letters.length === 0) {
        // First parachute - place it on the left side
        newX = margin;
    } else if (letters.length === 1) {
        // Second parachute - place it on the right side
        newX = canvas.width - parachuteWidth - margin;
    } else {
        // Third parachute - place it in the middle
        newX = (canvas.width - parachuteWidth) / 2;
    }

    // Ensure it doesn't go off screen
    newX = Math.max(margin, Math.min(newX, canvas.width - parachuteWidth - margin));
    // Determine if this parachute should be the target (voice) letter
    // We'll randomly select one of the three parachutes to be the target
    let isTarget = false;
    if (parachutesSpawned === 0) {
        // Randomly decide if the first parachute should be the target
        isTarget = Math.random() < 0.33; // 33% chance
    } else if (parachutesSpawned === 1) {
        // If first wasn't target, this one has 50% chance
        isTarget = !letters[0].isTarget && Math.random() < 0.5;
    } else {
        // If neither first nor second was target, this one must be target
        isTarget = !letters[0].isTarget && !letters[1].isTarget;
    }

    const letter = {
        x: newX,
        y: -50, // Start from behind the top border instead of far above
        width: 160, // Increased width
        height: 130, // Increased height
        letter: letterObj.letter,
        isTarget: isTarget,
        speed: 0.5 + Math.random() * 0.5, // Slightly faster speed
        collected: false
    };
    letters.push(letter);
    parachutesSpawned++;
    console.log(`Spawned parachute ${parachutesSpawned}/${maxParachutesAtOnce} at x:${newX}, y:-100, size:${letter.width}x${letter.height}`);

    // Play the voice only for the target parachute
    if (isTarget) {
        console.log(`Playing voice for target letter: ${letterObj.sound} (${letterObj.letter})`);
        playLetterSound(letterObj.sound, letterObj.letter);
    }

    // If we've spawned the maximum number of parachutes, stop spawning
    if (parachutesSpawned >= maxParachutesAtOnce) {
        canSpawnNewParachutes = false;
        console.log('Reached maximum parachutes, stopping spawn');
    }
}

function updateGame() {
    // Move the slate based on key presses
    if (keys.ArrowLeft && slate.x > 0) {
        slate.x -= slate.speed;
    }
    if (keys.ArrowRight && slate.x < canvas.width - slate.width) {
        slate.x += slate.speed;
    }

    // Update letters position and check for collisions
    for (let i = 0; i < letters.length; i++) {
        const letter = letters[i];

        if (!letter.collected) {
            letter.y += letter.speed;

            // Check for collision with slate (use offset to reduce visual gap)
            if (letter.y + letter.height - PARACHUTE_TOUCH_OFFSET_PX > slate.y &&
                letter.y < slate.y + slate.height &&
                letter.x + letter.width > slate.x &&
                letter.x < slate.x + slate.width) {

                letter.collected = true;

                if (letter.isTarget) {
                    // Stop the repeating sound when correct letter is collected
                    stopRepeatingSound();

                    // Try to play the correct sound if available
                    if (correctSound) {
                        try {
                            correctSound.play();
                        } catch (e) {
                            console.log('Could not play sound:', e);
                        }
                    }
                    console.log('Correct letter collected!');

                    // Add character to the collected characters array
                    collectedCharacters.push({
                        letter: letter.letter,
                        x: slate.x + (collectedCharacters.length * 25) // Position characters side by side
                    });

                    // Check if we've collected the maximum number of characters
                    if (collectedCharacters.length >= MAX_CHARACTERS) {
                        // Update score to show multiples of 4 (4, 8, 12, etc.)
                        score += 4;
                        console.log('4 letters collected! Score updated to:', score);

                        // Instead of congratulating, decrement a chance and reset collectedCharacters
                        misses = Math.min(MAX_MISSES, misses + 1);
                        updateOctopusChances();
                        collectedCharacters = [];
                        if (misses >= MAX_MISSES) {
                            showGameOverBox();
                            gameRunning = false;
                            return;
                        }
                    }

                    // Generate a new target letter (which will start the new sound)
                    generateNewTargetLetter();
                    // Remove the collected letter from the array
                    letters.splice(i, 1);
                    i--;
                } else {
                    // Wrong letter collected
                    if (wrongSound) {
                        try {
                            wrongSound.play();
                        } catch (e) {
                            console.log('Could not play sound:', e);
                        }
                    }

                    // Create a falling rock from above the slate
                    createRock(slate.x + slate.width / 2, slate.y - 100);

                    misses = Math.min(MAX_MISSES, misses + 1);
                    updateOctopusChances();
                    // Lose progress: clear collected characters so player starts again
                    collectedCharacters = [];
                    console.log('Wrong letter collected!');
                    // End game if max misses reached
                    if (misses >= MAX_MISSES) {
                        showGameOverBox();
                        gameRunning = false;
                        return;
                    }
                    // Remove the collected letter from the array
                    letters.splice(i, 1);
                    i--;
                }
            }
        }

        // Check if letter hits the water (adjust for parachute height)
        const waterLevel = canvas.height * 0.7;
        const parachuteBottom = letter.y + letter.height;

        if (parachuteBottom > waterLevel) {
            console.log(`Parachute hit water at x:${letter.x}, y:${letter.y}, waterLevel:${waterLevel}`);
            // Create water splash effect at the water surface
            createWaterSplash(letter.x + letter.width / 2, waterLevel);

            // Create splash animation with chapak gif at water surface
            createSplashAnimation(letter.x + letter.width / 2, waterLevel);

            // Play drop sound
            playDropSound();

            // Remove the letter (make it invisible)
            letters.splice(i, 1);
            i--;
        }
    }

    // Check if all parachutes have dropped and we can spawn new ones
    if (letters.length === 0 && canSpawnNewParachutes === false) {
        // All parachutes have dropped, reset for next batch
        parachutesSpawned = 0;
        canSpawnNewParachutes = true;
        console.log('All parachutes dropped, spawning new batch of 3');
    }

    // Spawn new parachutes only if we can and haven't reached the limit
    if (canSpawnNewParachutes && parachutesSpawned < maxParachutesAtOnce && misses < MAX_MISSES && gameRunning !== false) {
        createLetter();
    }

    // Update water splashes
    updateWaterSplashes();

    // Update splash animations
    updateSplashAnimations();

    // Update wrong letter animations
    updateWrongLetterAnimations();

    // Update rocks
    updateRocks();

    // Update slate pieces
    updateSlatePieces();
}

function drawGame() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    if (backgroundImage.complete) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
        // Fallback if image not loaded
        ctx.fillStyle = '#87CEEB'; // Sky blue
        ctx.fillRect(0, 0, canvas.width, canvas.height * 0.7);

        ctx.fillStyle = '#0077BE'; // Deep blue for water
        ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);
    }

    // Always draw the slate (wooden plank)
    if (!slateBroken) {
        if (slateImage.complete) {
            ctx.drawImage(slateImage, slate.x, slate.y, slate.width, slate.height);
        } else {
            ctx.fillStyle = '#8B4513'; // Brown for wooden slate
            ctx.fillRect(slate.x, slate.y, slate.width, slate.height);
        }
    } else if (slatePieces.length > 0) {
        // Draw slate pieces instead of broken slate
        drawSlatePieces();
    } else {
        // Draw broken slate (fallback)
        ctx.fillStyle = '#654321'; // Darker brown for broken slate
        ctx.fillRect(slate.x, slate.y, slate.width, slate.height);

        // Draw cracks on the slate
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(slate.x + slate.width * 0.3, slate.y);
        ctx.lineTo(slate.x + slate.width * 0.3, slate.y + slate.height);
        ctx.moveTo(slate.x + slate.width * 0.7, slate.y);
        ctx.lineTo(slate.x + slate.width * 0.7, slate.y + slate.height);
        ctx.stroke();
    }

    // Draw collected characters on the slate (only when visible and slate intact)
    if (gameRunning && !hideBodiesDuringReset && !slateBroken && collectedCharacters.length > 0) {
        const charWidth = 120; // Increased size
        const charHeight = 84; // Increased size proportionally
        const spacing = 25; // Space between characters

        // Calculate starting position to center the characters on the slate
        const totalWidth = collectedCharacters.length * spacing;
        const startX = slate.x + (slate.width / 2) - (totalWidth / 2) + (spacing / 2);

        collectedCharacters.forEach((char, index) => {
            if (characterImage.complete) {
                // Draw only the character image on the slate (no letter text)
                ctx.drawImage(characterImage,
                    startX + (index * spacing) - charWidth / 2,
                    slate.y - charHeight + slate.height,
                    charWidth, charHeight);
            } else {
                // Fallback simple body without letter text
                ctx.fillStyle = '#FFA500';
                ctx.fillRect(startX + (index * spacing) - 10, slate.y - 25, 20, 20);
                ctx.fillRect(startX + (index * spacing) - 5, slate.y - 5, 10, 10);
            }
        });
    }

    // Only draw letters with parachutes when game is running
    if (gameRunning && !hideBodiesDuringReset) {
        letters.forEach(letter => {
            if (!letter.collected) {
                if (parachuteImage.complete) {
                    // Use the parachute SVG image
                    ctx.save();
                    // Apply color tint based on whether it's the target letter
                    if (letter.isTarget) {
                        ctx.filter = 'hue-rotate(0deg)'; // Keep pink color for target
                    } else {
                        ctx.filter = 'hue-rotate(60deg)'; // Yellow tint for non-target
                    }
                    ctx.drawImage(parachuteImage, letter.x, letter.y, letter.width, letter.height);
                    ctx.restore();

                    // Draw letter text on top of the parachute
                    ctx.fillStyle = 'black';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(letter.letter, letter.x + letter.width / 2, letter.y + 40);
                } else {
                    // Fallback if image not loaded
                    // Draw parachute
                    ctx.fillStyle = letter.isTarget ? '#FF69B4' : '#FFFF00'; // Pink for target, yellow for others
                    ctx.beginPath();
                    ctx.arc(letter.x + letter.width / 2, letter.y + 10, 30, 0, Math.PI, true);
                    ctx.fill();

                    // Draw strings
                    ctx.strokeStyle = 'black';
                    ctx.beginPath();
                    ctx.moveTo(letter.x + letter.width / 2 - 20, letter.y + 10);
                    ctx.lineTo(letter.x + letter.width / 2 - 5, letter.y + 40);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(letter.x + letter.width / 2 + 20, letter.y + 10);
                    ctx.lineTo(letter.x + letter.width / 2 + 5, letter.y + 40);
                    ctx.stroke();

                    // Draw letter circle
                    ctx.fillStyle = letter.isTarget ? '#FF69B4' : '#FFFF00';
                    ctx.beginPath();
                    ctx.arc(letter.x + letter.width / 2, letter.y + 40, 20, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw letter text
                    ctx.fillStyle = 'black';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(letter.letter, letter.x + letter.width / 2, letter.y + 40);
                }
            }
        });
    }

    // Target letter indicator removed as requested

    // Draw instructions if game is not running
    if (!gameRunning) {
        if (!showGameScreen) {
            // Initial state - show play button overlay
            // Draw a semi-transparent overlay for the play button area
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Center the play button on the canvas
            playButton.style.display = 'block';
            playButton.style.position = 'absolute';
            playButton.style.left = '50%';
            playButton.style.top = '50%';
            playButton.style.transform = 'translate(-50%, -50%)';
            playButton.style.zIndex = '100';
            playButton.style.padding = '25px 50px';
            playButton.style.fontSize = '28px';
            playButton.style.fontWeight = 'bold';
            playButton.style.backgroundColor = '#3498db';
            playButton.style.color = 'white';
            playButton.style.border = 'none';
            playButton.style.borderRadius = '15px';
            playButton.style.cursor = 'pointer';
            playButton.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
            playButton.style.transition = 'all 0.3s ease';
            playButton.textContent = 'Start Game';
        } else {
            // Game screen state - hide play button overlay and show small button inside canvas
            playButton.style.display = 'none';
            
            // Draw a small start button inside the canvas
            drawSmallStartButton();
        }
    } else {
        // Hide the play button during game play
        playButton.style.display = 'none';
    }

    // Draw water splashes
    drawWaterSplashes();

    // Draw splash animations
    drawSplashAnimations();

    // Draw wrong letter animations
    if (!hideBodiesDuringReset) {
        drawWrongLetterAnimations();
    }

    // Draw rocks
    drawRocks();

    // Draw the turtle image and score outside the canvas (on the page)
    drawTurtleOnBorder();
}

function drawSmallStartButton() {
    // Draw a small start button in the center of the canvas, slightly upward
    const buttonX = canvas.width / 2 - 60;
    const buttonY = canvas.height / 2 - 50; // Moved upward by 30 pixels
    const buttonWidth = 120;
    const buttonHeight = 40;
    const borderRadius = 8; // Border radius for rounded corners
    
    // Draw button background with rounded corners
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, borderRadius);
    ctx.fill();
    
    // Draw button border with rounded corners
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, borderRadius);
    ctx.stroke();
    
    // Draw button text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Play', canvas.width / 2, canvas.height / 2 - 30); // Adjusted text position
    
    // Store button coordinates for click detection
    window.smallButtonCoords = {
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight
    };
}

function drawTurtleOnBorder() {
    if (turtleImage.complete) {
        // Get the canvas container position
        const canvasRect = canvas.getBoundingClientRect();
        const gameArea = canvas.parentElement;

        // Create or get existing turtle element
        let turtleElement = document.getElementById('turtleScoreDisplay');
        if (!turtleElement) {
            turtleElement = document.createElement('div');
            turtleElement.id = 'turtleScoreDisplay';
            turtleElement.style.position = 'absolute';
            turtleElement.style.width = '150px';
            turtleElement.style.height = '150px';
            turtleElement.style.backgroundImage = `url(${turtleImage.src})`;
            turtleElement.style.backgroundSize = 'contain';
            turtleElement.style.backgroundRepeat = 'no-repeat';
            turtleElement.style.backgroundPosition = 'center';
            turtleElement.style.display = 'flex';
            turtleElement.style.alignItems = 'center';
            turtleElement.style.justifyContent = 'center';
            turtleElement.style.fontSize = '24px';
            turtleElement.style.fontWeight = 'bold';
            turtleElement.style.color = 'white';
            turtleElement.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
            gameArea.appendChild(turtleElement);
        }

        // Position turtle on the bottom right of the game area
        turtleElement.style.right = '20px';
        turtleElement.style.bottom = '50px'; // Position at bottom of game area
        turtleElement.style.overflow = 'visible'; // Allow overflow
        turtleElement.style.pointerEvents = 'none'; // Prevent interaction issues
        turtleElement.style.textAlign = 'center';
        turtleElement.style.paddingTop = '80px'; // Move score text lower on the board
        turtleElement.style.paddingLeft = '40px'; // Move score text right to align with board
        turtleElement.textContent = ''; // Clear any existing text

        // Remove previous score span if it exists
        let scoreSpan = turtleElement.querySelector('.turtle-score');
        if (!scoreSpan) {
            scoreSpan = document.createElement('span');
            scoreSpan.className = 'turtle-score';
            scoreSpan.style.position = 'absolute';
            scoreSpan.style.left = '35px'; // Move further right
            scoreSpan.style.top = '38px';  // Move further up
            scoreSpan.style.fontSize = '30px';
            scoreSpan.style.fontWeight = 'bold';
            scoreSpan.style.color = 'white';
            scoreSpan.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
            turtleElement.appendChild(scoreSpan);
        }
        // Only show score when it's a multiple of 4 (4, 8, 12, etc.)
        if (score > 0 && score % 4 === 0) {
            scoreSpan.textContent = score;
        } else {
            scoreSpan.textContent = ''; // Hide score when not a multiple of 4
        }
        turtleElement.style.textAlign = '';
        turtleElement.style.paddingTop = '';
        turtleElement.style.paddingLeft = '';
        turtleElement.appendChild(scoreSpan);
    }
}

function drawCloud(x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.arc(x + size / 2, y - size / 4, size / 3, 0, Math.PI * 2);
    ctx.arc(x + size, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
}

function createWaterSplash(x, y) {
    // Create multiple splash particles for more realistic effect
    for (let i = 0; i < 15; i++) {
        const angle = (Math.PI * 2 * i) / 15; // Distribute particles in a circle
        const speed = Math.random() * 8 + 4; // Random speed

        waterSplashes.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed, // Circular distribution
            vy: Math.sin(angle) * speed - 3, // Slight upward bias
            life: 1.0,
            size: Math.random() * 6 + 3, // Larger particles
            gravity: 0.4 + Math.random() * 0.2, // Variable gravity
            bounce: 0.3 + Math.random() * 0.2, // Bounce effect
            hasBounced: false
        });
    }

    // Add some smaller secondary droplets
    for (let i = 0; i < 8; i++) {
        waterSplashes.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y,
            vx: (Math.random() - 0.5) * 12,
            vy: -Math.random() * 8 - 4,
            life: 0.8,
            size: Math.random() * 3 + 1,
            gravity: 0.5,
            bounce: 0.4,
            hasBounced: false
        });
    }
}

function createSplashAnimation(x, y) {
    // Create a splash animation with the chapak gif
    const splashAnim = {
        x: x - 50, // Center the gif on the splash point
        y: y - 50,
        width: 100,
        height: 100,
        life: 1.0,
        duration: 2000, // 2 seconds
        startTime: Date.now()
    };

    splashAnimations.push(splashAnim);
    console.log('Created splash animation at', x, y);
}

function createWrongLetterAnimation(x, y) {
    // Create a wrong letter animation with the water gif
    const wrongAnim = {
        x: x - 40, // Center the gif on the slate
        y: y - 40,
        width: 80,
        height: 80,
        life: 1.0,
        duration: 1500, // 1.5 seconds
        startTime: Date.now()
    };

    wrongLetterAnimations.push(wrongAnim);
    console.log('Created wrong letter animation at', x, y);
}

function createRock(x, y) {
    // Create a falling rock
    const rock = {
        x: x,
        y: y,
        width: 30,
        height: 30,
        speed: 3,
        rotation: 0,
        rotationSpeed: 0.1,
        hasHitSlate: false
    };

    rocks.push(rock);
    console.log('Created rock at', x, y);
}

function createSlateBreakingEffect(x, y) {
    // Create slate breaking particles
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const speed = Math.random() * 6 + 3;

        waterSplashes.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 1.0,
            size: Math.random() * 4 + 2,
            gravity: 0.3,
            bounce: 0.2,
            hasBounced: false
        });
    }
}

function createSlatePieces() {
    // Clear existing pieces
    slatePieces = [];

    const currentTime = Date.now();

    // Create left piece
    const leftPiece = {
        x: slate.x,
        y: slate.y,
        width: slate.width / 2,
        height: slate.height,
        vx: -2, // Move left
        vy: 1, // Slight downward movement
        rotation: -0.2, // Rotate left
        rotationSpeed: 0.05,
        life: 1.0,
        duration: 3000, // 3 seconds
        startTime: currentTime
    };

    // Create right piece
    const rightPiece = {
        x: slate.x + slate.width / 2,
        y: slate.y,
        width: slate.width / 2,
        height: slate.height,
        vx: 2, // Move right
        vy: 1, // Slight downward movement
        rotation: 0.2, // Rotate right
        rotationSpeed: -0.05,
        life: 1.0,
        duration: 3000, // 3 seconds
        startTime: currentTime
    };

    slatePieces.push(leftPiece, rightPiece);
    console.log('Created slate pieces');
}

function updateWaterSplashes() {
    for (let i = waterSplashes.length - 1; i >= 0; i--) {
        const splash = waterSplashes[i];

        // Update position
        splash.x += splash.vx;
        splash.y += splash.vy;
        splash.vy += splash.gravity; // Variable gravity

        // Bounce effect when hitting water surface
        if (splash.y >= canvas.height * 0.7 && !splash.hasBounced && splash.vy > 0) {
            splash.vy *= -splash.bounce; // Bounce with energy loss
            splash.vx *= 0.8; // Reduce horizontal velocity
            splash.hasBounced = true;
        }

        // Air resistance
        splash.vx *= 0.99;

        // Fade out over time
        splash.life -= 0.015;

        // Remove old splashes
        if (splash.life <= 0 || splash.y > canvas.height + 50) {
            waterSplashes.splice(i, 1);
        }
    }
}

function updateSplashAnimations() {
    const currentTime = Date.now();

    for (let i = splashAnimations.length - 1; i >= 0; i--) {
        const anim = splashAnimations[i];
        const elapsed = currentTime - anim.startTime;

        // Calculate life based on elapsed time
        anim.life = Math.max(0, 1 - (elapsed / anim.duration));

        // Remove expired animations
        if (anim.life <= 0) {
            splashAnimations.splice(i, 1);
        }
    }
}

function updateWrongLetterAnimations() {
    const currentTime = Date.now();

    for (let i = wrongLetterAnimations.length - 1; i >= 0; i--) {
        const anim = wrongLetterAnimations[i];
        const elapsed = currentTime - anim.startTime;

        // Calculate life based on elapsed time
        anim.life = Math.max(0, 1 - (elapsed / anim.duration));

        // Remove expired animations
        if (anim.life <= 0) {
            wrongLetterAnimations.splice(i, 1);
        }
    }
}

function updateRocks() {
    for (let i = rocks.length - 1; i >= 0; i--) {
        const rock = rocks[i];

        // Update rock position and rotation
        rock.y += rock.speed;
        rock.rotation += rock.rotationSpeed;

        // Check if rock hits the slate
        if (!rock.hasHitSlate &&
            rock.y + rock.height > slate.y &&
            rock.y < slate.y + slate.height &&
            rock.x + rock.width > slate.x &&
            rock.x < slate.x + slate.width) {

            rock.hasHitSlate = true;
            slateBroken = true;
            slateRepairTime = Date.now() + 2000; // Repair after 2 seconds
            console.log('Rock hit slate! Slate is broken!');

            // Create slate breaking particles
            createSlateBreakingEffect(slate.x + slate.width / 2, slate.y + slate.height / 2);

            // Create two slate pieces
            createSlatePieces();

            // Optionally auto-restart; by default keep playing and only show broken slate effect
            if (AUTO_RESTART_ON_WRONG) {
                hideBodiesDuringReset = true;
                stopRepeatingSound();
                letters = []; // Hide remaining parachutes immediately
                if (!restartScheduled) {
                    restartScheduled = true;
                    setTimeout(() => {
                        restartScheduled = false;
                        hideBodiesDuringReset = false;
                        startGame();
                    }, 1200);
                }
            }
        }

        // Remove rock if it goes below the water
        if (rock.y > canvas.height) {
            rocks.splice(i, 1);
        }
    }

    // Check if slate should be repaired
    if (slateBroken && Date.now() > slateRepairTime) {
        slateBroken = false;
        slatePieces = []; // Clear slate pieces
        console.log('Slate repaired!');
    }
}

function updateSlatePieces() {
    const currentTime = Date.now();

    for (let i = slatePieces.length - 1; i >= 0; i--) {
        const piece = slatePieces[i];

        // Update position
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.rotationSpeed;

        // Add gravity
        piece.vy += 0.1;

        // Fade out over time
        const elapsed = currentTime - (piece.startTime || currentTime);
        piece.life = Math.max(0, 1 - (elapsed / piece.duration));

        // Remove expired pieces
        if (piece.life <= 0 || piece.y > canvas.height) {
            slatePieces.splice(i, 1);
        }
    }
}

function drawWaterSplashes() {
    waterSplashes.forEach(splash => {
        ctx.save();
        ctx.globalAlpha = splash.life;

        // Create more realistic water droplet shape
        const gradient = ctx.createRadialGradient(
            splash.x - splash.size / 3, splash.y - splash.size / 3, 0,
            splash.x, splash.y, splash.size
        );
        gradient.addColorStop(0, '#E6F7FF'); // Light blue center
        gradient.addColorStop(0.7, '#87CEEB'); // Medium blue
        gradient.addColorStop(1, '#4682B4'); // Darker blue edge

        ctx.fillStyle = gradient;
        ctx.beginPath();

        // Draw teardrop shape for more realistic water droplets
        if (splash.vy > 0) { // Falling droplets are teardrop shaped
            ctx.ellipse(splash.x, splash.y, splash.size, splash.size * 1.5, 0, 0, Math.PI * 2);
        } else { // Rising droplets are more circular
            ctx.arc(splash.x, splash.y, splash.size, 0, Math.PI * 2);
        }

        ctx.fill();

        // Add highlight for more realistic look
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(splash.x - splash.size / 3, splash.y - splash.size / 3, splash.size / 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

function drawSplashAnimations() {
    splashAnimations.forEach(anim => {
        ctx.save();
        ctx.globalAlpha = anim.life;

        // Draw the chapak gif animation
        if (chapakGif.complete) {
            ctx.drawImage(chapakGif, anim.x, anim.y, anim.width, anim.height);
        } else {
            // Fallback if gif not loaded - draw a simple splash circle
            ctx.fillStyle = '#87CEEB';
            ctx.beginPath();
            ctx.arc(anim.x + anim.width / 2, anim.y + anim.height / 2, anim.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    });
}

function drawWrongLetterAnimations() {
    wrongLetterAnimations.forEach(anim => {
        ctx.save();
        ctx.globalAlpha = anim.life;

        // Draw the water gif animation
        if (waterGif.complete) {
            ctx.drawImage(waterGif, anim.x, anim.y, anim.width, anim.height);
        } else {
            // Fallback if gif not loaded - draw a simple water circle
            ctx.fillStyle = '#0077BE';
            ctx.beginPath();
            ctx.arc(anim.x + anim.width / 2, anim.y + anim.height / 2, anim.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    });
}

function drawRocks() {
    rocks.forEach(rock => {
        ctx.save();

        // Move to rock center for rotation
        ctx.translate(rock.x + rock.width / 2, rock.y + rock.height / 2);
        ctx.rotate(rock.rotation);

        // Draw rock
        ctx.fillStyle = '#696969'; // Dark gray
        ctx.beginPath();
        ctx.arc(0, 0, rock.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // Add rock texture
        ctx.fillStyle = '#808080'; // Light gray
        ctx.beginPath();
        ctx.arc(-5, -5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, 5, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

function drawSlatePieces() {
    slatePieces.forEach(piece => {
        ctx.save();
        ctx.globalAlpha = piece.life;

        // Move to piece center for rotation
        ctx.translate(piece.x + piece.width / 2, piece.y + piece.height / 2);
        ctx.rotate(piece.rotation);

        // Draw slate piece
        ctx.fillStyle = '#8B4513'; // Brown for wooden slate
        ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);

        // Add wood grain
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const y = -piece.height / 2 + (i + 1) * piece.height / 4;
            ctx.moveTo(-piece.width / 2, y);
            ctx.lineTo(piece.width / 2, y);
        }
        ctx.stroke();

        ctx.restore();
    });
}

function playDropSound() {
    try {
        // Play water drop sound
        waterDropSound.currentTime = 0; // Reset to beginning
        waterDropSound.play().catch(e => {
            console.log('Could not play water sound:', e);
        });
    } catch (e) {
        console.log('Water sound not available');
    }
}

function gameLoop() {
    if (gameRunning) {
        updateGame();
        drawGame();
        requestAnimationFrame(gameLoop);
    }
}

// Draw the initial game state
drawGame();

// Helper to show/hide game over box
function showGameOverBox() {
    const box = document.getElementById('gameOverBox');
    if (box) box.style.display = 'flex';
}
function hideGameOverBox() {
    const box = document.getElementById('gameOverBox');
    if (box) box.style.display = 'none';
}

// Reset heading sound state when the page is shown (useful for back/forward navigation)
function resetHeadingSoundState() {
    // Reset the flag but only if the page is being shown (not just refreshed)
    if (document.visibilityState === 'visible') {
        headingSoundPlayed = false;
        console.log('Heading sound state reset - will play only when Start Game is clicked');
        // Don't play automatically - only when Start Game is clicked
    }
}

// At the end of window.onload or DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    // Don't play heading sound automatically - only when Start Game is clicked
    console.log('Page loaded, heading sound will play only when Start Game is clicked');

    // Add additional fallback for when the page becomes visible (e.g., after redirect)
    window.addEventListener('pageshow', resetHeadingSoundState);
    document.addEventListener('visibilitychange', resetHeadingSoundState);

    const okBtn = document.getElementById('gameOverOkButton');
    if (okBtn) {
        okBtn.addEventListener('click', () => {
            hideGameOverBox();
            // Reset states when game over
            gameRunning = false;
            showGameScreen = false;
            startGame();
        });
    }
});