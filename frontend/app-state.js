import { setup, createMachine, assign, raise } from 'https://cdn.jsdelivr.net/npm/xstate@5.20.1/+esm';

export const appMachine = setup({
  actors: {
    sendMessageService: () => Promise.resolve(), // Placeholder
  },
  actions: {
    sendAppReady: raise({ type: 'APP_READY' }),
  },
}).createMachine({
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
      entry: ['sendAppReady'],
      on: {
        APP_READY: 'idle',
        APP_FAILED: {
          target: 'error',
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },
    idle: {
      on: {
        SEND_MESSAGE: {
          target: 'sendingMessage',
          actions: assign({
            userPrompt: ({ event }) => event.prompt,
            uploadedImage: ({ event }) => event.image,
          }),
        },
        TOGGLE_FILE_TREE: {
          actions: assign({
            isFileTreeVisible: ({ context }) => !context.isFileTreeVisible,
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
            src: 'sendMessageService',
            input: ({ context }) => ({
              prompt: context.userPrompt,
              image: context.uploadedImage,
            }),
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
              actions: assign({ error: ({ event }) => event.data }),
            },
          },
        },
        handleError: {
          // This state can decide whether to retry or fail
          on: {
            RETRY: 'processing',
            FAIL: {
              target: '#app.error',
              actions: assign({ error: ({ event }) => event.error }),
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