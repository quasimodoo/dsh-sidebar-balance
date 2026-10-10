/**
 * Client half of the sidebar balance bundle.
 *
 * Renders the signed-in DeepSeek account balance into the sidebar's bottom
 * `sidebar.footer.action` seat, directly above the account launcher. The value
 * comes from the same Application Remote the Account settings page uses, so it
 * always matches 设置 → 账号与余额.
 *
 * While no balance is available the row shows a short reason code, so a failed
 * read is visible in the UI instead of only in the browser console.
 *
 * The Loader id must equal the package name exactly: the browser module system
 * only hangs the factory on the row whose specifier matches.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-sidebar-balance',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'sidebar-balance';
    /**
     * Slow heartbeat backing up the focus refresh. The Account page does not poll
     * at all and a balance only moves on spend or top-up, so this stays coarse.
     */
    const REFRESH_MS = 5 * 60 * 1000;
    /** Skip a focus refresh that arrives soon after the previous read. */
    const MIN_GAP_MS = 15 * 1000;
    /**
     * Fallback client identity for account calls.
     *
     * Compiled DSH bundles inline `DSH_CLIENT_VERSION`; a plain-JS plugin cannot,
     * so this constant is updated with each DSH upgrade and
     * {@link clientVersion} prefers the global injected by the running shell.
     */
    const CLIENT_VERSION = '0.2.0-rc.2';
    /** Shown in place of an amount while no balance is available. */
    const PLACEHOLDER = '\u2014';

    const CSS = [
      '.sbb-root{box-sizing:border-box;display:flex;align-items:baseline;gap:6px;width:100%;min-width:0;padding:5px 12px;font-family:var(--dsw-font-family);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.sbb-label{flex:none;color:var(--dsw-alias-label-tertiary)}',
      '.sbb-amount{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.sbb-bonus{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.sbb-root[data-ready="false"] .sbb-amount{color:var(--dsw-alias-label-tertiary)}',
      '.sbb-root[data-wide="false"]{justify-content:center;width:auto;padding:5px 0}',
      '.sbb-root[data-wide="false"] .sbb-amount{margin-left:0;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.sbb-root[data-wide="false"] .sbb-bonus{display:none}',
    ].join('');

    /**
     * Format a balance with Platform Web's two-decimal and sub-cent rules.
     * @param raw - decimal balance string from the Host.
     * @param currency - ISO currency code, such as CNY or USD.
     * @returns currency text with grouped digits.
     */
    function formatAmount(raw, currency) {
      const symbol = currency === 'CNY' ? '\u00a5' : currency === 'USD' ? '$' : '';
      const value = Number(raw);
      if (!Number.isFinite(value)) return symbol + String(raw);
      const abs = Math.abs(value);
      if (abs === 0) return symbol + '0.00';
      if (abs < 0.01) return '<' + symbol + '0.01';
      const cents = Math.trunc(abs * 100) / 100;
      const text = cents.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return (value < 0 ? '-' : '') + symbol + text;
    }

    /** Client identity carried by account calls, preferring the running build. */
    function clientVersion() {
      const injected = globalThis.DSH_CLIENT_VERSION;
      if (typeof injected === 'string' && injected !== '') return injected;
      const boot = globalThis.__DSH_BOOT__;
      const fromBoot = boot && typeof boot.clientVersion === 'string' ? boot.clientVersion : '';
      return fromBoot !== '' ? fromBoot : CLIENT_VERSION;
    }

    /** Request identity the account Remote methods carry. */
    function requestMetadata() {
      const language = (navigator.language || 'en').toLowerCase();
      return {
        version: clientVersion(),
        locale: language.startsWith('zh') ? 'zh' : 'en',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      };
    }

    /** Render a refusal or failure short enough for the sidebar row. */
    function describe(result) {
      if (!result) return 'no-result';
      const error = result.error;
      if (error === undefined || error === null) return 'not-ok';
      if (typeof error === 'string') return error.slice(0, 60);
      const code = error.code ?? error.name;
      const message = error.message ?? error.detail;
      const text = [code, message].filter(Boolean).join(' ');
      if (text) return text.slice(0, 60);
      try {
        return JSON.stringify(error).slice(0, 60);
      } catch (_error) {
        return 'not-ok';
      }
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        /** Row and tooltip copy; the Plugin Manager card reads locale/*.json instead. */
        ctx.effect(
          () => ctx.locale.register(NS, {
            zh: {
              label: '余额',
              'tooltip.breakdown': '充值余额 {recharge} · 赠金余额 {bonus} · 合计余额 {total}',
              'tooltip.only': '余额 {recharge}',
              'error.title': '余额读取失败：{reason}',
            },
            en: {
              label: 'Balance',
              'tooltip.breakdown': 'Recharge {recharge} · Bonus {bonus} · Total {total}',
              'tooltip.only': 'Balance {recharge}',
              'error.title': 'Balance unavailable: {reason}',
            },
          }),
          'sidebar-balance: dictionary',
        );

        /** Bound translator for this plugin's namespace. */
        const t = ctx.locale.bind(NS);

        /** Translate a key, keeping the key itself when no dictionary answers. */
        function translate(key, options) {
          try {
            const text = t(key, options);
            return typeof text === 'string' && text !== '' ? text : key;
          } catch (_error) {
            return key;
          }
        }

        /** Attempt one access path to the account namespace service. */
        function tryAccount(read, label, attempts) {
          try {
            const candidate = read();
            if (candidate && typeof candidate.getBalance === 'function') return candidate;
            attempts.push(label + ':none');
          } catch (_error) {
            attempts.push(label + ':threw');
          }
          return null;
        }

        /**
         * Resolve the `remote.account` namespace service.
         *
         * Each Remote namespace is its own Cordis service keyed `remote.<namespace>`
         * (api-gateway `remoteServiceKey`), not a property of the base `remote`
         * service, so the ctx proxy path comes first and the literal service name
         * is the fallback. The base-service path is the documented trap: it throws
         * on access instead of returning undefined.
         */
        function resolveAccount() {
          const attempts = [];
          const account = tryAccount(() => ctx.remote.account, 'proxy', attempts)
            || tryAccount(() => ctx.get('remote.account'), 'named', attempts);
          if (account) return account;
          console.info('[sidebar-balance] remote.account unresolved: ' + attempts.join('+'));
          return null;
        }

        /** List a few own property names of a value, for diagnostics. */
        function keysOf(value) {
          try {
            if (!value || typeof value !== 'object') return typeof value;
            const names = Object.getOwnPropertyNames(value);
            return names.length === 0 ? 'empty' : names.slice(0, 8).join(',');
          } catch (_error) {
            return 'keys-threw';
          }
        }

        /**
         * Unwrap the recharge-wallet list from a balance outcome.
         *
         * Platform answers `get_user_summary` with `{ normal_wallets, bonus_wallets }`,
         * and the Host field reader can hand back either that payload or its parsed
         * `{ status, value, bonusWallets }` wrapper, so accept both.
         * @param value - the balance outcome carried by the Remote result.
         * @returns the wallet array, or null when the shape is unknown.
         */
        function normalizeWallets(value) {
          if (Array.isArray(value)) return value;
          if (!value || typeof value !== 'object') return null;
          for (const key of ['normal_wallets', 'value', 'wallets', 'normalWallets']) {
            if (Array.isArray(value[key])) return value[key];
          }
          return null;
        }

        /**
         * Unwrap the granted-bonus wallet list from a balance outcome.
         * @param value - the balance outcome carried by the Remote result.
         * @returns the bonus wallet array; empty when the outcome carries none.
         */
        function normalizeBonuses(value) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          for (const key of ['bonusWallets', 'bonus_wallets']) {
            if (Array.isArray(value[key])) return value[key];
          }
          return [];
        }

        /** Read one currency's amount from a wallet list, defaulting to zero. */
        function walletAmount(list, currency) {
          if (!Array.isArray(list) || currency === null) return 0;
          const found = list.find((wallet) => wallet && wallet.currency === currency);
          const value = found ? Number(found.balance) : 0;
          return Number.isFinite(value) ? value : 0;
        }

        /** Sidebar footer readout of the signed-in account's balance. */
        function BalanceWidget(props) {
          const wide = props.wide !== false;
          const [balance, setBalance] = React.useState(null);
          const [diag, setDiag] = React.useState('loading');

          React.useEffect(() => {
            let alive = true;
            let lastReadAt = 0;
            const load = async (force) => {
              const now = Date.now();
              if (force !== true && now - lastReadAt < MIN_GAP_MS) return;
              lastReadAt = now;
              try {
                if (alive) setDiag('resolving');
                const account = resolveAccount();
                if (!account) {
                  if (alive) setDiag('no-account');
                  return;
                }
                if (alive) setDiag('calling');
                const result = await account.getBalance(requestMetadata());
                if (!alive) return;
                if (!result || result.ok !== true) {
                  setDiag(describe(result));
                  console.info('[sidebar-balance] balance read refused', result);
                  return;
                }
                if (result.value === null || result.value === undefined) {
                  setDiag('null-value');
                  return;
                }
                if (!Array.isArray(result.value)) {
                  const wallets = normalizeWallets(result.value);
                  if (wallets === null) {
                    const status = result.value && result.value.status;
                    setDiag(status ? 'status:' + status : 'shape:' + keysOf(result.value));
                    return;
                  }
                  setBalance({ wallets, bonuses: normalizeBonuses(result.value) });
                  setDiag(null);
                  return;
                }
                setBalance({ wallets: result.value, bonuses: [] });
                setDiag(null);
              } catch (error) {
                if (!alive) return;
                setDiag('threw:' + String(error && error.message ? error.message : error).slice(0, 50));
                console.info('[sidebar-balance] balance read failed', error);
              }
            };
            load(true);
            const timer = setInterval(() => load(false), REFRESH_MS);
            const onFocus = () => load(false);
            window.addEventListener('focus', onFocus);
            return () => {
              alive = false;
              clearInterval(timer);
              window.removeEventListener('focus', onFocus);
            };
          }, []);

          const label = translate('label');
          const wallets = balance ? balance.wallets : null;
          const bonuses = balance ? balance.bonuses : [];
          const currency = wallets && wallets.length > 0
            ? wallets[0].currency
            : (bonuses.length > 0 ? bonuses[0].currency : null);
          const ready = currency !== null;
          const total = walletAmount(wallets, currency);
          const bonus = walletAmount(bonuses, currency);
          const text = ready ? formatAmount(total, currency) : PLACEHOLDER;
          const bonusText = ready && bonus >= 0.01 ? '+' + formatAmount(bonus, currency) : null;
          const tooltip = ready
            ? (bonusText === null
              ? translate('tooltip.only', { recharge: text })
              : translate('tooltip.breakdown', {
                recharge: text,
                bonus: formatAmount(bonus, currency),
                total: formatAmount(total + bonus, currency),
              }))
            : translate('error.title', { reason: String(diag) });
          return h(
            React.Fragment,
            null,
            h('style', { key: 'sbb-style' }, CSS),
            h(
              'div',
              {
                className: 'sbb-root',
                'data-wide': String(wide),
                'data-ready': String(ready),
                title: tooltip,
              },
              wide ? h('span', { className: 'sbb-label' }, label) : null,
              h('span', { className: 'sbb-amount' }, text),
              bonusText === null ? null : h('span', { className: 'sbb-bonus' }, bonusText),
            ),
          );
        }

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'sidebar-balance',
          order: 10,
          locale: NS,
        }, BalanceWidget));
      },
    };
  },
});
