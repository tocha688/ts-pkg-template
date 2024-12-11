process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (warning.name === 'ExperimentalWarning' && warning.message.includes('Fetch API')) {
        return;
    }
    console.warn(warning);
});
