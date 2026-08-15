import { initSupabase } from '../services/supabaseClient.js';
import { showAlert } from '../services/uiService.js';

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');

export const initAuth = async (supabase) => {
  // Set up auth state change listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_UP') {
      // User signed in - redirect to main app
      showAlert('Welcome to Family Vitals!', 'success');
      // The app.js will handle the UI switch
    } else if (event === 'SIGNED_OUT') {
      // User signed out - show auth screen
      showAlert('You have been signed out', 'info');
    }
  });
};

export const renderAuthScreen = () => {
  if (!authContainer || !appContainer) return;

  authContainer.innerHTML = `
    <div class="card auth-card">
      <div class="card-header">
        <span class="card-title">Family Vitals</span>
      </div>
      <div class="card-body">
        <h2 class="form-title">Sign In</h2>
        
        <form id="signin-form" class="form-group">
          <div class="form-group">
            <label for="email" class="form-label">Email address</label>
            <input type="email" id="email" class="form-input" placeholder="you@example.com" required>
          </div>
          
          <div class="form-group">
            <label for="password" class="form-label">Password</label>
            <input type="password" id="password" class="form-input" placeholder="••••••••" required>
          </div>
          
          <button type="submit" class="btn-primary btn-block">Sign In</button>
        </form>
        
        <p class="mt-4 text-center">
          <span>Don't have an account? <a href="#" id="signup-link">Sign up</a></span>
        </p>
      </div>
    </div>
  `;

  // Handle sign in form
  const signinForm = document.getElementById('signin-form');
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      showAlert(error.message, 'error');
    }
  });

  // Handle sign up link
  const signupLink = document.getElementById('signup-link');
  if (signupLink) {
    signupLink.addEventListener('click', (e) => {
      e.preventDefault();
      renderSignupScreen();
    });
  }
};

export const renderSignupScreen = () => {
  if (!authContainer || !appContainer) return;

  authContainer.innerHTML = `
    <div class="card auth-card">
      <div class="card-header">
        <span class="card-title">Family Vitals</span>
      </div>
      <div class="card-body">
        <h2 class="form-title">Sign Up</h2>
        
        <p class="mb-4 text-center" id="registration-status">
          Registration is currently <span id="reg-status-text">enabled</span>.
        </p>
        
        <form id="signup-form" class="form-group">
          <div class="form-group">
            <label for="signup-email" class="form-label">Email address</label>
            <input type="email" id="signup-email" class="form-input" placeholder="you@example.com" required>
          </div>
          
          <div class="form-group">
            <label for="signup-password" class="form-label">Password</label>
            <input type="password" id="signup-password" class="form-input" placeholder="••••••••" required>
          </div>
          
          <button type="submit" class="btn-primary btn-block">Create Account</button>
        </form>
      </div>
    </div>
  `;

  // Check registration status
  checkRegistrationStatus();

  // Handle sign up form
  const signupForm = document.getElementById('signup-form');
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      if (error.message.includes('Registration disabled')) {
        showAlert('Registration is currently disabled. Please contact an administrator.', 'error');
      } else {
        showAlert(error.message, 'error');
      }
    }
  });
};

const checkRegistrationStatus = async () => {
  try {
    // In a real app, this would come from a global setting
    // For now, we'll simulate based on Supabase auth configuration
    const registrationEnabled = true; // This would be fetched from admin settings
    const statusText = document.getElementById('reg-status-text');
    if (statusText) {
      statusText.textContent = registrationEnabled ? 'enabled' : 'disabled';
    }
  } catch (err) {
    console.error('Error checking registration status:', err);
  }
};