'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.SIDEQUEST_DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'quests.json');
const SEED_FILE = path.join(__dirname, '..', 'seed', 'quests.seed.json');

let quests = null;

function load() {
  if (quests) return quests;
  if (fs.existsSync(DATA_FILE)) {
    quests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    const now = Date.now();
    quests = seed.map((q, i) => ({
      id: crypto.randomUUID(),
      status: 'open',
      acceptedBy: null,
      // Stagger seed timestamps so "newest" sorting looks natural.
      createdAt: new Date(now - (i + 1) * 5 * 60 * 60 * 1000).toISOString(),
      ...q,
    }));
    persist();
  }
  return quests;
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(quests, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function all() {
  return load();
}

function get(id) {
  return load().find((q) => q.id === id) || null;
}

function add(fields) {
  const quest = {
    id: crypto.randomUUID(),
    status: 'open',
    acceptedBy: null,
    createdAt: new Date().toISOString(),
    ...fields,
  };
  load().unshift(quest);
  persist();
  return quest;
}

function accept(id, acceptedBy) {
  const quest = get(id);
  if (!quest) return { error: 'not_found' };
  if (quest.status !== 'open') return { error: 'not_open' };
  quest.status = 'accepted';
  quest.acceptedBy = acceptedBy;
  persist();
  return { quest };
}

module.exports = { all, get, add, accept };
