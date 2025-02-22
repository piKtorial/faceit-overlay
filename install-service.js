const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
    name: 'FACEIT Stats Overlay',
    description: 'FACEIT stats overlay server for OBS',
    script: path.join(__dirname, 'server.js'),
    nodeOptions: [],
    // Allow the service to restart when it fails
    restartOnFailure: true
});

// Listen for install events
svc.on('install', () => {
    console.log('Service installed successfully!');
    svc.start();
    console.log('Service started!');
    console.log('You can now close this window and the server will keep running.');
    console.log('The overlay will be available at: http://localhost:3000/overlay.html');
});

svc.on('error', (err) => {
    console.error('Error:', err);
});

// Install the service
console.log('Installing service...');
svc.install(); 