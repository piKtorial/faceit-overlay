const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
    name: 'FACEIT Stats Overlay',
    script: path.join(__dirname, 'server.js')
});

// Listen for uninstall events
svc.on('uninstall', () => {
    console.log('Service uninstalled successfully!');
    console.log('You can now close this window.');
});

svc.on('error', (err) => {
    console.error('Error:', err);
});

// Uninstall the service
console.log('Uninstalling service...');
svc.uninstall(); 