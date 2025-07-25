const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).send({ status: 'OK', message: 'Server is running.' });
  });
  
  // Endpoint to execute terminal commands
  app.post('/api/execute-tool', (req, res) => {
  	const { toolName, parameters } = req.body;
  	
  	if (toolName !== 'run_terminal_command') {
  		return res.status(400).json({
  			status: 'Error',
  			message: `Tool '${toolName}' is not supported by this endpoint.`,
  		});
  	}
  	
  	const command = parameters.command;
  	if (!command) {
  		return res
  		.status(400)
  		.json({ status: 'Error', message: 'No command provided.' });
  	}
  	
  	exec(command, (error, stdout, stderr) => {
  		if (error) {
  			console.error(`exec error: ${error}`);
  			return res.status(500).json({
  				status: 'Error',
  				message: `Command failed: ${error.message}`,
  				stderr: stderr,
  			});
  		}
  		res.json({
  			status: 'Success',
  			stdout: stdout,
  			stderr: stderr,
  		});
  	});
  });
  
  // For any other route, serve the index.html file
  app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(port, () => {
  console.log(`AI Code Editor server listening at http://localhost:${port}`);
});