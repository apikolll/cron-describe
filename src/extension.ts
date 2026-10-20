import * as vscode from 'vscode';
import { findCronExpressions } from './cron';
import { EditTarget, openEditor } from './editor';

interface EditArgs {
  uri: string;
  line: number;
  start: number;
  end: number;
  expression: string;
}

const use24HourTimeFormat = () =>
  vscode.workspace.getConfiguration('cronDescribe').get<boolean>('use24HourTime', false);

/** The cron expression under the cursor in the active editor, for running the command from the palette. */
const targetAtCursor = (): EditTarget | undefined => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const { line, character } = editor.selection.active;
  const match = findCronExpressions(editor.document.lineAt(line).text).find(
    (m) => character >= m.start && character <= m.end,
  );
  if (!match) return undefined;
  return {
    uri: editor.document.uri,
    range: new vscode.Range(line, match.start, line, match.end),
    expression: match.expression,
  };
};

export function activate(context: vscode.ExtensionContext) {
  const provider: vscode.HoverProvider = {
    provideHover(document, position) {
      const line = document.lineAt(position.line).text;
      const match = findCronExpressions(line, { use24HourTimeFormat: use24HourTimeFormat() }).find(
        (m) => position.character >= m.start && position.character <= m.end,
      );
      if (!match) return undefined;

      const args: EditArgs = {
        uri: document.uri.toString(),
        line: position.line,
        start: match.start,
        end: match.end,
        expression: match.expression,
      };
      const editLink = `command:cronDescribe.edit?${encodeURIComponent(JSON.stringify([args]))}`;

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = { enabledCommands: ['cronDescribe.edit'] };
      markdown.appendMarkdown(
        match.description ? `**Cron:** ${match.description}` : `**Cron:** ⚠️ Invalid — ${match.error}`,
      );
      markdown.appendMarkdown(`\n\n[✏️ Edit](${editLink} "Pick the time, days and months")`);
      return new vscode.Hover(markdown, new vscode.Range(position.line, match.start, position.line, match.end));
    },
  };

  context.subscriptions.push(
    vscode.languages.registerHoverProvider([{ scheme: 'file' }, { scheme: 'untitled' }], provider),
    vscode.commands.registerCommand('cronDescribe.edit', (args?: EditArgs) => {
      const target = args
        ? {
            uri: vscode.Uri.parse(args.uri),
            range: new vscode.Range(args.line, args.start, args.line, args.end),
            expression: args.expression,
          }
        : targetAtCursor();
      if (!target) {
        vscode.window.showInformationMessage('Put the cursor on a cron expression to edit it.');
        return;
      }
      openEditor(target);
    }),
  );
}

export function deactivate() {}
