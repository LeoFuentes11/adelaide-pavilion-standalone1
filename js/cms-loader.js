/**
 * cms-loader.js — Adelaide Pavilion
 *
 * Fetches CMS-managed JSON content and populates elements
 * marked with data-cms / data-cms-href / data-cms-html attributes.
 *
 * Elements keep their static HTML text as fallback — if the fetch
 * fails or is slow, visitors see the baked-in content with no flash.
 *
 * Attribute API:
 *   data-cms="key"       → sets element.textContent
 *   data-cms-html="key"  → sets element.innerHTML (for address <br> etc.)
 *   data-cms-href="key"  → sets element.href
 *   data-cms-bg="key"    → sets element.style.backgroundImage (from images.json)
 *   data-cms-src="key"   → sets element.src (from images.json)
 */

(function () {
  'use strict';

  let initialized = false;

  // Map body[data-page] values to their JSON data files
  const PAGE_MAP = {
    home:      '_data/homepage.json',
    about:     '_data/about.json',
    weddings:  '_data/weddings.json',
    corporate: '_data/corporate.json',
    social:    '_data/social.json',
    packages:  '_data/packages.json',
    // gallery and contact have no page-scoped JSON
  };

  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null; // silently fail — static content remains visible
    }
  }

  // Render testimonials array into [data-testimonials] container
  function renderTestimonials(data) {
    const container = document.querySelector('[data-testimonials]');
    if (!container) return;
    if (container.dataset.loaded) return; // already rendered
    const items = data['testimonials'];
    if (!Array.isArray(items) || items.length === 0) return; // keep static HTML
    container.innerHTML = ''; // safe to clear — we have data
    items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'testimonial fade-up visible';
      div.setAttribute('data-delay', String(i * 120));

      const stars = document.createElement('div');
      stars.className = 'testimonial-stars';
      stars.textContent = '★★★★★';

      const quote = document.createElement('p');
      quote.className = 'testimonial-text';
      quote.textContent = '\u201c' + (item.quote || '') + '\u201d';

      const author = document.createElement('div');
      author.className = 'testimonial-author';
      author.textContent = '\u2014 ' + (item.author || '') + (item.event ? ', ' + item.event : '');

      div.appendChild(stars);
      div.appendChild(quote);
      div.appendChild(author);
      container.appendChild(div);
    });
    container.dataset.loaded = 'true';
  }

  // Render string arrays into [data-bev] containers as <li> items
  function renderBeverages(data) {
    document.querySelectorAll('[data-bev]').forEach(container => {
      if (container.dataset.loaded) return;
      const key = container.dataset.bev;
      const items = data[key];
      if (!Array.isArray(items)) return;
      container.innerHTML = '';
      items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        container.appendChild(li);
      });
      container.dataset.loaded = 'true';
    });
  }

  // Render array-based menu sections into [data-menu] containers
  function renderMenus(data) {
    if (!data || typeof data !== 'object') return;
    document.querySelectorAll('[data-menu]').forEach(container => {
      if (container.dataset.loaded) return;
      const key = container.dataset.menu;
      const items = data[key];
      if (!Array.isArray(items)) return;
      container.innerHTML = '';
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'menu-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'menu-item-name';
        nameEl.textContent = item.name || '';

        const descEl = document.createElement('div');
        descEl.className = 'menu-item-desc';
        descEl.textContent = item.desc || '';

        if (item.surcharge) {
          const s = document.createElement('span');
          s.className = 'menu-item-surcharge';
          s.textContent = ' ' + item.surcharge;
          descEl.appendChild(s);
        }

        div.appendChild(nameEl);
        div.appendChild(descEl);
        container.appendChild(div);
      });
      container.dataset.loaded = 'true';
    });
  }

  function applyImages(images) {
    if (!images || typeof images !== 'object') return;
    document.querySelectorAll('[data-cms-bg]').forEach(el => {
      const key = el.dataset.cmsBg;
      if (images[key] && images[key].src) {
        el.style.backgroundImage = "url('" + images[key].src + "')";
      }
    });
    document.querySelectorAll('[data-cms-src]').forEach(el => {
      const key = el.dataset.cmsSrc;
      if (images[key] && images[key].src) {
        el.src = images[key].src;
      }
    });
  }

  function applyData(data) {
    if (!data || typeof data !== 'object') return;

    // Text content
    document.querySelectorAll('[data-cms]').forEach(el => {
      const key = el.dataset.cms;
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        el.textContent = String(data[key]);
      }
    });

    // innerHTML (allows <br> in addresses etc.)
    document.querySelectorAll('[data-cms-html]').forEach(el => {
      const key = el.dataset.cmsHtml;
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        el.innerHTML = String(data[key]);
      }
    });

    // href attributes (phone links, email links, social URLs)
    const SAFE_HREF_PREFIXES = ['tel:', 'mailto:', 'https://'];
    document.querySelectorAll('[data-cms-href]').forEach(el => {
      const key = el.dataset.cmsHref;
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const val = String(data[key]);
        if (SAFE_HREF_PREFIXES.some(p => val.startsWith(p))) {
          el.setAttribute('href', val);
        }
      }
    });
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    const pageKey = document.body.dataset.page;
    const hasMenus = !!document.querySelector('[data-menu]');

    // Fetch all needed JSON in parallel
    const urls = ['_data/contact.json', '_data/images.json'];
    if (pageKey && PAGE_MAP[pageKey]) urls.push(PAGE_MAP[pageKey]);
    if (hasMenus) urls.push('_data/menus.json');

    const results = await Promise.all(urls.map(fetchJSON));

    const contact  = results[0];
    const images   = results[1];
    const pageData = pageKey && PAGE_MAP[pageKey] ? results[2] : null;
    const menus    = hasMenus ? results[results.length - 1] : null;

    if (contact)  applyData(contact);
    if (images)   applyImages(images);
    if (pageData) {
      applyData(pageData);
      renderTestimonials(pageData);
      renderBeverages(pageData);
    }
    if (menus) renderMenus(menus);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
