import { getSupabase } from './services/supabaseClient.js';
import { showAlert } from './services/uiService.js';
import { renderAuthScreen } from './features/auth/auth.js';
import { renderDashboard } from './features/dashboard/dashboard.js';
import { renderFamilyView } from './features/family/family.js';
import { renderReadingsUI } from './features/readings/readings.js';
import { renderAdminUI } from './features/admin/admin.js';
import { escapeHtml } from './shared/html.js';
import { ensureProfile, setupErrorMessage } from './shared/api.js';

const app = document.getElementById('app');
const supabase = getSupabase();

let currentUser = null;
let currentProfile = null;
let renderGeneration = 0;

function currentRoute() {
  const raw = (window.location.hash || '#/').replace(/^#/, '');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return path === '' ? '/' : path;
}

function showCentered(message) {
  app.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function renderAuth() {
  const route = currentRoute();
  if (route === '/signup') {
    renderAuthScreen(app, { mode: 'signup' });
    return;
  }
  renderAuthScreen(app, { mode: 'signin' });
}

function renderShell() {
  const route = currentRoute();
  const isAdmin = Boolean(currentProfile?.is_super_admin);
  const name = currentProfile?.full_name || currentUser?.email || '';

  app.innerHTML = `
    <div class="app-shell">
      <header class="header">
        <div class="container">
          <a href="#/" class="logo">Family Vitals</a>
          <nav class="nav-links" aria-label="Main">
            <a href="#/" data-route="/" class="${route === '/' ? 'is-active' : ''}">Dashboard</a>
            <a href="#/family" data-route="/family" class="${route === '/family' ? 'is-active' : ''}">Family</a>
            <a href="#/readings" data-route="/readings" class="${route === '/readings' ? 'is-active' : ''}">Readings</a>
            ${
              isAdmin
                ? `<a href="#/admin" data-route="/admin" class="${route === '/admin' ? 'is-active' : ''}">Admin</a>`
                : ''
            }
            <span class="nav-user">${escapeHtml(name)}</span>
            <button type="button" class="btn-secondary" id="sign-out-btn">Sign out</button>
          </nav>
        </div>
      </header>
      <main>
        <div class="container" id="view-root">
          <p class="empty-state">Loading…</p>
        </div>
      </main>
    </div>
  `;

  app.querySelector('#sign-out-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showAlert(error.message, 'error');
  });
}

async function renderCurrentView() {
  const viewRoot = document.getElementById('view-root');
  if (!viewRoot || !currentUser) return;

  const ctx = { user: currentUser, profile: currentProfile, supabase };
  const route = currentRoute();

  if (route === '/family') {
    await renderFamilyView(viewRoot, ctx);
    currentProfile = ctx.profile || currentProfile;
    return;
  }
  if (route === '/readings') {
    await renderReadingsUI(viewRoot, ctx);
    return;
  }
  if (route === '/admin') {
    if (!currentProfile?.is_super_admin) {
      window.location.hash = '#/';
      return;
    }
    await renderAdminUI(viewRoot, ctx);
    return;
  }
  if (route === '/login' || route === '/signup') {
    window.location.hash = '#/';
    return;
  }
  await renderDashboard(viewRoot, ctx);
}

async function renderApp() {
  renderShell();
  await renderCurrentView();
}

async function handleSession(event, session) {
  const generation = ++renderGeneration;
  currentUser = session?.user ?? null;

  if (!currentUser) {
    currentProfile = null;
    if (event === 'SIGNED_OUT') showAlert('You have been signed out', 'info');
    renderAuth();
    return;
  }

  try {
    currentProfile = await ensureProfile(supabase, currentUser);
  } catch (error) {
    if (generation !== renderGeneration) return;
    showCentered(setupErrorMessage(error));
    showAlert(setupErrorMessage(error), 'error');
    return;
  }

  if (generation !== renderGeneration) return;
  await renderApp();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!window.location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Offline cache is optional; ignore registration failures.
  });
}

function boot() {
  if (!app) return;
  showCentered('Loading Family Vitals…');
  registerServiceWorker();

  supabase.auth.onAuthStateChange((event, session) => {
    handleSession(event, session);
  });

  window.addEventListener('hashchange', () => {
    if (!currentUser) {
      renderAuth();
      return;
    }
    renderApp();
  });
}

boot();
