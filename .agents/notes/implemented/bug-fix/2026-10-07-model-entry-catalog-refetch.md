# Agent Note: Refetch the model catalog when a model entry opens

Status: implemented

English | [中文](2026-10-07-model-entry-catalog-refetch.zh.md)

## Problem

`ModelCatalogDirectory` loaded one catalog per Host generation and refetched only on forwarded `llm/adapters-updated`, `settings/document-updated`, and credential events, or on a connection reset. Provider model lists change without any of those events: the opencode2dsh adapter refetches its Zen list every five minutes, and the Host's `session/modelCatalog` rebuilds from it on each call, so the Host-side answer is always current while the browser keeps the first response. Both entries read through `load()`, which returns the ready cache, so a model added upstream appears in the picker only after a reload or an unrelated settings edit.

## Decision

Opening either entry refetches. The `/model` option builder and the composer seat's `load` callback both call `ModelDirectory.reload()`, which delegates to `ModelCatalogDirectory.reload()`: invalidate the cached result and load, joining a load that is already running so simultaneous opens share one request. A failed open-time refetch keeps the last loaded groups with the error on the store — the popup keeps listing those rows and the seat shows its inline error — and rejects only when no catalog has ever loaded, where the popup shell's error and retry have nothing to render. `load()` also treats a value older than `CATALOG_FRESH_MS` (five minutes) as stale and refetches, so a read outside the open path ages out on its own. The forwarded-event refresh path is unchanged.

## Alternatives considered

**A Host-pushed event.** The opencode2dsh adapter's `onRefresh` could emit a new forwarded event that both entries subscribe to. It updates lists without user interaction, but it crosses the profile-web patch, the remote event table, the forwarding docs, and both SDK projections for one picker, and it still needs the open-path fallback for the gap before the first refresh. Deferred until a second consumer needs push updates.

**Timer-driven client polling.** A periodic refetch in the client refreshes lists nobody is looking at and contradicts the event-driven design the package README records. The freshness horizon in `load()` bounds staleness without a timer.

**Freshness horizon alone.** A five-minute horizon still shows an up-to-five-minute-old list at the moment the user opens the entry to pick from it, which is the complaint that motivated the change.

## Consequences

Each `/model` or seat open costs one catalog RPC, and concurrent opens share it through the single-flight load. When a refetch fails after a catalog has loaded once, the entries degrade to the retained groups instead of the popup's error shell, so a transient Host failure no longer blanks the picker. The horizon is a module constant rather than a cordis.yml field: the browser half has no configuration surface, and the value is a presentation freshness bound, not a deployment choice.

## Testing

`tests/catalog.client.spec.ts` pins the freshness horizon with a faked clock (cached inside it, refetched past it) and the reload join. `tests/browser-plugin.client.spec.ts` pins an open-time refetch for both entries with no Host event, the retained groups and store error on a failed refetch, and the rejection when nothing has loaded yet.
