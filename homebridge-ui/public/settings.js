/**
 * The settings page's form, as Synology Monitor's: the devices, each a name,
 * an IP address and how it is in HomeKit, and below them the General settings with the link
 * to the dashboard under its switch.
 *
 * Drawn here from the config as Homebridge has it, rather than with
 * Homebridge's generated form, which is kept hidden. Changes go to Homebridge
 * as they are made (`updatePluginConfig`) and are saved with the Save button
 * of the settings window. Only what differs from the default is written, so
 * the config stays as short as a hand-written one.
 */
(function (root) {
  'use strict';

  const PLATFORM = 'ConnectionMonitor';
  /** As DEFAULTS in src/config.ts; a test keeps them the same. */
  const DEFAULTS = { stepSeconds: 60, pings: 20, port: 8584, rawDays: 30, keepDays: 730 };
  /** How a device is in HomeKit, as Appliance Monitor's Running; as SHOWN in src/config.ts. */
  const SHOWN = [
    ['occupancy', 'Occupancy sensor — occupied while it answers'],
    ['switch', 'Switch — on while it answers'],
    ['outlet', 'Outlet — on while it answers'],
    ['none', 'Not in HomeKit — still on the dashboard'],
  ];

  const css = `
  .cm-section { margin-bottom: 1.25rem; }
  .cm-section > h6 { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; opacity: .65; margin-bottom: .5rem; }
  .cm-row { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: .5rem; align-items: center; margin-bottom: .5rem; }
  .cm-row select { min-width: 14rem; }
  @media (max-width: 640px) { .cm-row { grid-template-columns: 1fr 1fr auto; } .cm-row select { grid-column: 1 / 3; } }
  .cm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .75rem 1rem; }
  .cm-help { font-size: .78rem; opacity: .65; margin-top: .2rem; }
  .cm-error { font-size: .78rem; color: #d64545; margin-top: .2rem; }
  .cm-section input::placeholder { font-style: italic; opacity: .45; }
  details.cm-more > summary { cursor: pointer; font-size: .85rem; opacity: .8; margin-bottom: .75rem; }
  `;

  /** A tiny element builder: el('div', { class: 'x' }, child, 'text'). */
  function el(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }
      if (key.startsWith('on')) {
        element.addEventListener(key.slice(2), value);
      } else if (key === 'class') {
        element.className = value;
      } else if (value === true) {
        element.setAttribute(key, '');
      } else {
        element.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat()) {
      if (child !== undefined && child !== null && child !== false) {
        element.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    }
    return element;
  }

  /** Sets a key, or removes it when the value is the default or empty. */
  function setOrDrop(object, key, value, fallback) {
    if (value === undefined || value === null || value === '' || value === fallback) {
      delete object[key];
    } else {
      object[key] = value;
    }
  }

  /** A whole number from a field, or undefined for an empty one or anything else. */
  const wholeOrUndefined = (text) => {
    const trimmed = String(text).trim();
    const value = Number(trimmed);
    return trimmed !== '' && Number.isInteger(value) ? value : undefined;
  };

  /** Mounts the form in `container`; `address` is this machine's, for the dashboard link. */
  async function mount(container, { homebridge, address }) {
    const configs = await homebridge.getPluginConfig();
    if (!configs.length) {
      configs.push({ platform: PLATFORM, name: 'Connection Monitor', targets: [] });
    }
    const config = configs[0];
    // A name, an address and how it is in HomeKit per device: what else an earlier version saved is
    // dropped, a tick box for the sensor unticked kept as not in HomeKit.
    const shownAs = (target) => (SHOWN.some(([key]) => key === target.homekit) ? target.homekit : target.sensor === false ? 'none' : 'occupancy');
    config.targets = (Array.isArray(config.targets) ? config.targets : [])
      .filter((target) => target && typeof target === 'object')
      .map((target) => {
        const homekit = shownAs(target);
        return { name: String(target.name ?? ''), host: String(target.host ?? ''), ...(homekit !== 'occupancy' ? { homekit } : {}) };
      });
    let pending;

    /** Hands the config to Homebridge, a moment after the last change. */
    function changed() {
      clearTimeout(pending);
      pending = setTimeout(() => {
        pending = undefined;
        // Rows nobody filled in are not saved.
        const saved = { ...config, targets: config.targets.filter((target) => target.name.trim() || target.host.trim()) };
        void homebridge.updatePluginConfig([saved, ...configs.slice(1)]);
      }, 250);
    }

    /** Sets or drops a key as setOrDrop does, and hands the change on. */
    function put(object, key, value, fallback) {
      setOrDrop(object, key, value, fallback);
      changed();
    }

    function field(label, input, help) {
      return el('div', {}, el('label', { class: 'form-label mb-1' }, label), input, help ? el('div', { class: 'cm-help' }, help) : null);
    }

    function text(value, placeholder, onInput) {
      return el('input', {
        class: 'form-control form-control-sm', type: 'text', value: value ?? '', placeholder, autocomplete: 'off',
        oninput: (e) => onInput(e.target.value, e.target),
      });
    }

    function number(value, placeholder, onInput) {
      return el('input', {
        class: 'form-control form-control-sm', type: 'number', min: 1, step: 1, inputmode: 'numeric',
        value: value ?? '', placeholder, oninput: (e) => onInput(e.target.value),
      });
    }

    function render() {
      container.replaceChildren(devices(), general());
    }

    function devices() {
      const names = (target) => config.targets.filter((other) => other !== target && other.name.trim() === target.name.trim()).length;
      const rows = config.targets.map((target, index) => {
        const error = el('div', { class: 'cm-error', hidden: true });
        const check = () => {
          const message = !target.name.trim() && target.host.trim() ? 'A name is needed.'
            : target.name.trim() && !target.host.trim() ? 'An IP address is needed.'
            : names(target) ? 'Another device has this name.' : '';
          error.textContent = message;
          error.hidden = !message;
        };
        check();
        return el('div', {},
          el('div', { class: 'cm-row' },
            text(target.name, 'Router', (value) => { target.name = value; check(); changed(); }),
            text(target.host, '192.168.1.1', (value) => { target.host = value.trim(); check(); changed(); }),
            el('select', {
              class: 'form-select form-select-sm', 'aria-label': `${target.name || 'Device'} in HomeKit`,
              onchange: (e) => { setOrDrop(target, 'homekit', e.target.value, 'occupancy'); changed(); },
            }, SHOWN.map(([key, label]) => el('option', { value: key, selected: key === (target.homekit ?? 'occupancy') }, label))),
            el('button', {
              type: 'button', class: 'btn btn-sm btn-outline-danger', title: `Delete ${target.name}`,
              onclick: () => { config.targets.splice(index, 1); changed(); render(); },
            }, '×')),
          error);
      });
      return el('div', { class: 'cm-section' },
        el('h6', {}, 'Devices'),
        config.targets.length
          ? el('div', { class: 'cm-row' }, el('div', { class: 'cm-help' }, 'Name'), el('div', { class: 'cm-help' }, 'IP address'), el('div', { class: 'cm-help' }, 'In HomeKit'), el('span'))
          : el('p', { class: 'text-muted' }, 'No devices yet. Add each with a name and its IP address.'),
        rows,
        el('button', {
          type: 'button', class: 'btn btn-primary btn-sm',
          onclick: () => {
            config.targets.push({ name: '', host: '' });
            render();
            container.querySelectorAll('.cm-row input')[2 * (config.targets.length - 1)]?.focus();
          },
        }, '+ Add'),
        el('div', { class: 'cm-help mt-2' }, 'Each is on the dashboard, its data kept by its name. In HomeKit it is occupied or on while it answers pings, off once a whole round went unanswered. Changing how replaces it in HomeKit, with its automations.'));
    }

    /** The dashboard's address while it is switched on: this machine's, or the one the Homebridge UI was opened with. */
    const dashboardLink = el('div', { class: 'cm-help' });
    function showDashboardLink() {
      const port = Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535 ? config.port : DEFAULTS.port;
      const host = address || window.location.hostname;
      const url = host && `http://${host}:${port}/`;
      dashboardLink.replaceChildren(...(config.dashboard !== false && url ? [el('a', { href: url, target: '_blank', rel: 'noopener' }, url)] : []));
    }

    function general() {
      showDashboardLink();
      return el('details', { class: 'cm-more cm-section mt-4', open: true },
        el('summary', {}, 'General'),
        el('div', { class: 'cm-grid' },
          el('div', {},
            el('div', { class: 'form-check' },
              el('input', {
                class: 'form-check-input', type: 'checkbox', id: 'cm-dashboard', checked: config.dashboard !== false,
                onchange: (e) => { put(config, 'dashboard', e.target.checked, true); showDashboardLink(); },
              }),
              el('label', { class: 'form-check-label', for: 'cm-dashboard' }, 'Dashboard')),
            el('div', { class: 'cm-help' }, 'Latency and loss of each device, without login.'),
            dashboardLink),
          field('Dashboard port', number(config.port, String(DEFAULTS.port), (value) => {
            put(config, 'port', wholeOrUndefined(value), DEFAULTS.port);
            showDashboardLink();
          }))),
        el('div', { class: 'cm-grid mt-3' },
          field('Round every (s)', number(config.stepSeconds, String(DEFAULTS.stepSeconds),
            (value) => put(config, 'stepSeconds', wholeOrUndefined(value), DEFAULTS.stepSeconds)),
          'A device is not occupied once a whole round went unanswered.'),
          field('Pings per round', number(config.pings, String(DEFAULTS.pings),
            (value) => put(config, 'pings', wholeOrUndefined(value), DEFAULTS.pings)))),
        el('div', { class: 'cm-grid mt-3' },
          field('Rounds kept (days)', number(config.rawDays, String(DEFAULTS.rawDays),
            (value) => put(config, 'rawDays', wholeOrUndefined(value), DEFAULTS.rawDays)), 'As measured; then folded into their hour.'),
          field('Hours kept (days)', number(config.keepDays, String(DEFAULTS.keepDays),
            (value) => put(config, 'keepDays', wholeOrUndefined(value), DEFAULTS.keepDays)))));
    }

    render();
    // What an earlier version saved beside the name and address is dropped as the page opens.
    changed();
  }

  root.ConnectionSettings = { css, mount, DEFAULTS, SHOWN };
})(window);
