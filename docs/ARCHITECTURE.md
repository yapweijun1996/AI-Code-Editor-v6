# Architecture

This document outlines the architecture of the AI-Powered Code Editor.

## Core Components

*   **Frontend**: A single-page application built with HTML, CSS, and JavaScript. It uses the Monaco Editor for the text editor and communicates with the backend via a REST API.
*   **Backend**: A Node.js server using Express. It handles requests from the frontend, communicates with the Google Gemini API, and can execute terminal commands.
*   **AI Agent**: The agent logic is integrated into the frontend, using the Gemini API for tool-calling and chat functionality.

## Session and State Management

The application's state management is architected to be robust and resilient, especially during error recovery.

*   **Stateful Session Initialization**: The core principle is that a Gemini chat session's history is immutable after creation. Therefore, the application ensures that any new session, whether started fresh or restarted after an error, is initialized correctly.
*   **Correct History Preservation**: When a session needs to be restarted (e.g., due to a model change or a transient API error), the complete history from the previous session is first retrieved. This history is then passed directly into the `model.startChat({ history: [...] })` method.
*   **Architectural Soundness**: This approach is the officially supported method by the Google AI SDK and prevents the context loss and cascading failures that occurred with previous, incorrect implementations (which attempted to modify the history of a live session object). The `_startChat(history = [])` function in `frontend/app.js` is the single source of truth for this logic.
