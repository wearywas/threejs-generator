import './style.css';
import { createGame, startGame, setPaused, WORLD } from './game.js';
import { advanceGame } from './timing.js';
import { createScene } from './scene.js';
import { createAudio } from './audio.js';

const $ = id => document.getElementById(id);
const app = $('app');
let game = createGame();
let view;
const audio = createAudio();
const keys = new Set();
const touchDirections = new Set();
let touchBeam = false;
let helpOpen = false;
let returnFocus = null;
let animationFrame;
let previousTime;
let hintUntil = 0;
let muted = false;
let best = 0;
try { best = Math.max(0, Number(localStorage.getItem('snack-abduction-best')) || 0); muted = localStorage.getItem('snack-abduction-muted') === 'true'; } catch { /* Storage may be disabled. */ }
audio.setMuted(muted);

function soundUI() {
  $('sound-button').setAttribute('aria-pressed', String(muted));
  $('sound-button').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
}
soundUI();

function clearInput() { keys.clear(); touchDirections.clear(); touchBeam = false; $('touch-beam').classList.remove('active'); }
function focusFlight() { $('stage').querySelector('canvas')?.focus({ preventScroll: true }); }
function announce(message) { $('announcer').textContent = message; }
function setHint(message, seconds = 2) { $('hint-text').textContent = message; hintUntil = performance.now() + seconds * 1000; }
function syncUI() {
  app.dataset.phase = game.phase;
  $('intro').hidden = game.phase !== 'ready';
  $('hud').hidden = game.phase === 'ready';
  $('pause-button').hidden = !['playing', 'paused'].includes(game.phase);
  $('flight-controls').hidden = game.phase !== 'playing';
  $('touch-controls').hidden = game.phase !== 'playing';
  $('game-hint').hidden = game.phase !== 'playing';
  $('pause-overlay').hidden = !helpOpen && game.phase !== 'paused';
  $('result-overlay').hidden = game.phase !== 'ended';
  $('restart-button').hidden = game.phase === 'ready';
  $('pause-title').textContent = game.phase === 'ready' ? 'A tiny heist. Here’s how.' : 'A little breather.';
  $('resume-button').textContent = game.phase === 'ready' ? 'Got it. Let’s fly.' : 'Back to the snacks';
  $('help-button').disabled = game.phase === 'ended';
}

function start() {
  clearInput(); helpOpen = false; game = createGame(); startGame(game); view.reset();
  audio.unlock(); audio.play('start'); hintUntil = 0;
  syncUI(); focusFlight();
  setHint('Hold Space to lift the biscuit beneath you', 5);
  announce('Round started. Hold Space to lift the biscuit beneath you.');
}
function openPause() {
  if (game.phase === 'ended' || helpOpen) return;
  returnFocus = document.activeElement;
  setPaused(game, true); clearInput(); helpOpen = true; syncUI();
  $('resume-button').focus();
}
function closePause() {
  helpOpen = false; setPaused(game, false); clearInput(); syncUI();
  if (game.phase === 'ready') (returnFocus ?? $('start-button')).focus();
  else focusFlight();
}
function finish() {
  clearInput(); helpOpen = false;
  const newBest = game.score > best;
  best = Math.max(best, game.score);
  try { localStorage.setItem('snack-abduction-best', String(best)); } catch { /* Optional persistence. */ }
  $('final-score').textContent = game.score.toLocaleString();
  $('final-saved').textContent = game.delivered;
  $('final-swept').textContent = game.swept;
  $('final-left').textContent = game.snacks.length - game.delivered - game.swept;
  $('best-score').textContent = best.toLocaleString();
  $('best-label').firstChild.textContent = newBest ? 'A new personal best: ' : 'Personal best: ';
  $('result-title').textContent = game.delivered === 0 ? 'Outsnacked!' : game.delivered >= 6 ? 'The snacks are safe.' : 'A tasty little haul.';
  $('result-description').textContent = game.delivered === 0 ? 'That cleaning bot means business. Scoop up a biscuit, fly to the mug, and release your beam.' : 'A small step for a saucer. A giant leap for snack time.';
  syncUI(); $('replay-button').focus();
  announce(`Round complete. ${game.score} points. ${game.delivered} snacks saved.`);
}

function floater(text, x, y, z, bad = false) {
  const location = view.project(x, y, z);
  const element = document.createElement('span'); element.className = `score-floater${bad ? ' bad' : ''}`;
  element.textContent = text; element.style.left = `${location.x}px`; element.style.top = `${location.y}px`;
  $('floaters').appendChild(element); setTimeout(() => element.remove(), 1350);
}
function processEvents() {
  for (const event of game.events) {
    audio.play(event.type);
    if (event.type === 'pickup') { setHint('Bring it to your mug. Release Space to stash it.', 4); announce('Snack aboard. Fly to the mug and release Space.'); }
    if (event.type === 'deliver') { floater(`+${event.value}`, WORLD.mug.x, 4.4, WORLD.mug.z); setHint('Safely stashed. Go get another!', 2.4); announce(`${event.value} points. ${game.delivered} snacks saved.`); }
    if (event.type === 'sweep') { floater('Swept!', game.robot.x, 1.4, game.robot.z, true); setHint('The bot got one. Beat it to the next snack.', 2.2); }
    if (event.type === 'bump') { setHint('Bumped! Get clear of the bot and grab your snack.', 2.5); announce('The bot bumped you.'); }
    if (event.type === 'drop') setHint('Snack dropped. Hold Space nearby to pick it up.', 2);
    if (event.type === 'end') finish();
  }
}

function frame(time) {
  const dt = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.25);
  previousTime = time;
  const x = Number(keys.has('KeyD') || keys.has('ArrowRight') || touchDirections.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || touchDirections.has('left'));
  const z = Number(keys.has('KeyS') || keys.has('ArrowDown') || touchDirections.has('down')) - Number(keys.has('KeyW') || keys.has('ArrowUp') || touchDirections.has('up'));
  advanceGame(game, { x, z, beam: keys.has('Space') || touchBeam }, dt);
  view.update(game, dt);
  processEvents();
  $('score').textContent = game.score.toLocaleString();
  $('saved').textContent = game.delivered;
  const seconds = Math.ceil(game.timeLeft);
  $('time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('timer-progress').style.strokeDashoffset = String(113.1 * (1 - game.timeLeft / WORLD.duration));
  $('time').parentElement.classList.toggle('urgent', seconds <= 15);
  const nearMug = Math.hypot(game.player.x - WORLD.mug.x, game.player.z - WORLD.mug.z) < WORLD.mug.radius;
  if ((time >= hintUntil || (nearMug && game.player.carrying !== null)) && game.phase === 'playing') {
    $('hint-text').textContent = game.player.carrying !== null ? nearMug ? 'Release your beam to stash the snack!' : 'Fly to your mug. Keep holding the beam.' : 'Hold your beam near a snack to lift it';
  }
  animationFrame = requestAnimationFrame(frame);
}

$('start-button').addEventListener('click', start);
$('replay-button').addEventListener('click', start);
$('restart-button').addEventListener('click', start);
$('help-button').addEventListener('click', openPause);
$('pause-button').addEventListener('click', openPause);
$('resume-button').addEventListener('click', closePause);
$('home-button').addEventListener('click', () => { clearInput(); game = createGame(); view.reset(); syncUI(); $('start-button').focus(); });
$('sound-button').addEventListener('click', event => { audio.unlock(); muted = !muted; audio.setMuted(muted); soundUI(); try { localStorage.setItem('snack-abduction-muted', String(muted)); } catch { /* Optional persistence. */ } if (event.detail > 0 && game.phase === 'playing') focusFlight(); });
$('fullscreen-button').addEventListener('click', async event => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await app.requestFullscreen(); } catch { setHint('Fullscreen is unavailable in this browser window.'); }
  if (event.detail > 0 && game.phase === 'playing') focusFlight();
});
document.addEventListener('fullscreenchange', () => { $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); view?.resize(); });
$('reload-button').addEventListener('click', () => location.reload());

const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
window.addEventListener('keydown', event => {
  if (event.code === 'Tab') {
    const dialog = !$('pause-overlay').hidden ? $('pause-overlay') : !$('result-overlay').hidden ? $('result-overlay') : null;
    if (dialog) {
      const focusable = [...dialog.querySelectorAll('button:not([hidden]):not(:disabled)')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.code === 'Escape') { event.preventDefault(); if (game.phase === 'paused' || helpOpen) closePause(); else if (game.phase === 'playing') openPause(); return; }
  if (game.phase !== 'playing' || !controls.has(event.code)) return;
  if (event.code === 'Space' && event.target.closest('button, a')) return;
  event.preventDefault(); keys.add(event.code);
});
window.addEventListener('keyup', event => { keys.delete(event.code); });
window.addEventListener('blur', () => { if (game.phase === 'playing') openPause(); else clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'playing') openPause(); });
for (const button of document.querySelectorAll('[data-dir]')) {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); touchDirections.add(button.dataset.dir); });
  const release = () => touchDirections.delete(button.dataset.dir);
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
$('touch-beam').addEventListener('pointerdown', event => { event.preventDefault(); $('touch-beam').setPointerCapture(event.pointerId); touchBeam = true; $('touch-beam').classList.add('active'); audio.unlock(); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-beam').addEventListener(name, () => { touchBeam = false; $('touch-beam').classList.remove('active'); });

try {
  await document.fonts.ready;
  view = createScene($('stage'), game);
  $('start-label').textContent = 'Let’s snack'; $('start-button').disabled = false;
  syncUI(); animationFrame = requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('error-message').textContent = 'The 3D scene could not load. Try a current Chrome or Edge browser with graphics acceleration enabled, then reload.';
  $('error-panel').hidden = false;
}

if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(animationFrame); view?.dispose(); audio.dispose(); });
