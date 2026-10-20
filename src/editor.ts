import * as vscode from 'vscode';
import { BuilderState, buildExpression, parseExpression } from './builder';
import { describe } from './cron';

export interface EditTarget {
  uri: vscode.Uri;
  range: vscode.Range;
  expression: string;
}

let current: vscode.WebviewPanel | undefined;

const use24HourTimeFormat = () =>
  vscode.workspace.getConfiguration('cronDescribe').get<boolean>('use24HourTime', false);

const check = (state: BuilderState): { expression: string } & ({ description: string } | { error: string }) => {
  const expression = buildExpression(state);
  if (state.preset === 'weekly' && !state.weekdays.length) return { expression, error: 'pick at least one day' };
  return { expression, ...describe(expression, { use24HourTimeFormat: use24HourTimeFormat() }) };
};

const preview = (state: BuilderState) => ({ type: 'preview', ...check(state) });

/** The target's range, or wherever the expression moved to on its line since the hover. */
const locate = (document: vscode.TextDocument, target: EditTarget): vscode.Range | undefined => {
  if (document.getText(target.range) === target.expression) return target.range;
  if (target.range.start.line >= document.lineCount) return undefined;
  const line = document.lineAt(target.range.start.line).text;
  const index = line.indexOf(target.expression);
  if (index === -1) return undefined;
  return new vscode.Range(target.range.start.line, index, target.range.start.line, index + target.expression.length);
};

const apply = async (target: EditTarget, expression: string): Promise<boolean> => {
  const document = await vscode.workspace.openTextDocument(target.uri);
  const range = locate(document, target);
  if (!range) {
    vscode.window.showErrorMessage(`Couldn't find "${target.expression}" in the file any more; it may have been edited.`);
    return false;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(target.uri, range, expression);
  return vscode.workspace.applyEdit(edit);
};

export const openEditor = (target: EditTarget) => {
  current?.dispose();
  const panel = vscode.window.createWebviewPanel('cronDescribe.editor', 'Edit cron', vscode.ViewColumn.Beside, {
    enableScripts: true,
  });
  current = panel;
  panel.onDidDispose(() => {
    if (current === panel) current = undefined;
  });

  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  panel.webview.html = html(panel.webview, nonce);

  panel.webview.onDidReceiveMessage(async (message: { type: string; state?: BuilderState }) => {
    if (message.type === 'ready') {
      const state = parseExpression(target.expression);
      panel.webview.postMessage({ type: 'init', state, original: target.expression });
      panel.webview.postMessage(preview(state));
    } else if (message.type === 'change' && message.state) {
      panel.webview.postMessage(preview(message.state));
    } else if (message.type === 'apply' && message.state) {
      const result = check(message.state);
      if ('error' in result) return;
      if (await apply(target, result.expression)) panel.dispose();
    } else if (message.type === 'cancel') {
      panel.dispose();
    }
  });
};

const html = (webview: vscode.Webview, nonce: string) => /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 20px; max-width: 520px; }
  h2 { font-weight: 600; margin: 0 0 4px; }
  .original { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
  label.row { display: block; margin: 14px 0 6px; font-weight: 600; }
  select, input[type=number], input[type=time], input[type=text] {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; font: inherit;
  }
  input[type=text] { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips label { display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); cursor: pointer; }
  .hidden { display: none; }
  .result { margin-top: 24px; padding: 12px; border-radius: 4px; background: var(--vscode-textBlockQuote-background); }
  .result code { font-family: var(--vscode-editor-font-family); font-size: 1.1em; }
  .error { color: var(--vscode-errorForeground); }
  .actions { margin-top: 16px; display: flex; gap: 8px; }
  button { font: inherit; padding: 5px 14px; border: none; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
</head>
<body>
  <h2>Edit cron</h2>
  <div class="original">Currently <code id="original"></code></div>

  <label class="row" for="preset">Runs</label>
  <select id="preset">
    <option value="everyMinute">Every minute</option>
    <option value="everyNMinutes">Every N minutes</option>
    <option value="hourly">Every hour</option>
    <option value="daily">Every day</option>
    <option value="weekly">Every week</option>
    <option value="monthly">Every month</option>
    <option value="yearly">Every year</option>
    <option value="custom">Custom expression</option>
  </select>

  <div data-for="everyNMinutes">
    <label class="row" for="interval">Every</label>
    <input id="interval" type="number" min="1" max="59"> minutes
  </div>

  <div data-for="hourly">
    <label class="row" for="minute">At minute</label>
    <input id="minute" type="number" min="0" max="59"> past the hour
  </div>

  <div data-for="weekly">
    <label class="row">On</label>
    <div class="chips" id="weekdays"></div>
  </div>

  <div data-for="yearly">
    <label class="row" for="month">Month</label>
    <select id="month"></select>
  </div>

  <div data-for="monthly yearly">
    <label class="row" for="dayOfMonth">Day of month</label>
    <select id="dayOfMonth"></select>
  </div>

  <div data-for="daily weekly monthly yearly">
    <label class="row" for="time">At</label>
    <input id="time" type="time">
  </div>

  <div data-for="custom">
    <label class="row" for="custom">Expression</label>
    <input id="custom" type="text" spellcheck="false">
  </div>

  <div class="result">
    <div><code id="expression"></code></div>
    <div id="description"></div>
  </div>

  <div class="actions">
    <button id="apply">Apply</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = (n) => String(n).padStart(2, '0');
  let state;

  // Monday-first, like most calendars.
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    $('weekdays').insertAdjacentHTML('beforeend', '<label><input type="checkbox" value="' + d + '">' + DAYS[d] + '</label>');
  }
  MONTHS.forEach((name, i) => $('month').add(new Option(name, i + 1)));
  for (let d = 1; d <= 31; d++) $('dayOfMonth').add(new Option(d, d));

  const render = () => {
    $('preset').value = state.preset;
    $('interval').value = state.interval;
    $('minute').value = state.minute;
    $('time').value = pad(state.hour) + ':' + pad(state.minute);
    $('month').value = state.month;
    $('dayOfMonth').value = state.dayOfMonth;
    $('custom').value = state.custom;
    for (const box of $('weekdays').querySelectorAll('input')) box.checked = state.weekdays.includes(Number(box.value));
    for (const el of document.querySelectorAll('[data-for]')) {
      el.classList.toggle('hidden', !el.dataset.for.split(' ').includes(state.preset));
    }
  };

  const clamp = (value, min, max, fallback) => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
  };

  const read = () => {
    const [h, m] = ($('time').value || '').split(':');
    const preset = $('preset').value;
    state = {
      ...state,
      preset,
      interval: clamp($('interval').value, 1, 59, state.interval),
      minute: preset === 'hourly' ? clamp($('minute').value, 0, 59, state.minute) : clamp(m, 0, 59, state.minute),
      hour: clamp(h, 0, 23, state.hour),
      weekdays: [...$('weekdays').querySelectorAll('input:checked')].map((box) => Number(box.value)),
      month: Number($('month').value),
      dayOfMonth: Number($('dayOfMonth').value),
      custom: $('custom').value,
    };
    render();
    vscode.postMessage({ type: 'change', state });
  };

  document.body.addEventListener('input', (e) => { if (e.target.id !== 'custom') read(); });
  // Don't re-render the custom box on each keystroke, or the cursor jumps to the end.
  $('custom').addEventListener('input', () => {
    state = { ...state, custom: $('custom').value };
    vscode.postMessage({ type: 'change', state });
  });
  // Switching to custom starts from whatever the form currently builds.
  $('preset').addEventListener('change', () => {
    if ($('preset').value === 'custom') { state.custom = $('expression').textContent; render(); }
  });
  $('apply').addEventListener('click', () => vscode.postMessage({ type: 'apply', state }));
  $('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));

  window.addEventListener('message', ({ data }) => {
    if (data.type === 'init') {
      state = data.state;
      $('original').textContent = data.original;
      render();
    } else if (data.type === 'preview') {
      $('expression').textContent = data.expression;
      $('description').textContent = data.description ?? '⚠️ Invalid — ' + data.error;
      $('description').classList.toggle('error', !data.description);
      $('apply').disabled = !data.description;
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
