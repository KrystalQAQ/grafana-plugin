/**
 * The grafana plugin's settings page, browser half: the instance URL, the
 * request timeout, and the service-account token over the `grafana-plugin`
 * namespace the plugin itself registers. The page registers into the Plugins
 * page's `plugins.item` slot while the Host serves that namespace, so a
 * deployment without the plugin shows no trace of it.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { GrafanaCard } from './GrafanaCard'
import { GRAFANA_NS, GrafanaCardController } from './grafana-card-controller'
import { en, zh, type GrafanaSettingsLocaleKey } from './locales'

export type { GrafanaCardProps } from './GrafanaCard'
export type { GrafanaCardFace, GrafanaCardState, GrafanaSettings } from './grafana-card-controller'
export type { GrafanaSettingsLocaleKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Grafana settings page copy. */
    'settings.grafana': GrafanaSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.grafana'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'configForms']

/**
 * Mount the grafana settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'grafana-plugin.client: dictionaries')
  const card = new GrafanaCardController(ctx.configForms.get(GRAFANA_NS))
  ctx.effect(() => () => { card.dispose() }, 'grafana-plugin.client: form subscription')
  ctx.effect(() => ctx.configForms.whileServed([GRAFANA_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'grafana', order: 41, label: () => t('title'), locale: NS, inject: () => card.inject(),
  }, GrafanaCard))), 'grafana-plugin.client: page')
}
