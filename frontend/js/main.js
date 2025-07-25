import { DbManager } from './db.js';
import { ApiKeyManager } from './api_manager.js';
import { GeminiChat } from './gemini_chat.js';
import * as Editor from './editor.js';
import * as UI from './ui.js';
import * as FileSystem from './file_system.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Elements ---
    const fileTreeContainer = document.getElementById('file-tree');
    const editorContainer = document.getElementById('editor');
    const tabBarContainer = document.getElementById('tab-bar');
    const openDirectoryButton = document.getElementById('open-directory-button');
    const forgetFolderButton = document.getElementById('forget-folder-button');
    const reconnectButton = document.getElementById('reconnect-button');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const chatCancelButton = document.getElementById('chat-cancel-button');
    const apiKeysTextarea = document.getElementById('api-keys-textarea');
    const saveKeysButton = document.getElementById('save-keys-button');
    const thinkingIndicator = document.getElementById('thinking-indicator');
    const toggleFilesButton = document.getElementById('toggle-files-button');
    const imageUploadButton = document.getElementById('image-upload-button');
    const imageInput = document.getElementById('image-input');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const rateLimitSlider = document.getElementById('rate-limit-slider');
    const rateLimitInput = document.getElementById('rate-limit-input');
    const toolLogContainer = document.getElementById('tool-log-container');
    const toolLogHeader = document.querySelector('.tool-log-header');
    const viewContextButton = document.getElementById('view-context-button');
    const condenseContextButton = document.getElementById('condense-context-button');
    const clearContextButton = document.getElementById('clear-context-button');
    const contextModal = document.getElementById('context-modal');
    const contextDisplay = document.getElementById('context-display');
    const closeModalButton = contextModal.querySelector('.close-button');
    const runFolderTestsButton = document.getElementById('run-folder-tests-button');
    const formatButton = document.getElementById('format-button');

    // --- State ---
    let rootDirectoryHandle = null;
    let uploadedImage = null;
    let isFileTreeCollapsed = false;

    // --- Initialization ---
    const editor = await Editor.initializeEditor(editorContainer, tabBarContainer);
    UI.initResizablePanels(editor);

    const onFileSelect = async (filePath) => {
        const fileHandle = await FileSystem.getFileHandleFromPath(rootDirectoryHandle, filePath);
        await Editor.openFile(fileHandle, filePath, tabBarContainer);
    };
    
    async function tryRestoreDirectory() {
        const savedHandle = await DbManager.getDirectoryHandle();
        if (!savedHandle) {
            UI.updateDirectoryButtons(false);
            return;
        }

        if ((await savedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            rootDirectoryHandle = savedHandle;
            await UI.refreshFileTree(rootDirectoryHandle, onFileSelect);
            GeminiChat.initialize(rootDirectoryHandle);
        } else {
            UI.updateDirectoryButtons(false, true);
        }
    }

    await tryRestoreDirectory();
    
    // Load rate limit settings before initializing chat
    const savedRateLimit = localStorage.getItem('rateLimitValue') || '5';
    rateLimitSlider.value = savedRateLimit;
    rateLimitInput.value = savedRateLimit;
    GeminiChat.rateLimit = parseInt(savedRateLimit, 10) * 1000;

    await ApiKeyManager.loadKeys(apiKeysTextarea);
    await GeminiChat._startChat();

    // --- Event Listeners ---
    openDirectoryButton.addEventListener('click', async () => {
        try {
            rootDirectoryHandle = await window.showDirectoryPicker();
            await DbManager.saveDirectoryHandle(rootDirectoryHandle);
            await UI.refreshFileTree(rootDirectoryHandle, onFileSelect);
            GeminiChat.initialize(rootDirectoryHandle);
        } catch (error) {
            console.error('Error opening directory:', error);
        }
    });

    forgetFolderButton.addEventListener('click', async () => {
        await DbManager.clearDirectoryHandle();
        rootDirectoryHandle = null;
        const treeInstance = $('#file-tree').jstree(true);
        if (treeInstance) treeInstance.destroy();
        fileTreeContainer.innerHTML = '';
        UI.updateDirectoryButtons(false);
        Editor.clearEditor();
    });

    reconnectButton.addEventListener('click', async () => {
        let savedHandle = await DbManager.getDirectoryHandle();
        if (savedHandle) {
            try {
                if ((await savedHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
                    rootDirectoryHandle = savedHandle;
                    await UI.refreshFileTree(rootDirectoryHandle, onFileSelect);
                    GeminiChat.initialize(rootDirectoryHandle);
                } else {
                    alert('Permission to access the folder was denied.');
                }
            } catch (error) {
                console.error('Error requesting permission:', error);
                alert('There was an error reconnecting to the project folder.');
            }
        }
    });

    saveKeysButton.addEventListener('click', () => ApiKeyManager.saveKeys(apiKeysTextarea));
    chatSendButton.addEventListener('click', () => GeminiChat.sendMessage(chatInput, chatMessages, chatSendButton, chatCancelButton, thinkingIndicator, uploadedImage, clearImagePreview));
    chatCancelButton.addEventListener('click', () => GeminiChat.cancelMessage());

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            GeminiChat.sendMessage(chatInput, chatMessages, chatSendButton, chatCancelButton, thinkingIndicator, uploadedImage, clearImagePreview);
        }
    });

    editorContainer.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            Editor.saveActiveFile();
        }
    });

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

    viewContextButton.addEventListener('click', async () => {
        contextDisplay.textContent = await GeminiChat.viewHistory();
        contextModal.style.display = 'block';
    });

    condenseContextButton.addEventListener('click', () => GeminiChat.condenseHistory(chatMessages));
    clearContextButton.addEventListener('click', () => GeminiChat.clearHistory(chatMessages));

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

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage = {
                name: file.name,
                type: file.type,
                data: e.target.result.split(',')[1],
            };
            UI.updateImagePreview(imagePreviewContainer, uploadedImage, clearImagePreview);
        };
        reader.readAsDataURL(file);
    }

    function clearImagePreview() {
        uploadedImage = null;
        imageInput.value = '';
        UI.updateImagePreview(imagePreviewContainer, uploadedImage, clearImagePreview);
    }

    toggleFilesButton.addEventListener('click', () => {
        const fileTreePanel = document.getElementById('file-tree-container');
        if (!window.splitInstance || !fileTreePanel) return;

        isFileTreeCollapsed = !isFileTreeCollapsed;

        if (isFileTreeCollapsed) {
            fileTreePanel.classList.add('hidden');
            window.splitInstance.setSizes([0, 70, 30]);
        } else {
            fileTreePanel.classList.remove('hidden');
            window.splitInstance.setSizes([15, 55, 30]);
        }
        setTimeout(() => editor.layout(), 50);
    });

    if (formatButton) {
        formatButton.addEventListener('click', () => {
            const activeFile = Editor.getActiveFile();
            if (!activeFile) {
                alert('Please open a file to format.');
                return;
            }
            const originalContent = activeFile.model.getValue();
            const parser = Editor.getPrettierParser(activeFile.name);
            const prettierWorker = new Worker('prettier.worker.js');

            prettierWorker.onmessage = (event) => {
                if (event.data.success) {
                    activeFile.model.setValue(event.data.formattedCode);
                    console.log(`File '${activeFile.name}' formatted successfully.`);
                } else {
                    console.error('Error formatting file:', event.data.error);
                    alert('An error occurred while formatting the file.');
                }
            };
            prettierWorker.postMessage({ code: originalContent, parser });
        });
    }

    // --- Tab Bar Mouse Wheel Scrolling ---
    tabBarContainer.addEventListener('wheel', (event) => {
        if (event.deltaY !== 0) {
            event.preventDefault();
            tabBarContainer.scrollLeft += event.deltaY;
        }
    });
});