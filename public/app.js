'use strict';

const DEFAULT_LOCATION = { lat: 52.52, lng: 13.405, label: 'Berlin Mitte (demo)' };
const LOCATION_KEY = 'sidequest.location';
const NAME_KEY = 'sidequest.name';

const HERO_EYEBROWS = {
  distance: 'Closest to you',
  pay: 'Top reward',
  newest: 'Just posted',
};

// SF-symbol-style glyphs for the category tiles.
const CATEGORY_ICONS = {
  Garden: '<path d="M6 18C6 10.5 11 5.5 19 5c.5 8-4.5 13-13 13z"/><path d="M6 18c2.5-5 6-8.5 10-10.5"/>',
  Pets: '<circle cx="7.5" cy="8.5" r="1.7"/><circle cx="12" cy="7" r="1.7"/><circle cx="16.5" cy="8.5" r="1.7"/><path d="M12 11.5c2.9 0 5.2 2 5.2 4.3 0 1.4-1.1 2.4-2.4 2.4-1 0-1.9-.6-2.8-.6s-1.8.6-2.8.6c-1.3 0-2.4-1-2.4-2.4 0-2.3 2.3-4.3 5.2-4.3z"/>',
  Moving: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4"/><path d="M12 12v8"/>',
  Errands: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  Repairs: '<circle cx="12" cy="12" r="3.2"/><path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.6 6.6l1.7 1.7M15.7 15.7l1.7 1.7M17.4 6.6l-1.7 1.7M8.3 15.7l-1.7 1.7"/>',
  Tech: '<rect x="4.5" y="5.5" width="15" height="10" rx="1.6"/><path d="M3 19h18"/>',
  Other: '<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/>',
};

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
  return 'by ' + new Date(completeBy + 'T00:00:00').toLocaleDateString(undefined, {
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

function categoryIcon(category) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
  return svg;
}

function renderHero(quest) {
  const slot = $('#hero-slot');
  slot.replaceChildren();
  if (!quest) return;

  const card = $('#hero-template').content.cloneNode(true);
  const article = card.querySelector('.hero-card');
  article.dataset.cat = quest.category;

  card.querySelector('.hero-eyebrow').textContent = HERO_EYEBROWS[state.sort];
  card.querySelector('.hero-distance').textContent =
    quest.distanceKm != null ? `${quest.distanceKm} km away` : quest.category;
  card.querySelector('.hero-title').textContent = quest.title;
  card.querySelector('.hero-desc').textContent = quest.description;
  card.querySelector('.hero-location').textContent = quest.locationName;
  card.querySelector('.hero-byline').textContent =
    `${quest.postedBy} · ${quest.duration} · ${formatDeadline(quest.completeBy)}`;

  const button = card.querySelector('.hero-accept');
  if (quest.status === 'open') {
    button.textContent = `Accept · ${formatPay(quest.pay)}`;
    button.addEventListener('click', () => acceptQuest(quest, button));
  } else {
    button.textContent = `Taken by ${quest.acceptedBy || 'someone'}`;
    button.disabled = true;
  }

  slot.appendChild(card);
}

function renderCells(quests) {
  const list = $('#quest-list');
  const template = $('#quest-card-template');
  list.replaceChildren();

  for (const quest of quests) {
    const card = template.content.cloneNode(true);
    if (quest.status !== 'open') card.querySelector('.cell').classList.add('accepted');

    const tile = card.querySelector('.cat-tile');
    tile.dataset.cat = quest.category;
    tile.appendChild(categoryIcon(quest.category));

    card.querySelector('.quest-title').textContent = quest.title;
    card.querySelector('.quest-category').textContent = quest.category;
    card.querySelector('.distance-badge').textContent =
      quest.distanceKm != null ? `${quest.distanceKm} km` : '—';
    card.querySelector('.quest-duration').textContent = quest.duration;
    card.querySelector('.quest-deadline').textContent = formatDeadline(quest.completeBy);
    card.querySelector('.quest-desc').textContent = quest.description;
    card.querySelector('.quest-byline').textContent =
      `${quest.locationName} · ${quest.postedBy} · ${formatPostedAt(quest.createdAt)}`;

    const button = card.querySelector('.btn-accept');
    const caption = card.querySelector('.action-caption');
    if (quest.status === 'open') {
      button.textContent = formatPay(quest.pay);
      caption.textContent = 'Accept';
      button.addEventListener('click', () => acceptQuest(quest, button));
    } else {
      button.textContent = 'Taken';
      button.disabled = true;
      caption.textContent = `by ${quest.acceptedBy || 'someone'}`;
    }

    list.appendChild(card);
  }
}

function renderQuests(quests) {
  const [hero, ...rest] = quests;

  renderHero(hero);
  renderCells(rest);

  $('#list-title').textContent = hero ? 'More quests' : 'All quests';
  document.querySelector('.list-head').classList.toggle('hidden', quests.length === 0 || rest.length === 0);
  $('#empty-state').classList.toggle('hidden', quests.length > 0);

  const radiusText = state.radius === 'all' ? 'any distance' : `${state.radius} km`;
  $('#result-summary').textContent =
    `${quests.length} sidequest${quests.length === 1 ? '' : 's'} within ${radiusText}`;
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

// ---- Chrome ----

$('#date-eyebrow').textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

window.addEventListener('scroll', () => {
  $('#navbar-title').classList.toggle('show', window.scrollY > 90);
}, { passive: true });

// ---- Controls ----

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

// ---- Post sheet ----

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
