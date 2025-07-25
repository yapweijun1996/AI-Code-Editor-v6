import { setup, createMachine, assign, raise } from 'https://cdn.jsdelivr.net/npm/xstate@5.20.1/+esm';

export const appMachine = setup({
  actors: {
    sendMessageService: () => Promise.resolve(), // Placeholder
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
      entry: raise({ type: 'APP_READY' }),
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
      invoke: {
        id: 'sendMessageToAI',
        src: 'sendMessageService',
        input: ({ context }) => ({
          prompt: context.userPrompt,
          image: context.uploadedImage,
        }),
        onDone: {
          target: 'idle',
          actions: assign({
            userPrompt: '',
            uploadedImage: null,
            error: null,
          }),
        },
        onError: {
          target: 'idle',
          actions: assign({
            error: ({ event }) => event.data,
            userPrompt: '',
            uploadedImage: null,
          }),
        },
      },
      on: {
        CANCEL_MESSAGE: 'idle',
      },
    },
    error: {
      // Final error state for the application
    },
  },
});