/**
 * The grafana plugin's settings card, rendered with plain elements so the
 * external bundle does not need the in-repo UI primitives barrel (whose
 * markdown/KaTeX assets an external build cannot resolve). Layout mirrors the
 * shared SettingsForm: one field per row, hint under the control, a footer
 * with discard/save. Writes go through the same ConfigForms mutation contract.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GrafanaCardFace } from './grafana-card-controller'
import type { GrafanaSettingsLocaleKey } from './locales'

/** Locale reader face the renderer binds for slot entries with a locale. */
type LocaleReader = (key: GrafanaSettingsLocaleKey) => string

/** Props the renderer binds for the grafana page. */
export type GrafanaCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.grafana'>
  & InjectFace<GrafanaCardFace>

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 0',
  borderTop: '0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
}
const headStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, margin: 0 }
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
  background: 'transparent',
  color: 'inherit',
}
const hintStyle: React.CSSProperties = { fontSize: 12, opacity: 0.65, margin: 0 }
const badgeStyle: React.CSSProperties = { fontSize: 11, opacity: 0.7 }
const footerStyle: React.CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 0' }
const buttonStyle: React.CSSProperties = {
  padding: '5px 14px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}

function FieldRow(props: {
  label: string
  hint: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div style={rowStyle}>
      <div style={headStyle}>
        <p style={labelStyle}>{props.label}</p>
        {props.badge !== undefined && <span style={badgeStyle}>{props.badge}</span>}
      </div>
      {props.children}
      <p style={hintStyle}>{props.hint}</p>
    </div>
  )
}

/**
 * Render the grafana plugin's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function GrafanaCard(props: GrafanaCardProps) {
  const { t } = props as { t: LocaleReader }
  const state = props.useGrafanaCard(snapshot => snapshot)
  if (props.view === 'summary') return t('description')
  if (!state.available) return <p style={hintStyle}>{t('unavailable')}</p>

  const disabled = !state.writable || state.saving
  return (
    <div>
      <FieldRow label={t('url')} hint={t('urlHint')} badge={state.url.overridden ? t('overridden') : undefined}>
        <input
          aria-label={t('url')}
          disabled={disabled}
          style={inputStyle}
          value={state.url.text}
          onChange={event => { props.edit('url', event.target.value) }}
        />
      </FieldRow>
      <FieldRow label={t('token')} hint={t('tokenHint')} badge={state.tokenConfigured ? t('tokenSet') : t('tokenUnset')}>
        <input
          aria-label={t('token')}
          autoComplete="off"
          disabled={disabled}
          placeholder={state.tokenConfigured ? '••••••••' : ''}
          style={inputStyle}
          type="password"
          value={state.token.text}
          onChange={event => { props.edit('token', event.target.value) }}
        />
      </FieldRow>
      <FieldRow label={t('timeoutMs')} hint={t('timeoutMsHint')} badge={state.timeoutMs.overridden ? t('overridden') : undefined}>
        <input
          aria-label={t('timeoutMs')}
          disabled={disabled}
          inputMode="numeric"
          style={{ ...inputStyle, borderColor: state.timeoutMs.invalid ? 'var(--dsw-alias-danger, #d33)' : undefined }}
          value={state.timeoutMs.text}
          onChange={event => { props.edit('timeoutMs', event.target.value) }}
        />
      </FieldRow>
      <div style={footerStyle}>
        {state.failed && <span style={{ ...hintStyle, alignSelf: 'center' }}>{t('saveFailed')}</span>}
        <button disabled={!state.dirty || state.saving} style={buttonStyle} onClick={props.discard}>{t('reset')}</button>
        <button
          disabled={!state.dirty || state.invalid || disabled}
          style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary, rgba(90,120,255,0.9))', color: '#fff' }}
          onClick={props.save}
        >
          {state.saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}
