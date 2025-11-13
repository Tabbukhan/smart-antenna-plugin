const {ClusterManager} = require("@speedshield/velocity-commons");
const LOG = require("@speedshield/velocity-logging").LogFactory.getLogger("ClusterManager");

ClusterManager({
    LOG: LOG,
    // eslint-disable-next-line no-unused-vars
    spawner: (opts) => {
        require("./Main");
    }
});
