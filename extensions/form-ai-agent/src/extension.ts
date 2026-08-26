import * as vscode from 'vscode';

type ProviderId = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'nvidia' | 'openrouter' | 'ollama' | 'llamacpp' | 'lmstudio' | 'custom';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const endpoints: Record<Exclude<ProviderId, 'custom'>, string> = {
	anthropic: 'https://api.anthropic.com/v1/messages',
	openai: 'https://api.openai.com/v1/chat/completions',
	google: 'https://generativelanguage.googleapis.com/v1beta',
	deepseek: 'https://api.deepseek.com/v1/chat/completions',
	nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
	openrouter: 'https://openrouter.ai/api/v1/chat/completions',
	ollama: 'http://localhost:11434/api/chat',
	llamacpp: 'http://localhost:8080/v1/chat/completions',
	lmstudio: 'http://localhost:1234/v1/chat/completions'
};

export function activate(context: vscode.ExtensionContext): void {
	const agent = new FormAgent(context.secrets);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('formAiAgent.chat', new FormAgentView(agent)));
	context.subscriptions.push(vscode.commands.registerCommand('formAiAgent.configureProvider', () => configure(agent)));
	context.subscriptions.push(vscode.commands.registerCommand('formAiAgent.clearApiKey', () => agent.clearKey()));
}

class FormAgent {
	constructor(private readonly secrets: vscode.SecretStorage) { }
	async configure(provider: ProviderId, key?: string): Promise<void> { if (key) { await this.secrets.store(`form-ai-agent.${provider}.key`, key); } }
	async clearKey(): Promise<void> { const provider = this.provider; await this.secrets.delete(`form-ai-agent.${provider}.key`); void vscode.window.showInformationMessage(`Cleared the ${provider} API key.`); }
	get provider(): ProviderId { return vscode.workspace.getConfiguration('formAiAgent').get<ProviderId>('provider', 'openai'); }
	get model(): string { return vscode.workspace.getConfiguration('formAiAgent').get<string>('model', 'gpt-4.1-mini'); }
	async ask(prompt: string): Promise<string> {
		const provider = this.provider; const config = vscode.workspace.getConfiguration('formAiAgent');
		const endpoint = provider === 'custom' ? config.get<string>('customEndpoint', '') : endpoints[provider];
		if (!endpoint) { throw new Error('Set Form AI Agent: Custom Endpoint before sending a message.'); }
		const local = ['ollama', 'llamacpp', 'lmstudio'].includes(provider); const key = local ? undefined : await this.secrets.get(`form-ai-agent.${provider}.key`);
		if (!local && !key) { throw new Error(`No ${provider} API key is saved. Run “Form AI Agent: Configure Provider”.`); }
		const response = await fetch(provider === 'google' ? `${endpoint}/models/${this.model}:generateContent?key=${encodeURIComponent(key!)}` : endpoint, requestFor(provider, this.model, prompt, key));
		if (!response.ok) { throw new Error(`${provider} returned ${response.status}: ${await response.text()}`); }
		return textFrom(provider, await response.json() as Record<string, unknown>);
	}
}

function requestFor(provider: ProviderId, model: string, prompt: string, key?: string): RequestInit {
	if (provider === 'anthropic') return { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }) };
	if (provider === 'google') return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) };
	if (provider === 'ollama') return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }] }) };
	return { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }) };
}

function textFrom(provider: ProviderId, body: Record<string, any>): string {
	if (provider === 'anthropic') return body.content?.[0]?.text ?? '';
	if (provider === 'google') return body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
	if (provider === 'ollama') return body.message?.content ?? '';
	return body.choices?.[0]?.message?.content ?? '';
}

async function configure(agent: FormAgent): Promise<void> {
	const provider = await vscode.window.showQuickPick<ProviderId>(Object.keys(endpoints).concat('custom') as ProviderId[], { placeHolder: 'Choose an AI provider' });
	if (!provider) return; await vscode.workspace.getConfiguration('formAiAgent').update('provider', provider, vscode.ConfigurationTarget.Global);
	if (provider === 'custom') { const endpoint = await vscode.window.showInputBox({ prompt: 'OpenAI-compatible base chat-completions URL' }); if (endpoint) await vscode.workspace.getConfiguration('formAiAgent').update('customEndpoint', endpoint, vscode.ConfigurationTarget.Global); }
	if (!['ollama', 'llamacpp', 'lmstudio'].includes(provider)) { const key = await vscode.window.showInputBox({ prompt: `${provider} API key`, password: true, ignoreFocusOut: true }); await agent.configure(provider, key); }
}

class FormAgentView implements vscode.WebviewViewProvider {
	constructor(private readonly agent: FormAgent) { }
	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = { enableScripts: true };
		view.webview.html = `<!doctype html><html><body><h2>FORM AI</h2><p>Provider: <b>${this.agent.provider}</b> · Model: <b>${this.agent.model}</b></p><main id="chat"></main><form><textarea placeholder="Ask Form anything" required></textarea><button>Send</button></form><script>const v=acquireVsCodeApi(),f=document.querySelector('form'),t=document.querySelector('textarea'),c=document.querySelector('#chat');f.onsubmit=e=>{e.preventDefault();c.innerHTML+='<p class="user">'+t.value.replace(/</g,'&lt;')+'</p>';v.postMessage({type:'ask',prompt:t.value});t.value=''};addEventListener('message',e=>{const x=e.data;c.innerHTML+='<p class="assistant">'+(x.error?'Error: '+x.error:x.text).replace(/</g,'&lt;')+'</p>'})</script><style>body{font:13px system-ui;color:var(--vscode-foreground)}h2{letter-spacing:2px}textarea{width:100%;min-height:90px;background:var(--vscode-input-background);color:inherit;border:1px solid var(--vscode-input-border);padding:8px}.user,.assistant{padding:9px;border-radius:6px;white-space:pre-wrap}.user{background:var(--vscode-textBlockQuote-background)}.assistant{background:var(--vscode-editor-inactiveSelectionBackground)}button{margin-top:8px;padding:6px 12px}</style></body></html>`;
		view.webview.onDidReceiveMessage(async ({ type, prompt }) => { if (type !== 'ask') return; try { view.webview.postMessage({ text: await this.agent.ask(String(prompt)) }); } catch (error) { view.webview.postMessage({ error: error instanceof Error ? error.message : String(error) }); } });
	}
}
