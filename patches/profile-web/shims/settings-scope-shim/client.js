/**
 * Browser half of dsh-settings-scope-shim: re-provide the `settingsScope`
 * service that ui-settings dropped from the Client face in 0.1.7, so plugin
 * cards (dsh-loop-continue, @opencode2dsh/dsh-plugin) can activate.
 *
 * Closure-factory bundle (`window.__ModuleLoader__.load`) — the only shape
 * the client module system accepts. Reads and writes ride `ctx.remote.settings`
 * on the providing fiber; the Host half of this package keeps its own service
 * on the Host Cordis context.
 */
window.__ModuleLoader__.load({
  id: 'dsh-settings-scope-shim',
  factory: (require) => {
    /** One namespace's remote-backed view (same contract as the Host shim). */
    class ScopeController {
      #namespace
      #ctx
      #value = {}
      #revision = 0
      #listeners = new Set()
      #writable = false

      constructor(ctx, namespace) {
        this.#ctx = ctx
        this.#namespace = namespace
        void this.#load()
      }

      async #load() {
        try {
          const remote = this.#ctx.remote
          if (!remote?.settings?.describe) return
          const result = await remote.settings.describe()
          if (!result?.ok) return
          const ns = this.#namespace
          const view = result.value.namespaces?.find(n => n.ns === ns)
          if (view) {
            this.#value = view.value ?? {}
            this.#revision = view.revision ?? 0
            this.#writable = result.value.writable ?? false
            this.#notify()
          }
        } catch {
          /* remote unavailable; defaults remain */
        }
      }

      #notify() {
        for (const l of this.#listeners) {
          try { l() } catch { /* listener error contained */ }
        }
      }

      getSnapshot() {
        return {
          status: 'ready',
          value: this.#value,
          base: undefined,
          user: this.#value,
          revision: this.#revision,
          writable: this.#writable,
          mode: 'host',
        }
      }

      subscribe(listener) {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
      }

      async set(field, value) {
        return this.#mutate([{ op: 'set', path: [field], value }])
      }

      async unset(field) {
        return this.#mutate([{ op: 'unset', path: [field] }])
      }

      async #mutate(ops) {
        try {
          const remote = this.#ctx.remote
          if (!remote?.settings?.mutate) return false
          const ns = this.#namespace
          const rev = this.#revision
          const result = await remote.settings.mutate(ns, ops, rev)
          if (result?.ok) {
            this.#value = result.value.value ?? this.#value
            this.#revision = result.value.revision ?? this.#revision
            this.#notify()
            return true
          }
          return false
        } catch {
          return false
        }
      }
    }

    /** Required services: the Remote namespace every scope reads and writes through. */
    const inject = ['remote', 'remote.settings']

    /**
     * Provide `settingsScope` on the Client Cordis context.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      const binder = {
        bind(spec) {
          return new ScopeController(ctx, spec.namespace)
        },
        describe() {
          return {
            getSnapshot: () => ({ status: 'ready', view: { writable: false, namespaces: [] } }),
            subscribe: () => () => {},
            ensure: () => Promise.resolve(),
          }
        },
      }
      ctx.provide('settingsScope', binder)
    }

    return { apply, name: 'dsh-settings-scope-shim', inject }
  },
})
