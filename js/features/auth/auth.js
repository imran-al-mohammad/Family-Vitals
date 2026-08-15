import { getSupabase } from '../../services/supabaseClient.js';
import { setButtonBusy, showAlert } from '../../services/uiService.js';
import { fetchRegistrationEnabled, isMissingRelation, setupErrorMessage } from '../../shared/api.js';

export function renderAuthScreen(root, { mode = 'signin' } = {}) {
  if (mode === 'signup') {
    renderSignupScreen(root);
    return;
  }
  renderSigninScreen(root);
}

function renderSigninScreen(root) {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="card auth-card">
        <div class="card-header">
          <span class="card-title">Family Vitals</span>
        </div>
        <div class="card-body">
          <h2 class="form-title">Sign in</h2>
          <form id="signin-form">
            <div class="form-group">
              <label for="email" class="form-label">Email</label>
              <input type="email" id="email" class="form-input" placeholder="you@example.com" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label for="password" class="form-label">Password</label>
              <input type="password" id="password" class="form-input" placeholder="••••••••" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn-primary btn-block" id="signin-submit">Sign in</button>
          </form>
          <p class="mt-4 text-center muted is-hidden" id="signup-prompt"></p>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#signin-form');
  const submit = root.querySelector('#signin-submit');
  const signupPrompt = root.querySelector('#signup-prompt');
  warnIfDatabaseMissing(root);

  fetchRegistrationEnabled(getSupabase())
    .then((enabled) => {
      if (!enabled || !signupPrompt) return;
      signupPrompt.classList.remove('is-hidden');
      signupPrompt.innerHTML = `Don't have an account? <a href="#/signup">Sign up</a>`;
    })
    .catch(() => {
      // Leave sign-up hidden if the setting cannot be read.
    });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const supabase = getSupabase();
    setButtonBusy(submit, true, 'Signing in…');
    const { error } = await supabase.auth.signInWithPassword({
      email: root.querySelector('#email').value.trim(),
      password: root.querySelector('#password').value,
    });
    setButtonBusy(submit, false, 'Sign in');
    if (error) showAlert(error.message, 'error');
  });
}

async function renderSignupScreen(root) {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="card auth-card">
        <div class="card-body">
          <h2 class="form-title">Create account</h2>
          <p class="empty-state">Checking registration…</p>
        </div>
      </div>
    </div>
  `;
  warnIfDatabaseMissing(root);

  let enabled = false;
  try {
    enabled = await fetchRegistrationEnabled(getSupabase());
  } catch (error) {
    const status = root.querySelector('.empty-state');
    if (status) status.textContent = setupErrorMessage(error);
    return;
  }

  if (!(window.location.hash || '').includes('signup')) return;

  if (!enabled) {
    root.innerHTML = `
      <div class="auth-screen">
        <div class="card auth-card">
          <div class="card-header">
            <span class="card-title">Family Vitals</span>
          </div>
          <div class="card-body">
            <h2 class="form-title">Registration closed</h2>
            <p class="mb-4 text-center muted">New accounts are disabled. Ask an administrator to add you.</p>
            <p class="text-center muted"><a href="#/login">Back to sign in</a></p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="auth-screen">
      <div class="card auth-card">
        <div class="card-header">
          <span class="card-title">Family Vitals</span>
        </div>
        <div class="card-body">
          <h2 class="form-title">Create account</h2>
          <p class="mb-4 text-center muted" id="registration-status">Registration is open.</p>
          <form id="signup-form">
            <div class="form-group">
              <label for="signup-name" class="form-label">Full name</label>
              <input type="text" id="signup-name" class="form-input" placeholder="Your name" autocomplete="name" required>
            </div>
            <div class="form-group">
              <label for="signup-email" class="form-label">Email</label>
              <input type="email" id="signup-email" class="form-input" placeholder="you@example.com" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label for="signup-password" class="form-label">Password</label>
              <input type="password" id="signup-password" class="form-input" placeholder="At least 6 characters" autocomplete="new-password" minlength="6" required>
            </div>
            <button type="submit" class="btn-primary btn-block" id="signup-submit">Create account</button>
          </form>
          <p class="mt-4 text-center muted">
            Already have an account? <a href="#/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#signup-form');
  const submit = root.querySelector('#signup-submit');
  const supabase = getSupabase();
  warnIfDatabaseMissing(root);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setButtonBusy(submit, true, 'Creating account…');
    try {
      const enabled = await fetchRegistrationEnabled(supabase);
      if (!enabled) {
        showAlert('Registration is currently disabled.', 'error');
        return;
      }

      const fullName = root.querySelector('#signup-name').value.trim();
      const { data, error } = await supabase.auth.signUp({
        email: root.querySelector('#signup-email').value.trim(),
        password: root.querySelector('#signup-password').value,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: authRedirectTo(),
        },
      });

      if (error) {
        showAlert(error.message, 'error');
        return;
      }

      if (data.session) {
        showAlert('Welcome to Family Vitals', 'success');
        return;
      }

      showAlert('Check your email to confirm your account, then sign in.', 'info');
      window.location.hash = '#/login';
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
    } finally {
      setButtonBusy(submit, false, 'Create account');
    }
  });
}

function authRedirectTo() {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  return url.toString();
}

async function warnIfDatabaseMissing(root) {
  const { error } = await getSupabase().from('profiles').select('id').limit(1);
  if (!error || !isMissingRelation(error)) return;
  const screen = root.querySelector('.auth-screen');
  if (!screen || screen.querySelector('.setup-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'card auth-card setup-banner';
  banner.innerHTML =
    '<p>The database tables are missing. In the Supabase SQL editor, run the files in <code>supabase/migrations</code> in order, then refresh this page.</p>';
  screen.prepend(banner);
}
