(() => {
    const profileMenu = document.querySelector('.customer-profile-menu');
    const profileTrigger = document.querySelector('.customer-profile-trigger');
    const profileDropdown = document.querySelector('#customer-profile-dropdown');

    if (profileMenu && profileTrigger && profileDropdown) {
        const hideProfileDropdown = () => {
            if (!profileMenu.classList.contains('is-open')) {
                profileDropdown.hidden = true;
            }
        };

        const setProfileOpen = (open) => {
            profileTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');

            if (open) {
                profileDropdown.hidden = false;
                window.requestAnimationFrame(() => {
                    profileMenu.classList.add('is-open');
                });
                return;
            }

            if (!profileMenu.classList.contains('is-open')) {
                return;
            }

            profileMenu.classList.remove('is-open');
            profileDropdown.addEventListener('transitionend', hideProfileDropdown, { once: true });
            window.setTimeout(hideProfileDropdown, 220);
        };

        profileTrigger.addEventListener('click', (event) => {
            event.stopPropagation();
            setProfileOpen(!profileMenu.classList.contains('is-open'));
        });

        document.addEventListener('click', (event) => {
            if (!profileMenu.contains(event.target)) {
                setProfileOpen(false);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && profileMenu.classList.contains('is-open')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                setProfileOpen(false);
                profileTrigger.focus();
            }
        });
    }

    const root = document.documentElement;
    const toggle = document.querySelector('.customer-nav-toggle');
    const sidebar = document.querySelector('#customer-sidebar');
    const overlay = document.querySelector('.customer-nav-overlay');
    const closeButton = document.querySelector('.customer-nav-close');
    const workspace = document.querySelector('.customer-workspace');
    const desktopQuery = window.matchMedia('(min-width: 981px)');

    if (!toggle || !sidebar || !overlay || !closeButton) {
        return;
    }

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const isDesktop = () => desktopQuery.matches;
    const isOpen = () => document.body.classList.contains('customer-nav-open');

    const focusableItems = () => [...sidebar.querySelectorAll(focusableSelector)].filter((item) => {
        return item.getClientRects().length > 0;
    });

    const setInert = (locked) => {
        if (workspace && 'inert' in workspace) {
            workspace.inert = locked;
        }

        if ('inert' in sidebar) {
            sidebar.inert = !isDesktop() && !locked;
        }
    };

    const closeMenu = (restoreFocus) => {
        document.body.classList.remove('customer-nav-open');
        root.classList.remove('customer-nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        overlay.setAttribute('aria-hidden', 'true');
        setInert(false);

        if (!isDesktop()) {
            sidebar.setAttribute('aria-hidden', 'true');
        } else {
            sidebar.removeAttribute('aria-hidden');
        }

        if (restoreFocus) {
            toggle.focus();
        }
    };

    const openMenu = () => {
        if (isDesktop()) {
            return;
        }

        document.body.classList.add('customer-nav-open');
        root.classList.add('customer-nav-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        sidebar.setAttribute('aria-label', sidebar.getAttribute('data-menu-label') || 'Customer menu');
        sidebar.removeAttribute('aria-hidden');
        overlay.setAttribute('aria-hidden', 'false');
        setInert(true);
        closeButton.focus();
    };

    const syncToViewport = () => {
        if (isDesktop()) {
            document.body.classList.remove('customer-nav-open');
            root.classList.remove('customer-nav-open');
            toggle.setAttribute('aria-expanded', 'false');
            sidebar.removeAttribute('role');
            sidebar.removeAttribute('aria-modal');
            sidebar.removeAttribute('aria-hidden');
            overlay.setAttribute('aria-hidden', 'true');
            setInert(false);
            return;
        }

        if (!isOpen()) {
            sidebar.setAttribute('aria-hidden', 'true');
            if ('inert' in sidebar) {
                sidebar.inert = true;
            }
        }
    };

    toggle.addEventListener('click', () => {
        if (isOpen()) {
            closeMenu(false);
            return;
        }

        openMenu();
    });

    closeButton.addEventListener('click', () => closeMenu(true));
    overlay.addEventListener('click', () => closeMenu(true));

    sidebar.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => closeMenu(false));
    });

    document.addEventListener('keydown', (event) => {
        if (!isOpen()) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu(true);
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const items = focusableItems();
        if (!items.length) {
            event.preventDefault();
            closeButton.focus();
            return;
        }

        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    if (typeof desktopQuery.addEventListener === 'function') {
        desktopQuery.addEventListener('change', syncToViewport);
    } else if (typeof desktopQuery.addListener === 'function') {
        desktopQuery.addListener(syncToViewport);
    }

    syncToViewport();
})();
