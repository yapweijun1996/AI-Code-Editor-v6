import { buildTree } from './file_system.js';

export function initResizablePanels(editor) {
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

export function renderTree(treeData, onFileSelect) {
    $('#file-tree')
    .on('select_node.jstree', (e, data) => {
        if (data.node.type === 'file') {
            onFileSelect(data.node.id);
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

export async function refreshFileTree(rootDirectoryHandle, onFileSelect) {
    if (rootDirectoryHandle) {
        const treeInstance = $('#file-tree').jstree(true);
        if (treeInstance) {
            treeInstance.destroy();
        }

        const treeData = await buildTree(rootDirectoryHandle);
        renderTree(treeData, onFileSelect);

        updateDirectoryButtons(true);
    }
}

export function updateDirectoryButtons(isConnected, needsReconnect = false) {
    const openDirBtn = document.getElementById('open-directory-button');
    const forgetBtn = document.getElementById('forget-folder-button');
    const reconnectBtn = document.getElementById('reconnect-button');

    if (!openDirBtn || !forgetBtn || !reconnectBtn) {
        console.warn('Directory control buttons not found in the DOM.');
        return;
    }

    if (isConnected) {
        openDirBtn.style.display = 'none';
        forgetBtn.style.display = 'block';
        reconnectBtn.style.display = 'none';
    } else if (needsReconnect) {
        openDirBtn.style.display = 'none';
        forgetBtn.style.display = 'block';
        reconnectBtn.style.display = 'block';
    } else {
        openDirBtn.style.display = 'block';
        forgetBtn.style.display = 'none';
        reconnectBtn.style.display = 'none';
    }
}

export function appendMessage(chatMessages, text, sender, isStreaming = false) {
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
}

export function appendToolLog(toolLogMessages, toolName, params) {
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
}

export function updateToolLog(logEntry, isSuccess) {
    const statusIcon = logEntry.querySelector('.status-icon');
    statusIcon.classList.remove('loader');
    statusIcon.classList.add(isSuccess ? 'completed' : 'failed');
    statusIcon.textContent = isSuccess ? '✔' : '✖';
}

export function updateImagePreview(imagePreviewContainer, uploadedImage, clearImagePreview) {
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