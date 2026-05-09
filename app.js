/**
 * FoodFeast Track AI — app.js
 * 
 * Architecture:
 *  - Auth: email whitelist + ToS gate (swap doLogin() for Supabase Auth in production)
 *  - State: in-memory; replace with Supabase DB calls via supabaseClient
 *  - CV: simulated TensorFlow.js / MobileNet pipeline (see runInference())
 *  - Recipes: rule-based matching against pantry expiry; swap for LLM call in production
 */

'use strict';

// ─────────────────────────────────────────────
//  SUPABASE CONFIG (fill in your project details)
// ─────────────────────────────────────────────
const SUPABASE_URL  = 'https://jrnvnmchfmdkgcsvytli.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnZubWNoZm1ka2djc3Z5dGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDUyMDMsImV4cCI6MjA5MzEyMTIwM30.Kw--5RXc2n7VFZ6jidceXS5W8Z6UOPvkcXg5Z3FOnsg';

// Uncomment when you have real Supabase credentials:
// const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────
//  AUTH — WHITELIST
// ─────────────────────────────────────────────
const ALLOWED_EMAILS = [
  'hishikkyle@gmail.com',
  'demo@foodfeast.ai',
  'test@example.com',
];

// ─────────────────────────────────────────────
//  APP STATE
// ─────────────────────────────────────────────
let state = {
  currentUser: null,
  pantry: [
    { id: 1,  name: 'Spinach',        cat: 'produce', qty: '1 bag', exp: daysFromNow(2),  emoji: '🥬' },
    { id: 2,  name: 'Milk',           cat: 'dairy',   qty: '1 L',   exp: daysFromNow(4),  emoji: '🥛' },
    { id: 3,  name: 'Chicken Breast', cat: 'protein', qty: '500 g', exp: daysFromNow(1),  emoji: '🍗' },
    { id: 4,  name: 'Rice',           cat: 'grain',   qty: '2 kg',  exp: daysFromNow(180),emoji: '🍚' },
    { id: 5,  name: 'Eggs',           cat: 'protein', qty: '12',    exp: daysFromNow(11), emoji: '🥚' },
    { id: 6,  name: 'Cheddar',        cat: 'dairy',   qty: '200 g', exp: daysFromNow(8),  emoji: '🧀' },
    { id: 7,  name: 'Bell Pepper',    cat: 'produce', qty: '3',     exp: daysFromNow(3),  emoji: '🫑' },
    { id: 8,  name: 'Pasta',          cat: 'grain',   qty: '500 g', exp: daysFromNow(365),emoji: '🍝' },
    { id: 9,  name: 'Tomato',         cat: 'produce', qty: '4',     exp: daysFromNow(5),  emoji: '🍅' },
    { id: 10, name: 'Onion',          cat: 'produce', qty: '3',     exp: daysFromNow(14), emoji: '🧅' },
  ],
  activity: [],
  scannedCount: 0,
  selectedFoods: [],
  cameraStream: null,
  nextId: 100,
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86_400_000);
}

function expiryLabel(days) {
  if (days < 0)  return { text: 'Expired',   cls: 'red' };
  if (days === 0) return { text: 'Today',    cls: 'red' };
  if (days === 1) return { text: 'Tomorrow', cls: 'urgent' };
  if (days <= 7)  return { text: `${days}d`,  cls: days <= 3 ? 'urgent' : 'soon' };
  return { text: `${days}d`, cls: 'ok' };
}

function categoryEmoji(cat) {
  return { produce: '🥬', dairy: '🧀', protein: '🥩', grain: '🌾', other: '🥫' }[cat] ?? '🥫';
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'danger' ? ' danger' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function logActivity(msg) {
  state.activity.unshift(msg);
  if (state.activity.length > 20) state.activity.pop();
}

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
function doLogin() {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const tos   = document.getElementById('tosCheck').checked;
  const errEl = document.getElementById('authErr');

  if (!tos) {
    errEl.textContent = 'Please accept the Terms of Service and Privacy Policy.';
    return;
  }
  if (!ALLOWED_EMAILS.includes(email)) {
    errEl.textContent = 'Access denied. This email is not on the authorized list.';
    return;
  }

  errEl.textContent = '';
  state.currentUser = email;

  document.getElementById('userEmailDisplay').textContent = email;
  document.getElementById('userAvatar').textContent = email[0].toUpperCase();

  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  setGreeting();
  updateDashboard();
  renderPantry();
  generateRecipes();

  /**
   * PRODUCTION: replace above with Supabase Auth:
   * 
   * const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
   * if (error) { errEl.textContent = error.message; return; }
   * // then load user's pantry from DB
   */
}

function doLogout() {
  state.currentUser = null;
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('authEmail').value = '';
  document.getElementById('authPass').value = '';
  document.getElementById('tosCheck').checked = false;
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');

  if (name === 'dashboard') updateDashboard();
  if (name === 'pantry')    renderPantry();
  if (name === 'recipes')   generateRecipes();
}

function setGreeting() {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashGreeting').textContent = `${greeting} ✦`;
}

// ─────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
  event?.preventDefault();
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close modals on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.add('hidden');
  }
});

// ─────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────
function updateDashboard() {
  const expiring = state.pantry.filter(i => {
    const d = daysUntil(i.exp);
    return d >= 0 && d <= 7;
  }).length;

  document.getElementById('statTotal').textContent    = state.pantry.length;
  document.getElementById('statExpiring').textContent = expiring;
  document.getElementById('statScanned').textContent  = state.scannedCount;

  const matchCount = RECIPE_DB.filter(r => {
    const names = state.pantry.map(i => i.name);
    return r.ingredients.some(ing => names.includes(ing.name));
  }).length;
  document.getElementById('statRecipes').textContent = matchCount;

  renderExpiryList();
  renderActivityList();
}

function renderExpiryList() {
  const el = document.getElementById('expiryList');
  const items = [...state.pantry]
    .filter(i => daysUntil(i.exp) >= 0)
    .sort((a, b) => new Date(a.exp) - new Date(b.exp))
    .slice(0, 6);

  if (!items.length) {
    el.innerHTML = '<p class="empty-state">No items expiring soon 🎉</p>';
    return;
  }

  el.innerHTML = items.map(i => {
    const { text, cls } = expiryLabel(daysUntil(i.exp));
    return `
      <div class="expiry-item">
        <span class="exp-name">${i.emoji} ${i.name}</span>
        <span class="exp-days ${cls}">${text}</span>
      </div>`;
  }).join('');
}

function renderActivityList() {
  const el = document.getElementById('activityList');
  if (!state.activity.length) {
    el.innerHTML = '<p class="empty-state">No recent activity yet</p>';
    return;
  }
  el.innerHTML = state.activity.slice(0, 8).map(a =>
    `<div class="activity-item"><div class="act-dot"></div><div>${a}</div></div>`
  ).join('');
}

// ─────────────────────────────────────────────
//  SCAN — COMPUTER VISION PIPELINE
// ─────────────────────────────────────────────

/**
 * PRODUCTION Computer Vision Workflow:
 * 
 * 1. Load TensorFlow.js + MobileNet model:
 *    <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
 *    <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet"></script>
 * 
 * 2. const model = await mobilenet.load();
 * 
 * 3. On camera capture or file upload:
 *    const img = document.getElementById('videoEl'); // or <img> from file
 *    const predictions = await model.classify(img);
 *    // predictions = [{ className: 'Granny Smith apple', probability: 0.94 }, ...]
 * 
 * 4. Map TF class names → food categories using foodClassMap below
 * 
 * 5. Send results to Supabase:
 *    await supabaseClient.from('pantry_items').insert({ user_id, name, category, ... });
 */

const DEMO_DETECTIONS = [
  { name: 'Banana',    conf: '96%', cat: 'produce', emoji: '🍌' },
  { name: 'Apple',     conf: '94%', cat: 'produce', emoji: '🍎' },
  { name: 'Tomato',    conf: '91%', cat: 'produce', emoji: '🍅' },
  { name: 'Broccoli',  conf: '88%', cat: 'produce', emoji: '🥦' },
  { name: 'Carrot',    conf: '85%', cat: 'produce', emoji: '🥕' },
  { name: 'Orange',    conf: '82%', cat: 'produce', emoji: '🍊' },
  { name: 'Lettuce',   conf: '79%', cat: 'produce', emoji: '🥬' },
  { name: 'Strawberry',conf: '77%', cat: 'produce', emoji: '🍓' },
  { name: 'Lemon',     conf: '75%', cat: 'produce', emoji: '🍋' },
  { name: 'Avocado',   conf: '73%', cat: 'produce', emoji: '🥑' },
];

// MobileNet class name → food category mapper
const foodClassMap = {
  'Granny Smith': { cat: 'produce', emoji: '🍎', name: 'Apple' },
  'banana':       { cat: 'produce', emoji: '🍌', name: 'Banana' },
  'broccoli':     { cat: 'produce', emoji: '🥦', name: 'Broccoli' },
  'egg':          { cat: 'protein', emoji: '🥚', name: 'Eggs' },
  'milk':         { cat: 'dairy',   emoji: '🥛', name: 'Milk' },
};

async function toggleCamera() {
  const btn = document.getElementById('camToggleBtn');
  const box = document.getElementById('cameraBox');
  const vid = document.getElementById('videoEl');

  if (state.cameraStream) {
    // Stop camera
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
    vid.style.display = 'none';
    box.style.display = 'flex';
    btn.textContent = '▶ Start Camera';
    btn.onclick = toggleCamera;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    state.cameraStream = stream;
    vid.srcObject = stream;
    vid.style.display = 'block';
    box.style.display = 'none';
    btn.textContent = '📸 Capture & Analyze';
    btn.onclick = captureAndAnalyze;
  } catch (err) {
    showToast('Camera not available — use Demo Scan', 'danger');
  }
}

function captureAndAnalyze() {
  const vid    = document.getElementById('videoEl');
  const canvas = document.getElementById('canvasEl');
  canvas.width  = vid.videoWidth;
  canvas.height = vid.videoHeight;
  canvas.getContext('2d').drawImage(vid, 0, 0);
  runInference(canvas);
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => runInference(img);
  img.src = URL.createObjectURL(file);
}

async function runInference(imgElement) {
  /**
   * PRODUCTION: replace the simulation below with:
   * 
   * if (!window.tfModel) {
   *   window.tfModel = await mobilenet.load({ version: 2, alpha: 1.0 });
   * }
   * const predictions = await window.tfModel.classify(imgElement, 6);
   * const foods = predictions
   *   .filter(p => p.probability > 0.3)
   *   .map(p => ({
   *     name: foodClassMap[p.className]?.name ?? p.className.split(',')[0],
   *     conf: (p.probability * 100).toFixed(0) + '%',
   *     cat:  foodClassMap[p.className]?.cat ?? 'produce',
   *     emoji: foodClassMap[p.className]?.emoji ?? '🍽️',
   *   }));
   * displayDetectedFoods(foods);
   */
  showScanProgress();
  await delay(2200);
  hideScanProgress();

  const shuffled = [...DEMO_DETECTIONS].sort(() => Math.random() - 0.5);
  const foods = shuffled.slice(0, Math.floor(Math.random() * 3) + 3);
  state.scannedCount++;
  displayDetectedFoods(foods);
  logActivity(`Scanned food — detected ${foods.length} items`);
}

function runDemoScan() {
  runInference(null);
}

function showScanProgress() {
  const el = document.getElementById('scanProgress');
  const fill = document.getElementById('progressFill');
  el.classList.remove('hidden');
  fill.style.width = '0%';
  requestAnimationFrame(() => { fill.style.width = '100%'; });
}

function hideScanProgress() {
  document.getElementById('scanProgress').classList.add('hidden');
}

function displayDetectedFoods(foods) {
  state.selectedFoods = [];
  const section = document.getElementById('detectedSection');
  const tagsEl  = document.getElementById('foodTags');

  tagsEl.innerHTML = foods.map((f, i) =>
    `<span class="food-tag" id="ft${i}" onclick="toggleFoodTag(${i}, '${f.name}', '${f.cat}', '${f.emoji}')">
      ${f.emoji} ${f.name} <span class="conf">${f.conf}</span>
    </span>`
  ).join('');

  section.classList.remove('hidden');
}

function toggleFoodTag(i, name, cat, emoji) {
  const el  = document.getElementById(`ft${i}`);
  const idx = state.selectedFoods.findIndex(f => f.name === name);

  if (idx >= 0) {
    state.selectedFoods.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    state.selectedFoods.push({ name, cat, emoji });
    el.classList.add('selected');
  }
}

function addSelectedToPantry() {
  if (!state.selectedFoods.length) {
    showToast('Tap items to select them first', 'danger');
    return;
  }

  state.selectedFoods.forEach(f => {
    const item = {
      id:    ++state.nextId,
      name:  f.name,
      cat:   f.cat,
      qty:   '1',
      exp:   daysFromNow(Math.floor(Math.random() * 8) + 3),
      emoji: f.emoji,
    };
    state.pantry.push(item);
    logActivity(`Added <strong>${f.name}</strong> via AI scan`);

    /**
     * PRODUCTION — save to Supabase:
     * supabaseClient.from('pantry_items').insert({
     *   user_id: state.currentUser,
     *   name: item.name, category: item.cat, quantity: item.qty,
     *   expiry_date: item.exp, emoji: item.emoji
     * });
     */
  });

  showToast(`${state.selectedFoods.length} item(s) added to pantry!`);
  state.selectedFoods = [];
  document.getElementById('detectedSection').classList.add('hidden');
  updateDashboard();
}

// ─────────────────────────────────────────────
//  PANTRY
// ─────────────────────────────────────────────
function renderPantry(items = null) {
  const grid = document.getElementById('pantryGrid');
  const list = items ?? state.pantry;

  if (!list.length) {
    grid.innerHTML = '<p class="empty-state">No items found. Add items or scan food!</p>';
    return;
  }

  grid.innerHTML = list.map(i => {
    const d   = daysUntil(i.exp);
    const lbl = expiryLabel(d);
    const cardCls = d <= 2 ? 'expiring' : d <= 7 ? 'soon' : '';

    return `
      <div class="pantry-card ${cardCls}">
        <span class="exp-badge ${lbl.cls}">${lbl.text}</span>
        <div class="food-emoji">${i.emoji}</div>
        <div class="food-name">${i.name}</div>
        <div class="food-qty">${i.qty} · ${i.cat}</div>
        <button class="del-btn" onclick="deleteItem(${i.id})" title="Remove item">✕</button>
      </div>`;
  }).join('');
}

function filterPantry(query) {
  const q = query.toLowerCase();
  const cat = document.getElementById('catFilter').value;
  const filtered = state.pantry.filter(i => {
    const matchQ = i.name.toLowerCase().includes(q);
    const matchC = cat === 'all' || i.cat === cat;
    return matchQ && matchC;
  });
  renderPantry(filtered);
}

function filterByCategory(cat) {
  const q = document.getElementById('pantrySearch').value;
  filterPantry(q);
}

function openAddModal() {
  document.getElementById('mExp').value = daysFromNow(7);
  document.getElementById('mName').value  = '';
  document.getElementById('mQty').value   = '';
  showModal('addItemModal');
}

function saveItem() {
  const name = document.getElementById('mName').value.trim();
  if (!name) { showToast('Please enter an item name', 'danger'); return; }

  const cat = document.getElementById('mCat').value;
  const item = {
    id:    ++state.nextId,
    name,
    cat,
    qty:   document.getElementById('mQty').value || '1',
    exp:   document.getElementById('mExp').value || daysFromNow(7),
    emoji: categoryEmoji(cat),
  };

  state.pantry.push(item);
  logActivity(`Added <strong>${name}</strong> to pantry`);

  /**
   * PRODUCTION — save to Supabase:
   * await supabaseClient.from('pantry_items').insert({
   *   user_id: state.currentUser,
   *   name: item.name, category: item.cat,
   *   quantity: item.qty, expiry_date: item.exp
   * });
   */

  closeModal('addItemModal');
  renderPantry();
  updateDashboard();
  showToast(`${name} added to pantry!`);
}

function deleteItem(id) {
  const item = state.pantry.find(i => i.id === id);
  if (!item) return;

  state.pantry = state.pantry.filter(i => i.id !== id);
  logActivity(`Removed <strong>${item.name}</strong> from pantry`);

  /**
   * PRODUCTION:
   * await supabaseClient.from('pantry_items').delete().eq('id', id);
   */

  renderPantry();
  updateDashboard();
  showToast(`${item.name} removed`);
}

// ─────────────────────────────────────────────
//  RECIPE DATABASE
// ─────────────────────────────────────────────
const RECIPE_DB = [
  {
    name: 'Spinach & Egg Scramble',
    emoji: '🍳',
    time: '15 min',
    cals: '320 kcal',
    tags: ['Quick', 'High Protein'],
    ingredients: [
      { name: 'Spinach', amount: '2 cups' },
      { name: 'Eggs',    amount: '3 large' },
      { name: 'Cheddar', amount: '30 g' },
    ],
    steps: [
      'Whisk eggs with a pinch of salt and pepper.',
      'Sauté spinach in a non-stick pan over medium heat for 1 minute until wilted.',
      'Pour in eggs and fold gently until just set.',
      'Top with grated cheddar, serve immediately.',
    ],
  },
  {
    name: 'Chicken Rice Bowl',
    emoji: '🍛',
    time: '30 min',
    cals: '520 kcal',
    tags: ['Meal Prep', 'High Protein'],
    ingredients: [
      { name: 'Chicken Breast', amount: '200 g' },
      { name: 'Rice',           amount: '½ cup' },
      { name: 'Bell Pepper',    amount: '1 medium' },
      { name: 'Onion',          amount: '½ medium' },
    ],
    steps: [
      'Cook rice according to package instructions.',
      'Season chicken with salt, pepper, and paprika.',
      'Pan-fry chicken over medium-high heat for 6–7 minutes per side until cooked through.',
      'Sauté diced bell pepper and onion until softened.',
      'Slice chicken, serve over rice with vegetables.',
    ],
  },
  {
    name: 'Stuffed Bell Peppers',
    emoji: '🫑',
    time: '40 min',
    cals: '410 kcal',
    tags: ['Vegetarian', 'Filling'],
    ingredients: [
      { name: 'Bell Pepper', amount: '2 large' },
      { name: 'Rice',        amount: '½ cup' },
      { name: 'Tomato',      amount: '2 medium' },
      { name: 'Onion',       amount: '1 medium' },
    ],
    steps: [
      'Preheat oven to 190°C (375°F).',
      'Cook rice and mix with diced tomato and sautéed onion.',
      'Halve peppers, remove seeds, fill with rice mixture.',
      'Bake for 25–30 minutes until peppers are tender.',
    ],
  },
  {
    name: 'Cheese Pasta',
    emoji: '🍝',
    time: '20 min',
    cals: '480 kcal',
    tags: ['Comfort Food', 'Easy'],
    ingredients: [
      { name: 'Pasta',   amount: '200 g' },
      { name: 'Cheddar', amount: '80 g' },
      { name: 'Milk',    amount: '150 ml' },
    ],
    steps: [
      'Cook pasta in salted boiling water until al dente. Reserve ½ cup pasta water.',
      'Melt butter in a saucepan, whisk in a tablespoon of flour.',
      'Gradually add milk, stirring until thick. Add grated cheddar.',
      'Toss drained pasta in sauce, add pasta water to loosen if needed.',
    ],
  },
  {
    name: 'Egg Fried Rice',
    emoji: '🍚',
    time: '20 min',
    cals: '430 kcal',
    tags: ['Easy', 'Leftovers'],
    ingredients: [
      { name: 'Rice',  amount: '1 cup cooked' },
      { name: 'Eggs',  amount: '2 large' },
      { name: 'Onion', amount: '½ medium' },
    ],
    steps: [
      'Heat oil in a wok or large frying pan over high heat.',
      'Fry diced onion until golden.',
      'Push onion to the side, scramble eggs in the pan.',
      'Add cold cooked rice, stir-fry everything together for 3–4 minutes.',
      'Season with soy sauce and sesame oil.',
    ],
  },
  {
    name: 'Tomato Pasta Sauce',
    emoji: '🍅',
    time: '25 min',
    cals: '350 kcal',
    tags: ['Vegetarian', 'Classic'],
    ingredients: [
      { name: 'Tomato', amount: '4 medium' },
      { name: 'Onion',  amount: '1 large' },
      { name: 'Pasta',  amount: '200 g' },
    ],
    steps: [
      'Dice onion and tomatoes.',
      'Sauté onion in olive oil until translucent, about 5 minutes.',
      'Add tomatoes, simmer 15 minutes until sauce thickens. Season to taste.',
      'Cook pasta, toss with sauce, garnish with fresh basil.',
    ],
  },
];

// ─────────────────────────────────────────────
//  RECIPES
// ─────────────────────────────────────────────
function generateRecipes() {
  const pantryNames = state.pantry.map(i => i.name);

  // Sort: full matches first, then partial, prioritize expiring items
  const scored = RECIPE_DB.map(r => {
    const have    = r.ingredients.filter(ing => pantryNames.includes(ing.name));
    const missing = r.ingredients.filter(ing => !pantryNames.includes(ing.name));
    const pct     = Math.round((have.length / r.ingredients.length) * 100);

    // Boost recipes that use expiring ingredients
    const urgencyBoost = have.reduce((sum, ing) => {
      const item = state.pantry.find(p => p.name === ing.name);
      const d = item ? daysUntil(item.exp) : 99;
      return sum + (d <= 3 ? 3 : d <= 7 ? 1 : 0);
    }, 0);

    return { ...r, have, missing, pct, urgencyBoost };
  }).sort((a, b) => (b.pct + b.urgencyBoost * 5) - (a.pct + a.urgencyBoost * 5));

  const grid = document.getElementById('recipeGrid');
  const noteEl = document.getElementById('recipeNote');

  const expiringCount = state.pantry.filter(i => daysUntil(i.exp) <= 5 && daysUntil(i.exp) >= 0).length;
  noteEl.textContent = expiringCount
    ? `${expiringCount} ingredient(s) expiring within 5 days prioritized`
    : '';

  grid.innerHTML = scored.map(r => {
    const matchCls = r.pct === 100 ? 'full' : 'partial';
    const matchLbl = r.pct === 100 ? '✓ Full pantry match' : `~ ${r.pct}% pantry match`;

    return `
      <div class="recipe-card" onclick="showRecipeDetail('${r.name}')">
        <div class="recipe-img">${r.emoji}</div>
        <div class="recipe-body">
          <div class="recipe-name">${r.name}</div>
          <div class="recipe-meta">
            <span>⏱ ${r.time}</span>
            <span>🔥 ${r.cals}</span>
          </div>
          <div class="recipe-match ${matchCls}">${matchLbl}</div>
          <div class="recipe-tags">
            ${r.tags.map(t => `<span class="rtag">${t}</span>`).join('')}
            ${r.have.map(i => `<span class="rtag use">Uses ${i.name}</span>`).join('')}
            ${r.missing.map(i => `<span class="rtag missing">Need ${i.name}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  /**
   * PRODUCTION — use LLM for smart recipe generation:
   * 
   * const expiringItems = state.pantry
   *   .filter(i => daysUntil(i.exp) <= 7)
   *   .map(i => `${i.name} (expires in ${daysUntil(i.exp)} days)`).join(', ');
   * 
   * const prompt = `Given these expiring ingredients: ${expiringItems}.
   *   Suggest 3 recipes with exact quantities and step-by-step instructions.
   *   Prioritize reducing food waste. Return as JSON.`;
   * 
   * const { data } = await supabaseClient.functions.invoke('generate-recipes', { body: { prompt } });
   */
}

function showRecipeDetail(name) {
  const r = RECIPE_DB.find(x => x.name === name);
  if (!r) return;

  const pantryNames = state.pantry.map(i => i.name);
  const have    = r.ingredients.filter(i => pantryNames.includes(i.name));
  const missing = r.ingredients.filter(i => !pantryNames.includes(i.name));

  document.getElementById('recipeModalContent').innerHTML = `
    <div class="recipe-detail-header">
      <div class="recipe-detail-emoji">${r.emoji}</div>
      <div class="recipe-detail-info">
        <h2>${r.name}</h2>
        <div class="recipe-detail-meta">
          <span>⏱ ${r.time}</span>
          <span>🔥 ${r.cals}</span>
        </div>
        <div class="recipe-tags">
          ${r.tags.map(t => `<span class="rtag">${t}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="recipe-section">
      <h3>Ingredients</h3>
      <ul class="ingredient-list">
        ${r.ingredients.map(i => {
          const inPantry = pantryNames.includes(i.name);
          return `<li class="${inPantry ? 'have' : 'missing-item'}">
            ${inPantry ? '✓' : '○'} <strong>${i.name}</strong> — ${i.amount}
          </li>`;
        }).join('')}
      </ul>
      ${missing.length ? `<p style="font-size:12px;color:var(--muted);margin-top:8px">You need: ${missing.map(i=>i.name).join(', ')}</p>` : ''}
    </div>

    <div class="recipe-section">
      <h3>Instructions</h3>
      <ol class="step-list">
        ${r.steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
    </div>
  `;

  showModal('recipeModal');
}

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill demo email for convenience
  document.getElementById('authEmail').value = 'hishikkyle@gmail.com';
});