import { initSupabase } from '../services/supabaseClient.js';
import { showAlert } from '../services/uiService.js';

export const renderReadingsUI = async (userId) => {
  const supabase = initSupabase();
  
  // Form for adding new readings
  const appContainer = document.getElementById('app-container');
  if (!appContainer) return;
  
  const readingsSection = document.createElement('section');
  readingsSection.className = 'readings-section';
  
  // Check if user has a family
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userId)
    .single();
  
  readingsSection.innerHTML = `
    <div class="section">
      <h2 class="section-title">Log New Reading</h2>
      <form id="reading-form" class="reading-form">
        <input type="hidden" id="user-id" value="${userId}">
        
        <div class="form-group">
          <label class="form-label">Reading Type</label>
          <select id="reading-type" class="form-input" required>
            <option value="bp">Blood Pressure</option>
            <option value="pulse">Pulse (bpm)</option>
            <option value="blood-sugar">Blood Sugar</option>
          </select>
        </div>
        
        <div id="bp-fields" class="form-group" style="display:none;">
          <div class="form-group">
            <label class="form-label">Systolic (mmHg)</label>
            <input type="number" id="systolic" class="form-input" min="60" max="250" required>
          </div>
          <div class="form-group">
            <label class="form-label">Diastolic (mmHg)</label>
            <input type="number" id="diastolic" class="form-input" min="40" max="150" required>
          </div>
        </div>
        
        <div id="pulse-fields" class="form-group" style="display:none;">
          <div class="form-group">
            <label class="form-label">Pulse (bpm)</label>
            <input type="number" id="pulse-value" class="form-input" min=40 max=200 required>
          </div>
        </div>
        
        <div id="sugar-fields" class="form-group" style="display:none;">
          <div class="form-group">
            <label class="form-label">Value</label>
            <input type="number" id="sugar-value" class="form-input" min=50 max=500 required>
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select id="sugar-unit" class="form-input">
              <option value="mg/dL">mg/dL</option>
              <option value="mmol/L">mmol/L</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Context</label>
            <select id="sugar-context" class="form-input">
              <option value="fasting">Fasting</option>
              <option value="after-meal">After Meal</option>
              <option value="random">Random</option>
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea id="reading-notes" class="form-input" rows="2" placeholder="Any notes..."></textarea>
        </div>
        
        <button type="submit" class="btn-primary btn-block">Log Reading</button>
      </form>
    </div>
    
    <div class="section" id="history-section">
      <h2 class="section-title">Reading History</h2>
      <div class="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Value</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <!-- Readings will be populated here -->
        </tbody>
      </div>
    </div>
  `;
  
  // Handle form type change
  const readingType = document.getElementById('reading-type');
  readingType.addEventListener('change', (e) => {
    const type = e.target.value;
    document.getElementById('bp-fields').style.display = type === 'bp' ? 'block' : 'none';
    document.getElementById('pulse-fields').style.display = type === 'pulse' ? 'block' : 'none';
    document.getElementById('sugar-fields').style.display = type === 'blood-sugar' ? 'block' : 'none';
  });
  
  // Handle form submission
  const readingForm = document.getElementById('reading-form');
  readingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = readingType.value;
    let data = { user_id: userId, type, created_at: new Date().toISOString() };
    
    if (type === 'bp') {
      data = {
        ...data,
        systolic: parseInt(document.getElementById('systolic').value),
        diastolic: parseInt(document.getElementById('diastolic').value),
      };
    } else if (type === 'pulse') {
      data = {
        ...data,
        bpm: parseInt(document.getElementById('pulse-value').value),
      };
    } else if (type === 'blood-sugar') {
      data = {
        ...data,
        value: parseFloat(document.getElementById('sugar-value').value),
        unit: document.getElementById('sugar-unit').value,
        context: document.getElementById('sugar-context').value,
      };
    }
    
    const { error } = await supabase
      .from('readings')
      .insert([data]);
    
    if (error) {
      showAlert('Error logging reading: ' + error.message, 'error');
    } else {
      showAlert('Reading logged successfully!', 'success');
      readingForm.reset();
      // Refresh the history
      renderReadingsHistory(userId);
    }
  });
  
  // Initial load - show BP fields by default
  document.getElementById('reading-type').value = 'bp';
  document.getElementById('bp-fields').style.display = 'block';
  
  // Load history
  renderReadingsHistory(userId);
};

const renderReadingsHistory = async (userId) => {
  const supabase = initSupabase();
  
  const { data: readings, error } = await supabase
    .from('readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) {
    showAlert('Error loading history', 'error');
    return;
  }
  
  const tbody = document.querySelector('#history-section tbody');
  if (!tbody) return;
  
  if (!readings || readings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No readings yet. Log your first reading above!</td></tr>`;
    return;
  }
  
  tbody.innerHTML = readings.map((reading, index) => {
    const value = reading.value || `${reading.systolic}/${reading.diastolic}` || reading.bpm || reading.value;
    const typeLabel = reading.type === 'bp' ? 'BP' : reading.type === 'pulse' ? 'Pulse' : 'Sugar';
    const date = new Date(reading.created_at).toLocaleDateString();
    
    return `
      <tr>
        <td class="type-${reading.type}">${typeLabel}</td>
        <td>${value}</td>
        <td>${date}</td>
        <td></td>
      </tr>
    `;
  }).join('');
};