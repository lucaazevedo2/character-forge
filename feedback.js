/* Public Web3Forms form access key, supplied after email verification. */
const WEB3FORMS_ACCESS_KEY = 'da6337dd-c4a2-4f0f-8641-55a8a4025391';
(() => {
  const dialog = document.getElementById('feedbackDialog');
  const form = document.getElementById('feedbackForm');
  const message = form.elements.message;
  const send = document.getElementById('feedbackSend');
  const status = document.getElementById('feedbackStatus');
  const configured = Boolean(WEB3FORMS_ACCESS_KEY);
  send.disabled = !configured;
  if (!configured) status.textContent = 'Feedback delivery is being set up. Please check back soon.';
  document.addEventListener('click', event => {
    if (event.target.closest('#openFeedback')) dialog.showModal();
  });
  document.getElementById('closeFeedback').onclick = () => dialog.close();
  message.addEventListener('input', () => {
    document.getElementById('feedbackCount').textContent = `${message.value.length} / 1,000 characters`;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!configured || !form.reportValidity()) return;
    if (!message.value.trim() || message.value.length > 1000) {
      status.textContent = 'Please enter a message of 1–1,000 characters.';
      return;
    }
    if (form.elements.botcheck.checked) return;
    send.disabled = true;
    status.textContent = 'Sending feedback…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        signal: controller.signal,
        body: JSON.stringify({access_key: WEB3FORMS_ACCESS_KEY, subject: 'Character Forge feedback',
          from_name: 'Character Forge', feedback_type: form.elements.feedback_type.value,
          ...(form.elements.email.value.trim() ? {email: form.elements.email.value.trim()} : {}),
          message: message.value.trim(), botcheck: ''})
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('Submission failed');
      form.reset();
      document.getElementById('feedbackCount').textContent = '0 / 1,000 characters';
      status.textContent = 'Thank you! Your feedback has been sent.';
    } catch {
      status.textContent = 'Feedback could not be sent. Your message is still here—please try again.';
    } finally { clearTimeout(timeout); send.disabled = false; }
  });
})();
