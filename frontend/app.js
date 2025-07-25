document.addEventListener('DOMContentLoaded', () => {
	// --- Editor and File Tree Elements ---
	const fileTreeContainer = document.getElementById('file-tree');
	const editorContainer = document.getElementById('editor');
	const tabBarContainer = document.getElementById('tab-bar');
	const chatPanel = document.getElementById('chat-panel');
	const openDirectoryButton = document.createElement('button');
	openDirectoryButton.textContent = 'Open Project Folder';
	fileTreeContainer.before(openDirectoryButton);
	let editor;
	let rootDirectoryHandle = null;
	
	// --- Chat Elements ---
	const chatMessages = document.getElementById('chat-messages');
	const chatInput = document.getElementById('chat-input');
	const chatSendButton = document.getElementById('chat-send-button');
	const chatCancelButton = document.getElementById('chat-cancel-button');
	const modelSelector = document.getElementById('model-selector');
	const agentModeSelector = document.getElementById('agent-mode-selector');
	const apiKeysTextarea = document.getElementById('api-keys-textarea');
	const saveKeysButton = document.getElementById('save-keys-button');
	const thinkingIndicator = document.getElementById('thinking-indicator');
	const toggleFilesButton = document.getElementById('toggle-files-button');
	const imageUploadButton = document.getElementById('image-upload-button');
	const imageInput = document.getElementById('image-input');
	const imagePreviewContainer = document.getElementById(
	'image-preview-container',
	);
	const rateLimitSlider = document.getElementById('rate-limit-slider');
	const rateLimitInput = document.getElementById('rate-limit-input');
	
	// --- Tool Log Elements ---
	const toolLogContainer = document.getElementById('tool-log-container');
	const toolLogMessages = document.getElementById('tool-log-messages');
	const toolLogHeader = document.querySelector('.tool-log-header');
	// --- State for multimodal input ---
	let uploadedImage = null; // Will store { name, type, data }
	
	// --- Context Management Elements ---
	const viewContextButton = document.getElementById('view-context-button');
	const condenseContextButton = document.getElementById(
	'condense-context-button',
	);
	const clearContextButton = document.getElementById('clear-context-button');
	const contextModal = document.getElementById('context-modal');
	const contextDisplay = document.getElementById('context-display');
	const closeModalButton = contextModal.querySelector('.close-button');
	
	// --- Monaco Editor Initialization ---
	require.config({
		paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' },
	});
	
	
	require(['vs/editor/editor.main'], () => {
		monaco.editor.defineTheme('cfmlTheme', {
			base: 'vs-dark',
			inherit: true,
			rules: [
				// All html tokens get nice colors
				{ token: 'tag', foreground: '569cd6' },
				{ token: 'delimiter', foreground: 'd4d4d4' },
				{ token: 'attribute.name', foreground: '9cdcfe' },
				{ token: 'attribute.value', foreground: 'ce9178' },
				{ token: 'string', foreground: 'd69d85' },
				{ token: 'number', foreground: 'b5cea8' },
				{ token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
				// (If you want <cf*> tags extra visible, make ALL tags orange:)
				// { token: 'tag', foreground: 'd19a66', fontStyle: 'bold' },
			],
			colors: {
				'editor.foreground': '#D4D4D4',
				'editor.background': '#1E1E1E',
				'editor.lineHighlightBackground': '#2c313c',
				'editorCursor.foreground': '#528BFF',
				'editorWhitespace.foreground': '#3B4048',
				'editor.selectionBackground': '#264F78',
				'editor.inactiveSelectionBackground': '#3A3D41',
			},
		});
		
		monaco.editor.setTheme('cfmlTheme');
		
		editor = monaco.editor.create(editorContainer, {
			value: `<!-- Click \"Open Project Folder\" to start -->\n<cfoutput>#username#</cfoutput>\n<script>let a = 1;\nalert(a);</script>\n<style>body{color:red;}</style>`,
			language: 'html', // 👈 use 'html' here!
			theme: 'cfmlTheme',
			readOnly: true,
		});
	});
	
	
	
	
	// --- Prettier Worker ---
	const prettierWorker = new Worker('prettier.worker.js');
	// === IndexedDB Manager for API Keys                            ===
	// =================================================================
	const DbManager = {
		db: null,
		dbName: 'CodeEditorDB',
		stores: {
			keys: 'apiKeys',
			handles: 'fileHandles',
			codeIndex: 'codeIndex',
		},
		async openDb() {
			return new Promise((resolve, reject) => {
				if (this.db) return resolve(this.db);
				const request = indexedDB.open(this.dbName, 3); // Version 3 for new store
				request.onerror = () => reject('Error opening IndexedDB.');
				request.onsuccess = (event) => {
					this.db = event.target.result;
					resolve(this.db);
				};
				request.onupgradeneeded = (event) => {
					const db = event.target.result;
					if (!db.objectStoreNames.contains(this.stores.keys)) {
						db.createObjectStore(this.stores.keys, { keyPath: 'id' });
					}
					if (!db.objectStoreNames.contains(this.stores.handles)) {
						db.createObjectStore(this.stores.handles, { keyPath: 'id' });
					}
					if (!db.objectStoreNames.contains(this.stores.codeIndex)) {
						db.createObjectStore(this.stores.codeIndex, { keyPath: 'id' });
					}
				};
			});
		},
		async getKeys() {
			const db = await this.openDb();
			return new Promise((resolve) => {
				const request = db
				.transaction(this.stores.keys, 'readonly')
				.objectStore(this.stores.keys)
				.get('userApiKeys');
				request.onerror = () => resolve('');
				request.onsuccess = () =>
				resolve(request.result ? request.result.keys : '');
			});
		},
		async saveKeys(keysString) {
			const db = await this.openDb();
			return new Promise((resolve, reject) => {
				const request = db
				.transaction(this.stores.keys, 'readwrite')
				.objectStore(this.stores.keys)
				.put({ id: 'userApiKeys', keys: keysString });
				request.onerror = () => reject('Error saving keys.');
				request.onsuccess = () => resolve();
			});
		},
		async saveDirectoryHandle(handle) {
			const db = await this.openDb();
			return new Promise((resolve, reject) => {
				const request = db
				.transaction(this.stores.handles, 'readwrite')
				.objectStore(this.stores.handles)
				.put({ id: 'rootDirectory', handle });
				request.onerror = () => reject('Error saving directory handle.');
				request.onsuccess = () => resolve();
			});
		},
		async getDirectoryHandle() {
			const db = await this.openDb();
			return new Promise((resolve) => {
				const request = db
				.transaction(this.stores.handles, 'readonly')
				.objectStore(this.stores.handles)
				.get('rootDirectory');
				request.onerror = () => resolve(null);
				request.onsuccess = () =>
				resolve(request.result ? request.result.handle : null);
			});
		},
		async clearDirectoryHandle() {
			const db = await this.openDb();
			return new Promise((resolve, reject) => {
				const request = db
				.transaction(this.stores.handles, 'readwrite')
				.objectStore(this.stores.handles)
				.delete('rootDirectory');
				request.onerror = () => reject('Error clearing directory handle.');
				request.onsuccess = () => resolve();
			});
		},
		async saveCodeIndex(index) {
			const db = await this.openDb();
			return new Promise((resolve, reject) => {
				const request = db
				.transaction(this.stores.codeIndex, 'readwrite')
				.objectStore(this.stores.codeIndex)
				.put({ id: 'fullCodeIndex', index });
				request.onerror = () => reject('Error saving code index.');
				request.onsuccess = () => resolve();
			});
		},
		async getCodeIndex() {
			const db = await this.openDb();
			return new Promise((resolve) => {
				const request = db
				.transaction(this.stores.codeIndex, 'readonly')
				.objectStore(this.stores.codeIndex)
				.get('fullCodeIndex');
				request.onerror = () => resolve(null);
				request.onsuccess = () =>
				resolve(request.result ? request.result.index : null);
			});
		},
	};
	
	// =================================================================
	// === API Key Manager (Handles DB and Rotation)                 ===
	// =================================================================
	const ApiKeyManager = {
		keys: [],
		currentIndex: 0,
		triedKeys: new Set(),
		async loadKeys() {
			const keysString = await DbManager.getKeys();
			this.keys = keysString.split('\n').filter((k) => k.trim() !== '');
			apiKeysTextarea.value = keysString;
			this.currentIndex = 0;
			this.triedKeys.clear();
		},
		async saveKeys() {
			await DbManager.saveKeys(apiKeysTextarea.value);
			await this.loadKeys();
			alert(`Saved ${this.keys.length} API key(s) to IndexedDB.`);
		},
		getCurrentKey() {
			if (this.keys.length > 0) {
				this.triedKeys.add(this.keys[this.currentIndex]);
				return this.keys[this.currentIndex];
			}
			return null;
		},
		rotateKey() {
			if (this.keys.length > 0) {
				this.currentIndex = (this.currentIndex + 1) % this.keys.length;
			}
		},
		hasTriedAllKeys() {
			return this.triedKeys.size >= this.keys.length;
		},
		resetTriedKeys() {
			this.triedKeys.clear();
		},
	};
	
	// =================================================================
	// === Codebase Intelligence and Indexing                        ===
	// =================================================================
	const CodebaseIndexer = {
		async buildIndex(dirHandle) {
			const index = { files: {} };
			await this.traverseAndIndex(dirHandle, '', index);
			return index;
		},
		
		async traverseAndIndex(dirHandle, currentPath, index) {
			const ignoreDirs = ['.git', 'node_modules', 'dist', 'build'];
			if (ignoreDirs.includes(dirHandle.name)) return;
			
			for await (const entry of dirHandle.values()) {
				const newPath = currentPath
				? `${currentPath}/${entry.name}`
				: entry.name;
				if (
				entry.kind === 'file' &&
				entry.name.match(/\.(js|html|css|md|json|py|java|ts)$/)
				) {
					try {
						const file = await entry.getFile();
						const content = await file.text();
						index.files[newPath] = this.parseFileContent(content);
					} catch (e) {
						console.warn(`Could not index file: ${newPath}`, e);
					}
				} else if (entry.kind === 'directory') {
					await this.traverseAndIndex(entry, newPath, index);
				}
			}
		},
		
		parseFileContent(content) {
			const definitions = [];
			const functionRegex1 = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
			const functionRegex2 =
			/const\s+([a-zA-Z0-9_]+)\s*=\s*(\(.*\)|async\s*\(.*\))\s*=>/g;
			const classRegex = /class\s+([a-zA-Z0-9_]+)/g;
			const todoRegex = /\/\/\s*TODO:(.*)/g;
			
			let match;
			while ((match = functionRegex1.exec(content)) !== null) {
				definitions.push({ type: 'function', name: match[1] });
			}
			while ((match = functionRegex2.exec(content)) !== null) {
				definitions.push({ type: 'function', name: match[1] });
			}
			while ((match = classRegex.exec(content)) !== null) {
				definitions.push({ type: 'class', name: match[1] });
			}
			while ((match = todoRegex.exec(content)) !== null) {
				definitions.push({ type: 'todo', content: match[1].trim() });
			}
			return definitions;
		},
		
		async queryIndex(index, query) {
			const results = [];
			const lowerCaseQuery = query.toLowerCase();
			for (const filePath in index.files) {
				for (const def of index.files[filePath]) {
					if (
					(def.name && def.name.toLowerCase().includes(lowerCaseQuery)) ||
					(def.content && def.content.toLowerCase().includes(lowerCaseQuery))
					) {
						results.push({
							file: filePath,
							type: def.type,
							name: def.name || def.content,
						});
					}
				}
			}
			return results;
		},
	};
	
	// =================================================================
	// === Diff Application Logic                                      ===
	// =================================================================
	function applyDiff(originalContent, diff) {
		// Normalize line endings for both original content and diff to \n
		const normalizeLineEndings = (s) => s.replace(/\r\n/g, '\n');
		originalContent = normalizeLineEndings(originalContent);
		diff = normalizeLineEndings(diff);
		
		// Decode common HTML entities (handles cases like <, >, &#x3C;)
		function htmlDecode(str) {
			const textarea = document.createElement('textarea');
			textarea.innerHTML = str;
			return textarea.value;
		}
		diff = htmlDecode(diff);
		
		// Replace any hexadecimal escapes (e.g., \x3C) with their character equivalents
		diff = diff.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
		String.fromCharCode(parseInt(hex, 16)),
		);
		
		// Simple debug log: show first 10 lines for both original and diff
		console.log(
		'[applyDiff] --- ORIGINAL ---\\n' +
		originalContent.split('\n').slice(0, 10).join('\n'),
		);
		console.log(
		'[applyDiff] --- DIFF ---\\n' + diff.split('\n').slice(0, 10).join('\n'),
		);
		
		const patchedContent = Diff.applyPatch(originalContent, diff);
		if (patchedContent === false) {
			console.error('[applyDiff] PATCH FAILED');
			throw new Error(
			'Failed to apply patch. The diff may be invalid or not apply to the file.',
			);
		}
		return patchedContent;
	}
	
	// =================================================================
	// === Gemini Agentic Chat Manager with Official Tool Calling    ===
	// =================================================================
	const GeminiChat = {
		isSending: false,
		isCancelled: false,
		abortController: null,
		chatSession: null,
		activeModelName: '', // To track the model used by the current session
		lastRequestTime: 0,
		rateLimit: 5000, // Default 5 seconds
		
		async _restartSessionWithHistory(history = []) {
			console.log('Restarting session with history preservation...');
			await this._startChat(history);
			console.log(`Session re-initialized with ${history.length} history parts.`);
		},
		
		initialize() {
			// This method is now effectively empty as initialization happens on demand.
		},
		
		async _startChat(history = []) {
			try {
				const apiKey = ApiKeyManager.getCurrentKey();
				if (!apiKey) {
					throw new Error('No API key provided. Please add one in the settings.');
				}
				
				const genAI = new window.GoogleGenerativeAI(apiKey);
				const modelName = modelSelector.value;
				const mode = agentModeSelector.value;
				
				// Tool and system instruction setup (same as before)
				const baseTools = {
					functionDeclarations: [
						{ name: 'create_file', description: "Creates a new file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to check for existing files.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['filename', 'content'] } },
						{ name: 'delete_file', description: "Deletes a file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. CRITICAL: Use get_project_structure first to ensure the file exists.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' } }, required: ['filename'] } },
						{ name: 'create_folder', description: "Creates a new folder. IMPORTANT: Folder paths must be relative to the project root. Do NOT include the root folder's name in the path. Can create nested folders.", parameters: { type: 'OBJECT', properties: { folder_path: { type: 'STRING' } }, required: ['folder_path'] } },
						{ name: 'delete_folder', description: 'Deletes a folder and all of its contents recursively.', parameters: { type: 'OBJECT', properties: { folder_path: { type: 'STRING' } }, required: ['folder_path'] } },
						{ name: 'rename_folder', description: 'Renames a folder.', parameters: { type: 'OBJECT', properties: { old_folder_path: { type: 'STRING' }, new_folder_path: { type: 'STRING' } }, required: ['old_folder_path', 'new_folder_path'] } },
						{ name: 'rename_file', description: 'Renames a file.', parameters: { type: 'OBJECT', properties: { old_path: { type: 'STRING' }, new_path: { type: 'STRING' } }, required: ['old_path', 'new_path'] } },
						{ name: 'read_file', description: "Reads the content of an existing file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to get the correct file path.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' } }, required: ['filename'] } },
						{ name: 'get_open_file_content', description: 'Gets the content of the currently open file in the editor.' },
						{ name: 'get_selected_text', description: 'Gets the text currently selected by the user in the editor.' },
						{ name: 'replace_selected_text', description: 'Replaces the currently selected text in the editor with new text.', parameters: { type: 'OBJECT', properties: { new_text: { type: 'STRING' } }, required: ['new_text'] } },
						{ name: 'get_project_structure', description: 'Gets the entire file and folder structure of the project. CRITICAL: Always use this tool before attempting to read or create a file to ensure you have the correct file path.' },
						{ name: 'search_code', description: 'Searches for a specific string in all files in the project (like grep).', parameters: { type: 'OBJECT', properties: { search_term: { type: 'STRING' } }, required: ['search_term'] } },
						{ name: 'run_terminal_command', description: 'Executes a shell command on the backend and returns the output.', parameters: { type: 'OBJECT', properties: { command: { type: 'STRING' } }, required: ['command'] } },
						{ name: 'build_or_update_codebase_index', description: 'Scans the entire codebase to build a searchable index. Slow, run once per session.' },
						{ name: 'query_codebase', description: 'Searches the pre-built codebase index.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
						{ name: 'get_file_history', description: 'Retrieves the git commit history for a specific file.', parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' } }, required: ['filename'] } },
						{ name: 'rewrite_file', description: "Rewrites a file with new content. Overwrites the entire existing file content. IMPORTANT: Use for all file modifications instead of apply_diff.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['filename', 'content'] } },
						{ name: 'format_code', description: 'Formats a specific file using Prettier.', parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' } }, required: ['filename'] } },
						{ name: 'analyze_code', description: "Analyzes the structure of a JavaScript file (.js) using an AST parser. CRITICAL: Use this tool for analyzing JavaScript code structure. For reading other file types like HTML, CSS, or plain text, use the 'read_file' tool instead.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' } }, required: ['filename'] } },
					],
				};
				let allTools = [baseTools];
				let systemInstructionText = '';
				const now = new Date();
				const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
				const timeString = now.toLocaleString();
				const baseCodePrompt = `You are an expert AI programmer named Gemini. Your goal is to help users with their coding tasks. You have access to a file system, a terminal, and other tools to help you. Be concise and efficient. When asked to write code, just write the code without too much explanation unless asked. When you need to modify a file, use the 'rewrite_file' tool to overwrite the entire file content. Always format your responses using Markdown. For code, use language-specific code blocks.`;
				const basePlanPrompt = `You are a senior software architect named Gemini. Your goal is to help users plan their projects. When asked for a plan, break down the problem into clear, actionable steps. You can use mermaid syntax to create diagrams. Do not write implementation code unless specifically asked. Always format your responses using Markdown.`;
				const baseSearchPrompt = `You are a research assistant AI. Your primary function is to use the Google Search tool to find the most accurate and up-to-date information for any user query.\n\n**CRITICAL INSTRUCTION: You MUST use the Google Search tool for ANY query that requires external information. Do not rely on your internal knowledge. First, search, then answer.**\n\nCurrent user context:\n- Current Time: ${timeString}\n- Timezone: ${timeZone}\n\nAlways format your responses using Markdown, and cite your sources.`;
				
				if (mode === 'search') {
					allTools.push({ googleSearch: {} });
					systemInstructionText = baseSearchPrompt;
				} else if (mode === 'plan') {
					systemInstructionText = basePlanPrompt;
				} else {
					systemInstructionText = baseCodePrompt;
				}
				
				const model = genAI.getGenerativeModel({
					model: modelName,
					systemInstruction: { parts: [{ text: systemInstructionText }] },
					tools: allTools,
				});
				
				// CORE ARCHITECTURAL FIX: Pass the history directly into startChat.
				this.chatSession = model.startChat({
					history: history,
					safetySettings: [
						{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
						{ category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
						{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
						{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
					],
				});
				
				this.activeModelName = modelName;
				console.log(`New chat session started with model: ${modelName}, mode: ${mode}, and ${history.length} history parts.`);
			} catch (error) {
				console.error('Failed to start chat session:', error);
				this.appendMessage(`Error: Could not start chat session. ${error.message}`, 'ai');
			}
		},
		
		appendMessage(text, sender, isStreaming = false) {
			let messageDiv;
			if (isStreaming) {
				const lastMessage = chatMessages.lastElementChild;
				if (lastMessage && lastMessage.classList.contains('ai-streaming')) {
					messageDiv = lastMessage;
				}
			}
			
			if (!messageDiv) {
				messageDiv = document.createElement('div');
				messageDiv.className = `chat-message ${sender}`;
				if (isStreaming) {
					messageDiv.classList.add('ai-streaming');
				}
				chatMessages.appendChild(messageDiv);
			}
			
			if (sender === 'ai') {
				messageDiv.innerHTML = DOMPurify.sanitize(marked.parse(text));
			} else {
				messageDiv.textContent = text;
			}
			chatMessages.scrollTop = chatMessages.scrollHeight;
		},
		
		async executeTool(toolCall) {
			const toolName = toolCall.name;
			const parameters = toolCall.args;
			const groupTitle = `AI Tool Call: ${toolName}`;
			const groupContent = parameters && Object.keys(parameters).length > 0 ? parameters : 'No parameters';
			console.group(groupTitle, groupContent);
			const logEntry = this.appendToolLog(toolName, parameters);
			
			let resultForModel;
			let resultForLog;
			let isSuccess = true;
			
			try {
				if (
				!rootDirectoryHandle &&
				[
					'create_file', 'read_file', 'search_code', 'get_project_structure',
					'delete_file', 'build_or_update_codebase_index', 'query_codebase',
					'create_folder', 'delete_folder', 'rename_folder', 'rewrite_file',
					'format_code', 'analyze_code'
				].includes(toolName)
				) {
					throw new Error("No project folder is open. Ask the user to open one.");
				}
				
				switch (toolName) {
					case 'get_project_structure': {
						const tree = await buildStructureTree(rootDirectoryHandle);
						const structure = `${tree.name}\n${formatTreeToString(tree)}`;
						resultForModel = { structure: structure };
						break;
					}
					case 'read_file': {
						const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
						const file = await fileHandle.getFile();
						const content = await file.text();
						await openFile(fileHandle, parameters.filename);
						resultForModel = { content: content };
						break;
					}
					case 'create_file': {
						const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename, { create: true });
						const writable = await fileHandle.createWritable();
						await writable.write(parameters.content);
						await writable.close();
						await refreshFileTree();
						await openFile(fileHandle, parameters.filename);
						resultForModel = { message: `File '${parameters.filename}' created successfully.` };
						break;
					}
					case 'delete_file': {
						const { parentHandle, entryName: fileNameToDelete } = await getParentDirectoryHandle(rootDirectoryHandle, parameters.filename);
						await parentHandle.removeEntry(fileNameToDelete);
						if (openFiles.has(parameters.filename)) closeTab(parameters.filename);
						await refreshFileTree();
						resultForModel = { message: `File '${parameters.filename}' deleted successfully.` };
						break;
					}
					case 'delete_folder': {
						const { parentHandle, entryName } = await getParentDirectoryHandle(rootDirectoryHandle, parameters.folder_path);
						await parentHandle.removeEntry(entryName, { recursive: true });
						await refreshFileTree();
						resultForModel = { message: `Folder '${parameters.folder_path}' deleted successfully.` };
						break;
					}
					case 'rename_folder': {
						await moveDirectory(rootDirectoryHandle, parameters.old_folder_path, parameters.new_folder_path);
						await refreshFileTree();
						resultForModel = { message: `Folder '${parameters.old_folder_path}' renamed to '${parameters.new_folder_path}' successfully.` };
						break;
					}
					case 'rename_file': {
						await moveFile(rootDirectoryHandle, parameters.old_path, parameters.new_path);
						await refreshFileTree();
						// Close the old file tab if it's open and open the new one
						if (openFiles.has(parameters.old_path)) {
							closeTab(parameters.old_path);
							const newFileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.new_path);
							await openFile(newFileHandle, parameters.new_path);
						}
						resultForModel = { message: `File '${parameters.old_path}' renamed to '${parameters.new_path}' successfully.` };
						break;
					}
					case 'create_folder': {
						await createDirectoryFromPath(rootDirectoryHandle, parameters.folder_path);
						await refreshFileTree();
						resultForModel = { message: `Folder '${parameters.folder_path}' created successfully.` };
						break;
					}
					case 'search_code': {
						const searchResults = [];
						await searchInDirectory(rootDirectoryHandle, parameters.search_term, '', searchResults);
						resultForModel = { results: searchResults };
						break;
					}
					case 'get_open_file_content': {
						if (!activeFilePath) throw new Error('No file is currently open in the editor.');
						const fileData = openFiles.get(activeFilePath);
						resultForModel = { filename: fileData.name, content: fileData.model.getValue() };
						break;
					}
					case 'get_selected_text': {
						const selection = editor.getSelection();
						if (!selection || selection.isEmpty()) throw new Error('No text is currently selected.');
						resultForModel = { selected_text: editor.getModel().getValueInRange(selection) };
						break;
					}
					case 'replace_selected_text': {
						const selection = editor.getSelection();
						if (!selection || selection.isEmpty()) throw new Error('No text is selected to replace.');
						editor.executeEdits('ai-agent', [{ range: selection, text: parameters.new_text }]);
						resultForModel = { message: 'Replaced the selected text.' };
						break;
					}
					case 'run_terminal_command': {
						const response = await fetch('/api/execute-tool', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ toolName: 'run_terminal_command', parameters: parameters }),
						});
						const terminalResult = await response.json();
						if (terminalResult.status === 'Success') {
							await refreshFileTree();
							resultForModel = { output: terminalResult.output };
						} else {
							throw new Error(terminalResult.message);
						}
						break;
					}
					case 'build_or_update_codebase_index': {
						this.appendMessage('Building codebase index...', 'ai');
						const index = await CodebaseIndexer.buildIndex(rootDirectoryHandle);
						await DbManager.saveCodeIndex(index);
						resultForModel = { message: 'Codebase index built successfully.' };
						break;
					}
					case 'query_codebase': {
						const index = await DbManager.getCodeIndex();
						if (!index) throw new Error("No codebase index. Please run 'build_or_update_codebase_index'.");
						const queryResults = await CodebaseIndexer.queryIndex(index, parameters.query);
						resultForModel = { results: queryResults };
						break;
					}
					case 'get_file_history': {
						const command = `git log --pretty=format:"%h - %an, %ar : %s" -- ${parameters.filename}`;
						const response = await fetch('/api/execute-tool', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ toolName: 'run_terminal_command', parameters: { command } }),
						});
						const terminalResult = await response.json();
						if (terminalResult.status === 'Success') {
							resultForModel = { history: terminalResult.output };
						} else {
							throw new Error(terminalResult.message);
						}
						break;
					}
					case 'rewrite_file': {
						const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
						const writable = await fileHandle.createWritable();
						await writable.write(parameters.content);
						await writable.close();
						if (openFiles.has(parameters.filename)) {
							const fileData = openFiles.get(parameters.filename);
							if (fileData) fileData.model.setValue(parameters.content);
						}
						await openFile(fileHandle, parameters.filename);
						resultForModel = { message: `File '${parameters.filename}' rewritten successfully.` };
						break;
					}
					case 'format_code': {
						const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
						const file = await fileHandle.getFile();
						const originalContent = await file.text();
						const parser = getPrettierParser(parameters.filename);
						prettierWorker.postMessage({ code: originalContent, parser });
						resultForModel = { message: `Formatting request for '${parameters.filename}' sent.` };
						break;
					}
					case 'analyze_code': {
						if (!parameters.filename.endsWith('.js')) {
							throw new Error('This tool can only analyze .js files. Use read_file for others.');
						}
						const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
						const file = await fileHandle.getFile();
						const content = await file.text();
						const ast = acorn.parse(content, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
						const analysis = { functions: [], classes: [], imports: [] };
						acorn.walk.simple(ast, {
							FunctionDeclaration(node) { analysis.functions.push({ name: node.id.name, start: node.loc.start.line, end: node.loc.end.line }); },
							ClassDeclaration(node) { analysis.classes.push({ name: node.id.name, start: node.loc.start.line, end: node.loc.end.line }); },
							ImportDeclaration(node) { analysis.imports.push({ source: node.source.value, specifiers: node.specifiers.map((s) => s.local.name) }); },
						});
						resultForModel = { analysis: analysis };
						break;
					}
					default:
						throw new Error(`Unknown tool '${toolName}'.`);
				}
				resultForLog = { status: 'Success', ...resultForModel };
			} catch (error) {
				isSuccess = false;
				const errorMessage = `Error executing tool '${toolName}': ${error.message}`;
				resultForModel = { error: errorMessage };
				resultForLog = { status: 'Error', message: errorMessage };
			}
			
			console.log('Result:', resultForLog);
			console.groupEnd();
			this.updateToolLog(logEntry, isSuccess);
			return { toolResponse: { name: toolName, response: resultForModel } };
		},
		
		async sendMessage() {
			// --- Model and History Management ---
			const selectedModel = modelSelector.value;
			if (!this.chatSession || this.activeModelName !== selectedModel) {
				let historyToPreserve = this.chatSession ? await this.chatSession.getHistory() : [];
				await this._restartSessionWithHistory(historyToPreserve);
			}
			// --- End of Model and History Management ---
			
			const now = Date.now();
			const timeSinceLastRequest = now - this.lastRequestTime;
			const rateLimitMs = this.rateLimit;
			
			if (timeSinceLastRequest < rateLimitMs) {
				const delay = rateLimitMs - timeSinceLastRequest;
				this.appendMessage(`Rate limit active. Waiting for ${Math.ceil(delay / 1000)}s...`, 'ai');
				await new Promise(resolve => setTimeout(resolve, delay));
			}
			
			const userPrompt = chatInput.value.trim();
			if ((!userPrompt && !uploadedImage) || this.isSending) return;
			
			if (!this.chatSession) {
				await this._startChat(); // Start a fresh session if one doesn't exist
				if (!this.chatSession) return;
			}
			
			this.lastRequestTime = Date.now();
			
			this.isSending = true;
			this.isCancelled = false;
			chatSendButton.style.display = 'none';
			chatCancelButton.style.display = 'inline-block';
			thinkingIndicator.style.display = 'block';
			
			// Prepare initial user message and display it
			let displayMessage = userPrompt;
			const initialParts = [];
			if (userPrompt) initialParts.push({ text: userPrompt });
			if (uploadedImage) {
				displayMessage += `\n📷 Attached: ${uploadedImage.name}`;
				initialParts.push({
					inlineData: {
						mimeType: uploadedImage.type,
						data: uploadedImage.data,
					},
				});
			}
			this.appendMessage(displayMessage.trim(), 'user');
			chatInput.value = '';
			clearImagePreview();
			
			// --- User Query Logging ---
			console.log(`[User Query] ${userPrompt}`);
			
			try {
				let promptParts = initialParts;
				let running = true;
				let attempts = 0;
				
				ApiKeyManager.resetTriedKeys();
				
				// Loop to handle potential multi-turn tool calls and API key rotation
				while (running && !this.isCancelled) {
					const modelName = modelSelector.value; // Always capture latest value before each attempt
					try {
						// This is the main conversation loop.
						// It will attempt to send the message and handle tool calls.
						// If an API key fails, the outer catch block will handle rotation.
						console.log(
						`[AI Turn] Attempting to send with key index: ${ApiKeyManager.currentIndex} using model: ${modelName} (type: ${typeof modelName})`,
						);
						const result = await this.chatSession.sendMessageStream(promptParts);
						
						let fullResponseText = '';
						let functionCalls = [];
						
						for await (const chunk of result.stream) {
							if (this.isCancelled) break;
							const chunkText = chunk.text();
							if (chunkText) {
								fullResponseText += chunkText;
								this.appendMessage(fullResponseText, 'ai', true);
							}
							const chunkFunctionCalls = chunk.functionCalls();
							if (chunkFunctionCalls) {
								functionCalls.push(...chunkFunctionCalls);
							}
						}
						
						if (this.isCancelled) break;
						
						// If there are tool calls, execute them and continue the loop
						if (functionCalls.length > 0) {
							const toolPromises = functionCalls.map((call) =>
							this.executeTool(call),
							);
							const toolResults = await Promise.all(toolPromises);
							promptParts = toolResults.map((toolResult) => ({
								functionResponse: {
									name: toolResult.toolResponse.name,
									response: toolResult.toolResponse.response,
								},
							}));
						} else {
							running = false; // No more tool calls, exit the loop
						}
					} catch (error) {
						console.error('An error occurred during the AI turn:', error);
						ApiKeyManager.rotateKey(); // Move to the next key
						
						if (ApiKeyManager.hasTriedAllKeys()) {
							this.appendMessage(
							'All API keys failed. Please check your keys in the settings.',
							'ai',
							);
							console.error('All available API keys have failed.');
							running = false; // Stop the loop
						} else {
							const delay = this.rateLimit;
							this.appendMessage(
							`API key failed. Waiting for ${Math.ceil(delay / 1000)}s before retrying...`,
							'ai',
							);
							await new Promise(resolve => setTimeout(resolve, delay));
							
							// CORE ARCHITECTURAL FIX: The history is now handled correctly at session start.
							// No pruning is needed because the entire valid history will be passed
							// to the new session, and the loop will automatically retry the failed `promptParts`.
							console.log('[AI Turn] Restarting session due to API key failure.');
							const history = this.chatSession ? await this.chatSession.getHistory() : [];
							await this._restartSessionWithHistory(history);
							
							// The loop will automatically retry with the same `promptParts`
							this.lastRequestTime = Date.now(); // Reset timer after waiting
						}
					}
				}
				
				if (this.isCancelled) {
					this.appendMessage('Cancelled by user.', 'ai');
				}
			} catch (error) {
				this.appendMessage(`An error occurred: ${error.message}`, 'ai');
				console.error('Chat Error:', error);
			} finally {
				console.groupEnd();
				this.isSending = false;
				chatSendButton.style.display = 'inline-block';
				chatCancelButton.style.display = 'none';
				thinkingIndicator.style.display = 'none';
			}
		},
		
		cancelMessage() {
			if (this.isSending) {
				this.isCancelled = true;
				// The SDK doesn't have a direct abort controller,
				// but we can stop processing the stream.
			}
		},
		
		async clearHistory() {
			chatMessages.innerHTML = '';
			this.appendMessage('Conversation history cleared.', 'ai');
			await this._startChat(); // Start a fresh session
		},
		
		appendToolLog(toolName, params) {
			const logEntry = document.createElement('div');
			logEntry.className = 'tool-log-entry';
			
			const header = document.createElement('div');
			header.className = 'tool-log-entry-header';
			header.innerHTML = `
			<div class="status-icon loader"></div>
			<span class="tool-name">${toolName}</span>
			`;
			
			const paramsPre = document.createElement('pre');
			paramsPre.className = 'tool-log-params';
			paramsPre.textContent = JSON.stringify(params, null, 2);
			
			logEntry.appendChild(header);
			logEntry.appendChild(paramsPre);
			
			header.addEventListener('click', () => {
				paramsPre.style.display =
				paramsPre.style.display === 'none' ? 'block' : 'none';
			});
			
			toolLogMessages.appendChild(logEntry);
			toolLogMessages.scrollTop = toolLogMessages.scrollHeight;
			return logEntry;
		},
		
		updateToolLog(logEntry, isSuccess) {
			const statusIcon = logEntry.querySelector('.status-icon');
			statusIcon.classList.remove('loader');
			statusIcon.classList.add(isSuccess ? 'completed' : 'failed');
			statusIcon.textContent = isSuccess ? '✔' : '✖';
		},
		async condenseHistory() {
			if (!this.chatSession) {
				this.appendMessage('No active session to condense.', 'ai');
				return;
			}
			
			this.appendMessage(
			'Condensing history... This will start a new session.',
			'ai',
			);
			const history = await this.chatSession.getHistory();
			if (history.length === 0) {
				this.appendMessage('History is already empty.', 'ai');
				return;
			}
			
			const condensationPrompt =
			"Please summarize our conversation so far in a concise way. Include all critical decisions, file modifications, and key insights. The goal is to reduce the context size while retaining the essential information for our ongoing task. Start the summary with 'Here is a summary of our conversation so far:'.";
			
			const result = await this.chatSession.sendMessage(condensationPrompt);
			const summaryText = result.response.text();
			
			chatMessages.innerHTML = '';
			this.appendMessage(
			'Original conversation history has been condensed.',
			'ai',
			);
			this.appendMessage(summaryText, 'ai');
			
			await this.startOrRestartChatSession();
			// The new session will start fresh. For a more advanced implementation,
			// we could inject the summary into the new session's history.
		},
		
		async viewHistory() {
			if (!this.chatSession) {
				return '[]';
			}
			const history = await this.chatSession.getHistory();
			return JSON.stringify(history, null, 2);
		},
	};
	
	// =================================================================
	// === File System Access API Logic (Editor)                     ===
	// =================================================================
	async function refreshFileTree() {
		if (rootDirectoryHandle) {
			// Destroy the old tree instance if it exists
			const treeInstance = $('#file-tree').jstree(true);
			if (treeInstance) {
				treeInstance.destroy();
			}
			
			const treeData = await buildTree(rootDirectoryHandle);
			renderTree(treeData);
			
			openDirectoryButton.style.display = 'none';
			forgetFolderButton.style.display = 'block';
			reconnectButton.style.display = 'none';
		}
	}
	
	openDirectoryButton.addEventListener('click', async () => {
		try {
			rootDirectoryHandle = await window.showDirectoryPicker();
			await DbManager.saveDirectoryHandle(rootDirectoryHandle);
			await refreshFileTree();
		} catch (error) {
			console.error('Error opening directory:', error);
		}
	});
	
	const buildTree = async (dirHandle, currentPath = '') => {
		const children = [];
		for await (const entry of dirHandle.values()) {
			const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
			if (entry.kind === 'directory') {
				children.push({
					id: newPath,
					text: entry.name,
					type: 'folder',
					children: await buildTree(entry, newPath),
				});
			} else {
				children.push({
					id: newPath,
					text: entry.name,
					type: 'file',
					li_attr: { 'data-path': newPath, 'data-handle': entry }, // Store path and handle
				});
			}
		}
		// Sort so folders appear before files
		children.sort((a, b) => {
			if (a.type === 'folder' && b.type !== 'folder') return -1;
			if (a.type !== 'folder' && b.type === 'folder') return 1;
			return a.text.localeCompare(b.text);
		});
		return children;
	};
	
	const renderTree = (treeData) => {
		$('#file-tree')
		.on('select_node.jstree', async (e, data) => {
			if (data.node.type === 'file') {
				const filePath = data.node.id;
				const fileHandle = await getFileHandleFromPath(
				rootDirectoryHandle,
				filePath,
				);
				openFile(fileHandle, filePath);
			}
		})
		.jstree({
			core: {
				data: treeData,
				themes: {
					name: 'default',
					responsive: true,
					icons: true,
				},
			},
			types: {
				default: { icon: 'jstree-icon jstree-file' },
				folder: { icon: 'jstree-icon jstree-folder' },
				file: { icon: 'jstree-icon jstree-file' },
			},
			plugins: ['types'],
		});
	};
	
	let openFiles = new Map(); // Key: filePath (string), Value: { handle, name, model, viewState }
	let activeFilePath = null;
	
	const openFile = async (fileHandle, filePath) => {
		if (openFiles.has(filePath)) {
			await switchTab(filePath);
			return;
		}
		
		try {
			const file = await fileHandle.getFile();
			const content = await file.text();
			
			openFiles.set(filePath, {
				handle: fileHandle,
				name: file.name,
				model: monaco.editor.createModel(
				content,
				getLanguageFromExtension(file.name.split('.').pop()),
				),
				viewState: null,
			});
			
			await switchTab(filePath);
			renderTabs();
			chatInput.focus(); // Set focus to chat input
		} catch (error) {
			console.error(`Failed to open file ${filePath}:`, error);
		}
	};
	
	const switchTab = async (filePath) => {
		if (activeFilePath && openFiles.has(activeFilePath)) {
			openFiles.get(activeFilePath).viewState = editor.saveViewState();
		}
		
		activeFilePath = filePath;
		const fileData = openFiles.get(filePath);
		
		editor.setModel(fileData.model);
		if (fileData.viewState) {
			editor.restoreViewState(fileData.viewState);
		}
		editor.focus();
		editor.updateOptions({ readOnly: false });
		renderTabs();
		chatInput.focus(); // Set focus to chat input
	};
	
	const closeTab = (filePath) => {
		const fileData = openFiles.get(filePath);
		if (fileData && fileData.model) {
			fileData.model.dispose();
		}
		openFiles.delete(filePath);
		
		if (activeFilePath === filePath) {
			activeFilePath = null;
			const nextFile = openFiles.keys().next().value; // nextFile is a path
			if (nextFile) {
				switchTab(nextFile);
			} else {
				clearEditor();
			}
		}
		renderTabs();
	};
	
	const renderTabs = () => {
		tabBarContainer.innerHTML = '';
		openFiles.forEach((fileData, filePath) => {
			const tab = document.createElement('div');
			tab.className = 'tab' + (filePath === activeFilePath ? ' active' : '');
			tab.textContent = fileData.name;
			tab.onclick = () => switchTab(filePath);
			
			const closeBtn = document.createElement('button');
			closeBtn.className = 'tab-close-btn';
			closeBtn.innerHTML = '&times;';
			closeBtn.onclick = (e) => {
				e.stopPropagation();
				closeTab(filePath);
			};
			
			tab.appendChild(closeBtn);
			tabBarContainer.appendChild(tab);
		});
	};
	
	const clearEditor = () => {
		editor.setModel(
		monaco.editor.createModel(
		'// Select a file to view its content',
		'plaintext',
		),
		);
		editor.updateOptions({ readOnly: true });
		activeFilePath = null;
		openFiles = new Map();
		renderTabs();
	};
	
	const saveFile = async () => {
		if (!activeFilePath) return;
		try {
			const fileData = openFiles.get(activeFilePath);
			const writable = await fileData.handle.createWritable();
			await writable.write(fileData.model.getValue());
			await writable.close();
			console.log(`File '${fileData.name}' saved successfully`);
		} catch (error) {
			console.error(`Failed to save file:`, error);
		}
	};
	
	const getLanguageFromExtension = (ext) =>
	({
		cfm: 'html',
		cfml: 'html',
		js: 'javascript',
		ts: 'typescript',
		java: 'java',
		py: 'python',
		html: 'html',
		css: 'css',
		json: 'json',
		md: 'markdown',
		php: 'php',
	})[ext] || 'plaintext';
	
	function getPrettierParser(filename) {
		const extension = filename.split('.').pop();
		switch (extension) {
			case 'js':
			case 'ts':
			case 'jsx':
			case 'tsx':
			return 'babel';
			case 'html':
			return 'html';
			case 'css':
			case 'scss':
			case 'less':
			return 'css';
			case 'json':
			return 'json';
			case 'md':
			return 'markdown';
			default:
			return 'babel';
		}
	}
	
	const formatTreeToString = (node, prefix = '') => {
		let result = '';
		const children = node.children || [];
		children.forEach((child, index) => {
			const isLast = index === children.length - 1;
			const connector = isLast ? '└── ' : '├── ';
			result += `${prefix}${connector}${child.name}\n`;
			if (child.kind === 'directory') {
				const newPrefix = prefix + (isLast ? '    ' : '│   ');
				result += formatTreeToString(child, newPrefix);
			}
		});
		return result;
	};

	async function buildStructureTree(dirHandle) {
		const root = {
			name: dirHandle.name,
			kind: 'directory',
			children: []
		};

		for await (const entry of dirHandle.values()) {
			if (entry.kind === 'directory') {
				const childNode = await buildStructureTree(entry);
				root.children.push(childNode);
			} else {
				root.children.push({
					name: entry.name,
					kind: 'file',
				});
			}
		}

		// Sort so folders appear before files
		root.children.sort((a, b) => {
			if (a.kind === 'directory' && b.kind !== 'directory') return -1;
			if (a.kind !== 'directory' && b.kind === 'directory') return 1;
			return a.name.localeCompare(b.name);
		});

		return root;
	}
	
	async function getFileHandleFromPath(dirHandle, path, options = {}) {
		const parts = path.split('/').filter((p) => p);
		let currentHandle = dirHandle;
		for (let i = 0; i < parts.length - 1; i++) {
			currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
		}
		if (options.create) {
			return await currentHandle.getFileHandle(parts[parts.length - 1], {
				create: true,
			});
		}
		return await currentHandle.getFileHandle(parts[parts.length - 1]);
	}
	
	async function getParentDirectoryHandle(rootDirHandle, path) {
		const parts = path.split('/').filter((p) => p);
		if (parts.length === 0) {
			throw new Error('Invalid path provided. Cannot get parent of root.');
		}

		let currentHandle = rootDirHandle;
		// Traverse to the parent directory
		for (let i = 0; i < parts.length - 1; i++) {
			currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
		}

		const entryName = parts[parts.length - 1];
		return { parentHandle: currentHandle, entryName };
	}
	
	async function createDirectoryFromPath(dirHandle, path) {
		const parts = path.split('/').filter((p) => p);
		let currentHandle = dirHandle;
		for (const part of parts) {
			currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
		}
		return currentHandle;
	}
	
	async function getDirectoryHandleFromPath(dirHandle, path) {
		const parts = path.split('/').filter((p) => p);
		let currentHandle = dirHandle;
		for (const part of parts) {
			currentHandle = await currentHandle.getDirectoryHandle(part);
		}
		return currentHandle;
	}
	
	async function moveFile(rootDirHandle, oldPath, newPath) {
		// 1. Get handle for the old file and read its content
		const oldFileHandle = await getFileHandleFromPath(rootDirHandle, oldPath);
		const file = await oldFileHandle.getFile();
		const content = await file.arrayBuffer();
		// 2. Create the new file with the same content
		const newFileHandle = await getFileHandleFromPath(rootDirHandle, newPath, { create: true });
		const writable = await newFileHandle.createWritable();
		await writable.write(content);
		await writable.close();
		// 3. Delete the old file
		const { parentHandle, entryName } = await getParentDirectoryHandle(rootDirHandle, oldPath);
		await parentHandle.removeEntry(entryName);
	}

	async function moveDirectory(rootDirHandle, oldPath, newPath) {
		const oldDirHandle = await getDirectoryHandleFromPath(rootDirHandle, oldPath);
		const newDirHandle = await createDirectoryFromPath(rootDirHandle, newPath);
		
		for await (const entry of oldDirHandle.values()) {
			if (entry.kind === 'file') {
				const file = await entry.getFile();
				const newFileHandle = await newDirHandle.getFileHandle(entry.name, { create: true });
				const writable = await newFileHandle.createWritable();
				await writable.write(await file.arrayBuffer());
				await writable.close();
			} else if (entry.kind === 'directory') {
				await moveDirectory(
				rootDirHandle,
				`${oldPath}/${entry.name}`,
				`${newPath}/${entry.name}`,
				);
			}
		}
		
		const { parentHandle, entryName: dirNameToDelete } = await getParentDirectoryHandle(
		rootDirHandle,
		oldPath,
		);
		await parentHandle.removeEntry(dirNameToDelete, { recursive: true });
	}
	
	async function searchInDirectory(
	dirHandle,
	searchTerm,
	currentPath,
	results,
	) {
		for await (const entry of dirHandle.values()) {
			const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
			if (entry.kind === 'file') {
				try {
					const file = await entry.getFile();
					const content = await file.text();
					const lines = content.split('\n');
					const fileMatches = [];
					for (let i = 0; i < lines.length; i++) {
						if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
							fileMatches.push({
								line_number: i + 1,
								line_content: lines[i].trim(),
							});
						}
					}
					if (fileMatches.length > 0) {
						results.push({
							file: newPath,
							matches: fileMatches,
						});
					}
				} catch (readError) {
					console.warn(`Could not read file ${newPath}:`, readError);
				}
			} else if (entry.kind === 'directory') {
				await searchInDirectory(entry, searchTerm, newPath, results);
			}
		}
	}
	
	// --- Initial Load & Event Listeners ---
	const reconnectButton = document.createElement('button');
	reconnectButton.textContent = 'Reconnect Project';
	reconnectButton.style.display = 'none';
	fileTreeContainer.before(reconnectButton);
	
	const forgetFolderButton = document.createElement('button');
	forgetFolderButton.textContent = 'Forget This Folder';
	forgetFolderButton.style.display = 'none';
	fileTreeContainer.before(forgetFolderButton);
	
	forgetFolderButton.addEventListener('click', async () => {
		await DbManager.clearDirectoryHandle();
		rootDirectoryHandle = null;
		fileTreeContainer.innerHTML = '';
		forgetFolderButton.style.display = 'none';
		openDirectoryButton.style.display = 'block';
		reconnectButton.style.display = 'none';
		clearEditor();
	});
	
	reconnectButton.addEventListener('click', async () => {
		let savedHandle = await DbManager.getDirectoryHandle();
		if (savedHandle) {
			try {
				if (
				(await savedHandle.requestPermission({ mode: 'readwrite' })) ===
				'granted'
				) {
					rootDirectoryHandle = savedHandle;
					await refreshFileTree();
				} else {
					alert('Permission to access the folder was denied.');
				}
			} catch (error) {
				console.error('Error requesting permission:', error);
				alert('There was an error reconnecting to the project folder.');
			}
		}
	});
	
	async function tryRestoreDirectory() {
		const savedHandle = await DbManager.getDirectoryHandle();
		if (!savedHandle) {
			openDirectoryButton.style.display = 'block';
			reconnectButton.style.display = 'none';
			forgetFolderButton.style.display = 'none';
			return;
		}
		
		if (
		(await savedHandle.queryPermission({ mode: 'readwrite' })) === 'granted'
		) {
			rootDirectoryHandle = savedHandle;
			await refreshFileTree();
		} else {
			openDirectoryButton.style.display = 'none';
			reconnectButton.style.display = 'block';
			forgetFolderButton.style.display = 'block';
		}
	}
	
	// =================================================================
	// === Resizable Panel Logic                                     ===
	// =================================================================
	function initResizablePanels() {
		// Store split instance globally to access in toggle logic
		window.splitInstance = Split(['#file-tree-container', '#editor-container', '#chat-panel'], {
			sizes: [15, 55, 30],
			minSize: [0, 300, 200],
			gutterSize: 10,
			cursor: 'col-resize',
			onDragEnd: () => {
				if (editor) {
					editor.layout();
				}
			},
		});
	}
	
	// --- Initialize Application ---
	initResizablePanels();
	tryRestoreDirectory();
	
	// Load rate limit settings before initializing chat
	const savedRateLimit = localStorage.getItem('rateLimitValue') || '5';
	rateLimitSlider.value = savedRateLimit;
	rateLimitInput.value = savedRateLimit;
	GeminiChat.rateLimit = parseInt(savedRateLimit, 10) * 1000;
	
	GeminiChat.initialize();
	ApiKeyManager.loadKeys().then(() => {
		GeminiChat._startChat();
	});
	
	saveKeysButton.addEventListener('click', () => ApiKeyManager.saveKeys());
	chatSendButton.addEventListener('click', () => GeminiChat.sendMessage());
	chatCancelButton.addEventListener('click', () => GeminiChat.cancelMessage());
	
	document.getElementById('run-folder-tests-button').addEventListener('click', () => {
		if (rootDirectoryHandle) {
			runFolderManagementTests(rootDirectoryHandle);
		} else {
			alert("Please open a project folder first.");
		}
	});

	// Rate Limiter Listeners
	rateLimitSlider.addEventListener('input', () => {
		rateLimitInput.value = rateLimitSlider.value;
		GeminiChat.rateLimit = parseInt(rateLimitSlider.value, 10) * 1000;
		localStorage.setItem('rateLimitValue', rateLimitSlider.value);
	});
	
	rateLimitInput.addEventListener('input', () => {
		rateLimitSlider.value = rateLimitInput.value;
		GeminiChat.rateLimit = parseInt(rateLimitInput.value, 10) * 1000;
		localStorage.setItem('rateLimitValue', rateLimitInput.value);
	});
	
	toolLogHeader.addEventListener('click', () => {
		toolLogContainer.classList.toggle('collapsed');
	});
	
	// Context management listeners
	viewContextButton.addEventListener('click', async () => {
		contextDisplay.textContent = await GeminiChat.viewHistory();
		contextModal.style.display = 'block';
	});
	
	condenseContextButton.addEventListener('click', () =>
	GeminiChat.condenseHistory(),
	);
	clearContextButton.addEventListener('click', () => GeminiChat.clearHistory());
	
	closeModalButton.addEventListener('click', () => {
		contextModal.style.display = 'none';
	});
	
	window.addEventListener('click', (event) => {
		if (event.target == contextModal) {
			contextModal.style.display = 'none';
		}
	});
	
	imageUploadButton.addEventListener('click', () => imageInput.click());
	imageInput.addEventListener('change', handleImageUpload);
	
	let isFileTreeCollapsed = false;
	toggleFilesButton.addEventListener('click', () => {
		const fileTreePanel = document.getElementById('file-tree-container');
		if (!window.splitInstance || !fileTreePanel) return;
		
		isFileTreeCollapsed = !isFileTreeCollapsed;
		
		if (isFileTreeCollapsed) {
			// Hide contents and collapse panel
			fileTreePanel.classList.add('hidden');
			window.splitInstance.setSizes([0, 70, 30]);
		} else {
			// Restore panel and show contents
			fileTreePanel.classList.remove('hidden');
			window.splitInstance.setSizes([15, 55, 30]);
		}
		
		// A brief delay helps the editor layout adjust correctly after the transition
		setTimeout(() => {
			if (editor) {
				editor.layout();
			}
		}, 50);
	});
	chatInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			GeminiChat.sendMessage();
		}
	});
	editorContainer.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			saveFile();
		}
	});
	
	const formatButton = document.getElementById('format-button');
	if (formatButton) {
		formatButton.addEventListener('click', () => {
			if (!activeFileHandle) {
				alert('Please open a file to format.');
				return;
			}
			
			const fileData = openFiles.get(activeFileHandle);
			const originalContent = fileData.model.getValue();
			const parser = getPrettierParser(fileData.name);
			
			prettierWorker.onmessage = (event) => {
				if (event.data.success) {
					fileData.model.setValue(event.data.formattedCode);
					console.log(`File '${fileData.name}' formatted successfully.`);
				} else {
					console.error('Error formatting file:', event.data.error);
					alert('An error occurred while formatting the file.');
				}
			};
			
			prettierWorker.postMessage({ code: originalContent, parser });
		});
	}
	
	function handleImageUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = (e) => {
			uploadedImage = {
				name: file.name,
				type: file.type,
				data: e.target.result.split(',')[1], // Get base64 part
			};
			updateImagePreview();
		};
		reader.readAsDataURL(file);
	}
	
	function updateImagePreview() {
		imagePreviewContainer.innerHTML = '';
		if (uploadedImage) {
			const img = document.createElement('img');
			img.src = `data:${uploadedImage.type};base64,${uploadedImage.data}`;
			
			const clearButton = document.createElement('button');
			clearButton.id = 'image-preview-clear';
			clearButton.innerHTML = '&times;';
			clearButton.onclick = clearImagePreview;
			
			imagePreviewContainer.appendChild(img);
			imagePreviewContainer.appendChild(clearButton);
			imagePreviewContainer.style.display = 'block';
		} else {
			imagePreviewContainer.style.display = 'none';
		}
	}
	
	function clearImagePreview() {
		uploadedImage = null;
		imageInput.value = ''; // Reset the file input
		updateImagePreview();
	}
});


// --- Tab Bar Mouse Wheel Scrolling ---
const tabBar = document.getElementById('tab-bar');
tabBar.addEventListener('wheel', (event) => {
	if (event.deltaY !== 0) {
		event.preventDefault();
		tabBar.scrollLeft += event.deltaY;
	}
});
