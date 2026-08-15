export const showAlert = (message, type = 'info') => {
  // Remove existing alerts
  const existingAlert = document.querySelector('.custom-alert');
  if (existingAlert) {
    existingAlert.remove();
  }
  
  const alertDiv = document.createElement('div');
  alertDiv.className = `custom-alert alert-${type}`;
  alertDiv.innerHTML = `
    <span>${message}</span>
    <button class="alert-close" aria-label="Close alert">&times;</button>
  `;
  
  // Add styles for the alert
  alertDiv.style.position = 'fixed';
  alertDiv.style.top = '20px';
  alertDiv.style.right = '20px';
  alertDiv.style.zIndex = '1000';
  alertDiv.style.background = type === 'success' ? 'rgba(167, 243, 208, 0.9)' : 
                            type === 'error' ? 'rgba(254, 202, 202, 0.9)' : 
                            'rgba(253, 230, 138, 0.9)';
  alertDiv.style.color = '#0F1F10';
  alertDiv.style.padding = '12px 20px';
  alertDiv.style.borderRadius = '8px';
  alertDiv.style.maxWidth = '300px';
  alertDiv.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
  
  const closeBtn = alertDiv.querySelector('.alert-close');
  closeBtn.style.marginLeft = '10px';
  closeBtn.style.background = 'none';
  closeBtn.style.color = inherit;
  closeBtn.style.border = 'none';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '16px';
  
  closeBtn.addEventListener('click', () => alertDiv.remove());
  
  document.body.appendChild(alertDiv);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove();
    }
  }, 5000);
};