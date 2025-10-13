let mapInstance;
let routeEditorState;
let resizeListenerAttached = false;
let routeFinderState;
let adminRouteFinderState;
let overlayBodyIdCounter = 0;
let routeSaveDialogState;
let accountDropdownState;
let mobileViewportQuery = null;

const STORAGE_KEYS = {
  driverProfile: 'itaxiFinderDriverProfile',
  ownerProfile: 'itaxiFinderOwnerProfile',
  authSession: 'itaxiFinderAuthSession',
  routeContributor: 'itaxiFinderRouteContributor',
};

const ROLE_LABELS = Object.freeze({
  'taxi-manager': 'Taxi Manager',
  'taxi-owner': 'Taxi Owner',
  'taxi-rider': 'Taxi Rider (Commuter)',
  'rank-manager': 'Rank Manager',
  collector: 'Collector',
  'spaza-owner': 'Spaza Owner',
  'monthly-subscriber': 'Monthly Subscriber',
});

function formatRoleSummary(roles, fallback = 'account') {
  if (!Array.isArray(roles) || roles.length === 0) {
    return fallback;
  }
  const mapped = roles
    .map(role => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
    .filter(Boolean)
    .map(role => ROLE_LABELS[role] || role.replace(/[-_]+/g, ' '))
    .filter(Boolean);
  if (!mapped.length) {
    return fallback;
  }
  if (mapped.length === 1) {
    return mapped[0];
  }
  const last = mapped[mapped.length - 1];
  const initial = mapped.slice(0, -1);
  return `${initial.join(', ')} and ${last}`;
}

function safeStorageGet(key, fallback = null) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn('Unable to read stored data', error);
    return fallback;
  }
}

function safeStorageSet(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Unable to persist data', error);
  }
}

function safeStorageRemove(key) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn('Unable to remove stored data', error);
  }
}

function isMobileViewport() {
  if (typeof window === 'undefined') {
    return false;
  }
  if (!mobileViewportQuery && typeof window.matchMedia === 'function') {
    mobileViewportQuery = window.matchMedia('(max-width: 899px)');
  }
  if (mobileViewportQuery) {
    return mobileViewportQuery.matches;
  }
  const width =
    window.innerWidth ||
    (typeof document !== 'undefined' && document.documentElement
      ? document.documentElement.clientWidth
      : 0);
  return width <= 899;
}

function pageAllowsMobileBodyDrag() {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }
  const { classList } = document.body;

  const handleOnlyClasses = [
    'page-home',
    'page-delivery',
    'page-community',
    'page-registration',
    'page-about',
  ];

  if (handleOnlyClasses.some(className => classList.contains(className))) {
    return false;
  }

  const allowedClasses = ['page-route-adder', 'page-route-finder'];
  return allowedClasses.some(className => classList.contains(className));
}

function notifyAuthChange(session) {
  if (typeof document === 'undefined') return;
  const detail = { session: session || null };
  document.dispatchEvent(new CustomEvent('authchange', { detail }));
}

function getAuthSession() {
  const session = safeStorageGet(STORAGE_KEYS.authSession, null);
  if (!session || typeof session !== 'object') {
    return null;
  }
  if (session.token && session.user) {
    return session;
  }
  if (session.token) {
    return { token: session.token, user: session.user || null };
  }
  return null;
}

function setAuthSession(session) {
  if (session && session.token) {
    safeStorageSet(STORAGE_KEYS.authSession, session);
    notifyAuthChange(session);
  } else {
    safeStorageRemove(STORAGE_KEYS.authSession);
    notifyAuthChange(null);
  }
}

function clearAuthSession() {
  setAuthSession(null);
}

function getLoggedInUser() {
  const session = getAuthSession();
  if (!session || !session.user) return null;
  return session.user;
}

function getRegisteredContributorDetails() {
  const user = getLoggedInUser();
  if (!user) {
    return normalizeContributor();
  }

  return normalizeContributor({
    username: user.username,
    homeTown: user.homeTown,
  });
}

function getAuthHeaders() {
  const session = getAuthSession();
  if (session && session.token) {
    return { Authorization: `Bearer ${session.token}` };
  }
  return {};
}

async function refreshAuthSession() {
  const session = getAuthSession();
  if (!session || !session.token) {
    return null;
  }
  try {
    const response = await fetch('/api/users/session', {
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (!response.ok) {
      throw new Error('Session expired');
    }
    const data = await response.json();
    if (data && data.user) {
      const nextSession = { token: session.token, user: data.user };
      setAuthSession(nextSession);
      return nextSession;
    }
  } catch (error) {
    clearAuthSession();
  }
  return null;
}

function generateId(prefix = 'id') {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function getDriverProfile() {
  return safeStorageGet(STORAGE_KEYS.driverProfile, null);
}

function setDriverProfile(profile) {
  if (!profile) {
    safeStorageRemove(STORAGE_KEYS.driverProfile);
  } else {
    safeStorageSet(STORAGE_KEYS.driverProfile, profile);
  }
  notifyAdminDataChanged();
}

function getOwnerProfile() {
  return safeStorageGet(STORAGE_KEYS.ownerProfile, null);
}

function setOwnerProfile(profile) {
  if (!profile) {
    safeStorageRemove(STORAGE_KEYS.ownerProfile);
  } else {
    safeStorageSet(STORAGE_KEYS.ownerProfile, profile);
  }
  notifyAdminDataChanged();
}

function normalizeContributor(data = {}) {
  const username = typeof data.username === 'string' ? data.username.trim() : '';
  const homeTown = typeof data.homeTown === 'string' ? data.homeTown.trim() : '';
  return { username, homeTown };
}

function contributorHasDetails(contributor) {
  if (!contributor) return false;
  const username = typeof contributor.username === 'string' ? contributor.username.trim() : '';
  const homeTown = typeof contributor.homeTown === 'string' ? contributor.homeTown.trim() : '';
  return Boolean(username || homeTown);
}

function getRouteContributor() {
  const stored = safeStorageGet(STORAGE_KEYS.routeContributor, null);
  if (!stored) return null;
  const normalized = normalizeContributor(stored);
  if (!normalized.username && !normalized.homeTown) {
    return null;
  }
  return normalized;
}

function setRouteContributor(contributor) {
  const normalized = normalizeContributor(contributor);
  if (!normalized.username && !normalized.homeTown) {
    safeStorageRemove(STORAGE_KEYS.routeContributor);
    if (routeEditorState) {
      routeEditorState.contributor = { username: '', homeTown: '' };
    }
    return;
  }
  safeStorageSet(STORAGE_KEYS.routeContributor, normalized);
  if (routeEditorState) {
    routeEditorState.contributor = { ...normalized };
  }
}

function clearRouteContributor() {
  setRouteContributor(null);
}

function attachLogoutHandler(button, { onComplete } = {}) {
  if (!button || button.dataset.logoutBound === 'true') return;
  button.addEventListener('click', () => {
    button.disabled = true;
    fetch('/api/users/logout', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
      },
    })
      .catch(() => null)
      .finally(() => {
        clearAuthSession();
        clearRouteContributor();
        button.disabled = false;
        if (typeof onComplete === 'function') {
          try {
            onComplete();
          } catch (error) {
            console.error('Logout completion handler failed', error);
          }
        }
      });
  });
  button.dataset.logoutBound = 'true';
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Number(position.coords.accuracy),
          timestamp: Date.now(),
        });
      },
      error => {
        reject(new Error((error && error.message) || 'Unable to retrieve your location.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

function enableDriverLiveLocation() {
  const profile = getDriverProfile();
  if (!profile) {
    return Promise.reject(new Error('Register as a taxi manager before enabling live location.'));
  }
  return requestCurrentPosition().then(location => {
    const updated = { ...profile, sharingEnabled: true, lastKnownLocation: location };
    setDriverProfile(updated);
    return updated;
  });
}

function disableDriverLiveLocation() {
  const profile = getDriverProfile();
  if (!profile) {
    return Promise.reject(new Error('Register as a taxi manager before disabling live location.'));
  }
  const updated = { ...profile, sharingEnabled: false };
  setDriverProfile(updated);
  return Promise.resolve(updated);
}

function refreshDriverLocation() {
  const profile = getDriverProfile();
  if (!profile) {
    return Promise.reject(new Error('Register as a taxi manager before refreshing your location.'));
  }
  if (!profile.sharingEnabled) {
    return Promise.reject(new Error('Enable live location before refreshing your position.'));
  }
  return requestCurrentPosition().then(location => {
    const updated = { ...profile, sharingEnabled: true, lastKnownLocation: location };
    setDriverProfile(updated);
    return updated;
  });
}

function updateOwnerTaxiLocation(taxiId) {
  const owner = getOwnerProfile();
  if (!owner || !Array.isArray(owner.taxis)) {
    return Promise.reject(new Error('Register your taxis before updating their locations.'));
  }
  const index = owner.taxis.findIndex(taxi => taxi.id === taxiId);
  if (index === -1) {
    return Promise.reject(new Error('Taxi not found. Refresh the Admin Route Finder and try again.'));
  }
  return requestCurrentPosition().then(location => {
    const updatedTaxi = { ...owner.taxis[index], lastKnownLocation: location };
    const updatedOwner = { ...owner, taxis: owner.taxis.slice() };
    updatedOwner.taxis[index] = updatedTaxi;
    setOwnerProfile(updatedOwner);
    return updatedTaxi;
  });
}

function formatRelativeTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) return 'Not updated yet';
  const diff = Date.now() - timestamp;
  if (diff < 30 * 1000) return 'Moments ago';
  if (diff < 90 * 1000) return 'About a minute ago';
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.round(diff / (60 * 1000));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diff / (60 * 60 * 1000));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return new Date(timestamp).toLocaleString('en-ZA');
}

function formatLocationSummary(location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return 'No live position recorded yet.';
  }
  return `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
}

function notifyAdminDataChanged() {
  if (!adminRouteFinderState) return;
  renderAdminDriverSection();
  renderAdminOwnerSection();
  updateAdminMarkers();
  fitAdminMapToEntities();
  if (adminRouteFinderState.map) {
    repositionMapControls(adminRouteFinderState.map.getDiv());
  }
}

async function init() {
  try {
    await refreshAuthSession();

    document.querySelectorAll('form[data-static-form]').forEach(form => {
      form.addEventListener('submit', event => event.preventDefault());
    });

    document.querySelectorAll('[data-static-link]').forEach(link => {
      link.addEventListener('click', event => event.preventDefault());
    });

    document.querySelectorAll('[data-dismiss-banner]').forEach(button => {
      button.addEventListener('click', () => {
        const banner = button.closest('.delivery-banner');
        if (banner) {
          banner.remove();
          const mapElement = document.getElementById('map');
          if (mapElement) repositionMapControls(mapElement);
        }
      });
    });

    setupResponsiveNavigation();
    setupAccountDropdown();
    applyLayoutOffsets(getControlOffset());
    setupDraggableOverlays();

    if (document.body.classList.contains('page-registration')) {
      setupRegistration();
    }

    const response = await fetch('/config');
    if (!response.ok) throw new Error(`Config request failed: ${response.status}`);
    const config = await response.json();
    loadMapsScript(config.mapsApiKey);
  } catch (error) {
    console.error('Unable to initialise Google Maps', error);
  }
}

function loadMapsScript(apiKey) {
  if (!apiKey) {
    console.error('Google Maps API key is missing');
    return;
  }

  if (window.google && window.google.maps) {
    initMap();
    return;
  }

  const existing = document.querySelector('script[data-google-maps="true"]');
  if (existing) {
    existing.addEventListener('load', initMap, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.dataset.googleMaps = 'true';
  script.addEventListener('load', initMap, { once: true });
  script.addEventListener('error', () => console.error('Google Maps script failed to load'));
  document.head.appendChild(script);
}

function ensureMapElement() {
  let mapElement = document.getElementById('map');
  if (!mapElement) {
    mapElement = document.createElement('div');
    mapElement.id = 'map';
    document.body.appendChild(mapElement);
  }

  const firstElement = document.body.firstElementChild;
  if (firstElement && firstElement !== mapElement) {
    document.body.insertBefore(mapElement, firstElement);
  }

  mapElement.classList.add('map-ready');
  return mapElement;
}

function initMap() {
  const mapElement = ensureMapElement();
  if (!mapElement) return;

  const initialCenter = { lat: -26.2041, lng: 28.0473 };
  const initialOptions = {
    center: initialCenter,
    zoom: 12,
    mapTypeControl: true,
    fullscreenControl: true,
    streetViewControl: false,
    backgroundColor: '#dbeafe',
  };

  if (!mapInstance) {
    mapInstance = new google.maps.Map(mapElement, initialOptions);
  }

  requestUserLocation(mapInstance);
  styleControls(mapElement, mapInstance);

  if (document.body.classList.contains('map-background')) {
    mapElement.classList.add('map-muted');
  } else {
    mapElement.classList.remove('map-muted');
  }

  if (document.body.classList.contains('page-route-adder')) {
    setupRouteAdder(mapInstance);
  }

  if (document.body.classList.contains('page-route-finder')) {
    setupRouteFinder(mapInstance);
  }

  if (document.body.classList.contains('page-admin-route-finder')) {
    setupAdminRouteFinder(mapInstance);
  }
}

function requestUserLocation(map) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        map.setCenter(coords);
      },
      () => fallbackToIpLocation(map),
    );
  } else {
    fallbackToIpLocation(map);
  }
}

async function fallbackToIpLocation(map) {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) return;
    const data = await response.json();
    if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      map.setCenter({ lat: data.latitude, lng: data.longitude });
    }
  } catch (error) {
    console.warn('IP geolocation fallback unavailable', error);
  }
}

function getControlOffset() {
  const topbar = document.getElementById('topbar');
  const navHeight = topbar ? topbar.getBoundingClientRect().height : 56;
  const root = document.documentElement;
  if (root) {
    root.style.setProperty('--topbar-height', `${Math.round(navHeight)}px`);
  }
  let offset = navHeight + 12;
  const banner = document.querySelector('.delivery-banner');
  if (banner && banner.isConnected) {
    offset += banner.getBoundingClientRect().height + 12;
  }
  return Math.round(offset);
}

function applyLayoutOffsets(offset) {
  const root = document.documentElement;
  const clampedOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const overlayTop = clampedOffset + 24;
  root.style.setProperty('--map-control-offset', `${clampedOffset}px`);
  root.style.setProperty('--overlay-panel-top', `${overlayTop}px`);
  const viewportHeight = window.innerHeight || 0;
  if (viewportHeight > 0) {
    const maxHeight = Math.max(viewportHeight - overlayTop - 32, 180);
    root.style.setProperty('--overlay-panel-max-height', `${maxHeight}px`);
  } else {
    root.style.setProperty('--overlay-panel-max-height', `calc(100vh - ${overlayTop}px - 32px)`);
  }
}

function repositionMapControls(mapElement) {
  if (!mapElement) return;
  const offset = getControlOffset();
  applyLayoutOffsets(offset);
  const offsetPx = `${offset}px`;
  const mapTypeControl = mapElement.querySelector('.gm-style-mtc');
  if (mapTypeControl) {
    mapTypeControl.style.top = offsetPx;
  }

  const fullscreenControl = mapElement.querySelector('.gm-fullscreen-control');
  if (fullscreenControl) {
    let fullscreenTop = offset;
    const tools = document.getElementById('editor-tools');
    if (tools) {
      const rect = tools.getBoundingClientRect();
      if (rect && Number.isFinite(rect.bottom)) {
        fullscreenTop = Math.max(fullscreenTop, Math.round(rect.bottom + 16));
      }
    }
    fullscreenControl.style.top = `${fullscreenTop}px`;
    fullscreenControl.style.right = '16px';
  }
}

function styleControls(mapElement, map) {
  const repositionControls = () => repositionMapControls(mapElement);

  google.maps.event.addListenerOnce(map, 'idle', repositionControls);
  google.maps.event.addListener(map, 'maptypeid_changed', repositionControls);
  google.maps.event.addListener(map, 'zoom_changed', repositionControls);
  if (!resizeListenerAttached) {
    window.addEventListener('resize', repositionControls);
    resizeListenerAttached = true;
  }
  repositionControls();
}

function setupResponsiveNavigation() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;
  const toggle = topbar.querySelector('[data-nav-toggle]');
  const navContainer = topbar.querySelector('[data-nav-container]');
  const closeButton = topbar.querySelector('[data-nav-close]');
  const backdrop = topbar.querySelector('[data-nav-backdrop]');
  const links = topbar.querySelector('[data-nav-links]');
  if (!toggle || !links || !navContainer) return;

  const navMediaQuery = window.matchMedia('(min-width: 900px)');
  let restoreFocusTo = null;
  const getViewportHeight = () => {
    if (window.visualViewport && typeof window.visualViewport.height === 'number') {
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || 0;
  };

  const updateMobileNavHeight = () => {
    if (!navContainer) return;

    const isDesktop = navMediaQuery.matches;
    topbar.dataset.navMode = isDesktop ? 'desktop' : 'overlay';

    if (isDesktop) {
      navContainer.style.removeProperty('--mobile-nav-max-height');
      navContainer.style.removeProperty('--mobile-nav-height');
      navContainer.classList.remove('mobile-nav--scrollable');
      return;
    }

    const viewportHeight = getViewportHeight();
    if (!viewportHeight) {
      navContainer.style.removeProperty('--mobile-nav-max-height');
      return;
    }

    const computed = window.getComputedStyle(navContainer);
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const columnGap =
      Number.parseFloat(computed.rowGap || computed.columnGap || computed.gap) || 0;

    const header = navContainer.querySelector('.mobile-nav__header');
    const headerRect = header && header.isConnected ? header.getBoundingClientRect() : null;
    const headerHeight = headerRect && Number.isFinite(headerRect.height)
      ? headerRect.height
      : 0;

    let linksHeight = 0;
    if (links && links.isConnected) {
      linksHeight = links.scrollHeight;
    }

    let totalHeight = paddingTop + paddingBottom + linksHeight;
    if (headerHeight) {
      totalHeight += headerHeight;
    }
    if (headerHeight && linksHeight) {
      totalHeight += columnGap;
    }

    totalHeight = Math.ceil(totalHeight);

    const safeSpacing = Math.max(12, Math.round(viewportHeight * 0.015));
    const availableHeight = Math.max(0, Math.round(viewportHeight - safeSpacing));
    let targetHeight = totalHeight;
    if (availableHeight && totalHeight > availableHeight) {
      targetHeight = availableHeight;
    }

    if (!targetHeight || targetHeight <= 0) {
      navContainer.style.removeProperty('--mobile-nav-max-height');
      navContainer.style.removeProperty('--mobile-nav-height');
      navContainer.classList.remove('mobile-nav--scrollable');
      return;
    }

    navContainer.style.setProperty('--mobile-nav-max-height', `${targetHeight}px`);
    navContainer.style.setProperty('--mobile-nav-height', `${targetHeight}px`);
    const needsScroll = totalHeight - targetHeight > 1;
    navContainer.classList.toggle('mobile-nav--scrollable', needsScroll);
  };

  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const getFocusableNavElements = () =>
    Array.from(navContainer.querySelectorAll(focusableSelectors)).filter(element => {
      if (element.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      return !(element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true');
    });

  const setLinkFocusability = enabled => {
    const focusableLinks = links.querySelectorAll('a, button');
    focusableLinks.forEach(link => {
      if (enabled) {
        if (link.hasAttribute('data-nav-tabindex')) {
          const original = link.getAttribute('data-nav-tabindex');
          if (original) {
            link.setAttribute('tabindex', original);
          } else {
            link.removeAttribute('tabindex');
          }
          link.removeAttribute('data-nav-tabindex');
        } else if (link.getAttribute('tabindex') === '-1') {
          link.removeAttribute('tabindex');
        }
      } else {
        if (!link.hasAttribute('data-nav-tabindex')) {
          const current = link.hasAttribute('tabindex') ? link.getAttribute('tabindex') : '';
          link.setAttribute('data-nav-tabindex', current || '');
        }
        link.setAttribute('tabindex', '-1');
      }
    });
  };

  const toggleBodyScroll = shouldLock => {
    document.body.classList.toggle('nav-open', Boolean(shouldLock));
  };

  const setNavState = open => {
    const isDesktop = navMediaQuery.matches;
    const shouldOpen = Boolean(open) && !isDesktop;
    closeAccountMenu();

    if (!isDesktop && shouldOpen) {
      restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    topbar.dataset.navOpen = shouldOpen ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

    if (isDesktop) {
      navContainer.setAttribute('aria-hidden', 'false');
      links.setAttribute('aria-hidden', 'false');
      setLinkFocusability(true);
      toggleBodyScroll(false);
      restoreFocusTo = null;
    } else {
      navContainer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
      links.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');

      if (shouldOpen) {
        setLinkFocusability(true);
        toggleBodyScroll(true);
        const focusTarget = getFocusableNavElements()[0] || links.querySelector('a, button');
        if (focusTarget && typeof focusTarget.focus === 'function') {
          requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
        }
      } else {
        setLinkFocusability(false);
        toggleBodyScroll(false);
        const focusReturn = restoreFocusTo && typeof restoreFocusTo.focus === 'function'
          ? restoreFocusTo
          : toggle;
        requestAnimationFrame(() => focusReturn.focus({ preventScroll: true }));
        restoreFocusTo = null;
      }
    }

    updateMobileNavHeight();

    const mapElement = document.getElementById('map');
    if (mapElement) {
      repositionMapControls(mapElement);
    } else {
      applyLayoutOffsets(getControlOffset());
    }
  };

  setNavState(false);

  if (typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(() => updateMobileNavHeight());
    resizeObserver.observe(navContainer);
    if (links) {
      resizeObserver.observe(links);
    }
  }

  const handleViewportChange = () => updateMobileNavHeight();
  window.addEventListener('resize', handleViewportChange);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
  }

  if (typeof MutationObserver === 'function') {
    const navMutationObserver = new MutationObserver(updateMobileNavHeight);
    navMutationObserver.observe(links, { childList: true, subtree: true });
  }

  updateMobileNavHeight();

  const closeNav = () => setNavState(false);

  toggle.addEventListener('click', () => {
    if (navMediaQuery.matches) return;
    const isOpen = topbar.dataset.navOpen === 'true';
    setNavState(!isOpen);
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeNav);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeNav);
  }

  links.addEventListener('click', event => {
    if (navMediaQuery.matches) return;
    if (event.target && event.target.closest('a')) {
      closeNav();
    }
  });

  const handleBreakpointChange = event => {
    if (event && typeof event.matches === 'boolean') {
      setNavState(false);
    } else {
      setNavState(false);
    }

    updateMobileNavHeight();
    toggleBodyScroll(false);
  };

  if (typeof navMediaQuery.addEventListener === 'function') {
    navMediaQuery.addEventListener('change', handleBreakpointChange);
  } else if (typeof navMediaQuery.addListener === 'function') {
    navMediaQuery.addListener(handleBreakpointChange);
  }

  if (navContainer) {
    navContainer.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || navMediaQuery.matches || topbar.dataset.navOpen !== 'true') return;
      const focusableItems = getFocusableNavElements();
      if (!focusableItems.length) return;
      const first = focusableItems[0];
      const last = focusableItems[focusableItems.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !navContainer.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !navMediaQuery.matches && topbar.dataset.navOpen === 'true') {
      closeNav();
    }
  });
}

function setAccountMenuOpen(state, open) {
  if (!state) return;
  const isOpen = Boolean(open);
  state.isOpen = isOpen;
  if (state.toggle) {
    state.toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  if (state.menu) {
    state.menu.hidden = !isOpen;
  }
  if (state.container) {
    state.container.classList.toggle('topbar__account--open', isOpen);
  }

  if (typeof window !== 'undefined') {
    const realignOverlays = () => {
      const mapElement = document.getElementById('map');
      if (mapElement) {
        repositionMapControls(mapElement);
      } else {
        applyLayoutOffsets(getControlOffset());
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(realignOverlays);
    } else {
      setTimeout(realignOverlays, 0);
    }
  }
}

function closeAccountMenu() {
  if (!accountDropdownState || !accountDropdownState.isOpen) return;
  setAccountMenuOpen(accountDropdownState, false);
}

function openAccountMenu(options = {}) {
  const state = setupAccountDropdown();
  if (!state) {
    if (options.redirect !== false) {
      window.location.href = '/registration.html#login';
    }
    return null;
  }
  setAccountMenuOpen(state, true);
  const focusPreference = options.focus || (getAuthSession() && getAuthSession().user ? 'manage' : 'signin');
  let focusTarget = null;
  if (focusPreference === 'manage') {
    focusTarget = state.manageLink || state.signInLink;
  } else if (focusPreference === 'signin') {
    focusTarget = state.signInLink || state.registerLink;
  } else if (focusPreference instanceof HTMLElement) {
    focusTarget = focusPreference;
  }
  const fallback = focusTarget || state.toggle;
  if (fallback && typeof fallback.focus === 'function') {
    requestAnimationFrame(() => fallback.focus({ preventScroll: true }));
  }
  return state;
}

function updateAccountDropdown(session = getAuthSession()) {
  if (!accountDropdownState) return;
  const state = accountDropdownState;
  const user = session && session.user ? session.user : null;
  const {
    container,
    toggle,
    label,
    summary,
    detailsList,
    detailFields,
    signInLink,
    registerLink,
    manageLink,
    signOutButton,
  } = state;

  if (!label || !summary || !signInLink || !registerLink || !manageLink || !signOutButton) {
    return;
  }

  if (user) {
    const username = typeof user.username === 'string' ? user.username.trim() : '';
    const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : '';
    const lastName = typeof user.lastName === 'string' ? user.lastName.trim() : '';
    const homeTown = typeof user.homeTown === 'string' ? user.homeTown.trim() : '';
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    const phone = typeof user.phone === 'string' ? user.phone.trim() : '';
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    const displayLabel = username || name || 'Account';
    const truncated = displayLabel.length > 22 ? `${displayLabel.slice(0, 21)}…` : displayLabel;
    label.textContent = truncated || 'Account';

    let summaryText = '';
    if (name) {
      summaryText = name;
    }
    if (username && (!name || name.toLowerCase() !== username.toLowerCase())) {
      summaryText = summaryText ? `${summaryText} (${username})` : username;
    }
    if (homeTown) {
      summaryText = summaryText ? `${summaryText} · ${homeTown}` : homeTown;
    }
    summary.textContent = summaryText || 'Signed in to iTaxi-Finder.';

    if (detailsList && detailFields) {
      detailsList.hidden = false;
      if (detailFields.username) detailFields.username.textContent = username || '—';
      if (detailFields.name) detailFields.name.textContent = name || '—';
      if (detailFields.hometown) detailFields.hometown.textContent = homeTown || '—';
      if (detailFields.roles) detailFields.roles.textContent = formatRoleSummary(roles, 'No roles selected');
      if (detailFields.email) detailFields.email.textContent = email || '—';
      if (detailFields.phone) detailFields.phone.textContent = phone || '—';
      if (detailFields.lastLogin) {
        const lastLogin = typeof user.lastLoginAt === 'string' ? new Date(user.lastLoginAt) : null;
        detailFields.lastLogin.textContent = lastLogin && !Number.isNaN(lastLogin.valueOf())
          ? lastLogin.toLocaleString('en-ZA')
          : '—';
      }
    }

    manageLink.hidden = false;
    signOutButton.hidden = false;
    signOutButton.disabled = false;
    signInLink.hidden = true;
    registerLink.hidden = true;
    if (toggle) {
      toggle.setAttribute('aria-label', `Account menu for ${displayLabel}`);
    }
    if (container) {
      container.classList.add('topbar__account--authenticated');
    }
  } else {
    label.textContent = 'Account';
    summary.textContent = 'Sign in to manage your taxi network profile.';
    if (detailsList) {
      detailsList.hidden = true;
    }
    manageLink.hidden = true;
    signOutButton.hidden = true;
    signOutButton.disabled = true;
    signInLink.hidden = false;
    registerLink.hidden = false;
    if (toggle) {
      toggle.setAttribute('aria-label', 'Open account menu');
    }
    if (container) {
      container.classList.remove('topbar__account--authenticated');
    }
  }
}

function setupAccountDropdown() {
  if (accountDropdownState) return accountDropdownState;
  const topbar = document.getElementById('topbar');
  if (!topbar) return null;

  const container = document.createElement('div');
  container.className = 'topbar__account';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'topbar__account-toggle';
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'topbar__account-label';
  label.textContent = 'Account';

  const caret = document.createElement('span');
  caret.className = 'topbar__account-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = '▾';

  toggle.append(label, caret);

  const menu = document.createElement('div');
  menu.className = 'topbar__account-menu';
  const menuId = `account-menu-${++overlayBodyIdCounter}`;
  menu.id = menuId;
  toggle.setAttribute('aria-controls', menuId);
  menu.hidden = true;

  const summary = document.createElement('p');
  summary.className = 'topbar__account-summary';
  summary.textContent = 'Sign in to manage your taxi network profile.';

  const detailsList = document.createElement('dl');
  detailsList.className = 'topbar__account-details';
  detailsList.hidden = true;

  const createDetail = (labelText, key) => {
    const term = document.createElement('dt');
    term.textContent = labelText;
    const value = document.createElement('dd');
    value.dataset.accountField = key;
    value.textContent = '—';
    detailsList.append(term, value);
    return value;
  };

  const detailFields = {
    name: createDetail('Name', 'name'),
    username: createDetail('Username', 'username'),
    hometown: createDetail('Home town', 'hometown'),
    roles: createDetail('Roles', 'roles'),
    email: createDetail('Email', 'email'),
    phone: createDetail('Phone', 'phone'),
    lastLogin: createDetail('Last active', 'lastLogin'),
  };

  const actions = document.createElement('div');
  actions.className = 'topbar__account-actions';

  const signInLink = document.createElement('a');
  signInLink.href = '/registration.html#login';
  signInLink.className = 'topbar__account-link';
  signInLink.textContent = 'Sign in';

  const registerLink = document.createElement('a');
  registerLink.href = '/registration.html';
  registerLink.className = 'topbar__account-link';
  registerLink.textContent = 'Create account';

  const manageLink = document.createElement('a');
  manageLink.href = '/registration.html';
  manageLink.className = 'topbar__account-link';
  manageLink.textContent = 'Manage account';
  manageLink.hidden = true;

  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'topbar__account-signout';
  signOutButton.textContent = 'Sign out';
  signOutButton.hidden = true;

  actions.append(signInLink, registerLink, manageLink, signOutButton);

  menu.append(summary, detailsList, actions);
  container.append(toggle, menu);
  topbar.appendChild(container);

  accountDropdownState = {
    container,
    toggle,
    menu,
    label,
    summary,
    detailsList,
    detailFields,
    signInLink,
    registerLink,
    manageLink,
    signOutButton,
    isOpen: false,
  };

  attachLogoutHandler(signOutButton, { onComplete: () => closeAccountMenu() });

  toggle.addEventListener('click', () => {
    const willOpen = !accountDropdownState.isOpen;
    setAccountMenuOpen(accountDropdownState, willOpen);
    if (willOpen) {
      const focusTarget = getAuthSession() && getAuthSession().user
        ? accountDropdownState.manageLink
        : accountDropdownState.signInLink;
      const fallback = focusTarget || accountDropdownState.toggle;
      if (fallback && typeof fallback.focus === 'function') {
        requestAnimationFrame(() => fallback.focus({ preventScroll: true }));
      }
    }
  });

  document.addEventListener('click', event => {
    if (!accountDropdownState || !accountDropdownState.isOpen) return;
    if (accountDropdownState.container && accountDropdownState.container.contains(event.target)) {
      return;
    }
    setAccountMenuOpen(accountDropdownState, false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && accountDropdownState && accountDropdownState.isOpen) {
      setAccountMenuOpen(accountDropdownState, false);
      if (accountDropdownState.toggle && typeof accountDropdownState.toggle.focus === 'function') {
        accountDropdownState.toggle.focus({ preventScroll: true });
      }
    }
  });

  document.addEventListener('authchange', event => {
    const session = event && event.detail ? event.detail.session : null;
    updateAccountDropdown(session);
  });

  updateAccountDropdown(getAuthSession());

  return accountDropdownState;
}

function getOverlayLabel(overlay) {
  if (!overlay) return 'panel';

  const explicitLabel = overlay.getAttribute('data-overlay-label');
  if (explicitLabel) return explicitLabel.trim();

  const ariaLabel = overlay.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledby = overlay.getAttribute('aria-labelledby');
  if (labelledby) {
    const ids = labelledby.split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element && element.textContent) {
        const text = element.textContent.trim();
        if (text) return text;
      }
    }
  }

  const heading = overlay.querySelector('h1, h2, h3, legend, [role="heading"]');
  if (heading && heading.textContent) {
    return heading.textContent.trim();
  }

  if (overlay.id) {
    return overlay.id.replace(/[-_]+/g, ' ').trim();
  }

  return 'panel';
}

function setOverlayMinimizedState({ overlay, toggle, srText, icon, label }, minimized) {
  overlay.classList.toggle('is-minimized', minimized);
  overlay.dataset.overlayMinimized = minimized ? 'true' : 'false';
  toggle.setAttribute('aria-expanded', minimized ? 'false' : 'true');
  srText.textContent = minimized ? `Restore ${label}` : `Minimise ${label}`;
  toggle.setAttribute('aria-label', minimized ? `Restore ${label}` : `Minimise ${label}`);
  icon.textContent = minimized ? '+' : '–';

  const summary = overlay.querySelector('[data-overlay-summary]');
  if (summary) {
    summary.setAttribute('aria-hidden', minimized ? 'false' : 'true');
  }

  const mapElement = document.getElementById('map');
  if (mapElement) {
    repositionMapControls(mapElement);
  }
}

function resetOverlayPosition(overlay) {
  if (!overlay) return;
  overlay.style.left = '';
  overlay.style.top = '';
  overlay.style.right = '';
  overlay.style.bottom = '';
  overlay.style.transform = '';
  overlay.style.position = '';
  overlay.style.zIndex = '';
  if (overlay.dataset) {
    delete overlay.dataset.dragConverted;
  }
}

function enhanceOverlayChrome(overlay) {
  if (!overlay || overlay.dataset.overlayChromeBound === 'true') return;

  if (overlay.dataset.overlayPositionInitialised !== 'true') {
    resetOverlayPosition(overlay);
    overlay.dataset.overlayPositionInitialised = 'true';
  }

  let handle = overlay.querySelector('[data-drag-handle]');
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'overlay-drag-handle overlay-drag-handle--floating';
    handle.setAttribute('data-drag-handle', '');
    handle.setAttribute('aria-hidden', 'true');
    overlay.insertBefore(handle, overlay.firstChild);
  } else {
    handle.classList.add('overlay-drag-handle', 'overlay-drag-handle--floating');
    if (!handle.hasAttribute('aria-hidden')) {
      handle.setAttribute('aria-hidden', 'true');
    }
    if (handle.parentElement === overlay && overlay.firstChild !== handle) {
      overlay.insertBefore(handle, overlay.firstChild);
    }
  }
  const label = getOverlayLabel(overlay);

  let toggle = overlay.querySelector('[data-overlay-toggle]');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'overlay-toggle';
    toggle.setAttribute('data-overlay-toggle', '');
    overlay.insertBefore(toggle, overlay.firstChild);
  } else {
    toggle.classList.add('overlay-toggle');
  }

  let srText = toggle.querySelector('.visually-hidden');
  if (!srText) {
    srText = document.createElement('span');
    srText.className = 'visually-hidden';
    toggle.appendChild(srText);
  }

  let icon = toggle.querySelector('.overlay-toggle__icon');
  if (!icon) {
    icon = document.createElement('span');
    icon.className = 'overlay-toggle__icon';
    icon.setAttribute('aria-hidden', 'true');
    toggle.appendChild(icon);
  }

  srText.textContent = `Minimise ${label}`;
  icon.textContent = '–';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', `Minimise ${label}`);

  let summary = overlay.querySelector('[data-overlay-summary]');
  if (!summary) {
    summary = document.createElement('span');
    summary.className = 'overlay-panel__summary';
    summary.setAttribute('data-overlay-summary', '');
  }
  summary.textContent = label;
  summary.title = label;
  summary.setAttribute('aria-hidden', 'true');

  if (!summary.parentElement) {
    if (handle && handle.parentElement === overlay && handle.nextSibling) {
      overlay.insertBefore(summary, handle.nextSibling);
    } else if (handle && handle.parentElement === overlay) {
      overlay.appendChild(summary);
    } else if (toggle && toggle.nextSibling) {
      overlay.insertBefore(summary, toggle.nextSibling);
    } else {
      overlay.appendChild(summary);
    }
  }

  let body = overlay.querySelector('[data-overlay-body]');
  if (!body) {
    body = document.createElement('div');
    body.className = 'overlay-body';
    body.setAttribute('data-overlay-body', '');
  }

  const childrenToWrap = Array.from(overlay.children).filter(child => {
    if (child === toggle) return false;
    if (child === body) return false;
    if (handle && child === handle) return false;
    if (summary && child === summary) return false;
    return true;
  });

  if (childrenToWrap.length) {
    childrenToWrap.forEach(child => body.appendChild(child));
  }

  if (!body.id) {
    const baseId = overlay.id ? overlay.id.replace(/[^a-zA-Z0-9_-]/g, '-') : 'overlay';
    overlayBodyIdCounter += 1;
    body.id = `${baseId || 'overlay'}-body-${overlayBodyIdCounter}`;
  }
  toggle.setAttribute('aria-controls', body.id);

  if (!body.parentElement) {
    if (handle && handle.parentElement === overlay && handle.nextSibling) {
      overlay.insertBefore(body, handle.nextSibling);
    } else if (handle && handle.parentElement === overlay) {
      overlay.appendChild(body);
    } else {
      overlay.appendChild(body);
    }
  }

  const bindings = { overlay, toggle, srText, icon, label };
  toggle.addEventListener('click', event => {
    event.stopPropagation();
    const minimized = overlay.dataset.overlayMinimized === 'true';
    setOverlayMinimizedState(bindings, !minimized);
  });

  toggle.addEventListener('pointerdown', event => {
    event.stopPropagation();
  });

  overlay.dataset.overlayChromeBound = 'true';
  overlay.dataset.overlayMinimized = 'false';
}

function bindOverlayDragging(overlay) {
  if (!overlay || overlay.dataset.draggableBound === 'true') return;

  const visualHandle = overlay.querySelector('[data-drag-handle]');
  const computeHorizontalPeek = size => {
    if (!Number.isFinite(size) || size <= 0) return 0;
    const preferred = Math.round(size * 0.32);
    const base = Math.max(108, Math.min(preferred, 184));
    const maxVisible = Math.max(size - 24, Math.round(size * 0.75));
    return Math.min(Math.max(base, 96), maxVisible);
  };
  const computeVerticalPeek = size => {
    if (!Number.isFinite(size) || size <= 0) return 0;
    const preferred = Math.round(size * 0.38);
    const base = Math.max(88, Math.min(preferred, 152));
    const maxVisible = Math.max(size - 28, Math.round(size * 0.78));
    return Math.min(Math.max(base, 72), maxVisible);
  };

  try {
    const computedStyle = window.getComputedStyle(overlay);
    if (computedStyle) {
      if (computedStyle.position === 'static') {
        const rect = overlay.getBoundingClientRect();
        overlay.style.position = 'fixed';
        overlay.style.left = `${Math.round(rect.left)}px`;
        overlay.style.top = `${Math.round(rect.top)}px`;
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.transform = 'none';
      }

      const zIndex = Number.parseInt(computedStyle.zIndex, 10);
      if (!Number.isFinite(zIndex) || zIndex < 1) {
        overlay.style.zIndex = '960';
      }
    }
  } catch (error) {
    // non-blocking: styling hints best-effort only
  }

  const handlePointerDown = event => {
    const pointerType = event.pointerType || 'mouse';
    if (pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    if (event.target && event.target.closest('[data-overlay-toggle]')) {
      return;
    }

    if (isMobileViewport() && !pageAllowsMobileBodyDrag()) {
      const handleTarget =
        event.target && typeof event.target.closest === 'function'
          ? event.target.closest('[data-drag-handle]')
          : null;
      if (!handleTarget || !overlay.contains(handleTarget)) {
        return;
      }
    }

    const scrollableAncestor =
      event.target && event.target.closest && event.target.closest('[data-overlay-body]');
    const scrollElement =
      scrollableAncestor instanceof HTMLElement ? scrollableAncestor : null;
    const canScroll = Boolean(
      scrollElement && scrollElement.scrollHeight - scrollElement.clientHeight > 2
    );

    const pointerId = event.pointerId;
    const rect = overlay.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let startLeft = parseFloat(overlay.style.left) || rect.left;
    let startTop = parseFloat(overlay.style.top) || rect.top;
    let width = rect.width;
    let height = rect.height;
    let dragging = false;

    const startDrag = initialEvent => {
      if (dragging) return;
      dragging = true;

      if (!overlay.dataset.dragConverted) {
        overlay.dataset.dragConverted = 'true';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.transform = 'none';
      }

      const liveRect = overlay.getBoundingClientRect();
      startLeft = parseFloat(overlay.style.left) || liveRect.left;
      startTop = parseFloat(overlay.style.top) || liveRect.top;
      width = liveRect.width;
      height = liveRect.height;

      if (initialEvent && typeof initialEvent.preventDefault === 'function') {
        initialEvent.preventDefault();
      }

      try {
        overlay.setPointerCapture(pointerId);
      } catch (captureError) {
        // Pointer capture may fail on unsupported browsers; ignore.
      }
    };

    const cleanup = shouldReposition => {
      window.removeEventListener('pointermove', updatePosition);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);

      try {
        if (
          typeof overlay.hasPointerCapture === 'function' &&
          overlay.hasPointerCapture(pointerId)
        ) {
          overlay.releasePointerCapture(pointerId);
        }
      } catch (releaseError) {
        // Non-blocking.
      }

      const snapToEdges = () => {
        const liveRect = overlay.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || liveRect.right;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || liveRect.bottom;
        const margin = 20;
        const horizontalPeek = computeHorizontalPeek(liveRect.width);
        const verticalPeek = computeVerticalPeek(liveRect.height);

        let nextLeft = parseFloat(overlay.style.left) || liveRect.left;
        let nextTop = parseFloat(overlay.style.top) || liveRect.top;

        if (nextLeft <= margin) {
          nextLeft = Math.min(margin, horizontalPeek - liveRect.width);
        } else if (nextLeft + liveRect.width >= viewportWidth - margin) {
          nextLeft = Math.max(viewportWidth - horizontalPeek, viewportWidth - liveRect.width - margin);
        }

        if (nextTop <= margin) {
          nextTop = Math.min(margin, verticalPeek - liveRect.height);
        } else if (nextTop + liveRect.height >= viewportHeight - margin) {
          nextTop = Math.max(viewportHeight - verticalPeek, viewportHeight - liveRect.height - margin);
        }

        overlay.style.left = `${Math.round(nextLeft)}px`;
        overlay.style.top = `${Math.round(nextTop)}px`;
      };

      if (shouldReposition) {
        snapToEdges();
        const mapElement = document.getElementById('map');
        if (mapElement) {
          repositionMapControls(mapElement);
        }
      }
    };

    const updatePosition = moveEvent => {
      if (moveEvent.pointerId !== pointerId) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));

      if (!dragging) {
        if (distance < 4) {
          return;
        }

        if (canScroll && scrollElement && Math.abs(deltaY) >= Math.abs(deltaX)) {
          const scrollTop = scrollElement.scrollTop;
          const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
          const movingDown = deltaY > 0;
          const movingUp = deltaY < 0;
          const canScrollDown = maxScroll - scrollTop > 1;
          const canScrollUp = scrollTop > 1;

          if ((movingDown && canScrollDown) || (movingUp && canScrollUp)) {
            cleanup(false);
            return;
          }
        }

        startDrag(moveEvent);
      }

      moveEvent.preventDefault();

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
      const margin = 20;
      const horizontalPeek = computeHorizontalPeek(width);
      const verticalPeek = computeVerticalPeek(height);

      let nextLeft = startLeft + deltaX;
      let nextTop = startTop + deltaY;

      const minLeft = Math.min(margin, horizontalPeek - width);
      const minTop = Math.min(margin, verticalPeek - height);
      const maxLeft = Math.max(viewportWidth - width - margin, viewportWidth - horizontalPeek);
      const maxTop = Math.max(viewportHeight - height - margin, viewportHeight - verticalPeek);

      nextLeft = Math.min(Math.max(nextLeft, minLeft), maxLeft);
      nextTop = Math.min(Math.max(nextTop, minTop), maxTop);

      overlay.style.left = `${Math.round(nextLeft)}px`;
      overlay.style.top = `${Math.round(nextTop)}px`;
    };

    const endDrag = endEvent => {
      if (endEvent.pointerId !== pointerId) return;
      cleanup(dragging);
    };

    window.addEventListener('pointermove', updatePosition);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  };

  if (visualHandle) {
    visualHandle.style.cursor = 'grab';
  }

  overlay.addEventListener('pointerdown', handlePointerDown);
  overlay.dataset.draggableBound = 'true';
}

function setupDraggableOverlays() {
  const overlays = document.querySelectorAll('[data-draggable-overlay]');
  overlays.forEach(overlay => {
    enhanceOverlayChrome(overlay);
    bindOverlayDragging(overlay);
  });
}

function setupSavedRoutesManager() {
  const panel = document.getElementById('saved-routes-panel');
  if (!panel) return null;

  if (panel.dataset.savedRoutesBound === 'true') {
    return routeEditorState ? routeEditorState.savedRoutes || null : null;
  }

  const deleteSelect = document.querySelector('[data-route-delete-select]');

  const state = {
    panel,
    list: panel.querySelector('[data-saved-routes-list]'),
    refreshButton: panel.querySelector('[data-saved-routes-refresh]'),
    feedback: document.getElementById('saved-routes-feedback'),
    deleteSelect,
    routes: [],
    isLoading: false,
    collator: new Intl.Collator('en', { sensitivity: 'base' }),
  };

  if (state.refreshButton) {
    state.refreshButton.addEventListener('click', () => {
      loadSavedRoutesForEditor(state, { message: 'Saved routes refreshed.' });
    });
  }

  if (state.list) {
    state.list.addEventListener('click', handleSavedRoutesListClick);
  }

  if (!panel.dataset.authListenerBound) {
    document.addEventListener('authchange', () => {
      renderSavedRoutesList(state);
    });
    panel.dataset.authListenerBound = 'true';
  }

  if (state.deleteSelect && state.deleteSelect.dataset.deleteSelectBound !== 'true') {
    state.deleteSelect.addEventListener('change', handleDeleteSelectChange);
    state.deleteSelect.dataset.deleteSelectBound = 'true';
  }

  panel.dataset.savedRoutesBound = 'true';
  loadSavedRoutesForEditor(state, { initial: true });
  return state;
}

function setupRouteSaveDialog() {
  if (routeSaveDialogState && routeSaveDialogState.dialog && routeSaveDialogState.dialog.isConnected) {
    return routeSaveDialogState;
  }

  const dialog = document.getElementById('route-save-dialog');
  if (!dialog) {
    routeSaveDialogState = null;
    return null;
  }

  const form = dialog.querySelector('[data-route-save-form]');
  const cancelButton = dialog.querySelector('[data-route-save-cancel]');
  const feedback = dialog.querySelector('[data-route-save-feedback]');

  routeSaveDialogState = {
    dialog,
    form,
    cancelButton,
    feedback,
    inputs: {
      pointA: dialog.querySelector('[data-route-save-point-a]'),
      pointB: dialog.querySelector('[data-route-save-point-b]'),
      notes: dialog.querySelector('[data-route-save-notes]'),
      fareMin: dialog.querySelector('[data-route-save-fare-min]'),
      fareMax: dialog.querySelector('[data-route-save-fare-max]'),
    },
    displays: {
      username: dialog.querySelector('[data-route-save-username-display]'),
      homeTown: dialog.querySelector('[data-route-save-hometown-display]'),
    },
    contributor: { username: '', homeTown: '' },
    resolver: null,
  };

  const hideDialog = () => {
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
    dialog.dataset.active = 'false';
    if (routeSaveDialogState) {
      routeSaveDialogState.contributor = { username: '', homeTown: '' };
    }
  };

  const resetFeedback = () => {
    if (!routeSaveDialogState || !routeSaveDialogState.feedback) return;
    routeSaveDialogState.feedback.textContent = '';
    routeSaveDialogState.feedback.classList.remove('error');
  };

  const showFeedback = (message, isError = false) => {
    if (!routeSaveDialogState || !routeSaveDialogState.feedback) return;
    routeSaveDialogState.feedback.textContent = message;
    routeSaveDialogState.feedback.classList.toggle('error', Boolean(isError));
  };

  routeSaveDialogState.resetFeedback = resetFeedback;
  routeSaveDialogState.showFeedback = showFeedback;

  const resolveDialog = result => {
    hideDialog();
    resetFeedback();
    const resolver = routeSaveDialogState ? routeSaveDialogState.resolver : null;
    routeSaveDialogState.resolver = null;
    if (typeof resolver === 'function') {
      resolver(result);
    }
  };

  if (form && !form.dataset.routeSaveBound) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!routeSaveDialogState) return;
      const { inputs } = routeSaveDialogState;
      const pointA = inputs.pointA ? inputs.pointA.value.trim() : '';
      const pointB = inputs.pointB ? inputs.pointB.value.trim() : '';
      const notes = inputs.notes ? inputs.notes.value.trim() : '';
      const contributor = routeSaveDialogState.contributor || { username: '', homeTown: '' };
      const username = typeof contributor.username === 'string' ? contributor.username.trim() : '';
      const homeTown = typeof contributor.homeTown === 'string' ? contributor.homeTown.trim() : '';
      const fareMinValueRaw = inputs.fareMin ? inputs.fareMin.value.trim() : '';
      const fareMaxValueRaw = inputs.fareMax ? inputs.fareMax.value.trim() : '';

      if (!pointA) {
        showFeedback('Provide a name for route point A before saving.', true);
        if (inputs.pointA) inputs.pointA.focus();
        return;
      }

      if (!pointB) {
        showFeedback('Provide a name for route point B before saving.', true);
        if (inputs.pointB) inputs.pointB.focus();
        return;
      }

      if (!username) {
        showFeedback('Your registration profile is missing a username. Update it before saving routes.', true);
        return;
      }

      if (!homeTown) {
        showFeedback('Your registration profile is missing a home town. Update it before saving routes.', true);
        return;
      }

      const fareMinValue = Number.parseFloat(fareMinValueRaw);
      if (!Number.isFinite(fareMinValue) || fareMinValue < 0) {
        showFeedback('Enter a valid minimum fare price.', true);
        if (inputs.fareMin) inputs.fareMin.focus();
        return;
      }

      const fareMaxValue = Number.parseFloat(fareMaxValueRaw);
      if (!Number.isFinite(fareMaxValue) || fareMaxValue < fareMinValue) {
        showFeedback('Maximum fare must be equal to or higher than the minimum.', true);
        if (inputs.fareMax) inputs.fareMax.focus();
        return;
      }

      resolveDialog({
        pointAName: pointA,
        pointBName: pointB,
        username,
        homeTown,
        notes,
        fareMin: fareMinValue,
        fareMax: fareMaxValue,
      });
    });
    form.dataset.routeSaveBound = 'true';
  }

  if (cancelButton && !cancelButton.dataset.routeSaveBound) {
    cancelButton.addEventListener('click', () => {
      resolveDialog(null);
    });
    cancelButton.dataset.routeSaveBound = 'true';
  }

  hideDialog();
  return routeSaveDialogState;
}

function openRouteSaveDialog(defaults = {}) {
  const state = setupRouteSaveDialog();
  if (!state) return Promise.resolve(null);

  const normalized = {
    pointAName: typeof defaults.pointAName === 'string' ? defaults.pointAName.trim() : '',
    pointBName: typeof defaults.pointBName === 'string' ? defaults.pointBName.trim() : '',
    notes: typeof defaults.notes === 'string' ? defaults.notes.trim() : '',
    fareMin: Number.isFinite(Number(defaults.fareMin)) ? Number(defaults.fareMin) : '',
    fareMax: Number.isFinite(Number(defaults.fareMax)) ? Number(defaults.fareMax) : '',
  };

  const contributor = normalizeContributor(defaults.contributor || {});
  state.contributor = contributor;

  if (state.displays && state.displays.username) {
    state.displays.username.textContent = contributor.username || '—';
  }
  if (state.displays && state.displays.homeTown) {
    state.displays.homeTown.textContent = contributor.homeTown || '—';
  }

  if (state.inputs.pointA) state.inputs.pointA.value = normalized.pointAName;
  if (state.inputs.pointB) state.inputs.pointB.value = normalized.pointBName;
  if (state.inputs.notes) state.inputs.notes.value = normalized.notes;
  if (state.inputs.fareMin) state.inputs.fareMin.value = normalized.fareMin === '' ? '' : normalized.fareMin;
  if (state.inputs.fareMax) state.inputs.fareMax.value = normalized.fareMax === '' ? '' : normalized.fareMax;

  if (typeof state.resetFeedback === 'function') {
    state.resetFeedback();
  } else if (state.feedback) {
    state.feedback.textContent = '';
    state.feedback.classList.remove('error');
  }

  if (!contributor.username || !contributor.homeTown) {
    if (typeof state.showFeedback === 'function') {
      state.showFeedback(
        'Account details incomplete. Update your username and home town before saving routes.',
        true,
      );
    }
  }

  if (state.resolver) {
    const previousResolver = state.resolver;
    state.resolver = null;
    previousResolver(null);
  }

  state.dialog.hidden = false;
  state.dialog.removeAttribute('aria-hidden');
  state.dialog.dataset.active = 'true';

  const focusTarget = state.inputs.pointA;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    window.requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
    });
  }

  return new Promise(resolve => {
    state.resolver = result => {
      resolve(result);
    };
  });
}

function setSavedRoutesLoading(state, isLoading) {
  if (!state) return;
  state.isLoading = Boolean(isLoading);
  if (state.list) {
    state.list.setAttribute('aria-busy', state.isLoading ? 'true' : 'false');
  }
  if (state.refreshButton) {
    state.refreshButton.disabled = state.isLoading;
  }
  if (state.deleteSelect) {
    const hasRoutes = state.deleteSelect.dataset.hasRoutes === 'true';
    state.deleteSelect.disabled = state.isLoading || !hasRoutes;
  }
  if (state.panel) {
    if (state.isLoading) {
      state.panel.classList.add('is-loading');
    } else {
      state.panel.classList.remove('is-loading');
    }
  }
}

async function loadSavedRoutesForEditor(state, options = {}) {
  if (!state) return;
  const { silent = false, initial = false, force = false, message = '' } = options;
  if (state.isLoading && !force) return;

  setSavedRoutesLoading(state, true);

  try {
    const response = await fetch('/api/routes');
    if (!response.ok) {
      throw new Error(`Routes request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const routes = Array.isArray(payload) ? payload.map(normalizeRouteRecord).filter(Boolean) : [];
    state.routes = routes;
    renderSavedRoutesList(state);

    if (initial) {
      if (!silent) {
        if (routes.length === 0) {
          showSavedRoutesFeedback(
            state,
            'No routes saved yet. Draw a corridor and choose Save to add it to the list.',
          );
        } else {
          showSavedRoutesFeedback(state, 'Use the tools panel dropdown to remove a saved route.');
        }
      }
    } else if (!silent) {
      const feedbackMessage = message || 'Saved routes refreshed.';
      showSavedRoutesFeedback(state, feedbackMessage);
    } else {
      showSavedRoutesFeedback(state, '');
    }
  } catch (error) {
    console.error('Failed to load saved routes for editor', error);
    state.routes = [];
    renderSavedRoutesList(state);
    showSavedRoutesFeedback(state, 'Unable to load saved routes right now. Try refreshing in a moment.', true);
  } finally {
    setSavedRoutesLoading(state, false);
  }
}

function renderSavedRoutesList(state) {
  if (!state || !state.list) return;
  const list = state.list;
  list.innerHTML = '';

  if (!Array.isArray(state.routes) || state.routes.length === 0) {
    populateRouteDeleteSelect(state, []);
    const empty = document.createElement('li');
    empty.className = 'route-adder-saved__empty';
    empty.textContent = 'No routes saved yet. Use the Route Adder to capture your first corridor.';
    list.appendChild(empty);
    return;
  }

  const sortedRoutes = sortRoutesForManager(state.routes, state.collator);
  populateRouteDeleteSelect(state, sortedRoutes);
  const isLoggedIn = Boolean(getLoggedInUser());

  sortedRoutes.forEach(route => {
    const item = document.createElement('li');
    item.className = 'route-adder-saved__item';

    const text = document.createElement('div');
    text.className = 'route-adder-saved__item-text';

    const name = document.createElement('span');
    name.className = 'route-adder-saved__item-name';
    name.textContent = route.name || 'Saved route';
    text.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'route-adder-saved__item-meta';
    const city = route.city || 'Unspecified city';
    const province = route.province || 'Unspecified province';
    meta.textContent = `${city}, ${province}`;
    text.appendChild(meta);

    const contributorUsername = route.addedBy && typeof route.addedBy.username === 'string'
      ? route.addedBy.username
      : '';
    const contributorHomeTown = route.addedBy && typeof route.addedBy.homeTown === 'string'
      ? route.addedBy.homeTown
      : '';
    if (contributorUsername || contributorHomeTown) {
      const contributor = document.createElement('span');
      contributor.className = 'route-adder-saved__item-contributor';
      if (contributorHomeTown) {
        const usernameText = contributorUsername || 'Registered contributor';
        contributor.textContent = `By ${usernameText} · ${contributorHomeTown}`;
      } else {
        contributor.textContent = `By ${contributorUsername}`;
      }
      text.appendChild(contributor);
    }

    item.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'route-adder-saved__actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'route-adder-saved__action';

    if (isLoggedIn) {
      editButton.textContent = 'Edit route';
      editButton.dataset.routeAction = 'edit';
      editButton.dataset.routeId = String(route.routeId);
      editButton.setAttribute('aria-label', `Edit ${route.name || 'saved route'}`);
    } else {
      editButton.textContent = 'Sign in to edit';
      editButton.dataset.routeAction = 'signin';
    }

    actions.appendChild(editButton);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function showSavedRoutesFeedback(state, message, isError = false) {
  if (!state || !state.feedback) return;
  state.feedback.textContent = message || '';
  state.feedback.hidden = !message;
  state.feedback.classList.toggle('error', Boolean(isError));
}

function populateRouteDeleteSelect(state, routes) {
  if (!state || !state.deleteSelect) return;

  const select = state.deleteSelect;
  const hasRoutes = Array.isArray(routes) && routes.length > 0;
  const previousValue = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = hasRoutes
    ? 'Select a saved route to delete…'
    : 'No saved routes available';
  select.appendChild(placeholder);

  if (hasRoutes) {
    routes.forEach(route => {
      const option = document.createElement('option');
      option.value = route.routeId;
      const city = route.city || 'Unspecified city';
      const province = route.province || 'Unspecified province';
      option.textContent = `${route.name || 'Saved route'} — ${city}, ${province}`;
      select.appendChild(option);
    });
  }

  select.dataset.hasRoutes = hasRoutes ? 'true' : 'false';
  if (hasRoutes && routes.some(route => route.routeId === previousValue)) {
    select.value = previousValue;
  } else {
    select.value = '';
  }

  select.disabled = state.isLoading || !hasRoutes;
}

function handleSavedRoutesListClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('[data-route-action]') : null;
  if (!target) return;

  const action = target.dataset.routeAction;
  const routeId = target.dataset.routeId;
  const savedState = routeEditorState ? routeEditorState.savedRoutes : null;

  if (action === 'signin') {
    if (!openAccountMenu({ focus: 'signin', redirect: false })) {
      window.location.href = '/registration.html#login';
    }
    return;
  }

  if (!savedState) {
    return;
  }

  if (!routeId) {
    if (action === 'edit') {
      setEditorStatus(routeEditorState, 'Select a specific route to edit.');
    }
    return;
  }

  const route = savedState.routes.find(entry => String(entry.routeId) === String(routeId));
  if (!route) return;

  if (action === 'edit') {
    loadRouteForEditing(route);
    return;
  }

  if (action === 'delete') {
    deleteSavedRouteRecord(route, target, savedState);
  }
}

function handleDeleteSelectChange(event) {
  const select = event.target instanceof HTMLSelectElement ? event.target : null;
  if (!select) return;
  const routeId = select.value;
  if (!routeId) return;

  const state = routeEditorState ? routeEditorState.savedRoutes : null;
  if (!state) {
    select.value = '';
    return;
  }

  const route = state.routes.find(entry => entry.routeId === routeId);
  if (!route) {
    select.value = '';
    return;
  }

  const confirmDelete = window.confirm(`Delete "${route.name || 'this route'}" from saved routes? This cannot be undone.`);
  if (!confirmDelete) {
    select.value = '';
    return;
  }

  deleteSavedRouteRecord(route, null, state, { skipPrompt: true }).finally(() => {
    select.value = '';
  });
}

async function deleteSavedRouteRecord(route, triggerButton, state, options = {}) {
  if (!route || !state) return;
  const skipPrompt = Boolean(options.skipPrompt);
  if (!skipPrompt) {
    const confirmDelete = window.confirm(`Delete "${route.name || 'this route'}" from saved routes? This cannot be undone.`);
    if (!confirmDelete) return;
  }

  const button = triggerButton instanceof HTMLButtonElement ? triggerButton : null;
  const originalLabel = button ? button.textContent : '';

  try {
    if (button) button.disabled = true;
    if (button) button.textContent = 'Deleting…';
    setSavedRoutesLoading(state, true);

    const response = await fetch(`/api/routes/${encodeURIComponent(route.routeId)}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Delete failed with status ${response.status}`);
    }

    await loadSavedRoutesForEditor(state, { silent: true, force: true });
    showSavedRoutesFeedback(state, `Route "${route.name}" deleted.`);
    if (routeEditorState) {
      setEditorStatus(routeEditorState, `Removed "${route.name}" from saved routes.`);
    }
    if (routeFinderState && typeof loadRoutesForFinder === 'function') {
      loadRoutesForFinder();
    }
  } catch (error) {
    console.error('Failed to delete saved route', error);
    showSavedRoutesFeedback(state, 'Unable to delete this route right now. Please try again.', true);
  } finally {
    setSavedRoutesLoading(state, false);
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || 'Delete';
    }
  }
}

function sortRoutesForManager(routes, collator) {
  const comparer = collator || new Intl.Collator('en', { sensitivity: 'base' });
  return routes
    .slice()
    .sort((a, b) => {
      const provinceCompare = comparer.compare(a.province || '', b.province || '');
      if (provinceCompare !== 0) return provinceCompare;
      const cityCompare = comparer.compare(a.city || '', b.city || '');
      if (cityCompare !== 0) return cityCompare;
      return comparer.compare(a.name || '', b.name || '');
    });
}

function setupRouteAdder(map) {
  if (routeEditorState) return;

  const tools = document.getElementById('editor-tools');
  if (!tools) return;

  if (map && typeof map.setOptions === 'function') {
    map.setOptions({
      gestureHandling: 'greedy',
      scrollwheel: true,
    });
  }

  const statusElement = document.getElementById('editor-status');
  const actions = {
    draw: tools.querySelector('[data-editor-action="draw"]'),
    snap: tools.querySelector('[data-editor-action="snap"]'),
    edit: tools.querySelector('[data-editor-action="edit"]'),
    undo: tools.querySelector('[data-editor-action="undo"]'),
    redo: tools.querySelector('[data-editor-action="redo"]'),
    save: tools.querySelector('[data-editor-action="save"]'),
    exit: tools.querySelector('[data-editor-action="exit"]'),
  };

  const storedContributor = getRouteContributor();
  const activeUser = getLoggedInUser();
  const sessionContributor = activeUser
    ? normalizeContributor({ username: activeUser.username, homeTown: activeUser.homeTown })
    : null;
  const initialContributor = contributorHasDetails(storedContributor)
    ? normalizeContributor(storedContributor)
    : sessionContributor && contributorHasDetails(sessionContributor)
      ? sessionContributor
      : normalizeContributor();

  routeEditorState = {
    map,
    tools,
    statusElement,
    actions,
    mode: 'idle',
    isBusy: false,
    path: [],
    snappedPath: [],
    history: [],
    redoStack: [],
    pathListeners: [],
    savedRoutes: null,
    contributor: initialContributor,
    lastSaveDetails: null,
    editingRouteId: null,
    editingRouteName: '',
    polyline: new google.maps.Polyline({
      map,
      strokeColor: '#2563eb',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      clickable: true,
      visible: false,
      zIndex: 900,
    }),
    snappedPolyline: new google.maps.Polyline({
      map,
      strokeColor: '#16a34a',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      visible: false,
      zIndex: 905,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 4,
          },
          offset: '0',
          repeat: '24px',
        },
      ],
    }),
    mapClickListener: null,
  };

  if (contributorHasDetails(initialContributor)) {
    setRouteContributor(initialContributor);
  }

  const savedRoutesState = setupSavedRoutesManager();
  if (savedRoutesState) {
    routeEditorState.savedRoutes = savedRoutesState;
  }

  setupRouteSaveDialog();

  routeEditorState.mapClickListener = map.addListener('click', event => {
    if (!routeEditorState || routeEditorState.mode !== 'draw') return;
    addPointToDraftRoute(routeEditorState, event.latLng);
  });

  Object.entries(actions).forEach(([action, button]) => {
    if (!button) return;
    button.addEventListener('click', () => handleRouteEditorAction(action));
  });

  if (!tools.dataset.authListenerBound) {
    document.addEventListener('authchange', event => {
      const session = event && event.detail ? event.detail.session : null;
      const user = session && session.user ? session.user : null;
      if (user) {
        setRouteContributor({
          username: typeof user.username === 'string' ? user.username : '',
          homeTown: typeof user.homeTown === 'string' ? user.homeTown : '',
        });
      } else {
        setRouteContributor(null);
      }
    });
    tools.dataset.authListenerBound = 'true';
  }

  initialiseRouteHistory(routeEditorState);
  updateEditorControls(routeEditorState);
  repositionMapControls(map.getDiv());
}

function handleRouteEditorAction(action) {
  if (!routeEditorState) return;
  const handlers = {
    draw: startDrawingRoute,
    snap: snapRouteToRoad,
    edit: enableRouteEditing,
    undo: undoRouteStep,
    redo: redoRouteStep,
    save: saveCurrentRoute,
    exit: exitRouteEditing,
  };

  const handler = handlers[action];
  if (typeof handler === 'function') {
    if (action === 'draw') {
      const session = getAuthSession();
      if (!session || !session.user) {
        setEditorStatus(routeEditorState, 'Sign in to draw and save taxi routes. Use the account menu above to log in.');
        updateEditorControls(routeEditorState);
        if (!openAccountMenu({ focus: 'signin', redirect: false })) {
          window.location.href = '/registration.html#login';
        }
        return;
      }
    }
    handler(routeEditorState);
  }
}

function initialiseRouteHistory(state) {
  state.history = [
    [],
  ];
  state.redoStack = [];
}

function addPointToDraftRoute(state, latLng) {
  const point = { lat: latLng.lat(), lng: latLng.lng() };
  state.path.push(point);
  state.snappedPath = [];
  commitRouteHistory(state);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, `Plotted ${state.path.length} point${state.path.length === 1 ? '' : 's'}. Continue clicking or choose Snap to Road when ready.`);
  updateEditorControls(state);
}

function startDrawingRoute(state) {
  state.mode = 'draw';
  state.path = [];
  state.snappedPath = [];
  state.editingRouteId = null;
  state.editingRouteName = '';
  initialiseRouteHistory(state);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Drawing mode enabled. Click along the taxi corridor to sketch your route.');
  updateEditorControls(state);
}

function enableRouteEditing(state) {
  if (state.path.length < 2) {
    setEditorStatus(state, 'Add at least two points before editing segments.');
    return;
  }
  state.mode = 'edit';
  updateDraftPolyline(state);
  attachEditableListeners(state);
  setEditorStatus(state, 'Drag the route vertices to refine alignment, then snap again to clean it up.');
  updateEditorControls(state);
}

function undoRouteStep(state) {
  if (!state.history || state.history.length <= 1) {
    setEditorStatus(state, 'Nothing to undo yet.');
    return;
  }

  const current = state.history.pop();
  if (current) state.redoStack.push(current);
  const previous = state.history[state.history.length - 1] || [];
  state.path = cloneCoordinateList(previous);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Reverted the last change.');
  updateEditorControls(state);
}

function redoRouteStep(state) {
  if (!state.redoStack || state.redoStack.length === 0) {
    setEditorStatus(state, 'Nothing to redo.');
    return;
  }

  const next = state.redoStack.pop();
  if (!next) return;
  state.path = cloneCoordinateList(next);
  commitRouteHistory(state, true);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Reapplied the previous change.');
  updateEditorControls(state);
}

function deleteCurrentRoute(state) {
  state.mode = 'idle';
  state.path = [];
  state.snappedPath = [];
  state.editingRouteId = null;
  state.editingRouteName = '';
  initialiseRouteHistory(state);
  updateDraftPolyline(state);
  updateSnappedPolyline(state);
  setEditorStatus(state, 'Cleared the editor. Choose Draw to sketch a new route.');
  updateEditorControls(state);
}

function exitRouteEditing(state) {
  deleteCurrentRoute(state);
}

function updateDraftPolyline(state) {
  detachEditableListeners(state);
  const path = state.path.map(point => ({ lat: point.lat, lng: point.lng }));
  state.polyline.setPath(path);
  state.polyline.setVisible(path.length > 0);
  state.polyline.setEditable(state.mode === 'edit');
  if (state.mode === 'edit') {
    attachEditableListeners(state);
  }
}

function updateSnappedPolyline(state) {
  const path = (state.snappedPath || []).map(point => ({ lat: point.lat, lng: point.lng }));
  state.snappedPolyline.setPath(path);
  state.snappedPolyline.setVisible(path.length > 0);
}

function attachEditableListeners(state) {
  detachEditableListeners(state);
  const path = state.polyline.getPath();
  if (!path) return;
  const update = () => {
    state.path = path.getArray().map(latLng => ({ lat: latLng.lat(), lng: latLng.lng() }));
    commitRouteHistory(state);
    updateEditorControls(state);
  };
  state.pathListeners = [
    path.addListener('insert_at', update),
    path.addListener('set_at', update),
    path.addListener('remove_at', update),
  ];
}

function detachEditableListeners(state) {
  if (!state.pathListeners) {
    state.pathListeners = [];
    return;
  }
  state.pathListeners.forEach(listener => listener.remove());
  state.pathListeners = [];
}

function commitRouteHistory(state, skipRedoReset = false) {
  if (!state.history) state.history = [];
  const snapshot = cloneCoordinateList(state.path);
  const last = state.history[state.history.length - 1];
  if (!pathsMatch(last, snapshot)) {
    state.history.push(snapshot);
    if (state.history.length > 100) state.history.shift();
    if (!skipRedoReset) {
      state.redoStack = [];
    }
  }
}

function cloneCoordinateList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(point => ({ lat: Number(point.lat), lng: Number(point.lng) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function pathsMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i].lat - b[i].lat) > 1e-9 || Math.abs(a[i].lng - b[i].lng) > 1e-9) {
      return false;
    }
  }
  return true;
}

function updateEditorControls(state) {
  const { actions } = state;
  const hasPath = state.path.length > 0;
  const hasMultiplePoints = state.path.length > 1;
  const hasHistory = state.history && state.history.length > 1;
  const hasRedo = state.redoStack && state.redoStack.length > 0;
  const hasSnapped = state.snappedPath && state.snappedPath.length > 1;

  setDisabled(actions.draw, state.isBusy);
  setDisabled(actions.snap, !hasMultiplePoints || state.isBusy);
  setDisabled(actions.edit, !hasMultiplePoints || state.isBusy);
  setDisabled(actions.undo, !hasHistory || state.isBusy);
  setDisabled(actions.redo, !hasRedo || state.isBusy);
  setDisabled(actions.save, (!hasMultiplePoints && !hasSnapped) || state.isBusy);
  setDisabled(actions.exit, state.isBusy || (!hasPath && !hasSnapped && state.mode === 'idle'));
}

function setDisabled(button, disabled) {
  if (!button) return;
  button.disabled = Boolean(disabled);
}

function setEditorStatus(state, message) {
  if (state.statusElement) {
    state.statusElement.textContent = message;
  }
}

function setEditorBusy(state, busy) {
  state.isBusy = Boolean(busy);
  updateEditorControls(state);
}

async function snapRouteToRoad(state) {
  if (state.path.length < 2) {
    setEditorStatus(state, 'Plot at least two points before snapping to roads.');
    return;
  }

  setEditorBusy(state, true);
  setEditorStatus(state, 'Snapping route to nearby roads...');

  try {
    const response = await fetch('/api/roads/snap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.path }),
    });
    if (!response.ok) throw new Error(`Snap failed with status ${response.status}`);
    const data = await response.json();
    const snappedPath = cloneCoordinateList(data.snappedPath);
    if (!snappedPath.length) {
      setEditorStatus(state, 'Snap-to-Roads returned no results. Try refining the path and retry.');
    } else {
      state.snappedPath = snappedPath;
      updateSnappedPolyline(state);
      setEditorStatus(state, 'Route snapped. Review the green overlay before saving.');
    }
  } catch (error) {
    console.error('Snap to Roads failed', error);
    setEditorStatus(state, 'Could not snap the route right now. Please try again in a moment.');
  } finally {
    setEditorBusy(state, false);
  }
}

function focusEditorMapOnPath(state, path) {
  if (!state || !state.map || !Array.isArray(path) || path.length === 0) {
    return;
  }

  try {
    const bounds = new google.maps.LatLngBounds();
    path.forEach(point => {
      if (!point) return;
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        bounds.extend({ lat, lng });
      }
    });

    if (!bounds.isEmpty()) {
      state.map.fitBounds(bounds, getRouteFitPadding());
    }
  } catch (error) {
    console.warn('Unable to focus editor map on saved route', error);
  }
}

function loadRouteForEditing(route) {
  if (!routeEditorState || !route) return;

  const session = getAuthSession();
  if (!session || !session.user) {
    setEditorStatus(
      routeEditorState,
      'Sign in to edit saved routes. Use the account menu above to log in.',
    );
    if (!openAccountMenu({ focus: 'signin', redirect: false })) {
      window.location.href = '/registration.html#login';
    }
    return;
  }

  const path = cloneCoordinateList(
    Array.isArray(route.path) && route.path.length ? route.path : route.snappedPath || [],
  );
  const snappedPath = cloneCoordinateList(
    Array.isArray(route.snappedPath) && route.snappedPath.length
      ? route.snappedPath
      : path,
  );

  if (!path.length && !snappedPath.length) {
    setEditorStatus(
      routeEditorState,
      'This saved route does not include enough map data to edit.',
    );
    return;
  }

  const workingPath = path.length ? path : snappedPath;

  routeEditorState.mode = 'edit';
  routeEditorState.editingRouteId = route.routeId;
  routeEditorState.editingRouteName = route.name || '';
  routeEditorState.path = workingPath;
  routeEditorState.snappedPath = snappedPath.length ? snappedPath : workingPath;

  initialiseRouteHistory(routeEditorState);
  routeEditorState.history = [cloneCoordinateList(routeEditorState.path)];
  routeEditorState.redoStack = [];

  const stops = Array.isArray(route.stops) ? route.stops : [];
  const firstStop = stops[0] || null;
  const lastStop = stops[stops.length - 1] || null;
  const fare = route.fare || {};

  routeEditorState.lastSaveDetails = {
    pointAName: firstStop && typeof firstStop.name === 'string' ? firstStop.name : '',
    pointBName:
      lastStop && typeof lastStop.name === 'string' ? lastStop.name : firstStop && firstStop.name ? firstStop.name : '',
    fareMin: Number.isFinite(Number(fare.min)) ? Number(fare.min) : '',
    fareMax: Number.isFinite(Number(fare.max)) ? Number(fare.max) : '',
    notes: typeof route.notes === 'string' ? route.notes : '',
  };

  const contributor = getRegisteredContributorDetails();
  if (contributorHasDetails(contributor)) {
    setRouteContributor(contributor);
    routeEditorState.contributor = contributor;
  }

  updateDraftPolyline(routeEditorState);
  updateSnappedPolyline(routeEditorState);

  focusEditorMapOnPath(routeEditorState, routeEditorState.snappedPath.length ? routeEditorState.snappedPath : routeEditorState.path);
  if (routeEditorState.map) {
    repositionMapControls(routeEditorState.map.getDiv());
  }

  const routeLabel = route.name || 'Saved route';
  setEditorStatus(
    routeEditorState,
    `Editing "${routeLabel}". Adjust the path or choose Save to update the shared directory.`,
  );
  updateEditorControls(routeEditorState);
}

async function saveCurrentRoute(state) {
  const workingPath = state.snappedPath.length > 1 ? state.snappedPath : state.path;
  if (workingPath.length < 2) {
    setEditorStatus(state, 'Snap and refine the route before saving.');
    return;
  }

  const session = getAuthSession();
  const sessionUser = session && session.user ? session.user : null;
  if (!sessionUser) {
    setEditorStatus(state, 'Sign in to save taxi routes. Use the account menu above to log in.');
    if (!openAccountMenu({ focus: 'signin', redirect: false })) {
      window.location.href = '/registration.html#login';
    }
    return;
  }

  const contributorDefaults = getRegisteredContributorDetails();
  const hasContributorUsername = Boolean(contributorDefaults.username);
  const hasContributorHomeTown = Boolean(contributorDefaults.homeTown);

  if (!hasContributorUsername || !hasContributorHomeTown) {
    setEditorStatus(
      state,
      'Complete your registration profile with a username and home town before saving routes.',
    );
    if (!openAccountMenu({ focus: 'profile', redirect: false })) {
      window.location.href = '/registration.html#account';
    }
    return;
  }

  setRouteContributor(contributorDefaults);
  state.contributor = { ...contributorDefaults };

  const previousDetails = state.lastSaveDetails || {};
  const dialogDefaults = {
    pointAName: previousDetails.pointAName || '',
    pointBName: previousDetails.pointBName || '',
    notes: previousDetails.notes || '',
    fareMin: previousDetails.fareMin,
    fareMax: previousDetails.fareMax,
    contributor: contributorDefaults,
  };

  const details = await openRouteSaveDialog(dialogDefaults);
  if (!details) {
    setEditorStatus(state, 'Route save cancelled. Provide the listed details to store your route.');
    return;
  }

  state.contributor = { username: details.username, homeTown: details.homeTown };
  state.lastSaveDetails = {
    pointAName: details.pointAName,
    pointBName: details.pointBName,
    notes: details.notes || '',
    fareMin: details.fareMin,
    fareMax: details.fareMax,
  };

  const routeNameParts = [details.pointAName, details.pointBName].filter(part => part && part.trim());
  const generatedName = routeNameParts.length ? routeNameParts.join(' – ') : 'New Taxi Route';

  const contributorNameParts = [
    typeof sessionUser.firstName === 'string' ? sessionUser.firstName.trim() : '',
    typeof sessionUser.lastName === 'string' ? sessionUser.lastName.trim() : '',
  ].filter(Boolean);
  const contributorDisplayName = contributorNameParts.join(' ').trim();

  const payload = {
    name: generatedName,
    gesture: '',
    province: '',
    city: '',
    pointAName: details.pointAName,
    pointBName: details.pointBName,
    notes: details.notes || '',
    fare: {
      min: Number.isFinite(details.fareMin) ? details.fareMin : 0,
      max: Number.isFinite(details.fareMax) ? details.fareMax : Number.isFinite(details.fareMin) ? details.fareMin : 0,
      currency: 'ZAR',
    },
    stops: buildStopsFromPath(workingPath, {
      startName: details.pointAName,
      endName: details.pointBName,
    }),
    path: cloneCoordinateList(state.path),
    snappedPath: cloneCoordinateList(state.snappedPath.length ? state.snappedPath : state.path),
    variations: [],
    addedBy: {
      name: contributorDisplayName || details.username,
      username: details.username,
      homeTown: details.homeTown,
    },
  };

  const isEditingExisting = Boolean(state.editingRouteId);
  const endpoint = isEditingExisting
    ? `/api/routes/${encodeURIComponent(state.editingRouteId)}`
    : '/api/routes';
  const method = isEditingExisting ? 'PUT' : 'POST';

  setEditorBusy(state, true);
  setEditorStatus(state, isEditingExisting ? 'Updating route...' : 'Saving route...');

  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData && errorData.message
        ? errorData.message
        : isEditingExisting
          ? 'Unable to update the route right now. Please try again.'
          : 'Unable to save the route right now. Please try again.';
      setEditorStatus(state, message);
      return;
    }
    const saved = await response.json();
    const actionVerb = isEditingExisting ? 'updated' : 'saved';
    setEditorStatus(state, `Route "${saved.name || generatedName}" ${actionVerb} successfully.`);
    state.mode = 'idle';
    state.path = [];
    state.snappedPath = [];
    state.editingRouteId = null;
    state.editingRouteName = '';
    initialiseRouteHistory(state);
    updateDraftPolyline(state);
    updateSnappedPolyline(state);
    updateEditorControls(state);
    if (routeEditorState && routeEditorState.savedRoutes) {
      loadSavedRoutesForEditor(routeEditorState.savedRoutes, { silent: true, force: true });
    }
    if (typeof loadRoutesForFinder === 'function') {
      loadRoutesForFinder();
    }
  } catch (error) {
    console.error('Unable to save route', error);
    setEditorStatus(
      state,
      isEditingExisting
        ? 'Unable to update the route right now. Please try again.'
        : 'Unable to save the route right now. Please try again.',
    );
  } finally {
    setEditorBusy(state, false);
  }
}

function buildStopsFromPath(path, names = {}) {
  if (!Array.isArray(path) || path.length === 0) return [];
  const stops = [];
  const first = path[0];
  const last = path[path.length - 1];
  const startName = typeof names.startName === 'string' && names.startName.trim()
    ? names.startName.trim()
    : 'Point A';
  const endName = typeof names.endName === 'string' && names.endName.trim()
    ? names.endName.trim()
    : 'Point B';
  if (first) {
    stops.push({ name: startName, lat: first.lat, lng: first.lng });
  }
  if (last && (last.lat !== first.lat || last.lng !== first.lng)) {
    stops.push({ name: endName, lat: last.lat, lng: last.lng });
  }
  return stops;
}

function setupRegistration() {
  const form = document.querySelector('[data-registration-form]');
  if (!form || form.dataset.registrationBound === 'true') return;

  form.dataset.registrationBound = 'true';

  const roleInputs = Array.from(form.querySelectorAll('input[name="roles"]'));
  const dynamicContainer = form.querySelector('[data-role-fields]');
  const errorElement = form.querySelector('[data-registration-error]');
  const successPanel = document.getElementById('registration-success');
  const successMessage = successPanel ? successPanel.querySelector('[data-registration-success-message]') : null;
  const successActions = successPanel ? successPanel.querySelector('[data-registration-success-actions]') : null;
  const successFeedback = successPanel ? successPanel.querySelector('[data-registration-feedback]') : null;
  const authStatus = document.querySelector('[data-auth-status]');
  const logoutButton = document.querySelector('[data-logout-button]');
  const loginForm = document.querySelector('[data-login-form]');
  const loginError = loginForm ? loginForm.querySelector('[data-login-error]') : null;
  const firstNameInput = form.querySelector('input[name="firstName"]');
  const lastNameInput = form.querySelector('input[name="lastName"]');
  const homeTownInput = form.querySelector('input[name="homeTown"]');

  const state = {
    ownerTaxiList: null,
    selectedRoles: new Set(),
  };

  function getSelectedRoles() {
    return roleInputs.filter(input => input.checked).map(input => input.value);
  }

  function hasRole(roles, role) {
    return roles.includes(role);
  }

  function updateAuthStatus(session = getAuthSession()) {
    const activeSession = session && typeof session === 'object' ? session : null;
    if (authStatus) {
      if (activeSession && activeSession.user) {
        const user = activeSession.user;
        const username = typeof user.username === 'string' ? user.username : '';
        const firstName = typeof user.firstName === 'string' ? user.firstName : '';
        const lastName = typeof user.lastName === 'string' ? user.lastName : '';
        const homeTown = typeof user.homeTown === 'string' ? user.homeTown : '';
        const privateName = [firstName, lastName].filter(Boolean).join(' ').trim();
        let summary = username || privateName || 'Signed-in user';
        if (privateName && username && privateName.toLowerCase() !== username.toLowerCase()) {
          summary = `${privateName} (${username})`;
        }
        if (homeTown) {
          summary = `${summary} · ${homeTown}`;
        }
        authStatus.textContent = `Signed in as ${summary}`;
      } else {
        authStatus.textContent = 'Not signed in.';
      }
    }
    if (logoutButton) {
      logoutButton.hidden = !(activeSession && activeSession.user);
      logoutButton.disabled = false;
    }
    if (loginForm) {
      loginForm.hidden = Boolean(activeSession && activeSession.user);
    }
    if (activeSession && loginError) {
      loginError.hidden = true;
      loginError.textContent = '';
    }
  }

  function clearLoginError() {
    if (!loginError) return;
    loginError.hidden = true;
    loginError.textContent = '';
  }

  function showLoginError(message) {
    if (!loginError) return;
    loginError.hidden = false;
    loginError.textContent = message;
  }

  function clearError() {
    if (errorElement) {
      errorElement.hidden = true;
      errorElement.textContent = '';
    }
    clearLoginError();
  }

  function showError(message) {
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.hidden = false;
    if (successPanel) {
      successPanel.hidden = true;
    }
  }

  function resetSuccessPanel() {
    if (!successPanel) return;
    successPanel.hidden = true;
    if (successMessage) successMessage.textContent = '';
    if (successActions) successActions.innerHTML = '';
    if (successFeedback) {
      successFeedback.textContent = '';
      successFeedback.classList.remove('error');
    }
  }

  function showSuccess(message, actions = []) {
    if (!successPanel) return;
    if (successMessage) {
      successMessage.textContent = message;
    }
    if (successActions) {
      successActions.innerHTML = '';
      actions.forEach(action => successActions.appendChild(action));
    }
    if (successFeedback) {
      successFeedback.textContent = '';
      successFeedback.classList.remove('error');
    }
    successPanel.hidden = false;
    if (typeof successPanel.scrollIntoView === 'function') {
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof successPanel.focus === 'function') {
      successPanel.focus({ preventScroll: true });
    }
  }

  updateAuthStatus();

  if (!form.dataset.authListenerBound) {
    document.addEventListener('authchange', event => {
      const session = event && event.detail ? event.detail.session : null;
      updateAuthStatus(session);
    });
    form.dataset.authListenerBound = 'true';
  }

  attachLogoutHandler(logoutButton, {
    onComplete: () => {
      showSuccess('You have signed out. Sign in again below to keep contributing routes.', []);
    },
  });

  if (loginForm && !loginForm.dataset.loginBound) {
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearError();
      resetSuccessPanel();

      const loginData = new FormData(loginForm);
      const username = (loginData.get('username') || '').trim();
      const passwordRaw = loginData.get('password');
      const passwordValue = typeof passwordRaw === 'string' ? passwordRaw : '';

      if (!username) {
        showLoginError('Enter your username to sign in.');
        return;
      }
      if (!passwordValue) {
        showLoginError('Enter your password to sign in.');
        return;
      }

      const submit = loginForm.querySelector('button[type="submit"]');
      let originalLabel = '';
      if (submit) {
        originalLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = 'Signing in…';
      }

      try {
        const response = await fetch('/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password: passwordValue }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data && data.message ? data.message : 'Unable to sign in. Check your details and try again.';
          showLoginError(message);
          return;
        }
        const data = await response.json();
        if (!data || !data.token || !data.user) {
          showLoginError('Unexpected response from the server. Please try again.');
          return;
        }
        setAuthSession({ token: data.token, user: data.user });
        setRouteContributor({
          username: typeof data.user.username === 'string' ? data.user.username : '',
          homeTown: typeof data.user.homeTown === 'string' ? data.user.homeTown : '',
        });
        loginForm.reset();
        const actions = [];
        const routeAdderLink = document.createElement('a');
        routeAdderLink.href = '/route-adder.html';
        routeAdderLink.className = 'cta';
        routeAdderLink.textContent = 'Open Route Adder';
        actions.push(routeAdderLink);
        const greetingName = typeof data.user.firstName === 'string' && data.user.firstName.trim()
          ? data.user.firstName.trim()
          : data.user.username;
        showSuccess(`Welcome back ${greetingName || 'there'}! You're signed in.`, actions);
      } catch (error) {
        console.error('Login failed', error);
        showLoginError('Unable to sign in right now. Please try again shortly.');
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = originalLabel || 'Sign in';
        }
      }
    });
    loginForm.dataset.loginBound = 'true';
  }

  function createOwnerTaxiFieldset(initial = {}) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'registration-owner-taxi';
    fieldset.dataset.ownerTaxi = 'true';
    fieldset.dataset.taxiId = initial.id || generateId('taxi');

    const legend = document.createElement('legend');
    legend.textContent = 'Taxi';
    fieldset.appendChild(legend);

    const header = document.createElement('div');
    header.className = 'registration-owner-taxi__header';
    const title = document.createElement('h3');
    title.textContent = initial.name || 'Taxi';
    header.appendChild(title);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'registration-owner-taxi__remove';
    removeButton.setAttribute('aria-label', 'Remove taxi');
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      fieldset.remove();
      refreshOwnerTaxiTitles();
    });
    header.appendChild(removeButton);

    fieldset.appendChild(header);

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Taxi name or nickname';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = 'taxi-name';
    nameInput.placeholder = 'e.g. Soweto CBD Express';
    if (initial.name) nameInput.value = initial.name;
    nameInput.addEventListener('input', refreshOwnerTaxiTitles);
    nameLabel.appendChild(nameInput);
    fieldset.appendChild(nameLabel);

    const regLabel = document.createElement('label');
    regLabel.textContent = 'Registration / Fleet number (optional)';
    const regInput = document.createElement('input');
    regInput.type = 'text';
    regInput.name = 'taxi-registration';
    regInput.placeholder = 'e.g. CA 123-456';
    if (initial.registration) regInput.value = initial.registration;
    regLabel.appendChild(regInput);
    fieldset.appendChild(regLabel);

    return fieldset;
  }

  function refreshOwnerTaxiTitles() {
    if (!state.ownerTaxiList) return;
    const groups = Array.from(state.ownerTaxiList.querySelectorAll('[data-owner-taxi]'));
    groups.forEach((fieldset, index) => {
      const title = fieldset.querySelector('.registration-owner-taxi__header h3');
      const nameInput = fieldset.querySelector('input[name="taxi-name"]');
      if (title) {
        const fallback = `Taxi ${index + 1}`;
        title.textContent = nameInput && nameInput.value.trim() ? nameInput.value.trim() : fallback;
      }
      const legend = fieldset.querySelector('legend');
      if (legend) {
        legend.textContent = `Taxi ${index + 1}`;
      }
    });
  }

  function collectOwnerTaxiEntries() {
    if (!state.ownerTaxiList) return [];
    const rows = Array.from(state.ownerTaxiList.querySelectorAll('[data-owner-taxi]'));
    return rows
      .map(row => {
        const id = row.dataset.taxiId || generateId('taxi');
        row.dataset.taxiId = id;
        const nameInput = row.querySelector('input[name="taxi-name"]');
        const regInput = row.querySelector('input[name="taxi-registration"]');
        const name = nameInput ? nameInput.value.trim() : '';
        const registration = regInput ? regInput.value.trim() : '';
        if (!name && !registration) return null;
        return {
          id,
          name,
          registration,
          lastKnownLocation: null,
        };
      })
      .filter(Boolean);
  }

  function renderRoleFields(selectedRoles = []) {
    if (!dynamicContainer) return;
    dynamicContainer.innerHTML = '';
    state.ownerTaxiList = null;

    const roles = Array.isArray(selectedRoles) ? selectedRoles : [];
    const rolesSet = new Set(roles);

    if (rolesSet.has('taxi-manager')) {
      const note = document.createElement('div');
      note.className = 'registration-driver-note';
      note.innerHTML =
        '<strong>Enable live visibility</strong>After submitting, share your location to appear on the Admin Route Finder.';
      dynamicContainer.appendChild(note);

      const vehicleLabel = document.createElement('label');
      vehicleLabel.textContent = 'Vehicle nickname or association (optional)';
      const vehicleInput = document.createElement('input');
      vehicleInput.type = 'text';
      vehicleInput.name = 'managerVehicle';
      vehicleInput.placeholder = 'e.g. Soweto — Sandton Quantum';
      vehicleLabel.appendChild(vehicleInput);
      dynamicContainer.appendChild(vehicleLabel);
    }

    if (rolesSet.has('taxi-owner')) {
      const note = document.createElement('div');
      note.className = 'registration-driver-note';
      note.innerHTML =
        '<strong>Map your fleet</strong>List each taxi you manage. Update live positions later from the Admin Route Finder.';
      dynamicContainer.appendChild(note);

      const list = document.createElement('div');
      list.className = 'registration-owner-fleet';
      list.dataset.ownerTaxiList = 'true';
      dynamicContainer.appendChild(list);
      state.ownerTaxiList = list;

      list.appendChild(createOwnerTaxiFieldset());
      refreshOwnerTaxiTitles();

      const actions = document.createElement('div');
      actions.className = 'registration-owner-actions';
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'cta secondary';
      addButton.textContent = 'Add another taxi';
      addButton.addEventListener('click', () => {
        list.appendChild(createOwnerTaxiFieldset());
        refreshOwnerTaxiTitles();
      });
      actions.appendChild(addButton);
      dynamicContainer.appendChild(actions);
    }

    const otherRoles = roles.filter(role => role !== 'taxi-manager' && role !== 'taxi-owner');
    if (otherRoles.length) {
      const info = document.createElement('p');
      info.className = 'registration-feedback';
      info.textContent =
        'Once approved, your username and hometown will appear on shared commuter tools.';
      dynamicContainer.appendChild(info);
    } else if (!rolesSet.size) {
      const info = document.createElement('p');
      info.className = 'registration-feedback';
      info.textContent = 'Choose at least one role above to unlock tailored onboarding fields.';
      dynamicContainer.appendChild(info);
    }
  }

  function renderDriverSuccessPanel(selectedRoles = null) {
    const profile = getDriverProfile();
    if (!profile) return;
    const username = typeof profile.username === 'string' ? profile.username : '';
    const displayName = typeof profile.displayName === 'string' && profile.displayName.trim()
      ? profile.displayName.trim()
      : '';
    const identity = username || displayName || 'Taxi manager';
    const resolvedRoles = Array.isArray(selectedRoles)
      ? selectedRoles
      : Array.isArray(profile.roles)
      ? profile.roles
      : [];
    const rolesSet = new Set(resolvedRoles);
    const messageBase = profile.sharingEnabled
      ? `${identity}, your live location is active. Refresh it whenever you need to update the Admin Route Finder.`
      : `Thanks ${identity}! Enable live location to appear on the Admin Route Finder.`;
    let message = messageBase;
    if (rolesSet.has('taxi-owner')) {
      message = `${messageBase} Capture your fleet below to surface every taxi on the admin map.`;
    } else if (rolesSet.size > 1) {
      message = `${messageBase} Your ${formatRoleSummary(Array.from(rolesSet), 'account')} workspace is ready.`;
    }
    const actions = [];

    const enableButton = document.createElement('button');
    enableButton.type = 'button';
    enableButton.className = 'cta';
    enableButton.textContent = profile.sharingEnabled ? 'Refresh live location' : 'Enable live location now';
    enableButton.addEventListener('click', () => {
      if (successFeedback) {
        successFeedback.textContent = 'Requesting your current position...';
        successFeedback.classList.remove('error');
      }
      const actionPromise = profile.sharingEnabled ? refreshDriverLocation() : enableDriverLiveLocation();
      actionPromise
        .then(() => {
          if (successFeedback) {
            successFeedback.textContent = 'Live location updated. Open the Admin Route Finder to view your marker.';
            successFeedback.classList.remove('error');
          }
          renderDriverSuccessPanel(resolvedRoles);
        })
        .catch(error => {
          if (successFeedback) {
            successFeedback.textContent = error.message || 'Unable to update your location.';
            successFeedback.classList.add('error');
          }
        });
    });
    actions.push(enableButton);

    const adminLink = document.createElement('a');
    adminLink.href = '/admin-route-finder.html';
    adminLink.className = 'cta secondary';
    adminLink.textContent = 'Open Admin Route Finder';
    actions.push(adminLink);

    showSuccess(message, actions);
  }

  function renderOwnerSuccessPanel(selectedRoles = null) {
    const profile = getOwnerProfile();
    if (!profile) return;
    const total = Array.isArray(profile.taxis) ? profile.taxis.length : 0;
    const username = typeof profile.username === 'string' ? profile.username : '';
    const displayName = typeof profile.displayName === 'string' && profile.displayName.trim()
      ? profile.displayName.trim()
      : '';
    const identity = username || displayName || 'Taxi owner';
    const resolvedRoles = Array.isArray(selectedRoles)
      ? selectedRoles
      : Array.isArray(profile.roles)
      ? profile.roles
      : [];
    const rolesSet = new Set(resolvedRoles);
    let message =
      total > 0
        ? `${identity}, ${total} taxi${total === 1 ? '' : 's'} are ready to display on the Admin Route Finder.`
        : `${identity}, your profile is saved. Add taxis to manage their live visibility.`;
    if (rolesSet.has('taxi-manager')) {
      message = `${message} Enable the taxi manager tools when you are on the road to broadcast your live position.`;
    } else if (rolesSet.size > 1) {
      message = `${message} Your ${formatRoleSummary(Array.from(rolesSet), 'account')} profile is active.`;
    }
    const actions = [];

    if (rolesSet.has('taxi-manager')) {
      const driverProfile = getDriverProfile();
      if (driverProfile) {
        const enableButton = document.createElement('button');
        enableButton.type = 'button';
        enableButton.className = 'cta';
        enableButton.textContent = driverProfile.sharingEnabled
          ? 'Refresh live location'
          : 'Enable live location now';
        enableButton.addEventListener('click', () => {
          if (successFeedback) {
            successFeedback.textContent = driverProfile.sharingEnabled
              ? 'Refreshing your live position…'
              : 'Requesting your current position…';
            successFeedback.classList.remove('error');
          }
          const actionPromise = driverProfile.sharingEnabled
            ? refreshDriverLocation()
            : enableDriverLiveLocation();
          actionPromise
            .then(() => {
              if (successFeedback) {
                successFeedback.textContent = 'Live location updated. Open the Admin Route Finder to view your marker.';
                successFeedback.classList.remove('error');
              }
              renderOwnerSuccessPanel(resolvedRoles);
            })
            .catch(error => {
              if (successFeedback) {
                successFeedback.textContent = error.message || 'Unable to update your location.';
                successFeedback.classList.add('error');
              }
            });
        });
        actions.push(enableButton);
      }
    }

    const adminLink = document.createElement('a');
    adminLink.href = '/admin-route-finder.html';
    adminLink.className = 'cta';
    adminLink.textContent = 'Open Admin Route Finder';
    actions.push(adminLink);

    showSuccess(message, actions);
  }

  function renderGenericSuccess(roles, user) {
    const roleSummary = formatRoleSummary(Array.isArray(roles) ? roles : [], 'account');
    const username = user && typeof user.username === 'string' ? user.username : '';
    const firstName = user && typeof user.firstName === 'string' && user.firstName.trim()
      ? user.firstName.trim()
      : '';
    const greetingName = firstName || username || 'there';
    const message = `Thanks ${greetingName}! Your ${roleSummary} profile is saved. ${
      username ? `You're signed in as ${username}.` : 'You are signed in and ready to explore the tools.'
    }`;
    const actions = [];
    const adminLink = document.createElement('a');
    adminLink.href = '/admin-route-finder.html';
    adminLink.className = 'cta secondary';
    adminLink.textContent = 'Visit Admin Route Finder';
    actions.push(adminLink);
    showSuccess(message, actions);
  }

  if (roleInputs.length) {
    const initialRoles = getSelectedRoles();
    state.selectedRoles = new Set(initialRoles);
    renderRoleFields(initialRoles);
    roleInputs.forEach(input => {
      if (input.dataset.roleBound === 'true') return;
      input.addEventListener('change', () => {
        clearError();
        resetSuccessPanel();
        const nextRoles = getSelectedRoles();
        state.selectedRoles = new Set(nextRoles);
        renderRoleFields(nextRoles);
      });
      input.dataset.roleBound = 'true';
    });
  } else if (dynamicContainer) {
    dynamicContainer.innerHTML = '';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearError();
    resetSuccessPanel();

    const submitButton = form.querySelector('button[type="submit"]');
    let originalSubmitLabel = '';
    if (submitButton) {
      originalSubmitLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting…';
    }

    try {
      const formData = new FormData(form);
      const selectedRoles = getSelectedRoles();
      if (!selectedRoles.length) {
        showError('Select at least one role to continue.');
        return;
      }

      const firstName = (formData.get('firstName') || '').trim();
      if (!firstName) {
        showError('Enter your first name.');
        return;
      }

      const lastName = (formData.get('lastName') || '').trim();
      if (!lastName) {
        showError('Enter your last name.');
        return;
      }

      const username = (formData.get('username') || '').trim();
      if (!username) {
        showError('Choose a username to manage your account.');
        return;
      }
      if (username.length < 3) {
        showError('Usernames need at least 3 characters.');
        return;
      }

      const passwordRaw = formData.get('password');
      const passwordValue = typeof passwordRaw === 'string' ? passwordRaw : '';
      if (!passwordValue || passwordValue.length < 4) {
        showError('Passwords must be at least 4 characters long.');
        return;
      }

      const homeTown = (formData.get('homeTown') || '').trim();
      if (!homeTown) {
        showError('Add your home town so commuters know where you operate.');
        return;
      }

      const email = (formData.get('email') || '').trim();
      const phone = (formData.get('phone') || '').trim();
      const routes = (formData.get('routes') || '').trim();

      const metadata = {};
      let managerVehicle = '';
      if (selectedRoles.includes('taxi-manager')) {
        managerVehicle = (formData.get('managerVehicle') || '').trim();
        if (managerVehicle) {
          metadata.managerVehicle = managerVehicle;
        }
      }

      let ownerTaxis = [];
      if (selectedRoles.includes('taxi-owner')) {
        ownerTaxis = collectOwnerTaxiEntries();
        if (!ownerTaxis.length) {
          showError('Add at least one taxi so that your fleet can appear on the Admin Route Finder.');
          return;
        }
        metadata.taxis = ownerTaxis;
      }

      const payload = {
        username,
        password: passwordValue,
        firstName,
        lastName,
        homeTown,
        roles: selectedRoles,
        email,
        phone,
        routes,
        metadata,
      };

      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data && data.message ? data.message : 'We could not complete your registration right now.';
        showError(message);
        return;
      }

      const data = await response.json();
      if (!data || !data.token || !data.user) {
        showError('Unexpected response from the server. Please try again.');
        return;
      }

      const registeredUser = data.user;
      const registeredRoles = Array.isArray(registeredUser.roles) && registeredUser.roles.length
        ? registeredUser.roles
        : selectedRoles;
      state.selectedRoles = new Set(registeredRoles);

      setAuthSession({ token: data.token, user: registeredUser });
      setRouteContributor({
        username: typeof registeredUser.username === 'string' ? registeredUser.username : username,
        homeTown: typeof registeredUser.homeTown === 'string' ? registeredUser.homeTown : homeTown,
      });

      const responseFirstName =
        typeof registeredUser.firstName === 'string' && registeredUser.firstName.trim()
          ? registeredUser.firstName.trim()
          : firstName;
      const responseLastName =
        typeof registeredUser.lastName === 'string' && registeredUser.lastName.trim()
          ? registeredUser.lastName.trim()
          : lastName;
      const contributorHomeTown =
        typeof registeredUser.homeTown === 'string' && registeredUser.homeTown.trim()
          ? registeredUser.homeTown.trim()
          : homeTown;
      const displayName = [responseFirstName, responseLastName].filter(Boolean).join(' ').trim();

      const baseProfile = {
        displayName,
        name: displayName,
        firstName: responseFirstName,
        lastName: responseLastName,
        email,
        phone,
        routes,
        homeTown: contributorHomeTown,
        username: registeredUser.username,
        accountId: registeredUser.id,
        roles: registeredRoles,
        timestamp: Date.now(),
      };

      const hasManagerRole = registeredRoles.includes('taxi-manager');
      const hasOwnerRole = registeredRoles.includes('taxi-owner');

      if (hasManagerRole) {
        const profile = {
          ...baseProfile,
          id: generateId('manager'),
          role: 'taxi-manager',
          vehicle: managerVehicle,
          sharingEnabled: false,
          lastKnownLocation: null,
        };
        setDriverProfile(profile);
      } else {
        setDriverProfile(null);
      }

      if (hasOwnerRole) {
        const profile = {
          ...baseProfile,
          id: generateId('owner'),
          role: 'taxi-owner',
          taxis: ownerTaxis,
        };
        setOwnerProfile(profile);
      } else {
        setOwnerProfile(null);
      }

      if (hasOwnerRole) {
        renderOwnerSuccessPanel(registeredRoles);
      } else if (hasManagerRole) {
        renderDriverSuccessPanel(registeredRoles);
      } else {
        renderGenericSuccess(registeredRoles, registeredUser);
      }

      form.reset();
      roleInputs.forEach(input => {
        input.checked = false;
      });
      state.selectedRoles = new Set();
      renderRoleFields([]);
    } catch (error) {
      console.error('Failed to submit registration', error);
      showError('We could not submit your registration right now. Please try again.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalSubmitLabel || 'Submit registration';
      }
    }
  });

  const storedDriver = getDriverProfile();
  const storedOwner = getOwnerProfile();
  if (storedOwner) {
    const roles = Array.isArray(storedOwner.roles) ? storedOwner.roles : [];
    renderOwnerSuccessPanel(roles);
  } else if (storedDriver) {
    const roles = Array.isArray(storedDriver.roles) ? storedDriver.roles : [];
    renderDriverSuccessPanel(roles);
  }
}

function setupRouteFinder(map) {
  if (!map) return;

  const dropdown = document.getElementById('route-select');
  const detailsElement = document.getElementById('route-details');
  const searchForm = document.getElementById('search');

  if (!routeFinderState) {
    routeFinderState = {
      map,
      dropdown,
      detailsElement,
      searchForm,
      infoWindow: new google.maps.InfoWindow({ maxWidth: 320 }),
      routes: [],
      routeById: new Map(),
      overlays: [],
      polylineById: new Map(),
      collator: new Intl.Collator('en', { sensitivity: 'base' }),
      selectedRouteId: '',
    };
  } else {
    routeFinderState.map = map;
    routeFinderState.dropdown = dropdown;
    routeFinderState.detailsElement = detailsElement;
    routeFinderState.searchForm = searchForm;
    if (!routeFinderState.infoWindow) {
      routeFinderState.infoWindow = new google.maps.InfoWindow({ maxWidth: 320 });
    }
    if (!routeFinderState.collator) {
      routeFinderState.collator = new Intl.Collator('en', { sensitivity: 'base' });
    }
  }

  attachRouteFinderEventListeners();
  renderRouteDetails(null);
  loadRoutesForFinder();
  repositionMapControls(map.getDiv());
}

function attachRouteFinderEventListeners() {
  if (!routeFinderState) return;
  const { dropdown, searchForm } = routeFinderState;

  if (dropdown && !dropdown.dataset.routeFinderBound) {
    dropdown.addEventListener('change', event => {
      focusRouteById(event.target.value || '', { updateDropdown: false });
    });
    dropdown.dataset.routeFinderBound = 'true';
  }

  if (searchForm && !searchForm.dataset.routeFinderBound) {
    searchForm.addEventListener('submit', event => {
      event.preventDefault();
      const input = searchForm.querySelector('input[name="q"], input[type="search"]');
      const query = input ? input.value.trim() : '';
      handleRouteSearch(query);
    });
    searchForm.dataset.routeFinderBound = 'true';
  }
}

async function loadRoutesForFinder() {
  if (!routeFinderState) return;

  try {
    const response = await fetch('/api/routes');
    if (!response.ok) {
      throw new Error(`Routes request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const routes = Array.isArray(payload) ? payload.map(normalizeRouteRecord).filter(Boolean) : [];

    routeFinderState.routes = routes;
    if (!routeFinderState.routeById) {
      routeFinderState.routeById = new Map();
    } else {
      routeFinderState.routeById.clear();
    }
    routes.forEach(route => {
      routeFinderState.routeById.set(route.routeId, route);
    });

    updateRouteDropdown();
    drawRoutesOnMap();

    if (routeFinderState.selectedRouteId && routeFinderState.routeById.has(routeFinderState.selectedRouteId)) {
      focusRouteById(routeFinderState.selectedRouteId, { fit: false, updateDropdown: true });
    } else {
      routeFinderState.selectedRouteId = '';
      if (routeFinderState.dropdown) {
        routeFinderState.dropdown.value = '';
      }
      if (routes.length === 0) {
        renderRouteDetails(null, {
          message: 'No routes have been saved yet. Use the Route Adder to capture your first corridor.',
        });
      } else {
        renderRouteDetails(null);
      }
      if (routeFinderState.infoWindow) {
        routeFinderState.infoWindow.close();
      }
      highlightRoutes('');
    }
  } catch (error) {
    console.error('Failed to load routes', error);
    routeFinderState.routes = [];
    if (routeFinderState.routeById) {
      routeFinderState.routeById.clear();
    }
    updateRouteDropdown();
    clearRouteOverlays();
    if (routeFinderState.infoWindow) {
      routeFinderState.infoWindow.close();
    }
    renderRouteDetails(null, {
      message: 'Unable to load saved routes right now. Please refresh the page to try again.',
    });
  }
}

function drawRoutesOnMap() {
  if (!routeFinderState || !routeFinderState.map) return;

  clearRouteOverlays();
  routeFinderState.polylineById = new Map();

  routeFinderState.routes.forEach(route => {
    const path = getRoutePath(route);
    if (!Array.isArray(path) || path.length < 2) return;

    const strokeColor = getRouteColor(route.frequencyPerHour);
    const polyline = new google.maps.Polyline({
      map: routeFinderState.map,
      path: path.map(point => ({ lat: point.lat, lng: point.lng })),
      strokeColor,
      strokeOpacity: 0.6,
      strokeWeight: 4,
      zIndex: 500,
    });

    const entry = {
      routeId: route.routeId,
      polyline,
      strokeColor,
      listeners: [],
    };

    entry.listeners.push(
      polyline.addListener('click', event => {
        focusRouteById(route.routeId, { eventPosition: event.latLng, updateDropdown: true });
      }),
      polyline.addListener('mouseover', () => {
        applyRouteStyle(entry, {
          isHover: true,
          isSelected: routeFinderState.selectedRouteId === route.routeId,
        });
      }),
      polyline.addListener('mouseout', () => {
        applyRouteStyle(entry, { isSelected: routeFinderState.selectedRouteId === route.routeId });
      }),
    );

    routeFinderState.overlays.push(entry);
    routeFinderState.polylineById.set(route.routeId, entry);
    applyRouteStyle(entry, { isSelected: routeFinderState.selectedRouteId === route.routeId });
  });

  repositionMapControls(routeFinderState.map.getDiv());
}

function clearRouteOverlays() {
  if (!routeFinderState) return;
  if (Array.isArray(routeFinderState.overlays)) {
    routeFinderState.overlays.forEach(entry => {
      if (entry.listeners) {
        entry.listeners.forEach(listener => listener.remove());
      }
      if (entry.polyline) {
        entry.polyline.setMap(null);
      }
    });
  }
  routeFinderState.overlays = [];
  if (routeFinderState.polylineById) {
    routeFinderState.polylineById.clear();
  }
}

function applyRouteStyle(entry, { isSelected = false, isHover = false } = {}) {
  if (!entry || !entry.polyline) return;
  const strokeOpacity = isSelected ? 1 : isHover ? 0.85 : 0.55;
  const strokeWeight = isSelected ? 6 : isHover ? 5 : 4;
  const zIndex = isSelected ? 1100 : isHover ? 900 : 500;
  entry.polyline.setOptions({
    strokeOpacity,
    strokeWeight,
    zIndex,
    strokeColor: entry.strokeColor,
  });
}

function highlightRoutes(routeId) {
  if (!routeFinderState) return;
  const selectedId = routeId ? String(routeId) : '';
  routeFinderState.overlays.forEach(entry => {
    applyRouteStyle(entry, { isSelected: entry.routeId === selectedId });
  });
}

function focusRouteById(routeId, options = {}) {
  if (!routeFinderState) return;
  const id = routeId ? String(routeId) : '';

  if (!id) {
    routeFinderState.selectedRouteId = '';
    highlightRoutes('');
    if (options.updateDropdown !== false && routeFinderState.dropdown) {
      routeFinderState.dropdown.value = '';
    }
    renderRouteDetails(null);
    if (routeFinderState.infoWindow) {
      routeFinderState.infoWindow.close();
    }
    return;
  }

  const route = routeFinderState.routeById ? routeFinderState.routeById.get(id) : null;
  if (!route) {
    renderRouteDetails(null, { message: 'The selected route could not be found.' });
    return;
  }

  routeFinderState.selectedRouteId = id;
  highlightRoutes(id);

  if (options.updateDropdown !== false && routeFinderState.dropdown && routeFinderState.dropdown.value !== id) {
    routeFinderState.dropdown.value = id;
  }

  renderRouteDetails(route);

  if (options.fit !== false) {
    fitMapToRoute(route);
  }

  if (routeFinderState.infoWindow) {
    const anchor = options.eventPosition || getRouteMidpoint(route);
    if (anchor) {
      routeFinderState.infoWindow.setContent(buildRouteInfoWindow(route));
      routeFinderState.infoWindow.setPosition(anchor);
      routeFinderState.infoWindow.open({ map: routeFinderState.map });
    } else {
      routeFinderState.infoWindow.close();
    }
  }
}

function fitMapToRoute(route) {
  if (!routeFinderState || !routeFinderState.map) return;
  const path = getRoutePath(route);
  if (!Array.isArray(path) || path.length === 0) return;

  const bounds = new google.maps.LatLngBounds();
  path.forEach(point => bounds.extend(point));
  try {
    routeFinderState.map.fitBounds(bounds, getRouteFitPadding());
  } catch (error) {
    console.warn('Unable to fit map to route bounds', error);
  }
}

function getRouteFitPadding() {
  const topPadding = getControlOffset() + 80;
  return { top: topPadding, bottom: 64, left: 80, right: 80 };
}

function getRoutePath(route) {
  if (!route) return [];
  if (Array.isArray(route.snappedPath) && route.snappedPath.length > 1) {
    return route.snappedPath;
  }
  if (Array.isArray(route.path)) {
    return route.path;
  }
  return [];
}

function getRouteColor(frequencyPerHour) {
  const value = Number(frequencyPerHour);
  if (!Number.isFinite(value)) {
    return '#2563eb';
  }
  if (value >= 25) return '#b91c1c';
  if (value >= 18) return '#ea580c';
  if (value >= 12) return '#f59e0b';
  if (value >= 6) return '#0ea5e9';
  return '#2563eb';
}

function normalizeRouteRecord(rawRoute) {
  if (!rawRoute || rawRoute.routeId === undefined || rawRoute.routeId === null) return null;
  const routeId = String(rawRoute.routeId);
  const name = typeof rawRoute.name === 'string' && rawRoute.name.trim() ? rawRoute.name.trim() : `Route ${routeId}`;
  const province = typeof rawRoute.province === 'string' && rawRoute.province.trim()
    ? rawRoute.province.trim()
    : 'Unspecified province';
  const city = typeof rawRoute.city === 'string' && rawRoute.city.trim() ? rawRoute.city.trim() : 'Unspecified city';
  const path = cloneCoordinateList(Array.isArray(rawRoute.path) ? rawRoute.path : []);
  const snappedPath = cloneCoordinateList(Array.isArray(rawRoute.snappedPath) ? rawRoute.snappedPath : []);
  const rawStops = Array.isArray(rawRoute.stops) ? rawRoute.stops : [];
  const stops = rawStops
    .map(stop => ({
      name: typeof stop.name === 'string' && stop.name.trim() ? stop.name.trim() : 'Stop',
      lat: Number(stop.lat),
      lng: Number(stop.lng),
    }))
    .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  const fallbackPointA = rawStops.length && typeof rawStops[0].name === 'string' ? rawStops[0].name.trim() : '';
  const fallbackPointB = rawStops.length && typeof rawStops[rawStops.length - 1].name === 'string'
    ? rawStops[rawStops.length - 1].name.trim()
    : fallbackPointA;
  const fare = rawRoute.fare
    ? {
        min: Number(rawRoute.fare.min),
        max: Number(rawRoute.fare.max),
        currency:
          typeof rawRoute.fare.currency === 'string' && rawRoute.fare.currency.trim()
            ? rawRoute.fare.currency.trim()
            : 'ZAR',
      }
    : null;
  const frequency = Number(rawRoute.frequencyPerHour);
  const addedBy = rawRoute.addedBy && typeof rawRoute.addedBy === 'object'
    ? {
        name: typeof rawRoute.addedBy.name === 'string' ? rawRoute.addedBy.name : '',
        username: typeof rawRoute.addedBy.username === 'string' ? rawRoute.addedBy.username : '',
        homeTown: typeof rawRoute.addedBy.homeTown === 'string' ? rawRoute.addedBy.homeTown : '',
      }
    : { name: '', username: '', homeTown: '' };
  const createdAt = typeof rawRoute.createdAt === 'string' ? rawRoute.createdAt : '';
  const updatedAt = typeof rawRoute.updatedAt === 'string' ? rawRoute.updatedAt : '';
  const pointAName = typeof rawRoute.pointAName === 'string' && rawRoute.pointAName.trim()
    ? rawRoute.pointAName.trim()
    : fallbackPointA;
  const pointBName = typeof rawRoute.pointBName === 'string' && rawRoute.pointBName.trim()
    ? rawRoute.pointBName.trim()
    : fallbackPointB;
  const notes = typeof rawRoute.notes === 'string' ? rawRoute.notes.trim() : '';

  return {
    ...rawRoute,
    routeId,
    name,
    province,
    city,
    path,
    snappedPath,
    stops,
    pointAName,
    pointBName,
    notes,
    fare,
    frequencyPerHour: Number.isFinite(frequency) ? frequency : null,
    nameLower: name.toLowerCase(),
    provinceLower: province.toLowerCase(),
    cityLower: city.toLowerCase(),
    addedBy,
    createdAt,
    updatedAt,
  };
}

function updateRouteDropdown() {
  if (!routeFinderState || !routeFinderState.dropdown) return;
  const select = routeFinderState.dropdown;
  const previousValue = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = routeFinderState.routes.length ? 'Select a saved route' : 'No routes saved yet';
  placeholder.selected = true;
  select.appendChild(placeholder);

  if (routeFinderState.routes.length === 0) {
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const groups = groupRoutesByProvinceCity(routeFinderState.routes, routeFinderState.collator);
  groups.forEach(group => {
    const optGroup = document.createElement('optgroup');
    optGroup.label = group.province;
    group.cities.forEach(cityGroup => {
      cityGroup.routes.forEach(route => {
        const option = document.createElement('option');
        option.value = route.routeId;
        option.textContent = `${cityGroup.name} — ${route.name}`;
        option.dataset.province = route.province;
        option.dataset.city = route.city;
        optGroup.appendChild(option);
      });
    });
    select.appendChild(optGroup);
  });

  if (previousValue && routeFinderState.routeById && routeFinderState.routeById.has(previousValue)) {
    select.value = previousValue;
  } else {
    select.value = '';
  }
}

function groupRoutesByProvinceCity(routes, collator) {
  const provinceMap = new Map();
  routes.forEach(route => {
    const province = route.province || 'Unspecified province';
    const city = route.city || 'Unspecified city';
    if (!provinceMap.has(province)) {
      provinceMap.set(province, new Map());
    }
    const cityMap = provinceMap.get(province);
    if (!cityMap.has(city)) {
      cityMap.set(city, []);
    }
    cityMap.get(city).push(route);
  });

  const comparer = collator || new Intl.Collator('en', { sensitivity: 'base' });
  return Array.from(provinceMap.entries())
    .sort((a, b) => comparer.compare(a[0], b[0]))
    .map(([province, cityMap]) => ({
      province,
      cities: Array.from(cityMap.entries())
        .sort((a, b) => comparer.compare(a[0], b[0]))
        .map(([city, cityRoutes]) => ({
          name: city,
          routes: cityRoutes.slice().sort((a, b) => comparer.compare(a.name, b.name)),
        })),
    }));
}

function renderRouteDetails(route, options = {}) {
  if (!routeFinderState || !routeFinderState.detailsElement) return;
  const container = routeFinderState.detailsElement;

  if (options.message) {
    container.innerHTML = `<p class="route-details__empty">${escapeHtml(options.message)}</p>`;
    return;
  }

  if (!route) {
    container.innerHTML = '<p class="route-details__empty">Select a saved route to see its details.</p>';
    return;
  }

  const fareText = escapeHtml(formatFare(route.fare));
  const serviceWindow = escapeHtml(formatServiceWindow(route.firstLoad, route.lastLoad));
  const frequencyMarkup = Number.isFinite(route.frequencyPerHour)
    ? `<span class="route-frequency-chip">${escapeHtml(`${route.frequencyPerHour} trips/hour`)}</span>`
    : escapeHtml('Frequency data unavailable');
  const gestureText = route.gesture ? escapeHtml(route.gesture) : 'Not specified';
  const stopsMarkup = buildStopsMarkup(route.stops);
  const variationsCount = Array.isArray(route.variations) ? route.variations.length : 0;
  const startNameRaw = typeof route.pointAName === 'string' && route.pointAName.trim()
    ? route.pointAName.trim()
    : Array.isArray(route.stops) && route.stops.length
      ? route.stops[0].name
      : '';
  const endNameRaw = typeof route.pointBName === 'string' && route.pointBName.trim()
    ? route.pointBName.trim()
    : Array.isArray(route.stops) && route.stops.length
      ? route.stops[route.stops.length - 1].name
      : '';
  const pointAValue = escapeHtml(startNameRaw || 'Unspecified');
  const pointBValue = escapeHtml(endNameRaw || 'Unspecified');
  const contributorUsername = route.addedBy && route.addedBy.username ? route.addedBy.username : '';
  const contributorHomeTown = route.addedBy && route.addedBy.homeTown ? route.addedBy.homeTown : '';
  let contributorMarkup = '';
  if (contributorUsername || contributorHomeTown) {
    const contributorSummary = contributorHomeTown
      ? `${escapeHtml(contributorUsername || 'Registered contributor')} · ${escapeHtml(contributorHomeTown)}`
      : escapeHtml(contributorUsername);
    contributorMarkup = `<li><strong>Added by:</strong> ${contributorSummary}</li>`;
  }
  const createdAtText = formatTimestamp(route.createdAt);
  const updatedAtText = formatTimestamp(route.updatedAt);
  const createdAtMarkup = createdAtText ? `<li><strong>Captured:</strong> ${escapeHtml(createdAtText)}</li>` : '';
  const updatedAtMarkup = updatedAtText && updatedAtText !== createdAtText
    ? `<li><strong>Updated:</strong> ${escapeHtml(updatedAtText)}</li>`
    : '';
  const rushHoursMarkup = buildTimeSection('Rush hours', route.rushHours, 'Rush hour data unavailable.');
  const quietHoursMarkup = buildTimeSection('Quiet hours', route.quietHours, 'Quiet hour data unavailable.');
  const variationsMarkup = buildVariationsMarkup(route.variations);
  const drawnPathMarkup = buildPathSection('Drawn path', route.path);
  const snappedPathMarkup = buildPathSection('Snapped path', route.snappedPath);
  const rawDataMarkup = buildRawRouteDataSection(route);
  const notesMarkup = buildNotesMarkup(route.notes);

  container.innerHTML = `
    <h2>${escapeHtml(route.name)}</h2>
    <ul class="route-details__meta">
      <li><strong>Province:</strong> ${escapeHtml(route.province || 'Unspecified')}</li>
      <li><strong>City:</strong> ${escapeHtml(route.city || 'Unspecified')}</li>
      <li><strong>Route point A:</strong> ${pointAValue}</li>
      <li><strong>Route point B:</strong> ${pointBValue}</li>
      <li><strong>Fare:</strong> ${fareText}</li>
      <li><strong>Gesture:</strong> ${gestureText}</li>
      <li><strong>Frequency:</strong> ${frequencyMarkup}</li>
      <li><strong>Service window:</strong> ${serviceWindow}</li>
      <li><strong>Variations:</strong> ${variationsCount}</li>
      ${contributorMarkup}
      ${createdAtMarkup}
      ${updatedAtMarkup}
    </ul>
    ${notesMarkup}
    ${rushHoursMarkup}
    ${quietHoursMarkup}
    ${variationsMarkup}
    ${drawnPathMarkup}
    ${snappedPathMarkup}
    ${stopsMarkup}
    ${rawDataMarkup}
  `;
}

function buildStopsMarkup(stops) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return '<p class="route-details__empty">No stops recorded yet.</p>';
  }

  const items = stops.map(stop => {
    const name = escapeHtml(stop.name || 'Stop');
    const lat = escapeHtml(formatCoordinate(stop.lat));
    const lng = escapeHtml(formatCoordinate(stop.lng));
    return `<li><strong>${name}</strong> — ${lat}, ${lng}</li>`;
  });

  return `
    <div>
      <strong>Stops</strong>
      <ul class="route-details__stops">
        ${items.join('')}
      </ul>
    </div>
  `;
}

function buildTimeSection(label, values, emptyMessage) {
  const normalized = Array.isArray(values)
    ? values
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];

  if (!normalized.length) {
    return `
      <div class="route-details__section">
        <strong>${escapeHtml(label)}</strong>
        <p class="route-details__empty">${escapeHtml(emptyMessage || 'No data recorded yet.')}</p>
      </div>
    `;
  }

  const chips = normalized
    .map(value => `<li class="route-details__chip">${escapeHtml(value)}</li>`)
    .join('');

  return `
    <div class="route-details__section">
      <strong>${escapeHtml(label)}</strong>
      <ul class="route-details__chips">${chips}</ul>
    </div>
  `;
}

function buildNotesMarkup(notes) {
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (!text) {
    return '';
  }

  const formatted = escapeHtml(text).replace(/\r?\n/g, '<br />');
  return `
    <div class="route-details__section">
      <strong>Notes &amp; comments</strong>
      <p>${formatted}</p>
    </div>
  `;
}

function buildVariationsMarkup(variations) {
  if (!Array.isArray(variations) || variations.length === 0) {
    return `
      <div class="route-details__section">
        <strong>Variations</strong>
        <p class="route-details__empty">No variations recorded yet.</p>
      </div>
    `;
  }

  const items = variations
    .map((variation, index) => {
      const defaultLabel = `Variation ${index + 1}`;
      if (!variation || typeof variation !== 'object') {
        return `
          <details class="route-details__subsection" open>
            <summary>${escapeHtml(defaultLabel)}</summary>
            <p class="route-details__muted">${escapeHtml(String(variation))}</p>
          </details>
        `;
      }

      const label = variation.name ? String(variation.name) : defaultLabel;
      const description = variation.description ? `<p class="route-details__muted">${escapeHtml(variation.description)}</p>` : '';
      const summaryParts = [];
      if (Array.isArray(variation.path)) {
        summaryParts.push(`${variation.path.length} path point${variation.path.length === 1 ? '' : 's'}`);
      }
      if (Array.isArray(variation.stops)) {
        summaryParts.push(`${variation.stops.length} stop${variation.stops.length === 1 ? '' : 's'}`);
      }
      const summaryText = summaryParts.length ? `<span class="route-details__muted">${escapeHtml(summaryParts.join(' · '))}</span>` : '';
      const raw = `<pre class="route-details__code">${escapeHtml(JSON.stringify(variation, null, 2))}</pre>`;
      return `
        <details class="route-details__subsection" open>
          <summary>${escapeHtml(label)}</summary>
          ${summaryText}
          ${description}
          ${raw}
        </details>
      `;
    })
    .join('');

  return `
    <details class="route-details__section" open>
      <summary>Variations</summary>
      <div class="route-details__variations">${items}</div>
    </details>
  `;
}

function buildPathSection(label, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return `
      <div class="route-details__section">
        <strong>${escapeHtml(label)}</strong>
        <p class="route-details__empty">No coordinates recorded yet.</p>
      </div>
    `;
  }

  const items = coordinates
    .map((point, index) => {
      if (!point || typeof point !== 'object') {
        return `<li><span><strong>Point ${index + 1}</strong></span><span>${escapeHtml(String(point))}</span></li>`;
      }
      const latText = escapeHtml(formatCoordinate(point.lat));
      const lngText = escapeHtml(formatCoordinate(point.lng));
      const extras = Object.entries(point)
        .filter(([key]) => key !== 'lat' && key !== 'lng')
        .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(String(value))}`);
      const extrasText = extras.length ? `<span class="route-details__muted">${extras.join(' · ')}</span>` : '';
      return `<li><span><strong>Point ${index + 1}</strong></span><span>${latText}, ${lngText}</span>${extrasText}</li>`;
    })
    .join('');

  return `
    <details class="route-details__section" open>
      <summary>${escapeHtml(label)}</summary>
      <ol class="route-details__coordinates">${items}</ol>
    </details>
  `;
}

function buildRawRouteDataSection(route) {
  if (!route || typeof route !== 'object') {
    return '';
  }
  return `
    <details class="route-details__section" open>
      <summary>Full route record</summary>
      <pre class="route-details__code">${escapeHtml(JSON.stringify(route, null, 2))}</pre>
    </details>
  `;
}

function buildRouteInfoWindow(route) {
  const fare = escapeHtml(formatFare(route.fare));
  const frequency = escapeHtml(
    Number.isFinite(route.frequencyPerHour) ? `${route.frequencyPerHour} trips/hour` : 'Frequency data unavailable',
  );
  const city = escapeHtml(route.city || 'Unspecified city');
  const province = escapeHtml(route.province || 'Unspecified province');
  return `
    <div class="route-info-window">
      <strong>${escapeHtml(route.name)}</strong><br />
      <span>${city}, ${province}</span><br />
      <span>${fare}</span><br />
      <span>${frequency}</span>
    </div>
  `;
}

function formatFare(fare) {
  if (!fare) return 'Not recorded';
  const currency = typeof fare.currency === 'string' && fare.currency.trim() ? fare.currency.trim().toUpperCase() : 'ZAR';
  const min = Number(fare.min);
  const max = Number(fare.max);

  if (Number.isFinite(min) && Number.isFinite(max)) {
    const minFormatted = formatCurrencyValue(min, currency);
    const maxFormatted = formatCurrencyValue(max, currency);
    if (Math.abs(max - min) < 0.01) {
      return minFormatted;
    }
    return `${minFormatted} – ${maxFormatted}`;
  }

  if (Number.isFinite(min)) return formatCurrencyValue(min, currency);
  if (Number.isFinite(max)) return formatCurrencyValue(max, currency);
  return 'Not recorded';
}

function formatCurrencyValue(amount, currency) {
  if (!Number.isFinite(amount)) return '';
  const normalizedCurrency = currency && currency.length === 3 ? currency.toUpperCase() : 'ZAR';
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    const symbol = normalizedCurrency === 'ZAR' ? 'R' : `${normalizedCurrency} `;
    return `${symbol}${amount.toFixed(2)}`;
  }
}

function formatServiceWindow(firstLoad, lastLoad) {
  const start = typeof firstLoad === 'string' && firstLoad.trim() ? firstLoad.trim() : '';
  const end = typeof lastLoad === 'string' && lastLoad.trim() ? lastLoad.trim() : '';
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} onward`;
  if (end) return `Until ${end}`;
  return 'Not recorded';
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (error) {
    return date.toISOString();
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleRouteSearch(query) {
  if (!routeFinderState) return;
  const trimmed = (query || '').trim();
  if (!trimmed) {
    focusRouteById('', { updateDropdown: false });
    renderRouteDetails(null);
    return;
  }

  const lower = trimmed.toLowerCase();
  const match = routeFinderState.routes.find(route =>
    route.nameLower.includes(lower) || route.cityLower.includes(lower) || route.provinceLower.includes(lower),
  );

  if (match) {
    focusRouteById(match.routeId, { fit: true, updateDropdown: true });
    if (routeFinderState.dropdown) {
      routeFinderState.dropdown.value = match.routeId;
    }
  } else {
    renderRouteDetails(null, { message: `No routes found for “${trimmed}”.` });
    if (routeFinderState.dropdown) {
      routeFinderState.dropdown.value = '';
    }
    if (routeFinderState.infoWindow) {
      routeFinderState.infoWindow.close();
    }
    highlightRoutes('');
  }
}

function setupAdminRouteFinder(map) {
  if (!map) return;

  if (!adminRouteFinderState) {
    adminRouteFinderState = {
      map,
      markers: new Map(),
      driverStatus: document.querySelector('[data-driver-status]'),
      driverEnableButton: document.querySelector('[data-driver-enable]'),
      driverRefreshButton: document.querySelector('[data-driver-refresh]'),
      driverFeedback: document.querySelector('[data-driver-feedback]'),
      driverSummary: document.querySelector('[data-driver-summary]'),
      driverLastUpdate: document.querySelector('[data-driver-last-update]'),
      driverPosition: document.querySelector('[data-driver-position]'),
      ownerStatus: document.querySelector('[data-owner-status]'),
      ownerFeedback: document.querySelector('[data-owner-feedback]'),
      ownerList: document.querySelector('[data-owner-taxi-list]'),
      ownerEmpty: document.querySelector('[data-owner-empty]'),
    };
  } else {
    adminRouteFinderState.map = map;
  }

  if (!adminRouteFinderState.markers) {
    adminRouteFinderState.markers = new Map();
  }

  attachAdminEventListeners();
  renderAdminDriverSection();
  renderAdminOwnerSection();
  updateAdminMarkers();
  fitAdminMapToEntities();
  repositionMapControls(map.getDiv());
}

function attachAdminEventListeners() {
  if (!adminRouteFinderState) return;
  const { driverEnableButton, driverRefreshButton } = adminRouteFinderState;

  if (driverEnableButton && !driverEnableButton.dataset.adminBound) {
    driverEnableButton.addEventListener('click', handleDriverEnableToggle);
    driverEnableButton.dataset.adminBound = 'true';
  }

  if (driverRefreshButton && !driverRefreshButton.dataset.adminBound) {
    driverRefreshButton.addEventListener('click', handleDriverRefresh);
    driverRefreshButton.dataset.adminBound = 'true';
  }
}

function renderAdminDriverSection() {
  if (!adminRouteFinderState) return;
  const {
    driverStatus,
    driverEnableButton,
    driverRefreshButton,
    driverSummary,
    driverLastUpdate,
    driverPosition,
  } = adminRouteFinderState;

  const profile = getDriverProfile();

  if (!profile) {
    if (driverStatus) {
    driverStatus.textContent = 'Register as a taxi manager to manage live visibility here.';
    }
    if (driverEnableButton) {
      driverEnableButton.disabled = true;
      driverEnableButton.textContent = 'Enable live location';
    }
    if (driverRefreshButton) {
      driverRefreshButton.disabled = true;
    }
    if (driverSummary) {
      driverSummary.hidden = true;
    }
    return;
  }

  if (driverStatus) {
    driverStatus.textContent = profile.sharingEnabled
      ? `${profile.name || 'Taxi manager'} is broadcasting a live location. Refresh to capture the latest point.`
      : `${profile.name || 'Taxi manager'} is registered but live location is disabled.`;
  }

  if (driverEnableButton) {
    driverEnableButton.disabled = false;
    driverEnableButton.textContent = profile.sharingEnabled ? 'Disable live location' : 'Enable live location';
  }

  if (driverRefreshButton) {
    driverRefreshButton.disabled = !profile.sharingEnabled;
  }

  if (driverSummary) {
    const hasLocation =
      profile.sharingEnabled &&
      profile.lastKnownLocation &&
      Number.isFinite(profile.lastKnownLocation.lat) &&
      Number.isFinite(profile.lastKnownLocation.lng);
    driverSummary.hidden = !hasLocation;
    if (hasLocation) {
      if (driverLastUpdate) {
        driverLastUpdate.textContent = formatRelativeTimestamp(profile.lastKnownLocation.timestamp);
      }
      if (driverPosition) {
        driverPosition.textContent = formatLocationSummary(profile.lastKnownLocation);
      }
    }
  }
}

function handleDriverEnableToggle() {
  if (!adminRouteFinderState) return;
  const { driverFeedback } = adminRouteFinderState;
  const profile = getDriverProfile();
  if (!profile) {
    if (driverFeedback) {
      driverFeedback.textContent = 'No taxi manager registration found. Submit the manager form first.';
      driverFeedback.classList.add('error');
    }
    return;
  }

  if (driverFeedback) {
    driverFeedback.classList.remove('error');
    driverFeedback.textContent = profile.sharingEnabled
      ? 'Disabling live location...'
      : 'Requesting your current position...';
  }

  const action = profile.sharingEnabled ? disableDriverLiveLocation() : enableDriverLiveLocation();
  action
    .then(updated => {
      if (driverFeedback) {
        driverFeedback.textContent = updated.sharingEnabled
          ? 'Live location enabled. Refresh it any time to keep dispatchers informed.'
          : 'Live location disabled.';
        driverFeedback.classList.remove('error');
      }
    })
    .catch(error => {
      if (driverFeedback) {
        driverFeedback.textContent = error.message || 'Unable to update driver visibility.';
        driverFeedback.classList.add('error');
      }
    });
}

function handleDriverRefresh() {
  if (!adminRouteFinderState) return;
  const { driverFeedback } = adminRouteFinderState;
  if (driverFeedback) {
    driverFeedback.textContent = 'Refreshing driver location...';
    driverFeedback.classList.remove('error');
  }

  refreshDriverLocation()
    .then(() => {
      if (driverFeedback) {
        driverFeedback.textContent = 'Driver location refreshed.';
        driverFeedback.classList.remove('error');
      }
    })
    .catch(error => {
      if (driverFeedback) {
        driverFeedback.textContent = error.message || 'Unable to refresh driver location.';
        driverFeedback.classList.add('error');
      }
    });
}

function renderAdminOwnerSection() {
  if (!adminRouteFinderState) return;
  const { ownerStatus, ownerFeedback, ownerList, ownerEmpty } = adminRouteFinderState;
  const profile = getOwnerProfile();

  if (!profile) {
    if (ownerStatus) {
      ownerStatus.textContent = 'Register as a taxi owner to capture your fleet and track live positions.';
    }
    if (ownerList) {
      ownerList.innerHTML = '';
      ownerList.hidden = true;
    }
    if (ownerEmpty) {
      ownerEmpty.hidden = false;
    }
    if (ownerFeedback) {
      ownerFeedback.textContent = '';
      ownerFeedback.classList.remove('error');
    }
    return;
  }

  const total = Array.isArray(profile.taxis) ? profile.taxis.length : 0;
  if (ownerStatus) {
    ownerStatus.textContent =
      total > 0
        ? `${profile.name || 'Taxi owner'} has ${total} taxi${total === 1 ? '' : 's'} registered.`
        : `${profile.name || 'Taxi owner'} has no taxis captured yet.`;
  }

  if (ownerList) {
    ownerList.innerHTML = '';
    if (total > 0) {
      ownerList.hidden = false;
      profile.taxis.forEach(taxi => {
        const card = document.createElement('article');
        card.className = 'admin-taxi';

        const title = document.createElement('h3');
        title.textContent = taxi.name || 'Taxi';
        card.appendChild(title);

        const meta = document.createElement('p');
        meta.className = 'admin-taxi__meta';
        meta.textContent = taxi.registration ? `Fleet: ${taxi.registration}` : 'Registration not provided';
        card.appendChild(meta);

        const location = document.createElement('p');
        location.className = 'admin-taxi__location';
        const summary = formatLocationSummary(taxi.lastKnownLocation);
        if (taxi.lastKnownLocation && Number.isFinite(taxi.lastKnownLocation.timestamp)) {
          location.textContent = `${summary} • ${formatRelativeTimestamp(taxi.lastKnownLocation.timestamp)}`;
        } else {
          location.textContent = summary;
        }
        card.appendChild(location);

        const actions = document.createElement('div');
        actions.className = 'admin-taxi__actions';
        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.className = 'cta';
        updateButton.textContent = 'Update location';
        updateButton.addEventListener('click', () => handleOwnerTaxiUpdate(taxi.id));
        actions.appendChild(updateButton);
        card.appendChild(actions);

        ownerList.appendChild(card);
      });
    } else {
      ownerList.hidden = true;
    }
  }

  if (ownerEmpty) {
    ownerEmpty.hidden = total > 0;
  }

  if (ownerFeedback && !ownerFeedback.textContent) {
    ownerFeedback.classList.remove('error');
  }
}

function handleOwnerTaxiUpdate(taxiId) {
  if (!adminRouteFinderState) return;
  const { ownerFeedback } = adminRouteFinderState;
  if (ownerFeedback) {
    ownerFeedback.textContent = 'Capturing taxi location...';
    ownerFeedback.classList.remove('error');
  }

  updateOwnerTaxiLocation(taxiId)
    .then(taxi => {
      if (ownerFeedback) {
        ownerFeedback.textContent = `${taxi.name || 'Taxi'} location updated.`;
        ownerFeedback.classList.remove('error');
      }
    })
    .catch(error => {
      if (ownerFeedback) {
        ownerFeedback.textContent = error.message || 'Unable to update taxi location.';
        ownerFeedback.classList.add('error');
      }
    });
}

function updateAdminMarkers() {
  if (!adminRouteFinderState || !adminRouteFinderState.map || !window.google || !window.google.maps) return;
  if (!adminRouteFinderState.markers) {
    adminRouteFinderState.markers = new Map();
  }

  adminRouteFinderState.markers.forEach(marker => marker.setMap(null));
  adminRouteFinderState.markers.clear();

  const map = adminRouteFinderState.map;

  const driverProfile = getDriverProfile();
  if (driverProfile && driverProfile.sharingEnabled && driverProfile.lastKnownLocation) {
    const { lat, lng } = driverProfile.lastKnownLocation;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const driverMarker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: `${driverProfile.name || 'Taxi manager'} (live)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#2563eb',
          fillOpacity: 0.9,
          strokeColor: '#1d4ed8',
          strokeWeight: 2,
        },
      });
      adminRouteFinderState.markers.set('driver', driverMarker);
    }
  }

  const ownerProfile = getOwnerProfile();
  if (ownerProfile && Array.isArray(ownerProfile.taxis)) {
    ownerProfile.taxis.forEach(taxi => {
      if (!taxi.lastKnownLocation) return;
      const { lat, lng } = taxi.lastKnownLocation;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const taxiMarker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: `${taxi.name || 'Taxi'}${taxi.registration ? ` (${taxi.registration})` : ''}`.trim(),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#f59e0b',
          fillOpacity: 0.9,
          strokeColor: '#b45309',
          strokeWeight: 2,
        },
      });
      adminRouteFinderState.markers.set(`taxi-${taxi.id}`, taxiMarker);
    });
  }
}

function fitAdminMapToEntities() {
  if (!adminRouteFinderState || !adminRouteFinderState.map || !adminRouteFinderState.markers) return;
  const markers = Array.from(adminRouteFinderState.markers.values()).filter(marker => !!marker.getPosition);
  if (!markers.length) return;

  const bounds = new google.maps.LatLngBounds();
  markers.forEach(marker => {
    const position = marker.getPosition();
    if (position) {
      bounds.extend(position);
    }
  });

  if (!bounds.isEmpty()) {
    try {
      adminRouteFinderState.map.fitBounds(bounds, getRouteFitPadding());
    } catch (error) {
      console.warn('Unable to fit admin map to markers', error);
    }
  }
}

function getRouteMidpoint(route) {
  const path = getRoutePath(route);
  if (!Array.isArray(path) || path.length === 0) return null;
  const index = Math.floor(path.length / 2);
  const point = path[index];
  return point ? { lat: point.lat, lng: point.lng } : null;
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? Number(value).toFixed(5) : 'n/a';
}

document.addEventListener('DOMContentLoaded', init);
