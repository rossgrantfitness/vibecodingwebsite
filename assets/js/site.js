// Shared behaviour for every page: theme toggle, header shadow, scroll reveal, copy-email.
(function () {
  const root = document.documentElement;
  root.classList.remove('no-js');

  // Theme: follows the system until the visitor picks one; the choice is remembered.
  const THEME_KEY = 'rg-theme';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  } catch (e) { /* storage blocked: system theme it is */ }

  const isDark = () => root.dataset.theme
    ? root.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    const sync = () => btn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    sync();
    btn.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch (e) { /* ignore */ }
      sync();
    });
  });

  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // "Copy email" buttons: copy to clipboard, fall back to opening the mail app.
  document.querySelectorAll('[data-copy-email]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.copyEmail;
      const status = document.getElementById(btn.getAttribute('aria-controls'));
      try {
        await navigator.clipboard.writeText(email);
        if (status) status.textContent = `Copied ${email} to your clipboard.`;
      } catch (e) {
        window.location.href = `mailto:${email}`;
      }
    });
  });

  // Click-to-play embeds: load the game only when asked, then hand it keyboard focus.
  document.querySelectorAll('[data-embed]').forEach((fig) => {
    const btn = fig.querySelector('.embed-play');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = fig.dataset.embed;
      frame.title = fig.dataset.embedTitle || 'Playable game';
      frame.allow = 'gamepad; fullscreen; autoplay';
      fig.replaceChildren(frame);
      frame.addEventListener('load', () => frame.focus());
    });
  });

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
