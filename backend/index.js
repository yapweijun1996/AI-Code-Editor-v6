const express = require('express');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const app = express();
const port = 3333;

app.use(express.json());

// Serve the frontend static files.
app.use(express.static(path.join(__dirname, '../frontend')));

// =================================================================
// === Backend Terminal Tool Execution Endpoint                  ===
// =================================================================
app.post('/api/execute-tool', async (req, res) => {
  const { toolName, parameters } = req.body;

  if (toolName !== 'run_terminal_command') {
    return res
      .status(501)
      .json({
        status: 'Error',
        message: `Tool '${toolName}' is not implemented on the backend.`,
      });
  }

  const { command } = parameters;
  if (!command) {
    return res
      .status(400)
      .json({ status: 'Error', message: "A 'command' parameter is required." });
  }

  // Determine the shell based on the operating system
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME, // Start in the user's home directory
    env: process.env,
  });

  let output = '';
  ptyProcess.onData((data) => {
    output += data;
    console.log('[TERMINAL]', data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[TERMINAL] Process exited with code ${exitCode}`);
    if (exitCode === 0) {
      res.json({ status: 'Success', output: output });
    } else {
      res
        .status(500)
        .json({
          status: 'Error',
          message: `Command failed with exit code ${exitCode}.`,
          output: output,
        });
    }
  });

  console.log(`[BACKEND] Executing command: ${command}`);
  ptyProcess.write(command + '\r');

  // Add a small delay and then send an exit command to ensure the process terminates
  // if the executed command is non-interactive.
  setTimeout(() => {
    if (!ptyProcess.killed) {
      ptyProcess.write('exit\r');
    }
  }, 1000); // Wait 1 second before exiting

  // Timeout to prevent hanging processes
  setTimeout(() => {
    if (!res.headersSent) {
      ptyProcess.kill();
      console.error('[BACKEND] Command timed out.');
      res
        .status(500)
        .json({
          status: 'Error',
          message: 'Command execution timed out.',
          output: output,
        });
    }
  }, 15000); // 15-second timeout
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log('Navigate to http://localhost:3000 to open the editor.');
});
