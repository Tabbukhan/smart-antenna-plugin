"use strict";

require("dotenv").config();
const {describe, it} = require("mocha");
// const expect = require("expect");
const {
    MessageContext, ServiceContext, ServiceContextProperties, KafkaTransportSender,
    ServerConfigurationContext, GatewayEngine, ServerConfig
} = require("@speedshield/velocity-gateway-core");
const cbor = require("cbor");
const {SmartAntennaService} = require("../../lib/SmartAntennaService/SmartAntennaService");

describe("SmartAntennaService", function () {

    let messageContext;
    let serviceContext;
    let cborMessageSessionEvent = "A201A406001940016A313731373030343535341940020119200B6B4C3137373839323434324A02A103A204A4070508010974323031382D30362D31345431313A35393A34315A196001181905B8400B1903151920011914E919200218540E74323031382D30372D33305431313A33333A30315A0F74323031382D30372D33305431313A35333A34315A101904D8111A0022189019200C1A00221D40121A00210C8519200D1A00211103131A000E2A0F19200E1A000E2C9C141A000F728419200F1A000F7591151A00882AC91920101A00882E4F161A002218901920111A00221D401718F119201219011D18181A000F20071920131A000F222618191A0012F8891920141A0012FB1A181A1A0001600B1920151A0001602C181B1904B0181C1904D8181D19030D181E19028D181F1903851820190188182119038618221901F61825190116182618E71827189018281878182918E0182A19016B182B18C1182C18E1182D04182E02182F183818300C183118BD183219025018330118340218350118360318370818380918390F183A011960021850196003189619600418A519600518C81960061907D01960071913881960080219600904";
    let deCborMessageSessionEvent = cbor.decode(cborMessageSessionEvent);
    let serviceContextProperties = {
        PARAMETERS: {
            device_manager_epr: process.env.DEVICE_MANAGER_HOSTNAME,
            stream_manager_epr: process.env.STREAM_MANAGER_HOSTNAME,
            authenticator_host: process.env.DEV_REDIS_NAME,
            authenticator_port: 6379,
            kafka_destination_topic: "er.event.sa",
            kafka_invalid_topic: "dead.letter",
            isCoAPService: true
        }
    };
    ServiceContextProperties.PARAMETERS = serviceContextProperties.PARAMETERS;
    let senderParams = new Map();
    senderParams.set("broker_list", process.env.KAFKA_HOSTNAME);
    let kafkaSender = new KafkaTransportSender("kafka", senderParams);

    let serverConfig = ServerConfig.getInstance();
    let svrConfig = new ServerConfigurationContext(serverConfig);
    GatewayEngine.init(svrConfig);

    // eslint-disable-next-line no-undef
    before(async function () {
        messageContext = new MessageContext();
        serviceContext = new ServiceContext();
        serviceContext.setProperty(ServiceContextProperties.PARAMETERS, serviceContextProperties.PARAMETERS);
        // serviceContext.setProperty("device_manager_epr", "localhost");
        // serviceContext.setProperty("stream_manager_epr", "localhost");
        // serviceContext.setProperty("authenticator_host", "localhost");
        // serviceContext.setProperty("authenticator_port", "80");
        // serviceContext.setProperty("kafka_destination_topic", "er.event.sa");
        // serviceContext.setProperty("kafka_invalid_topic", "dead.letter");
    });

    describe("#processEvents", function () {
        it("should process incoming event successfully", async function () {
            await kafkaSender.init();
            messageContext.setProperty("payload", deCborMessageSessionEvent);
            let smartAntennaService = new SmartAntennaService(serviceContext);
            await smartAntennaService.processEvents(messageContext);
        })
    });
});
