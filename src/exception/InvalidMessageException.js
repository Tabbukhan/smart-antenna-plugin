const {Exception} = require("@speedshield/velocity-commons");

class InvalidMessageException extends Exception {

    constructor(msg, inner) {
        super(msg, inner);
    }
}

exports.InvalidMessageException = InvalidMessageException;