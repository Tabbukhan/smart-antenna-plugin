"use strict";

const {SmartAntennaService} = require("./SmartAntennaService");
const {VGWServer} = require("@speedshield/velocity-gateway-core");
const LOG = require("@speedshield/velocity-logging").LogFactory.getLogger("Main");
const {ConfigurationManager} = require("@speedshield/velocity-configuration-manager");

async function Main() {
    const cManager = ConfigurationManager.CreateDefaultManager({
        prefix: "dev"
    });

    const serverConfig = await cManager.generateConfig("velocity-gateway.yaml");
    const pluginConfig = await cManager.generateConfig("SmartAntennaService.yaml");

    let server = new VGWServer(serverConfig);
    server.setupSignalHandling(); // Let the VGW server handle sigint and sigterm

    let plugin = new SmartAntennaService(pluginConfig.parameters);
    await plugin.init();
    
    server.registerPlugin(plugin, pluginConfig.name, pluginConfig.version);

    await server.init();
    server.start();
}

Main().catch((err) => {
    LOG.warn("Fatal error occured in Main: ", err);
    process.exit(1);
});

process.on("uncaughtException", (err) => {
    LOG.error("Uncaught Exception: " + err.stack);
    // process.exit(1);
});

process.on("unhandledRejection", (err) => {
    LOG.error("Unhandled Rejection: " + err.stack);
    // process.exit(1);
});