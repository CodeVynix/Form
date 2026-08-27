/**
 * form-agent-panel — built-in extension.
 * Registers the Agent webview and diff Accept/Reject commands.
 * All orchestration is delegated to the OpenCode backend; this is a thin view.
 */
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AgentViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('form.agentPanel', provider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('form.agent.acceptDiff', async (patch: string, targetUri: string) => {
      // Apply patch via workspace edit — explicit user acceptance required.
      const uri = vscode.Uri.parse(targetUri);
      const doc = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), patch);
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage('Form Agent: diff accepted');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('form.agent.rejectDiff', () => {
      vscode.window.showInformationMessage('Form Agent: diff rejected');
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('form.agent.openSettings', () => {
      vscode.commands.executeCommand('workbench.view.extension.formAgent');
    })
  );
}

class AgentViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}
  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = getHtml(view.webview, this.extensionUri);
  }
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = String(Date.now());
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
<style>body{font-family:var(--vscode-font-family);padding:10px;color:var(--vscode-foreground)} .pill{font-size:11px;padding:2px 6px;background:var(--vscode-badge-background);border-radius:10px}</style></head>
<body>
  <p>Form Agent — powered by OpenCode</p>
  <p style="font-size:12px;opacity:.7">This view is hosted by Electron's workspace shell in the scaffold build. In the full Code-OSS build it renders as a workbench webview with chat, model picker, and diff preview (Accept/Reject). See <code>src/workbench/workspace.html</code>.</p>
  <p><span class="pill">Open VSX</span> <span class="pill">BYOK</span> <span class="pill">Local Ollama</span></p>
  <script nonce="${nonce}">console.log('Form Agent webview ready');</script>
</body></html>`;
}

export function deactivate(): void {}
