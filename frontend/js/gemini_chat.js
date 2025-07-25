import { ApiKeyManager } from './api_manager.js';
import { DbManager } from './db.js';
import { CodebaseIndexer } from './code_intel.js';
import * as FileSystem from './file_system.js';
import * as Editor from './editor.js';
import * as UI from './ui.js';

export const GeminiChat = {
    isSending: false,
    isCancelled: false,
    chatSession: null,
    activeModelName: '',
    lastRequestTime: 0,
    rateLimit: 5000,
    rootDirectoryHandle: null,

    initialize(rootDirectoryHandle) {
        this.rootDirectoryHandle = rootDirectoryHandle;
    },

    async _startChat(history = []) {
        try {
            const apiKey = ApiKeyManager.getCurrentKey();
            if (!apiKey) {
                throw new Error('No API key provided. Please add one in the settings.');
            }

            const genAI = new window.GoogleGenerativeAI(apiKey);
            const modelName = document.getElementById('model-selector').value;
            const mode = document.getElementById('agent-mode-selector').value;

            const baseTools = {
                functionDeclarations: [
                    { name: 'create_file', description: "Creates a new file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to check for existing files.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['filename', 'content'] } },
                    { name: 'delete_file', description: "Deletes a file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. CRITICAL: Use get_project_structure first to ensure the file exists.", parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' } }, required: ['filename'] } },
                    { name: 'create_folder', description: "Creates a new folder. IMPORTANT: Folder paths must be relative to the project root. Do NOT include the root folder's name in the path. Can create nested folders.", parameters: { type: 'OBJECT', properties: { folder_path: { type: 'STRING' } }, required: ['folder_path'] } },
                    { name: 'delete_folder', description: 'Deletes a folder and all of its contents recursively.', parameters: { type: 'OBJECT', properties: { folder_path: { type: 'STRING' } }, required: ['folder_path'] } },
                    { name: 'rename_folder', description: 'Renames a folder. Use this tool for renaming directories.', parameters: { type: 'OBJECT', properties: { old_folder_path: { type: 'STRING' }, new_folder_path: { type: 'STRING' } }, required: ['old_folder_path', 'new_folder_path'] } },
                    { name: 'rename_file', description: 'Renames a file. Use this tool for renaming files, not directories.', parameters: { type: 'OBJECT', properties: { old_path: { type: 'STRING' }, new_path: { type: 'STRING' } }, required: ['old_path', 'new_path'] } },
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
            const baseCodePrompt = `You are an expert AI programmer named Gemini. Your goal is to help users with their coding tasks. You have access to a file system, a terminal, and other tools to help you. Be concise and efficient. When asked to write code, just write the code without too much explanation unless asked. When you need to modify a file, use the 'rewrite_file' tool to overwrite the entire file content. CRITICAL RULE: After a tool is used, you MUST respond directly to the user with a summary of the action taken. Do not call another tool or just stay silent. You must reply. Always format your responses using Markdown. For code, use language-specific code blocks.`;
            const basePlanPrompt = `You are a senior software architect named Gemini. Your goal is to help users plan their projects. When asked for a plan, break down the problem into clear, actionable steps. You can use mermaid syntax to create diagrams. Do not write implementation code unless specifically asked. CRITICAL RULE: After a tool is used, you MUST respond directly to the user with a summary of the action taken. Do not call another tool or just stay silent. You must reply. Always format your responses using Markdown.`;
            const baseSearchPrompt = `You are a research assistant AI. Your primary function is to use the Google Search tool to find the most accurate and up-to-date information for any user query.\n\n**CRITICAL INSTRUCTION: You MUST use the Google Search tool for ANY query that requires external information. Do not rely on your internal knowledge. First, search, then answer.**\n\nCurrent user context:\n- Current Time: ${timeString}\n- Timezone: ${timeZone}\n\nCRITICAL RULE: After a tool is used, you MUST respond directly to the user with a summary of the action taken. Do not call another tool or just stay silent. You must reply. Always format your responses using Markdown, and cite your sources.`;

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
            UI.appendMessage(document.getElementById('chat-messages'), `Error: Could not start chat session. ${error.message}`, 'ai');
        }
    },

    async _restartSessionWithHistory(history = []) {
        console.log('Restarting session with history preservation...');
        await this._startChat(history);
        console.log(`Session re-initialized with ${history.length} history parts.`);
    },

    async executeTool(toolCall) {
        const toolName = toolCall.name;
        const parameters = toolCall.args;
        const groupTitle = `AI Tool Call: ${toolName}`;
        const groupContent = parameters && Object.keys(parameters).length > 0 ? parameters : 'No parameters';
        console.group(groupTitle, groupContent);
        const logEntry = UI.appendToolLog(document.getElementById('tool-log-messages'), toolName, parameters);

        let resultForModel;
        let resultForLog;
        let isSuccess = true;

        try {
            if (!this.rootDirectoryHandle &&
                [
                    'create_file', 'read_file', 'search_code', 'get_project_structure',
                    'delete_file', 'build_or_update_codebase_index', 'query_codebase',
                    'create_folder', 'delete_folder', 'rename_folder', 'rewrite_file',
                    'format_code', 'analyze_code', 'rename_file'
                ].includes(toolName)
            ) {
                throw new Error("No project folder is open. Ask the user to open one.");
            }

            switch (toolName) {
                case 'get_project_structure': {
                    const tree = await FileSystem.buildStructureTree(this.rootDirectoryHandle);
                    const structure = `${tree.name}\n${FileSystem.formatTreeToString(tree)}`;
                    resultForModel = { structure: structure };
                    break;
                }
                case 'read_file': {
                    const fileHandle = await FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, parameters.filename);
                    const file = await fileHandle.getFile();
                    const content = await file.text();
                    await Editor.openFile(fileHandle, parameters.filename, document.getElementById('tab-bar'));
                    resultForModel = { content: content };
                    break;
                }
                case 'create_file': {
                    const fileHandle = await FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, parameters.filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(parameters.content);
                    await writable.close();
                    await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                        const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                        Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                    });
                    await Editor.openFile(fileHandle, parameters.filename, document.getElementById('tab-bar'));
                    resultForModel = { message: `File '${parameters.filename}' created successfully.` };
                    break;
                }
                case 'delete_file': {
                    const { parentHandle, entryName: fileNameToDelete } = await FileSystem.getParentDirectoryHandle(this.rootDirectoryHandle, parameters.filename);
                    await parentHandle.removeEntry(fileNameToDelete);
                    if (Editor.getOpenFiles().has(parameters.filename)) Editor.closeTab(parameters.filename, document.getElementById('tab-bar'));
                    await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                        const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                        Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                    });
                    resultForModel = { message: `File '${parameters.filename}' deleted successfully.` };
                    break;
                }
                case 'delete_folder': {
                    const { parentHandle, entryName } = await FileSystem.getParentDirectoryHandle(this.rootDirectoryHandle, parameters.folder_path);
                    await parentHandle.removeEntry(entryName, { recursive: true });
                    await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                        const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                        Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                    });
                    resultForModel = { message: `Folder '${parameters.folder_path}' deleted successfully.` };
                    break;
                }
                case 'rename_folder': {
                    await FileSystem.renameEntry(this.rootDirectoryHandle, parameters.old_folder_path, parameters.new_folder_path);
                    await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                        const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                        Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                    });
                    resultForModel = { message: `Folder '${parameters.old_folder_path}' renamed to '${parameters.new_folder_path}' successfully.` };
                    break;
                }
                case 'rename_file': {
                    await FileSystem.renameEntry(this.rootDirectoryHandle, parameters.old_path, parameters.new_path);
                    await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                        const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                        Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                    });
                    if (Editor.getOpenFiles().has(parameters.old_path)) {
                        Editor.closeTab(parameters.old_path, document.getElementById('tab-bar'));
                        const newFileHandle = await FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, parameters.new_path);
                        await Editor.openFile(newFileHandle, parameters.new_path, document.getElementById('tab-bar'));
                    }
                    resultForModel = { message: `File '${parameters.old_path}' renamed to '${parameters.new_path}' successfully.` };
                    break;
                }
                case 'create_folder': {
                    await FileSystem.createDirectoryFromPath(this.rootDirectoryHandle, parameters.folder_path);
                    await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                        const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                        Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                    });
                    resultForModel = { message: `Folder '${parameters.folder_path}' created successfully.` };
                    break;
                }
                case 'search_code': {
                    const searchResults = [];
                    await FileSystem.searchInDirectory(this.rootDirectoryHandle, parameters.search_term, '', searchResults);
                    resultForModel = { results: searchResults };
                    break;
                }
                case 'get_open_file_content': {
                    const activeFile = Editor.getActiveFile();
                    if (!activeFile) throw new Error('No file is currently open in the editor.');
                    resultForModel = { filename: activeFile.name, content: activeFile.model.getValue() };
                    break;
                }
                case 'get_selected_text': {
                    const editor = Editor.getEditorInstance();
                    const selection = editor.getSelection();
                    if (!selection || selection.isEmpty()) throw new Error('No text is currently selected.');
                    resultForModel = { selected_text: editor.getModel().getValueInRange(selection) };
                    break;
                }
                case 'replace_selected_text': {
                    const editor = Editor.getEditorInstance();
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
                        await UI.refreshFileTree(this.rootDirectoryHandle, (filePath) => {
                            const fileHandle = FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, filePath);
                            Editor.openFile(fileHandle, filePath, document.getElementById('tab-bar'));
                        });
                        resultForModel = { output: terminalResult.output };
                    } else {
                        throw new Error(terminalResult.message);
                    }
                    break;
                }
                case 'build_or_update_codebase_index': {
                    UI.appendMessage(document.getElementById('chat-messages'), 'Building codebase index...', 'ai');
                    const index = await CodebaseIndexer.buildIndex(this.rootDirectoryHandle);
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
                    const fileHandle = await FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, parameters.filename);
                    const writable = await fileHandle.createWritable();
                    await writable.write(parameters.content);
                    await writable.close();
                    if (Editor.getOpenFiles().has(parameters.filename)) {
                        const fileData = Editor.getOpenFiles().get(parameters.filename);
                        if (fileData) fileData.model.setValue(parameters.content);
                    }
                    await Editor.openFile(fileHandle, parameters.filename, document.getElementById('tab-bar'));
                    resultForModel = { message: `File '${parameters.filename}' rewritten successfully.` };
                    break;
                }
                case 'format_code': {
                    const fileHandle = await FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, parameters.filename);
                    const file = await fileHandle.getFile();
                    const originalContent = await file.text();
                    const parser = Editor.getPrettierParser(parameters.filename);
                    const prettierWorker = new Worker('prettier.worker.js');
                    prettierWorker.postMessage({ code: originalContent, parser });
                    resultForModel = { message: `Formatting request for '${parameters.filename}' sent.` };
                    break;
                }
                case 'analyze_code': {
                    if (!parameters.filename.endsWith('.js')) {
                        throw new Error('This tool can only analyze .js files. Use read_file for others.');
                    }
                    const fileHandle = await FileSystem.getFileHandleFromPath(this.rootDirectoryHandle, parameters.filename);
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
        UI.updateToolLog(logEntry, isSuccess);
        return { toolResponse: { name: toolName, response: resultForModel } };
    },

    async sendMessage(chatInput, chatMessages, chatSendButton, chatCancelButton, thinkingIndicator, uploadedImage, clearImagePreview) {
        const selectedModel = document.getElementById('model-selector').value;
        if (!this.chatSession || this.activeModelName !== selectedModel) {
            let historyToPreserve = this.chatSession ? await this.chatSession.getHistory() : [];
            await this._restartSessionWithHistory(historyToPreserve);
        }

        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const rateLimitMs = this.rateLimit;

        if (timeSinceLastRequest < rateLimitMs) {
            const delay = rateLimitMs - timeSinceLastRequest;
            UI.appendMessage(chatMessages, `Rate limit active. Waiting for ${Math.ceil(delay / 1000)}s...`, 'ai');
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        const userPrompt = chatInput.value.trim();
        if ((!userPrompt && !uploadedImage) || this.isSending) return;

        if (!this.chatSession) {
            await this._startChat();
            if (!this.chatSession) return;
        }

        this.lastRequestTime = Date.now();

        this.isSending = true;
        this.isCancelled = false;
        chatSendButton.style.display = 'none';
        chatCancelButton.style.display = 'inline-block';
        thinkingIndicator.style.display = 'block';

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
        UI.appendMessage(chatMessages, displayMessage.trim(), 'user');
        chatInput.value = '';
        clearImagePreview();

        console.log(`[User Query] ${userPrompt}`);

        try {
            let promptParts = initialParts;
            let running = true;
            
            ApiKeyManager.resetTriedKeys();

            while (running && !this.isCancelled) {
                const modelName = document.getElementById('model-selector').value;
                try {
                    console.log(
                        `[AI Turn] Attempting to send with key index: ${ApiKeyManager.currentIndex} using model: ${modelName}`,
                    );
                    const result = await this.chatSession.sendMessageStream(promptParts);

                    let fullResponseText = '';
                    let functionCalls = [];

                    for await (const chunk of result.stream) {
                        if (this.isCancelled) break;
                        const chunkText = chunk.text();
                        if (chunkText) {
                            fullResponseText += chunkText;
                            UI.appendMessage(chatMessages, fullResponseText, 'ai', true);
                        }
                        const chunkFunctionCalls = chunk.functionCalls();
                        if (chunkFunctionCalls) {
                            functionCalls.push(...chunkFunctionCalls);
                        }
                    }

                    if (this.isCancelled) break;

                    if (fullResponseText) {
                        console.log('[AI Reply]', fullResponseText);
                    }

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
                        running = false;
                    }
                } catch (error) {
                    console.error('An error occurred during the AI turn:', error);
                    ApiKeyManager.rotateKey();

                    if (ApiKeyManager.hasTriedAllKeys()) {
                        UI.appendMessage(chatMessages, 'All API keys failed. Please check your keys in the settings.', 'ai');
                        console.error('All available API keys have failed.');
                        running = false;
                    } else {
                        const delay = this.rateLimit;
                        UI.appendMessage(chatMessages, `API key failed. Waiting for ${Math.ceil(delay / 1000)}s before retrying...`, 'ai');
                        await new Promise(resolve => setTimeout(resolve, delay));
                        
                        const history = this.chatSession ? await this.chatSession.getHistory() : [];
                        await this._restartSessionWithHistory(history);
                        
                        this.lastRequestTime = Date.now();
                    }
                }
            }

            if (this.isCancelled) {
                UI.appendMessage(chatMessages, 'Cancelled by user.', 'ai');
            }
        } catch (error) {
            UI.appendMessage(chatMessages, `An error occurred: ${error.message}`, 'ai');
            console.error('Chat Error:', error);
        } finally {
            this.isSending = false;
            chatSendButton.style.display = 'inline-block';
            chatCancelButton.style.display = 'none';
            thinkingIndicator.style.display = 'none';
        }
    },

    cancelMessage() {
        if (this.isSending) {
            this.isCancelled = true;
        }
    },

    async clearHistory(chatMessages) {
        chatMessages.innerHTML = '';
        UI.appendMessage(chatMessages, 'Conversation history cleared.', 'ai');
        await this._startChat();
    },

    async condenseHistory(chatMessages) {
        if (!this.chatSession) {
            UI.appendMessage(chatMessages, 'No active session to condense.', 'ai');
            return;
        }

        UI.appendMessage(chatMessages, 'Condensing history... This will start a new session.', 'ai');
        const history = await this.chatSession.getHistory();
        if (history.length === 0) {
            UI.appendMessage(chatMessages, 'History is already empty.', 'ai');
            return;
        }

        const condensationPrompt =
            "Please summarize our conversation so far in a concise way. Include all critical decisions, file modifications, and key insights. The goal is to reduce the context size while retaining the essential information for our ongoing task. Start the summary with 'Here is a summary of our conversation so far:'.";

        const result = await this.chatSession.sendMessage(condensationPrompt);
        const summaryText = result.response.text();

        chatMessages.innerHTML = '';
        UI.appendMessage(chatMessages, 'Original conversation history has been condensed.', 'ai');
        UI.appendMessage(chatMessages, summaryText, 'ai');

        await this._startChat();
    },

    async viewHistory() {
        if (!this.chatSession) {
            return '[]';
        }
        const history = await this.chatSession.getHistory();
        return JSON.stringify(history, null, 2);
    },
};