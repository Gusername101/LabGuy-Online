/* ============================================================
   tutorial.js — First-time user onboarding tutorial
   LabGuy Application
   ============================================================ */

const Tutorial = (() => {

  const STEPS = [
    {
      title:   'Welcome to Lab Guy! 👋',
      icon:    'fa-flask',
      content: `We're glad to have you here. This quick tour will walk you through
                the main features so you can hit the ground running. It'll only
                take a minute — let's go!`,
      highlight: null,
    },
    {
      title:   'Your Profile',
      icon:    'fa-user',
      content: `The <strong>User Profile</strong> button shows your name, email, and role
                (User or Admin). From here you can reset your password at any time.
                Your role determines what features you have access to.`,
      highlight: '[data-panel="panel-profile"]',
    },
    {
      title:   'Admin Dashboard',
      icon:    'fa-users-cog',
      content: `The <strong>Admin Dashboard</strong> is only visible to Admins. It's where
                department heads add storage modules, define sample structures, manage
                user roles, and review the full audit log of all sample activity.`,
      highlight: '[data-panel="panel-admin"]',
    },
    {
      title:   'Notifications',
      icon:    'fa-bell',
      content: `The <strong>Notifications</strong> panel is where Admins receive requests
                from users asking for elevated privileges. Each request can be
                approved or denied directly from this panel.`,
      highlight: '[data-panel="panel-notifications"]',
    },
    {
      title:   'Settings & Trash Can',
      icon:    'fa-cog',
      content: `<strong>Settings</strong> is where you log out and access the
                <strong>Trash Can</strong>. Deleted samples aren't gone forever — they
                sit in the Trash Can until you permanently delete or restore them
                to their exact original location.`,
      highlight: '[data-panel="panel-settings"]',
    },
    {
      title:   'Add Widgets',
      icon:    'fa-plus',
      content: `The <strong>green + button</strong> adds widgets to your personal dashboard.
                Widgets are fully modular — drag them anywhere, resize them by pulling
                the corner handle, and remove them with the ✕ button.
                Your layout saves automatically.`,
      highlight: '.nav-add',
    },
    {
      title:   'You\'re all set!',
      icon:    'fa-check-circle',
      content: `That's everything! If you ever need help, the Terms & Conditions are
                available in Settings. Welcome to the team — enjoy Lab Guy!`,
      highlight: null,
    },
  ];

  let _currentStep = 0;
  let _spotlight   = null;

  // ── Entry point ───────────────────────────────────────
  function checkAndShow() {
    _show();
  }

  // ── Build & show ──────────────────────────────────────
  function _show() {
    _currentStep = 0;
    _buildModal();
    _renderStep();
    document.getElementById('tutorial-overlay').classList.add('show');
  }

  function _buildModal() {
    if (document.getElementById('tutorial-overlay')) {
      document.getElementById('tutorial-overlay').remove();
    }

    // Spotlight element (the "cutout" that highlights a button)
    _spotlight = document.createElement('div');
    _spotlight.id = 'tutorial-spotlight';
    _spotlight.style.display = 'none';
    document.body.appendChild(_spotlight);

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.innerHTML = `
      <div id="tutorial-backdrop"></div>
      <div id="tutorial-modal">
        <div id="tutorial-icon-wrap">
          <i id="tutorial-icon" class="fas"></i>
        </div>
        <h2 id="tutorial-title"></h2>
        <p  id="tutorial-content"></p>
        <div id="tutorial-steps">
          ${STEPS.map((_, i) => `<div class="tutorial-dot" data-i="${i}"></div>`).join('')}
        </div>
        <div id="tutorial-actions">
          <button id="tutorial-skip" onclick="Tutorial.skip()">Skip tour</button>
          <button id="tutorial-next" onclick="Tutorial.next()">
            Next <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
  }

  // ── Render current step ───────────────────────────────
  function _renderStep() {
    const step   = STEPS[_currentStep];
    const isLast = _currentStep === STEPS.length - 1;

    // Animate icon swap
    const iconEl = document.getElementById('tutorial-icon');
    iconEl.style.transform = 'scale(0.5)';
    iconEl.style.opacity   = '0';
    setTimeout(() => {
      iconEl.className   = `fas ${step.icon}`;
      iconEl.style.transform = 'scale(1)';
      iconEl.style.opacity   = '1';
      iconEl.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    }, 150);

    document.getElementById('tutorial-title').textContent = step.title;
    document.getElementById('tutorial-content').innerHTML = step.content;

    // Dots
    document.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === _currentStep);
      dot.classList.toggle('done',   i < _currentStep);
    });

    // Button label
    const nextBtn = document.getElementById('tutorial-next');
    nextBtn.innerHTML = isLast
      ? 'Finish <i class="fas fa-check"></i>'
      : 'Next <i class="fas fa-arrow-right"></i>';

    // Spotlight
    _updateSpotlight(step.highlight);

    // Position modal — if spotlight exists, position modal near it
    _positionModal(step.highlight);
  }

  // ── Spotlight on a sidebar button ─────────────────────
  function _updateSpotlight(selector) {
    if (!selector) {
      _spotlight.style.display = 'none';
      return;
    }

    const target = document.querySelector(selector);
    if (!target) { _spotlight.style.display = 'none'; return; }

    const rect = target.getBoundingClientRect();
    const pad  = 8;

    _spotlight.style.display = 'block';
    _spotlight.style.left    = (rect.left   - pad) + 'px';
    _spotlight.style.top     = (rect.top    - pad) + 'px';
    _spotlight.style.width   = (rect.width  + pad * 2) + 'px';
    _spotlight.style.height  = (rect.height + pad * 2) + 'px';
  }

  // ── Position modal away from spotlight ────────────────
  function _positionModal(selector) {
    const modal = document.getElementById('tutorial-modal');
    if (!selector) {
      modal.style.left      = '50%';
      modal.style.top       = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const target = document.querySelector(selector);
    if (!target) return;

    const rect   = target.getBoundingClientRect();
    const modalW = 440;
    const modalH = modal.offsetHeight || 340;
    const margin = 24;

    // Always place modal to the right of sidebar
    const left = rect.right + margin;

    // Vertically: center on the button but clamp so modal stays fully on screen
    let top = rect.top + rect.height / 2 - modalH / 2;
    top = Math.max(margin, Math.min(window.innerHeight - modalH - margin, top));

    modal.style.left      = left + 'px';
    modal.style.top       = top  + 'px';
    modal.style.transform = 'none';
  }

  // ── Navigation ────────────────────────────────────────
  function next() {
    if (_currentStep < STEPS.length - 1) {
      _currentStep++;
      _renderStep();
    } else {
      _finish();
    }
  }

  function skip() { _finish(); }

  function _finish() {
    _spotlight?.remove();
    _spotlight = null;

    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 400);
    }
  }

  return { checkAndShow, next, skip };
})();

window.Tutorial = Tutorial;
