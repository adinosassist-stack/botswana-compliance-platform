(() => {
  const menuButton = document.querySelector('[data-mobile-menu-button]');
  const menu = document.querySelector('[data-mobile-menu]');
  const closeMenu = () => {
    if (!menuButton || !menu) return;
    menu.dataset.open = 'false';
    menuButton.setAttribute('aria-expanded', 'false');
  };
  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      const next = menu.dataset.open !== 'true';
      menu.dataset.open = String(next);
      menuButton.setAttribute('aria-expanded', String(next));
    });
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    document.addEventListener('click', (event) => {
      if (menu.dataset.open === 'true' && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });
  }

  const responses = {
    'What needs my attention today?': 'A typical Thebe answer prioritises deadlines, missing records, cash or operational exceptions, then shows the next owner or action. Sign in to use your real workspace context.',
    'Which licences expire next?': 'Thebe can surface licence dates already recorded in your workspace, flag what is approaching, and point you to the supporting records that should be checked.',
    'How is the business doing this month?': 'Thebe can bring together permitted financial and operating signals so you can see collections, expenses, open work and exceptions in one owner view.',
    'What evidence am I missing for this tender?': 'Thebe can compare the tender-readiness records in your workspace with the evidence you have already stored and highlight gaps for human review.'
  };
  const responseBox = document.querySelector('[data-ai-demo-response]');
  const prompts = document.querySelectorAll('[data-thebe-prompt]');
  prompts.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      prompts.forEach((item) => item.setAttribute('aria-pressed', 'false'));
      button.setAttribute('aria-pressed', 'true');
      if (!responseBox) return;
      const prompt = button.dataset.thebePrompt || '';
      const text = responses[prompt] || 'Thebe can answer practical questions using the business context your role is allowed to see.';
      const paragraph = responseBox.querySelector('p');
      if (paragraph) paragraph.textContent = text;
      responseBox.hidden = false;
      responseBox.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });

  document.querySelectorAll('.faq details').forEach((detail) => {
    detail.addEventListener('toggle', () => {
      if (!detail.open || window.innerWidth > 760) return;
      document.querySelectorAll('.faq details[open]').forEach((other) => {
        if (other !== detail) other.open = false;
      });
    });
  });
})();