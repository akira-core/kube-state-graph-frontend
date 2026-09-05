import type { ThemeTokens } from './tokens';

const VAR_PREFIX = '--ksg-';

export function flattenTokenKeys(value: unknown, prefix: string[] = []): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix.join('.')];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.flatMap(([key, child]) => flattenTokenKeys(child, [...prefix, key]));
}

export function tokenPathToCssVar(tokenPath: string): string {
  return `${VAR_PREFIX}${tokenPath.replaceAll('.', '-')}`;
}

export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of flattenTokenKeys(tokens)) {
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc !== null && typeof acc === 'object' && !Array.isArray(acc) && part in acc) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, tokens);
    if (typeof value === 'string') {
      out[tokenPathToCssVar(key)] = value;
    }
  }
  return out;
}

export function cssVarsBlock(selector: string, tokens: ThemeTokens): string {
  const vars = tokensToCssVars(tokens);
  const decls = Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  return `${selector}{${decls}}`;
}

const STYLE_ID = 'ksg-theme-vars';

export function injectThemeCssVars(light: ThemeTokens, dark: ThemeTokens): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (el === null) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `${cssVarsBlock(':root', light)}${cssVarsBlock('.dark', dark)}`;
  return el;
}
