import { describe, expect, it } from 'vitest'
import { assertCatalogParity, catalogKeys, createStaticTranslator, createTranslator, operationMessage, type MessageKey } from '../../src/client/i18n.ts'

describe('first-party message catalog', () => {
  it('keeps the zh and en key sets in parity', () => {
    expect(() => assertCatalogParity()).not.toThrow()
    expect(new Set(catalogKeys('zh'))).toEqual(new Set(catalogKeys('en')))
  })

  it('renders representative English labels and formatted messages', () => {
    const t = createStaticTranslator('en')
    expect(t('common.activate')).toBe('Enable')
    expect(t('common.pin')).toBe('Pin')
    expect(t('common.unpin')).toBe('Unpin')
    expect(t('common.pinned')).toBe('Pinned')
    expect(t('common.currentDsh', { version: '0.1.0' })).toBe('Current DSH 0.1.0')
    expect(t('compatibility.incompatible', { version: '0.1.0', range: '^2.0.0' })).toContain('outside')
    expect(t('common.durationMinutes', { minutes: 2, seconds: 7 })).toBe('2 min 7 sec')
  })

  it('localizes typed and legacy operation status while preserving unknown diagnostics', () => {
    const t = createStaticTranslator('en')
    expect(operationMessage({ message: '正在等待其他皮肤操作完成' }, t)).toBe('Waiting for another skin operation to finish')
    expect(operationMessage({ message: '下载并检查安装包', messageKey: 'common.stepDownloadInspect' }, t)).toBe('Download and inspect the install package file')
    expect(operationMessage({ messageKey: 'server.restartBlockedByOperations', messageParams: { count: 2 } }, t)).toContain('2 skin operation(s)')
    expect(operationMessage({ messageKey: 'common.dshComponentDisabled' }, t)).toContain('Choose Use')
    const diagnostic = 'RAW_DIAGNOSTIC_MARKER /private/profile\nline 2'
    expect(operationMessage({ message: diagnostic }, t)).toBe(diagnostic)
  })

  it('supports a third-language dry run with English fallback', () => {
    const partialFrench: Partial<Record<MessageKey, string>> = {
      'common.activate': 'Activer',
      'common.currentDsh': 'DSH actuel {version}',
      'common.operationWaitingOther': 'Attente d’une autre opération de skin',
    }
    const t = createTranslator(key => partialFrench[key as MessageKey] ?? key, 'en')
    expect(t('common.activate')).toBe('Activer')
    expect(t('common.currentDsh', { version: '0.1.0' })).toBe('DSH actuel 0.1.0')
    expect(t('common.durationSeconds', { count: 4 })).toBe('4 seconds')
    expect(operationMessage({ messageKey: 'common.operationWaitingOther' }, t)).toBe('Attente d’une autre opération de skin')
  })
})
