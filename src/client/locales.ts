/** Locale bundles for the grafana plugin's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type GrafanaSettingsLocaleKey =
  | 'title' | 'description'
  | 'url' | 'urlHint'
  | 'token' | 'tokenHint' | 'tokenSet' | 'tokenUnset'
  | 'timeoutMs' | 'timeoutMsHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<GrafanaSettingsLocaleKey, string> = {
  title: 'Grafana',
  description: 'Connect the Grafana tools to your instance.',
  url: 'Grafana URL',
  urlHint: 'Base address, e.g. http://localhost:3000. Required before the tools work.',
  token: 'Service account token',
  tokenHint: 'Bearer token (glsa_…). Leave blank to keep the current one; blank uses anonymous access when none is stored.',
  tokenSet: 'A token is configured.',
  tokenUnset: 'No token is configured; requests go out unauthenticated.',
  timeoutMs: 'Request timeout (ms)',
  timeoutMsHint: 'How long one Grafana API request may take before it is aborted.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<GrafanaSettingsLocaleKey, string> = {
  title: 'Grafana',
  description: '把 Grafana 工具连接到你的实例。',
  url: 'Grafana 地址',
  urlHint: '基地址，如 http://localhost:3000。未填写时工具不可用。',
  token: '服务账号 token',
  tokenHint: 'Bearer token（glsa_…）。留空保持当前值；从未存储过时以匿名方式访问。',
  tokenSet: '已配置 token。',
  tokenUnset: '未配置 token；请求将以未认证方式发出。',
  timeoutMs: '请求超时（毫秒）',
  timeoutMsHint: '一次 Grafana API 请求最多等待多久。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: GrafanaSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
