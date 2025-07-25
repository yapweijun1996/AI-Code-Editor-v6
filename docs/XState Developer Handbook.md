XState Developer Handbook for Node.js/HTML/JavaScript Projects
This handbook explains how to use XState (version 5) to model complex behaviour in Node.js, vanilla HTML/JavaScript and CSS projects. XState is a library for building finite‑state machines, statecharts and actors. It provides a formal way to model complex workflows and orchestrate asynchronous work.

1 Why use XState?
State machines describe behaviour as a finite set of states and transitions triggered by events. XState augments this model with statecharts (nested, parallel and history states) and an actor model. Actors are independent processes that communicate by sending events asynchronously; each actor has its own encapsulated state and processes messages sequentially
stately.ai
. Actors can create new actors (either invoke or spawn)
stately.ai
, making it possible to compose complex systems from smaller pieces. Using XState yields benefits such as visualisation, explicit behaviour, predictable state transitions and easier testing.

2 Installation
2.1 Node.js projects
Install the XState package from npm using your preferred package manager:

bash
Copy
Edit
# npm
npm install xstate

# pnpm
pnpm add xstate

# Yarn
yarn add xstate
These commands install the xstate library so that it can be imported into Node or bundler‑based frontend projects
stately.ai
.

2.2 Browser projects (HTML/CSS/JavaScript)
For a project that uses plain HTML and JavaScript (no bundler), include XState via a CDN. The global XState object exposes the same APIs as the xstate package
graph-docs.vercel.app
:

html
Copy
Edit
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF‑8">
  <title>My XState App</title>
  <script src="https://cdn.jsdelivr.net/npm/xstate@latest/dist/xstate.web.js"></script>
</head>
<body>
  <script>
    const { createMachine, createActor, assign } = XState;
    // … define your machine here …
  </script>
</body>
</html>
3 Core concepts
3.1 Machines, states and events
A state machine defines a finite set of states and transitions between them triggered by events. You create a machine with createMachine(config) or setup(...).createMachine(config). Each machine configuration must specify an initial state
stately.ai
 and can define nested or parallel child states
stately.ai
stately.ai
.

Transitions are defined under a state’s on property. Each key corresponds to an event type, and the value defines a target state (and optionally actions or guards). Events are plain objects with a mandatory type property
stately.ai
. When an event is sent to an actor, XState checks transitions starting from the deepest active state; the first transition whose guard (if any) evaluates to true is taken
stately.ai
.

Self‑transitions can be declared by omitting the target property; they update context or perform actions without leaving the state
stately.ai
.

3.2 Context and actions
A machine may have context, which stores data relevant to the actor but not part of its finite state. Define the initial context via the context property; it can be a plain object or a function that computes context from input or static values
stately.ai
. Context is immutable; update it using the built‑in assign(...) action inside transitions or state entry/exit handlers. There are two forms of assigners:

Object assigner – provide an object mapping context keys to values or functions; the assigner merges the result with the existing context
graph-docs.vercel.app
.

Function assigner – supply a function (args) => newContext that returns the entire updated context
graph-docs.vercel.app
.

Multiple assign actions can be specified in an array; they will run sequentially and each update uses the updated context from the previous assign
graph-docs.vercel.app
.

Actions are side‑effect functions executed when transitions occur or when entering/exiting states. They can log, update context, call external functions or dispatch events. Use the entry and exit properties on a state to run actions upon entering or leaving the state
graph-docs.vercel.app
. Actions on transitions are specified via the actions property
graph-docs.vercel.app
. Built‑in actions include:

assign (described above) for updating context.

send to send events to the current or another actor
graph-docs.vercel.app
.

pure for dynamically returning other actions at runtime
graph-docs.vercel.app
.

stopChild to stop a spawned actor (see § 5).

3.3 Guards
A guard is a pure boolean function that determines whether a transition may occur. Guards evaluate synchronously based on current context and event. A transition with a guard only proceeds when the guard returns true; otherwise XState tries other transitions or ignores the event. Guards are specified via cond on a transition
stately.ai
. When there are multiple guarded transitions for the same event, XState checks them in order and takes the first matching one
stately.ai
.

3.4 Eventless, delayed and timed transitions
Eventless (always) transitions: Use the always property on a state to specify transitions that occur automatically when the state is entered. Guards can prevent the transition; if no guard or target is provided, an always transition may lead to an infinite loop
stately.ai
.

Delayed transitions: Use the after property to schedule a transition after a specified time (milliseconds). You can inline the delay (after: { 1000: { target: 'next' } }) or reference a named delay defined in setup’s delays option
stately.ai
stately.ai
. Delays may also be computed dynamically from context
stately.ai
.

3.5 Hierarchical states
Parent (compound) states: States can contain nested states. A parent state must define an initial child state
stately.ai
. Entering a parent state automatically enters its initial child; leaving the parent exits its active child.

Parallel states: A parallel state has multiple regions that are active simultaneously. Each region has its own child states and initial state. Events are broadcast to all regions. The state value is an object with keys for each region
stately.ai
. A parent can transition when all regions reach final states using an onDone transition
stately.ai
.

History states: A history pseudostate remembers the last active child when a parent state is reentered. A shallow history remembers only the immediate child state; a deep history remembers the entire nested path. Define a history state using { type: 'history' } (shallow) or { type: 'history', history: 'deep' }
stately.ai
. You can specify a target to indicate the default state if there is no history.

Final states: A state with type: 'final' signals completion. When a machine reaches a top‑level final state, the actor stops and cannot receive further events
stately.ai
. Child final states may trigger an onDone transition on the parent
stately.ai
. Machines can have multiple final states.

3.6 State object and tags
Each actor snapshot returned from actor.getSnapshot() contains:

value: the current finite state or nested object for parallel/compound states.

context: the current context object.

meta: optional metadata defined on states (e.g., tags).

You can subscribe to state changes via actor.subscribe(...) or obtain the snapshot synchronously via actor.getSnapshot()
stately.ai
.

States may specify a tags array for categorising states (e.g., 'loading', 'visible'). Use state.hasTag('loading') to check if a tag is active
stately.ai
. Tags can be strongly typed in TypeScript.

4 Running machines – the actor model
4.1 Actors and the actor model
When you run a state machine, it becomes an actor: a live process that can receive events, send events and change its behaviour based on events. Actors process one message at a time and encapsulate their state
stately.ai
. They communicate with each other by sending and receiving events asynchronously
stately.ai
. An actor’s state cannot be updated from outside; only the actor’s logic modifies its state
stately.ai
.

Create an actor using createActor(actorLogic, options?) where actorLogic can come from createMachine, fromPromise, fromTransition, fromObservable or fromCallback. After creating the actor, call .start() to begin processing events
stately.ai
. You can stop the actor with .stop(), which stops all child actors as well
stately.ai
.

Example:

js
Copy
Edit
import { createMachine, createActor, assign } from 'xstate';

const counterMachine = createMachine({
  id: 'counter',
  initial: 'active',
  context: { count: 0 },
  on: {
    INCREMENT: { actions: assign({ count: ({ context }) => context.count + 1 }) },
    DECREMENT: { actions: assign({ count: ({ context }) => context.count - 1 }) },
  },
});

const counterActor = createActor(counterMachine);
counterActor.subscribe(snapshot => {
  console.log('State:', snapshot.value, 'count:', snapshot.context.count);
});
counterActor.start();
// send events
counterActor.send({ type: 'INCREMENT' });
4.2 Invoking and spawning actors
Invoking starts a child actor when entering a particular state and stops it when leaving that state. It is useful for finite or scoped tasks such as fetching data. Use the invoke property on a state with src referencing a named actor source defined in setup({ actors }). Provide optional input to compute input values from context and specify onDone/onError transitions
stately.ai
. Invoked actors may also be declared at the root of the machine so they run for the lifetime of the machine
stately.ai
. Multiple actors can be invoked using an array under invoke
stately.ai
.

Example of invoking a promise actor to fetch user data:

js
Copy
Edit
import { setup, createActor, fromPromise, assign } from 'xstate';

const userMachine = setup({
  actors: {
    fetchUser: fromPromise(async ({ input }) => {
      const res = await fetch(`/api/users/${input.userId}`);
      return await res.json();
    }),
  },
}).createMachine({
  initial: 'idle',
  context: { userId: '42', user: undefined, error: undefined },
  states: {
    idle: {
      on: { FETCH: { target: 'loading' } },
    },
    loading: {
      invoke: {
        id: 'getUser',
        src: 'fetchUser',
        input: ({ context }) => ({ userId: context.userId }),
        onDone: {
          target: 'success',
          actions: assign({ user: ({ event }) => event.output }),
        },
        onError: {
          target: 'failure',
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },
    success: {},
    failure: { on: { RETRY: { target: 'loading' } } },
  },
});
Spawning creates actors dynamically at runtime. Spawned actors are not tied to a state’s lifecycle; they continue running until explicitly stopped or their parent actor stops. Use spawnChild(actorLogic, { id }) in an entry action to spawn an actor without tracking its reference
stately.ai
, or use the spawn helper inside an assign action to store an ActorRef in context
stately.ai
. When using spawn, remove the reference on exit using stopChild to avoid memory leaks
stately.ai
.

Example of spawning multiple child actors:

js
Copy
Edit
import { createMachine, assign } from 'xstate';

const childMachine = createMachine({ /* child logic */ });

const parentMachine = createMachine({
  initial: 'active',
  context: { children: [] },
  entry: assign({
    children: ({ spawn }) => [
      spawn(childMachine, { id: 'child-1' }),
      spawn(childMachine, { id: 'child-2' }),
    ],
  }),
});
4.3 Actor types
XState provides several actor logic creators:

Actor type	Logic creator	Capabilities
State machine actor	createMachine(...)	Receives and sends events; can spawn/invoke child actors; accepts input and produces output
stately.ai
.
Promise actor	fromPromise(promiseFn)	Represents an asynchronous task. It resolves with an output and may send events to other actors. Promise actors cannot receive events
stately.ai
.
Transition actor	fromTransition(reducer, initial)	Uses a reducer function to update a state object (similar to Redux). It receives events and can send events to other actors, but it cannot spawn actors or produce output
stately.ai
.
Callback actor	fromCallback(callback)	Executes a function that can sendBack events to its parent and receive events from other actors. It is useful for listening to event sources (e.g., DOM events). Callback actors run indefinitely and do not produce output
stately.ai
.
Observable actor	fromObservable(observableFn)	Integrates with observable libraries like RxJS. It represents an observable stream; it sends values to the actor’s context but does not receive events or produce output
stately.ai
.

4.4 Input and output
You can pass input to an actor when creating it by supplying an input object in the options argument of createActor. The input is available in the machine or actor logic via the input property of the first argument. For state machines, you typically use a function in the context property to derive initial context from input
stately.ai
. The input is included in the xstate.init event dispatched when the actor starts
stately.ai
.

Actors produce output when they reach a final state (status: 'done'). For machine actors you define an output: (args) => output function in the machine configuration; for promise actors the resolved value of the promise becomes the output
stately.ai
stately.ai
. Subscribers can read snapshot.output when the status is 'done'
stately.ai
.

4.5 Systems and actor registration
When an actor is created via createActor(machine).start(), XState implicitly creates an actor system. All actors spawned or invoked by the root actor become part of this system. You can access the system via actor.system
stately.ai
. Actors can be registered with a system‑wide systemId (specified on invoke or spawn) and looked up via system.get(id)
stately.ai
. Stopping the root actor stops the entire system
stately.ai
.

5 Advanced topics
5.1 Persistence
XState can persist the internal state of actors, including nested actors, so that systems can resume after a restart. To persist an actor, call actor.getPersistedSnapshot() and save it (e.g., to localStorage or a database). To restore, provide the snapshot in the snapshot option when creating the actor: createActor(logic, { snapshot }).start(). Persisted snapshots include details about invoked and spawned actors so they can be restored
stately.ai
.

5.2 Event emitter
Actors can emit custom events to external listeners using the emit action or emit method within logic such as promise, transition, observable or callback actors. Define an action that calls emit({ type: 'eventName', ...payload }), then subscribe to actor events via actor.on('eventName', handler)
stately.ai
. Emitted events are delivered asynchronously and can be used to notify other parts of your application without changing state.

5.3 Tags and inspections
Tags allow you to categorise states. Use them to quickly check if the machine is in a “loading” or “error” state: state.hasTag('loading')
stately.ai
. The Stately Visualizer and VS Code extension provide graphical inspection of machines for debugging.

5.4 TypeScript and setup function
For TypeScript projects, use the setup({ types, actions, actors, guards, delays }) helper to strongly type the machine configuration and reuse named implementations. This reduces boilerplate and improves type inference
stately.ai
. Provide types for context, events, input and output in the types property; define named actions and actors in the actions and actors properties and reference them by name in your machine configuration
stately.ai
.

6 Building projects with XState
6.1 Node.js CLI or server applications
XState works wherever JavaScript runs. In Node.js you can model asynchronous workflows (e.g., server requests, file operations) as machines. Here is a simple Node example that models a server request lifecycle:

js
Copy
Edit
// server.js
import { createMachine, createActor, assign } from 'xstate';

// A machine modelling a request–response lifecycle
const requestMachine = createMachine({
  id: 'request',
  initial: 'idle',
  context: { url: '', response: null, error: null },
  states: {
    idle: {
      on: {
        SEND: {
          target: 'pending',
          actions: assign({ url: (_, evt) => evt.url }),
        },
      },
    },
    pending: {
      // simulate asynchronous call via delayed transition
      after: {
        1000: {
          target: 'success',
          actions: assign({ response: () => ({ ok: true }) }),
        },
      },
      on: {
        CANCEL: { target: 'idle' },
      },
    },
    success: {
      entry: () => console.log('Request succeeded!'),
      on: {
        RESET: { target: 'idle', actions: assign({ response: null }) },
      },
    },
    failure: {
      entry: () => console.log('Request failed!'),
    },
  },
});

const actor = createActor(requestMachine);
actor.subscribe((s) => console.log('state:', s.value));
actor.start();

// send events from CLI or other code
actor.send({ type: 'SEND', url: 'https://example.com' });
This script demonstrates using delayed transitions (after), context assignments and entry actions in a Node environment. You could replace the delayed transition with an invoked promise actor (see §4.2) that fetches a URL.

6.2 Vanilla HTML/JavaScript
When building an interactive web page without a framework, XState can manage UI state. The following example uses a toggle machine to control a HTML button and updates the CSS class accordingly:

html
Copy
Edit
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF‑8">
  <title>Toggle Example</title>
  <script src="https://cdn.jsdelivr.net/npm/xstate@latest/dist/xstate.web.js"></script>
  <style>
    .active { background: green; color: white; }
    .inactive { background: gray; color: black; }
  </style>
</head>
<body>
  <button id="toggleBtn" class="inactive">OFF</button>

  <script>
    const { createMachine, createActor } = XState;

    // Define a simple toggle machine
    const toggleMachine = createMachine({
      id: 'toggle',
      initial: 'inactive',
      states: {
        inactive: { on: { TOGGLE: 'active' } },
        active:   { on: { TOGGLE: 'inactive' } },
      },
    });

    // Create and start the actor
    const actor = createActor(toggleMachine);
    actor.start();

    // Update the DOM based on state changes
    const button = document.getElementById('toggleBtn');
    actor.subscribe((snapshot) => {
      const state = snapshot.value;
      button.textContent = state === 'active' ? 'ON' : 'OFF';
      button.className = state;
    });

    // Send events when the button is clicked
    button.addEventListener('click', () => actor.send({ type: 'TOGGLE' }));
  </script>
</body>
</html>
This example loads XState via CDN, defines a machine, creates an actor and subscribes to state changes to update the UI. The machine’s states correspond to CSS classes to style the button.

6.3 Integration with frameworks
XState integrates with React (@xstate/react), Vue, Svelte and other frameworks, but those integrations are beyond the scope of this Node/vanilla guide. For React, you would use useActor or useMachine hooks to bind state to components.

7 Best practices
Model finite states first – Identify the distinct states of your system (e.g., idle, loading, success, error) before adding context. Keep the number of states minimal and descriptive.

Separate state and side effects – Use actions to perform side effects; avoid performing side effects directly in guards or event handlers.

Use context sparingly – Only store data that changes while the machine remains in the same state. For long‑lived or global data, consider storing it elsewhere.

Guard conditional transitions – Use guards to express business rules clearly (e.g., isValid check before submitting a form)
stately.ai
.

Leverage history and parallel states – Use history states to resume work where you left off and parallel states to model concurrent concerns. These features reduce complexity compared to manual state variables
stately.ai
stately.ai
.

Name invoked and spawned actors – Provide id and systemId to identify actors in logs and for sending events via sendTo or system.get(...)
stately.ai
.

Persist actor state – Persist actor snapshots when necessary so you can restore them after reload or across serverless invocations
stately.ai
.

Use the Visualizer – Stately provides a visualizer and VS Code extension for inspecting machines; these tools help validate your model and debug unexpected transitions.

Conclusion
XState brings the discipline of finite‑state machines and the power of actors to JavaScript. By modelling your application’s behaviour explicitly, you gain clarity and predictability. Whether you are building a Node.js backend, a vanilla JavaScript front‑end or a full‑stack application, XState can orchestrate asynchronous work, manage complex UI interactions and make your code easier to reason about.