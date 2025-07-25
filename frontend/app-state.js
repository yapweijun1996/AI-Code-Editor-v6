import { createMachine, assign } from 'xstate';

export const appMachine = createMachine({
  id: 'app',
  initial: 'initializing',
  context: {
    // To hold the chat session, user input, etc.
    chatSession: null,
    userPrompt: '',
    uploadedImage: null,
    history: [],
    error: null,
    isFileTreeVisible: true,
  },
  states: {
    initializing: {
      on: {
        APP_READY: 'idle',
        APP_FAILED: {
          target: 'error',
          actions: assign({ error: (context, event) => event.error }),
        },
      },
    },
    idle: {
      on: {
        SEND_MESSAGE: {
          target: 'sendingMessage',
          actions: assign({
            userPrompt: (context, event) => event.prompt,
            uploadedImage: (context, event) => event.image,
          }),
        },
        TOGGLE_FILE_TREE: {
          actions: assign({
            isFileTreeVisible: (context) => !context.isFileTreeVisible,
          }),
        },
      },
    },
    sendingMessage: {
      initial: 'processing',
      states: {
        processing: {
          invoke: {
            id: 'sendMessageToAI',
            src: 'sendMessageService', // This will be implemented in app.js
            onDone: {
              target: '#app.idle', // Go back to top-level idle
              actions: assign({
                // Clear inputs after successful send
                userPrompt: '',
                uploadedImage: null,
              }),
            },
            onError: {
              target: 'handleError',
              actions: assign({ error: (context, event) => event.data }),
            },
          },
        },
        handleError: {
          // This state can decide whether to retry or fail
          on: {
            RETRY: 'processing',
            FAIL: {
              target: '#app.error',
              actions: assign({ error: (context, event) => event.error }),
            },
          },
        },
      },
      on: {
        CANCEL_MESSAGE: 'idle', // Allow cancellation
      },
    },
    error: {
      // Final error state for the application
    },
  },
});