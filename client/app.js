let menuToggleButton = null;
let menuBackdrop = null;
let menuCloseButton = null;
let menuContainer = null;

async function loadMap() {
  const config = await fetch('/config').then(r => r.json());
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}`;
  script.onload = initMap;

  document.head.appendChild(script);
}

function initMap() {
  const map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: -26.2041, lng: 28.0473 },
    zoom: 12,
    disableDefaultUI: true,
  });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setCenter(p);
    });
  }
}

function updateMenuState(isOpen) {
  document.body.classList.toggle('menu-open', isOpen);
  if (menuToggleButton) {
    menuToggleButton.setAttribute('aria-expanded', String(isOpen));
  }
  if (menuCloseButton) {
    menuCloseButton.setAttribute('aria-expanded', String(isOpen));
  }
  if (menuContainer) {
    menuContainer.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      menuContainer.focus({ preventScroll: true });
    }
  }
  if (!isOpen && menuToggleButton) {
    menuToggleButton.focus({ preventScroll: true });
  }
}

function openMenu() {
  updateMenuState(true);
}

function closeMenu() {
  updateMenuState(false);
}

function toggleMenu(force) {
  const shouldOpen = typeof force === 'boolean'
    ? force
    : !document.body.classList.contains('menu-open');
  updateMenuState(shouldOpen);
}

function enhanceSearch(search) {
  if (!search) return;
  search.classList.add('menu-search');
  const input = search.querySelector('input');
  if (input) {
    if (!input.id) {
      input.id = 'route-search';
    }
    if (!search.querySelector('label')) {
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = 'Route search';
      search.insertBefore(label, input);
    }
    input.setAttribute('aria-label', 'Search routes');
  }
}

function relocateContent(topbar) {
  const mapElement = document.getElementById('map');
  const search = document.getElementById('search');
  if (search) {
    search.removeAttribute('style');
    enhanceSearch(search);
    const brand = topbar.querySelector('.menu-brand');
    if (brand && brand.nextSibling) {
      topbar.insertBefore(search, brand.nextSibling);
    } else {
      topbar.appendChild(search);
    }
  }

  const extraPanels = Array.from(document.body.children).filter(el => {
    if (el === topbar || el === mapElement || el === menuToggleButton || el === menuBackdrop) return false;
    return !(el.id === 'search');
  });

  extraPanels.forEach(panel => {
    if (panel.matches('#map')) return;
    panel.removeAttribute('style');
    if (panel.classList && panel.classList.contains('grid')) {
      const wrapper = document.createElement('div');
      wrapper.classList.add('menu-section');
      wrapper.appendChild(panel);
      topbar.appendChild(wrapper);
    } else {
      panel.classList.add('menu-section');
      topbar.appendChild(panel);
    }
  });
}

function buildMenu() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  topbar.setAttribute('role', 'dialog');
  topbar.setAttribute('aria-modal', 'false');
  topbar.setAttribute('aria-label', 'iTaxi-Finder navigation');
  topbar.setAttribute('aria-hidden', 'true');
  if (!topbar.hasAttribute('tabindex')) {
    topbar.setAttribute('tabindex', '-1');
  }
  menuContainer = topbar;

  menuToggleButton = document.createElement('button');
  menuToggleButton.type = 'button';
  menuToggleButton.className = 'menu-toggle';
  menuToggleButton.setAttribute('aria-label', 'Open navigation menu');
  menuToggleButton.setAttribute('aria-controls', topbar.id || 'topbar');
  menuToggleButton.setAttribute('aria-expanded', 'false');
  menuToggleButton.innerHTML = '<span></span><span></span><span></span>';
  document.body.appendChild(menuToggleButton);

  menuBackdrop = document.createElement('div');
  menuBackdrop.className = 'menu-backdrop';
  document.body.appendChild(menuBackdrop);

  const links = Array.from(topbar.querySelectorAll('a'));
  const closeButton = topbar.querySelector('button');

  topbar.textContent = '';

  if (closeButton) {
    closeButton.className = 'menu-close';
    closeButton.type = 'button';
    closeButton.textContent = 'Close menu';
    closeButton.removeAttribute('onclick');
    menuCloseButton = closeButton;
    topbar.appendChild(closeButton);
  } else {
    menuCloseButton = document.createElement('button');
    menuCloseButton.type = 'button';
    menuCloseButton.className = 'menu-close';
    menuCloseButton.textContent = 'Close menu';
    topbar.appendChild(menuCloseButton);
  }

  menuCloseButton.setAttribute('aria-controls', topbar.id || 'topbar');
  menuCloseButton.setAttribute('aria-expanded', 'false');
  menuCloseButton.setAttribute('aria-label', 'Close navigation menu');

  if (links.length) {
    const brandLink = links.shift();
    if (brandLink) {
      brandLink.classList.add('menu-brand');
      brandLink.textContent = 'iTaxi-Finder';
      topbar.appendChild(brandLink);
    }

    if (links.length) {
      const nav = document.createElement('nav');
      nav.className = 'menu-links';
      nav.setAttribute('aria-label', 'Site sections');
      links.forEach(link => {
        link.classList.add('menu-link');
        nav.appendChild(link);
      });
      topbar.appendChild(nav);
    }
  }

  relocateContent(topbar);

  menuToggleButton.addEventListener('click', () => toggleMenu());
  if (menuCloseButton) {
    menuCloseButton.addEventListener('click', () => closeMenu());
  }
  menuBackdrop.addEventListener('click', () => closeMenu());

  topbar.addEventListener('click', event => {
    if (event.target instanceof HTMLElement && event.target.matches('a')) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
      closeMenu();
    }
  });
}

function toggleUI(force) {
  toggleMenu(force);
}

document.addEventListener('DOMContentLoaded', () => {
  buildMenu();
  loadMap();
});

