// Entrada no modo administrador (cookie HttpOnly definido pelo servidor).
const msg = document.getElementById('msg');
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/v1/admin', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: document.getElementById('t').value.trim() }) });
  const j = await r.json().catch(() => ({}));
  msg.textContent = r.ok ? 'Pronto: consultas sem cota neste navegador por 30 dias.' : (j.error || `erro ${r.status}`);
  if (r.ok) document.getElementById('t').value = '';
});
document.getElementById('sair').addEventListener('click', async () => {
  await fetch('/api/v1/admin', { method: 'DELETE', credentials: 'same-origin' });
  msg.textContent = 'Modo administrador desligado neste navegador.';
});
