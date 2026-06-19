const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
let shuttingDown = false;

const processes = [
  {
    name: 'server',
    command: 'node server/dist/index.js',
  },
  {
    name: 'client',
    command: 'npm --prefix client run preview',
  },
];

const children = processes.map(({ name, command }) => {
  const child = spawn(command, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[${name}] exited with ${reason}; stopping remaining processes.`);
    shutdown(code || 1);
  });

  child.on('error', (err) => {
    if (shuttingDown) return;
    console.error(`[${name}] failed to start: ${err.message}`);
    shutdown(1);
  });

  return child;
});

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
