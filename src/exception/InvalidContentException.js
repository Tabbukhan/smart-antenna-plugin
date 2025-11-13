const {Exception} = require("@speedshield/velocity-commons");

class InvalidContentException extends Exception {

    constructor(msg, inner, event) {
        super(msg, inner);
        this.event = event;
    }
}

exports.InvalidContentException = InvalidContentException;