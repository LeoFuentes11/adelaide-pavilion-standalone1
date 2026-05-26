/* =============================================
   Adelaide Pavilion — main.js
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Sticky Navbar ---------- */
  const navbar = document.getElementById('navbar');
  const handleScroll = () => {
    if (window.scrollY > 60) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  /* ---------- Mobile Nav ---------- */
  const navToggle = document.getElementById('navToggle');
  const navMobile = document.getElementById('navMobile');
  navToggle?.addEventListener('click', () => {
    navMobile?.classList.toggle('open');
  });
  // Close mobile nav on link click
  navMobile?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => navMobile.classList.remove('open'));
  });

  /* ---------- Scroll Animations ---------- */
  const animEls = document.querySelectorAll('.fade-up, .fade-in');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        // Stagger children if data-stagger
        const delay = e.target.dataset.delay || 0;
        setTimeout(() => e.target.classList.add('visible'), delay);
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  animEls.forEach(el => observer.observe(el));

  /* ---------- Lightbox ---------- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');

  let galleryItems = [];
  let currentIndex = 0;
  let lastFocusedEl = null;

  const openLightbox = (index) => {
    currentIndex = index;
    const item = galleryItems[index];
    if (!item || !lightbox || !lightboxImg) return;
    lastFocusedEl = document.activeElement;
    lightboxImg.src = item.src;
    lightboxImg.alt = item.alt || '';
    if (lightboxCaption) lightboxCaption.textContent = item.caption || '';
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    lightboxClose?.focus();
  };

  const closeLightbox = () => {
    lightbox?.classList.remove('active');
    document.body.style.overflow = '';
    lastFocusedEl?.focus();
  };

  const showPrev = () => openLightbox((currentIndex - 1 + galleryItems.length) % galleryItems.length);
  const showNext = () => openLightbox((currentIndex + 1) % galleryItems.length);

  // Build gallery items array
  document.querySelectorAll('[data-lightbox]').forEach((el, idx) => {
    const img = el.querySelector('img');
    galleryItems.push({
      src: img ? img.src : el.dataset.src || '',
      alt: img ? img.alt : '',
      caption: el.dataset.caption || (img ? img.alt : '')
    });
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `View image: ${img ? img.alt || 'gallery photo' : 'gallery photo'}`);
    el.addEventListener('click', () => openLightbox(idx));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(idx); }
    });
  });

  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxPrev?.addEventListener('click', showPrev);
  lightboxNext?.addEventListener('click', showNext);
  lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (!lightbox?.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showPrev();
    if (e.key === 'ArrowRight') showNext();
  });

  /* ---------- Tab System ---------- */
  document.querySelectorAll('.tab-buttons').forEach(tabGroup => {
    const buttons = tabGroup.querySelectorAll('.tab-btn');
    const tabContainer = tabGroup.closest('[data-tabs]') || tabGroup.parentElement;
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabContainer.querySelectorAll('.tab-content').forEach(c => {
          c.classList.toggle('active', c.dataset.tabContent === target);
        });
        const navbarHeight = document.getElementById('navbar')?.offsetHeight || 80;
        const top = tabContainer.getBoundingClientRect().top + window.scrollY - navbarHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  });

  // Activate tab from URL hash (e.g. packages.html#menus)
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const matchBtn = document.querySelector(`.tab-btn[data-tab="${hash}"]`);
    if (matchBtn) matchBtn.click();
  }

  /* ---------- Accordion ---------- */
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      const body = item.querySelector('.accordion-body');
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('open');
      });
      // Toggle current
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

  /* ---------- Enquiry Form ---------- */
  const enquiryForm = document.getElementById('enquiryForm');
  const formSuccess = document.getElementById('formSuccess');
  const formError   = document.getElementById('formError');
  const submitBtn   = document.getElementById('submitBtn');

  function showError(msg) {
    if (!formError) return;
    formError.textContent = msg;
    formError.style.display = 'block';
    formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearError() {
    if (formError) { formError.textContent = ''; formError.style.display = 'none'; }
  }

  // Highlight fields that failed server-side validation
  function markServerErrors(fieldNames) {
    fieldNames.forEach(name => {
      const el = enquiryForm.querySelector(`[name="${name}"]`);
      if (el) el.style.borderColor = '#e57373';
    });
  }

  // Validate email format
  function isValidEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
  }

  // Validate Australian phone: 04xx xxx xxx, 08xx xxxx xxxx, +61 4xx etc.
  function isValidAustralianPhone(val) {
    const stripped = val.replace(/[\s\-()]/g, '');
    return /^(\+?61|0)[2-9]\d{8}$/.test(stripped);
  }

  // Live phone formatting & validation feedback
  const phoneField = document.getElementById('phone');
  phoneField?.addEventListener('blur', () => {
    const val = phoneField.value.trim();
    if (!val) { phoneField.style.borderColor = ''; return; }
    phoneField.style.borderColor = isValidAustralianPhone(val) ? '' : '#e57373';
  });
  phoneField?.addEventListener('input', () => {
    // Only allow digits, spaces, +, -, (, )
    phoneField.value = phoneField.value.replace(/[^\d\s\+\-\(\)]/g, '');
  });

  // Live email validation feedback
  const emailField = document.getElementById('email');
  emailField?.addEventListener('blur', () => {
    const val = emailField.value.trim();
    if (!val) { emailField.style.borderColor = ''; return; }
    emailField.style.borderColor = isValidEmail(val) ? '' : '#e57373';
  });

  enquiryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    // --- Client-side required-field check ---
    const required = enquiryForm.querySelectorAll('[required]');
    let valid = true;
    required.forEach(field => {
      if (!field.value.trim()) {
        field.style.borderColor = '#e57373';
        valid = false;
      } else {
        field.style.borderColor = '';
      }
    });

    // --- Email format check ---
    const emailVal = emailField?.value.trim();
    if (emailVal && !isValidEmail(emailVal)) {
      if (emailField) emailField.style.borderColor = '#e57373';
      valid = false;
    }

    // --- Phone format check (only if filled in) ---
    const phoneVal = phoneField?.value.trim();
    if (phoneVal && !isValidAustralianPhone(phoneVal)) {
      if (phoneField) phoneField.style.borderColor = '#e57373';
      valid = false;
    }

    if (!valid) {
      showError('Please check the highlighted fields — email must be valid, phone must be an Australian number (e.g. 0400 000 000).');
      return;
    }

    // --- Honeypot check (bots fill hidden field) ---
    const honeypot = enquiryForm.querySelector('[name="bot-field"]');
    if (honeypot && honeypot.value) return; // silently drop

    // --- Disable button to prevent double-submit ---
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

    // --- Collect form data as JSON ---
    const payload = {
      firstName:  enquiryForm.querySelector('#firstName')?.value.trim(),
      lastName:   enquiryForm.querySelector('#lastName')?.value.trim(),
      email:      enquiryForm.querySelector('#email')?.value.trim(),
      phone:      enquiryForm.querySelector('#phone')?.value.trim(),
      eventType:  enquiryForm.querySelector('#eventType')?.value,
      eventDate:  enquiryForm.querySelector('#eventDate')?.value,
      guestCount: enquiryForm.querySelector('#guestCount')?.value,
      message:    enquiryForm.querySelector('#message')?.value.trim(),
      newsletter: enquiryForm.querySelector('#newsletter')?.checked,
      // Cloudflare Turnstile token (auto-inserted by the widget)
      'cf-turnstile-response': enquiryForm.querySelector('[name="cf-turnstile-response"]')?.value || '',
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Show confirmation, hide form
        enquiryForm.style.display = 'none';
        if (formSuccess) {
          formSuccess.classList.add('visible');
          window.scrollTo({ top: formSuccess.offsetTop - 100, behavior: 'smooth' });
        }
      } else if (res.status === 429) {
        // Rate limited
        showError(data.error || 'Too many submissions. Please try again later or call 08 8212 7444.');
      } else if (res.status === 422 && data.fields) {
        // Validation errors — highlight specific fields
        markServerErrors(data.fields);
        showError(data.error || 'Please check the highlighted fields and try again.');
      } else {
        showError(data.error || 'Something went wrong. Please call us on 08 8212 7444.');
      }
    } catch {
      showError('Unable to send your enquiry. Please check your connection or call 08 8212 7444.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Enquiry →'; }
    }
  });

  /* ---------- Smooth Scroll for anchor links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ---------- Active nav link ---------- */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .nav-mobile a').forEach(a => {
    const href = a.getAttribute('href');
    if (href && (href === currentPage || (currentPage === '' && href === 'index.html'))) {
      a.classList.add('active');
    }
  });

  /* ---------- Year in footer ---------- */
  document.querySelectorAll('.js-year').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

});
