/** Compatibility shim providing the removed `settingsScope` service. */
import { Service } from '@deepseek-ai/cordis'

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

export class SettingsScopeBinder extends Service {
  constructor(ctx, config) {
    super(ctx, 'settingsScope', config)
  }

  bind(spec) {
    return new ScopeController(this.ctx, spec.namespace)
  }

  describe() {
    return {
      getSnapshot: () => ({ status: 'ready', view: { writable: false, namespaces: [] } }),
      subscribe: () => () => {},
      ensure: () => Promise.resolve(),
    }
  }
}

export function apply(ctx, config) {
  new SettingsScopeBinder(ctx, config)
}

export default SettingsScopeBinder
