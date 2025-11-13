
const {describe, it, before, after} = require("mocha");
const {expect} = require("chai");

const {LogFactory} = require("@speedshield/velocity-logging");

const {SmartAntennaService} = require("../../src/SmartAntennaService");

const TOPIC = {
    invalid: "invalid.topic",
    validated: "valid.topic"
};

function AsyncRunner(cb) {
    return (done) => {
        try {
            let result = cb();
            if(result instanceof Promise) {
                result.then(done).catch(done);
            } else if(result instanceof Error) {
                done(result);
            } else {
                done();
            }
        } catch(e) {
            done(e);
        }
    }
}

describe.only("SmartAntennaService", () => {
    /** @type {SmartAntennaService} */
    let service = null;

    before((done) => {
        LogFactory.silent = true;
        service = new SmartAntennaService({
            kafka_destination_topic: TOPIC.validated,
            kafka_invalid_topic: TOPIC.invalid
        });
        service.init().then(done).catch(done);
    });

    after((done) => {
        service.stop().then(done).catch(done);
        LogFactory.silent = false;
    });

    it("should process an invalid event and generate dead.letter messages", () => {
        let results = service.processEventObj({
            body: null,
            header: "asd"
        });

        expect(results).to.have.lengthOf(1);
        expect(results[0].action).to.equal("publish");
        expect(results[0].params.topic).to.deep.equal(TOPIC.invalid);
    });

    it("should process a single valid event", () => {
        let results = service.processEventObj(require("./resources/single.json"));

        expect(results).to.have.lengthOf(1);
        expect(results[0].action).to.equal("publish");
        expect(results[0].params.topic).to.deep.equal(TOPIC.validated);
    });

    it("should process a single set of valid events", () => {
        let results = service.processEventObj(require("./resources/multiple.json"));

        expect(results).to.have.lengthOf(3);
        expect(results[0].action).to.equal("publish");
        expect(results[0].params.topic).to.deep.equal(TOPIC.validated);
        expect(results[1].action).to.equal("publish");
        expect(results[1].params.topic).to.deep.equal(TOPIC.validated);
        expect(results[2].action).to.equal("publish");
        expect(results[2].params.topic).to.deep.equal(TOPIC.validated);
    });

    
});