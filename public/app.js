'use strict';

const DEFAULT_LOCATION = { lat: 52.52, lng: 13.405, label: 'Berlin Mitte (demo)' };
const LOCATION_KEY = 'sidequest.location';
const NAME_KEY = 'sidequest.name';

const state = {
  location: loadLocation(),
  radius: '10', // km, or 'all'
  category: 'all',
  sort: 'distance',
  showAccepted: false,
};

const $ = (sel) => document.querySelector(sel);

function loadLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCATION_KEY));
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) return saved;
  } catch { /* fall through to default */ }
  return { ...DEFAULT_LOCATION };
}

function saveLocation() {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(state.location));
}

function renderLocation() {
  const { lat, lng, label } = state.location;
  $('#location-display').textContent = `${label || 'Custom point'} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

async function fetchQuests() {
  const params = new URLSearchParams({
    lat: state.location.lat,
    lng: state.location.lng,
  });
  if (state.radius !== 'all') params.set('radius', state.radius);
  if (state.category !== 'all') params.set('category', state.category);
  if (!state.showAccepted) params.set('status', 'open');

  const res = await fetch(`/api/quests?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const { quests } = await res.json();
  return quests;
}

function sortQuests(quests) {
  const sorted = quests.slice();
  if (state.sort === 'pay') sorted.sort((a, b) => b.pay - a.pay);
  else if (state.sort === 'newest') sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  // 'distance' keeps the server's nearest-first order.
  return sorted;
}

function formatPay(pay) {
  return `€${Number.isInteger(pay) ? pay : pay.toFixed(2)}`;
}

function formatDeadline(completeBy) {
  if (!completeBy) return 'Flexible';
  return new Date(completeBy + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatPostedAt(createdAt) {
  const hours = Math.max(0, (Date.now() - new Date(createdAt)) / 36e5);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderQuests(quests) {
  const list = $('#quest-list');
  const template = $('#quest-card-template');
  list.replaceChildren();

  for (const quest of quests) {
    const card = template.content.cloneNode(true);
    const article = card.querySelector('.quest-card');
    if (quest.status !== 'open') article.classList.add('accepted');

    card.querySelector('.category-badge').textContent = quest.category;
    card.querySelector('.distance-badge').textContent =
      quest.distanceKm != null ? `📍 ${quest.distanceKm} km away` : '';
    card.querySelector('.quest-title').textContent = quest.title;
    card.querySelector('.quest-desc').textContent = quest.description;
    card.querySelector('.quest-pay').textContent = formatPay(quest.pay);
    card.querySelector('.quest-duration').textContent = quest.duration;
    card.querySelector('.quest-deadline').textContent = formatDeadline(quest.completeBy);
    card.querySelector('.quest-location').textContent = quest.locationName;
    card.querySelector('.quest-byline').textContent =
      `${quest.postedBy} · ${formatPostedAt(quest.createdAt)}`;

    const acceptBtn = card.querySelector('.btn-accept');
    if (quest.status === 'open') {
      acceptBtn.addEventListener('click', () => acceptQuest(quest, acceptBtn));
    } else {
      acceptBtn.disabled = true;
      acceptBtn.textContent = `Taken by ${quest.acceptedBy || 'someone'}`;
    }

    list.appendChild(card);
  }

  $('#empty-state').classList.toggle('hidden', quests.length > 0);

  const radiusText = state.radius === 'all' ? 'any distance' : `${state.radius} km`;
  $('#result-summary').innerHTML =
    `<strong>${quests.length}</strong> sidequest${quests.length === 1 ? '' : 's'} within <strong>${radiusText}</strong> of you`;
}

async function refresh() {
  try {
    renderQuests(sortQuests(await fetchQuests()));
  } catch (err) {
    $('#result-summary').textContent = `Could not load quests: ${err.message}`;
  }
}

async function acceptQuest(quest, button) {
  const name = prompt(`Accept "${quest.title}" for ${formatPay(quest.pay)}?\n\nYour name:`,
    localStorage.getItem(NAME_KEY) || '');
  if (name === null) return;
  const acceptedBy = name.trim() || 'Anonymous adventurer';
  localStorage.setItem(NAME_KEY, acceptedBy);

  button.disabled = true;
  const res = await fetch(`/api/quests/${quest.id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedBy }),
  });
  if (!res.ok) {
    button.disabled = false;
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Could not accept this quest.');
  }
  refresh();
}

function useGeolocation(onCoords, button) {
  if (!navigator.geolocation) {
    alert('Geolocation is not available in this browser — enter coordinates manually.');
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      button.disabled = false;
      button.textContent = originalText;
      onCoords(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      button.disabled = false;
      button.textContent = originalText;
      alert(`Could not get your location (${err.message}). Enter coordinates manually instead.`);
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}

// ---- Wire up controls ----

$('#radius-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#radius-chips .chip').forEach((c) => c.classList.remove('chip-active'));
  chip.classList.add('chip-active');
  state.radius = chip.dataset.radius;
  refresh();
});

$('#category-filter').addEventListener('change', (e) => {
  state.category = e.target.value;
  refresh();
});

$('#sort-select').addEventListener('change', (e) => {
  state.sort = e.target.value;
  refresh();
});

$('#show-accepted').addEventListener('change', (e) => {
  state.showAccepted = e.target.checked;
  refresh();
});

$('#use-my-location').addEventListener('click', (e) => {
  useGeolocation((lat, lng) => {
    state.location = { lat, lng, label: 'My location' };
    saveLocation();
    renderLocation();
    refresh();
  }, e.target);
});

$('#edit-location').addEventListener('click', () => {
  const editor = $('#location-editor');
  editor.classList.toggle('hidden');
  $('#loc-lat').value = state.location.lat;
  $('#loc-lng').value = state.location.lng;
  $('#loc-name').value = state.location.label || '';
});

$('#save-location').addEventListener('click', () => {
  const lat = parseFloat($('#loc-lat').value);
  const lng = parseFloat($('#loc-lng').value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    alert('Please enter a valid latitude (-90…90) and longitude (-180…180).');
    return;
  }
  state.location = { lat, lng, label: $('#loc-name').value.trim() || 'Custom point' };
  saveLocation();
  renderLocation();
  $('#location-editor').classList.add('hidden');
  refresh();
});

// ---- Post modal ----

const modal = $('#post-modal');
const form = $('#post-form');

$('#open-post-modal').addEventListener('click', () => {
  form.reset();
  $('#form-error').classList.add('hidden');
  form.elements.lat.value = state.location.lat;
  form.elements.lng.value = state.location.lng;
  form.elements.postedBy.value = localStorage.getItem(NAME_KEY) || '';
  modal.showModal();
});

$('#cancel-post').addEventListener('click', () => modal.close());

$('#fill-my-coords').addEventListener('click', (e) => {
  useGeolocation((lat, lng) => {
    form.elements.lat.value = lat.toFixed(5);
    form.elements.lng.value = lng.toFixed(5);
  }, e.target);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('#form-error');
  errorEl.classList.add('hidden');

  const data = Object.fromEntries(new FormData(form));
  data.pay = parseFloat(data.pay);
  data.lat = parseFloat(data.lat);
  data.lng = parseFloat(data.lng);

  const res = await fetch('/api/quests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errorEl.textContent = (body.details || [body.error || 'Something went wrong.']).join('\n');
    errorEl.classList.remove('hidden');
    return;
  }

  localStorage.setItem(NAME_KEY, data.postedBy.trim());
  modal.close();
  refresh();
});

// ---- Init ----

renderLocation();
refresh();
