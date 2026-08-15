export function showAlert(message, type = 'info') {
  const existing = document.querySelector('.custom-alert');
  if (existing) existing.remove();

  const alertDiv = document.createElement('div');
  alertDiv.className = `custom-alert alert-${type}`;
  alertDiv.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'alert-close';
  closeBtn.setAttribute('aria-label', 'Close alert');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => alertDiv.remove());

  alertDiv.append(text, closeBtn);
  document.body.appendChild(alertDiv);

  window.setTimeout(() => {
    if (alertDiv.parentNode) alertDiv.remove();
  }, 5000);
}

export function setButtonBusy(button, busy, label) {
  if (!button) return;
  button.disabled = Boolean(busy);
  if (label) button.textContent = label;
}
