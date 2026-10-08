/** One Host-generation model catalog shared by every Session selector. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ModelCatalog, ModelSelection, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** How long a loaded catalog counts as fresh; `load()` refetches a value this old. */
const CATALOG_FRESH_MS = 300_000

/** Observable lifecycle of the shared model catalog. */
export interface ModelCatalogState {
  value: ModelCatalog | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

/** Loads at most one model catalog for the current Host generation. */
export class ModelCatalogDirectory {
  /** Current shared catalog value and load lifecycle. */
  readonly store: SnapshotStore<ModelCatalogState> = createSnapshotStore({
    value: null,
    status: 'idle',
    error: null,
  })

  private readonly reasoning = new Map<string, ModelProviderGroup['models'][number]['reasoning']>()

  /**
   * Read the last advertised reasoning metadata, including unavailable models.
   * @param selection - provider and model whose effort is displayed.
   * @returns reasoning metadata observed during this Host generation.
   */
  reasoningFor(selection: ModelSelection): ModelProviderGroup['models'][number]['reasoning'] {
    return this.reasoning.get(JSON.stringify([selection.provider, selection.model]))
  }

  private generation = 0
  private inflight: Promise<ModelCatalog> | undefined
  private loadedAt = 0

  /**
   * @param ctx - the providing plugin's context, whose `remote.session`
   * namespace carries the Host-generation catalog.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Return the current generation's catalog, sharing its one in-flight load.
   * A value older than the freshness horizon refetches instead of returning.
   * @returns the loaded global catalog.
   */
  load(): Promise<ModelCatalog> {
    const state = this.store.getSnapshot()
    if (state.status === 'ready' && state.value !== null && Date.now() - this.loadedAt < CATALOG_FRESH_MS) {
      return Promise.resolve(state.value)
    }
    if (this.inflight !== undefined) return this.inflight
    const generation = this.generation
    this.store.update((draft) => {
      draft.status = 'loading'
      draft.error = null
    })
    const operation = this.ctx.remote.session.modelCatalog().then((response) => {
      if (!response.ok) {
        throw new Error(`${response.error.code}: ${response.error.message}`)
      }
      if (generation === this.generation) {
        for (const group of response.value.groups) {
          for (const model of group.models) {
            this.reasoning.set(JSON.stringify([group.id, model.id]), model.reasoning)
          }
        }
        this.store.set({ value: response.value, status: 'ready', error: null })
        this.loadedAt = Date.now()
      }
      return response.value
    }).catch((error: unknown) => {
      if (generation === this.generation) {
        this.store.update((draft) => {
          draft.status = 'error'
          draft.error = error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }).finally(() => {
      if (generation === this.generation && this.inflight === operation) this.inflight = undefined
    })
    this.inflight = operation
    return operation
  }

  /**
   * Drop the cached result so the next `load()` refetches from the Host.
   * @param clear - whether values from the previous Host generation must be hidden.
   */
  private invalidate(clear = false): void {
    this.generation += 1
    this.inflight = undefined
    const value = clear ? null : this.store.getSnapshot().value
    this.store.set({ value, status: 'idle', error: null })
  }

  /**
   * Refetch the catalog from the Host, joining a load that is already running
   * instead of starting a second one. Used when a user opens a model entry,
   * where the freshly retrieved list matters more than the cached one.
   * @returns the refreshed global catalog.
   */
  async reload(): Promise<ModelCatalog> {
    if (this.inflight === undefined) this.invalidate()
    return this.load()
  }

  /** Invalidate and reload the catalog after a Host-side model input changes. */
  refresh(): void {
    this.invalidate()
    void this.load().catch(() => { /* the selector exposes the shared error */ })
  }

  /** Clear Host-specific values and load the replacement Host generation. */
  resetGeneration(): void {
    this.reasoning.clear()
    this.invalidate(true)
    void this.load().catch(() => { /* the selector exposes the shared error */ })
  }
}
