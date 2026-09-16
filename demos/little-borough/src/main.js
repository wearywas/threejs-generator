import './style.css';
import { createNeighborhood } from './scene.js';
import { PLOTS, MAX_FLOORS, editPlot, getStats, deserializeCity, serializeCity, createCity } from './model.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'little-borough.city.v1';
let city = createCity();
let storageAvailable = true;
try { city = deserializeCity(localStorage.getItem(STORAGE_KEY)); }
catch { storageAvailable = false; }
const history = [];
let selected = PLOTS[0].id, scene, noticeTimer;

function announce(message) {
  $('notice').textContent = message;
  $('notice').classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').classList.remove('visible'), 2600);
}

function save() {
  if (!storageAvailable) return;
  try { localStorage.setItem(STORAGE_KEY, serializeCity(city)); }
  catch { storageAvailable = false; announce('Browser storage is full. This visit’s changes won’t be saved.'); }
}

function updateInterface() {
  const stats = getStats(city);
  $('building-count').textContent = stats.buildings;
  $('floor-count').textContent = stats.floors;
  $('undo').disabled = history.length === 0;
  $('intro').classList.toggle('dismissed', stats.buildings > 0);
  for (const option of $('plot-select').options) {
    const plot = PLOTS.find(p => p.id === option.value);
    const n = city.buildings[plot.id]?.floors ?? 0;
    option.textContent = `${plot.label} · ${n ? `${n} ${n === 1 ? 'floor' : 'floors'}` : 'empty'}`;
  }
  $('plot-select').value = selected;
  $('subtract-floor').disabled = !city.buildings[selected];
  $('add-floor').disabled = (city.buildings[selected]?.floors ?? 0) === MAX_FLOORS;
}

function select(id) { selected = id; scene?.select(id); updateInterface(); }

function edit(id, delta) {
  const next = editPlot(city, id, delta);
  if (next === city) {
    announce(delta === 1 ? 'Ten floors. A lovely place to stop.' : 'This plot is already empty.');
    return;
  }
  try { scene.sync(next); }
  catch (error) { console.error(error); announce('That building could not be updated. Please try again.'); return; }
  history.push(city);
  if (history.length > 50) history.shift();
  city = next; selected = id; updateInterface(); save();
  $('hover-label').hidden = true;
  const n = city.buildings[id]?.floors ?? 0;
  const label = PLOTS.find(p => p.id === id).label;
  announce(n ? `${label} · ${n} ${n === 1 ? 'floor' : 'floors'}` : `${label} is ready for something new.`);
}

function undo() {
  if (!history.length) return;
  const previous = history.at(-1);
  try { scene.sync(previous); }
  catch (error) { console.error(error); announce('Could not undo this change. Please try again.'); return; }
  city = previous; history.pop(); updateInterface(); save(); announce('Last change undone.');
}

for (const plot of PLOTS) {
  const option = document.createElement('option'); option.value = plot.id; option.textContent = plot.label;
  $('plot-select').append(option);
}

try {
  scene = createNeighborhood($('scene'), {
    onEdit: edit,
    onSelect: select,
    onHover(id, event) {
      const label = $('hover-label');
      if (!id || event.pointerType === 'touch') { label.hidden = true; return; }
      const plot = PLOTS.find(p => p.id === id), n = city.buildings[id]?.floors ?? 0;
      label.textContent = `${plot.label} · ${n ? `${n} ${n === 1 ? 'floor' : 'floors'}` : 'build here'}`;
      label.hidden = false;
      label.style.left = `${Math.max(8, Math.min(innerWidth - label.offsetWidth - 8, event.clientX + 17))}px`;
      label.style.top = `${Math.min(innerHeight - label.offsetHeight - 8, event.clientY + 19)}px`;
    },
  });
  scene.sync(city, false); scene.select(selected); updateInterface();
  requestAnimationFrame(() => { $('loading').hidden = true; $('app').dataset.ready = 'true'; });
  if (!storageAvailable) announce('Browser storage is unavailable. Your city will last for this visit.');
} catch (error) {
  console.error(error);
  $('loading').textContent = 'The neighborhood couldn’t open. Try a browser with WebGL enabled, then reload.';
}

function setMode(value) {
  scene?.setTool(value);
  $('build-tool').setAttribute('aria-pressed', String(value === 1));
  $('remove-tool').setAttribute('aria-pressed', String(value === -1));
}
$('build-tool').addEventListener('click', () => setMode(1));
$('remove-tool').addEventListener('click', () => setMode(-1));
$('plot-select').addEventListener('change', e => select(e.target.value));
$('add-floor').addEventListener('click', () => scene && edit(selected, 1));
$('subtract-floor').addEventListener('click', () => scene && edit(selected, -1));
$('undo').addEventListener('click', () => scene && undo());
$('reset-view').addEventListener('click', () => { scene?.resetView(); announce('Back to the neighborhood view.'); });
$('help-button').addEventListener('click', () => {
  const expanded = $('help-panel').hidden;
  $('help-panel').hidden = !expanded;
  $('help-button').setAttribute('aria-expanded', String(expanded));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('help-panel').hidden = true; $('help-button').setAttribute('aria-expanded', 'false'); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
    e.preventDefault(); if (scene) undo();
  }
});

if (import.meta.hot) import.meta.hot.dispose(() => { scene?.dispose(); clearTimeout(noticeTimer); });
