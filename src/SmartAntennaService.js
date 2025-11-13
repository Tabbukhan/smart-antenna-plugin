"use strict";
const {
    GatewayClient, ServiceExecutionException, MessageContextProperties, MessageExchangePattern, LogFactory
} = require("@speedshield/velocity-gateway-core");
const {VelocityValidator} = require("@speedshield/velocity-event-transformer");
const {InvalidEventException} = require("@speedshield/velocity-event-transformer").Exception;
const {VelocityUtil, Exception} = require("@speedshield/velocity-commons");
const {InvalidMessageException} = require("./exception/InvalidMessageException");
// const {InvalidContentException} = require("./exception/InvalidContentException");
const clone = require("clone");
const path = require("path");
const _ = require('lodash');

const LOG = LogFactory.getLogger("SmartAntennaService");

const renameEventType = (name) => {
    name = (!_.endsWith(name, 'Event')) ? name + "Event" : name; 
    return _.kebabCase(name);
}

/**
 * A generalized service adaptor which processes incoming events from MQTT
 * and publishes them to Kafka, after some processing 
 * and remapping (provided by the velocity-event-transformer)
 */
class SmartAntennaService {

    constructor(params) {
        this._event_transformer = new VelocityValidator({
            dao: {
                type: "FileSystemDAO",
                options: {
                    rootPath: path.resolve(VelocityUtil.getVelocityHomeDir(), "resources", "validation")
                }
            }
        });

        this._destinationTopic = params.kafka_destination_topic || "er.event.sa";
        this._invalidTopic = params.kafka_invalid_topic || "dead.letter";
        this._evtType2TopicObj = params.custom_evtType2kafkaTopicObj || {};

        /**
         * A temporary(?) hard-coded map. One day in the future when we refactor the ER
         * it should be able to handle the raw event names.
         */
        this.erMap = {
            session: "session-event",
            checklist: "checklist-event",
            assetStatus: "truck-status-event",
            dtcC29: "dtc-c29-event",
            dtcCanOpen: "dtc-can-open-event",
            dtcDanaHydraulic: "dtc-dana-hydraulic-event",
            dtcDanaTransmission:"dtc-dana-transmission-event",
            dtcJ1939:"dtc-j1939-event",
            dtcZapi: "dtc-zapi-event",
            fuelCellDtc: "fuel-cell-dtc-event",
            fuelCellInformation: "fuel-cell-information-event",
            fuelCellMeter: "fuel-cell-meter-event",
            fuelCellReFuel: "fuel-cell-refuel-event",
            fuelCellStatus: "fuel-cell-status-event",
            gpsPosition: "gps-position-event",
            impact: "impact-event",
            impactRawData: "impact-raw-event",
            loadRegistered: "load-registered-event",
            connectStatus: "eq-connection-event",
            logMsg: "log-msg-event",

            batteryEventBDR: "battery-event-bdr-event",
            batteryLifeTimeBDR: "battery-life-time-bdr-event",
            batterySessionBDR: "battery-session-bdr-event",
           
            batteryEventLithium: "battery-event-lithium-event",
            batteryLifeTimeLithium: "battery-life-time-lithium-event",
            batterySessionLithium: "battery-session-lithium-event",

            batteryEvent: "battery-event-event",
            batteryLifeTime: "battery-life-time-event",
            batterySession: "battery-session-event",
            joinedWiFiNetwork:"joined-wifi-network-event",
            activationBDR:"bdr-activation-event",
            restDiagBDR:"bdr-rest-diag-event",
            // joinedWiFiNetwork:"joined-wifi-network-event",
            cellNetworkReg: "cell-network-reg-event",
            firmwareVersion: "firmware-version-event",
            configLoaded: "config-loaded-event",
            serviceRequest: "equipment-service-request-event",
            safetyViolation: "safety-violation-event",
            utilisation: "utilization-event",
            batteryCharge: "battery-charge-event",
            dss: "dynamic-stability-event",
            sessionChecklist: "session-checklist-event",
            earlyExit: "early-exit-event",
            tyrePressure: "tyre-pressure-event",
            containerCount: "container-count-event",
            criticalSensor: "critical-sensor-event",
            parkBrake: "park-brake-event",
            fuelBatteryLevel: "fuel-battery-level-event",
            overload: "overload-event",
            truckVersion: "truck-version-event",
            batV2Info: "battery-info-event",
            batV2Data: "battery-data-extended-event",
            dtcCleared: "dtc-cleared-event",
            inputStateChange: "input-state-change-event",
            vamLinkAivaEvent: "vam-link-aiva-event",
            batBTData: "battery-bt-data-event",
            batBTModule: "battery-bt-module-event",
            batBTPack: "battery-bt-pack-event"
        };

        LOG.verbose(`SmartAntennaService publishing messages to ${this._destinationTopic}. Dead Letter = ${this._invalidTopic}`);
        LOG.verbose(`SmartAntennaService evtType2TopicObj = ${JSON.stringify(this._evtType2TopicObj)}`);

        this._client = new GatewayClient();
    }

    remapToEventReceiverType(type) {
        let erType = this.erMap[type];
        if(VelocityUtil.isNullOrUndefined(erType)) {
            LOG.warn("No ER mapping exists for event type " + type, '. Renaming it using renameTypeName');
            return renameEventType(type);
        }
        return erType;
    }

    async init() {
        await this._event_transformer.init({
            refresh_events: true,
            refresh_idmap: true
        });
    }

    async stop() {
        await this._event_transformer.close();
    }

    /**
     * 
     * @param {string} deviceType 
     * @param {string} deviceId 
     * @param {string} eventType 
     * @param {string} reasonString 
     * @param {Object} event
     * @returns {ResultEntryPublish} 
     */
    generateDeadLetterMessage(deviceType, deviceId, eventType, reasonString, event) {
        try {
            let message = {
                device_type: deviceType,
                device_id: deviceId,
                event_type: eventType,
                reason: reasonString,
                event: event
            };
            
            let msgString = JSON.stringify(message);

            return {
                action: "publish",
                params: {
                    key: deviceId,
                    payload: msgString,
                    topic: this._invalidTopic
                },
                details: {
                    deviceId: deviceId,
                    deviceType: deviceType,
                    eventType: eventType
                }
            }
        } catch (e) {
            throw new ServiceExecutionException("Failed to publish to dead letter topic ", e);
        }
    }
    
    /**

     * 
     * @param {EventMessage} originalPayload
     * @returns {ResultSet}
     */
    processEventJSONRaw(originalPayload) {
        /** @type {ResultSet} */
        let result = [];
        let payload = originalPayload;
        let deviceId = null;
        let deviceType = null;

        // console.log('~~~~~111~~~~~', JSON.stringify(payload));
        /**
         * Make sure every date-tame value is string 
         * It should be changed in the future
         * by Rick 20-09-2019
         * 
         */
        // const parsedPayload = JSON.parse(JSON.stringify(payload));
        
        try {
            let events;
            if(payload.body.event) {
                events = [payload.body.event];
            } else if(payload.body.events) {
                events = payload.body.events;
                if(events.length > 1) {
                    LOG.verbose(`Processing ${events.length} events`);
                }
            } else {
                throw new InvalidMessageException("Message contains no 'event' or 'events' field");
            }

            if(events.length === 0) {
                throw new InvalidMessageException("Message contains 0 events");
            }

            this._event_transformer.reformatInboundMessage(payload);

            // Get some parameters from the header
            deviceId = payload.header.device_id;
            deviceType = payload.header.device_type;

            if(VelocityUtil.isNullOrUndefined(deviceId)) {
                throw new InvalidMessageException("Failed to determine device ID");
            }
            if(VelocityUtil.isNullOrUndefined(deviceType) || typeof deviceType !== 'string') {
                throw new InvalidMessageException("Failed to determine device type");
            }
            if(payload.header.message_type !== "Event") {
                throw new InvalidMessageException(`Cannot handle message type ${payload.header.message_type}`);
            }
            deviceType = deviceType.toLowerCase();

            // For each event, build a new Kafka event message and publish it
            // If something goes wrong, publish to dead letter
            for(let eventBody of events) {
                let event = {
                    header: payload.header,
                    body: {
                        event: eventBody
                    }
                };
                // LOG.info(event);
                let eventType = null;
                try {
                    eventType = eventBody.metadata.event_type;
                    if(VelocityUtil.isNullOrUndefined(eventType)) {
                        throw new InvalidMessageException("Failed to determine event type");
                    }
                    this._event_transformer.validateEventContent(event.body.event);

                    // custom remapping event_type to other alt topic as defined in yaml
                    let destTopic = this._evtType2TopicObj[eventType];

                    // Temporary shenanigans. When we refactor the ER this won't be needed?
                    eventBody.metadata.event_type = this.remapToEventReceiverType(eventType);
                    eventBody.data.device_id = eventBody.metadata.device_id;

                    let msgString = JSON.stringify(event.body);

                    result.push({
                        action: "publish",
                        params: {
                            payload: msgString,
                            key: deviceId,
                            topic: destTopic || this._destinationTopic
                        },
                        details: {
                            deviceId: deviceId,
                            deviceType: deviceType,
                            eventType: eventType
                        }
                    });
                } catch(e) {
                    LOG.error(e.stack, "AJV Errors:", JSON.stringify(SmartAntennaService.GetValidationErrors(e)));
                    let msg = SmartAntennaService.GetNestedErrorMessages(e).join(", ");
                    result.push(this.generateDeadLetterMessage(deviceType, deviceId, eventType, msg, event));
                }
            }
        } catch (e) {
            LOG.error(e.stack, "AJV Errors:", JSON.stringify(SmartAntennaService.GetValidationErrors(e)));
            let msg = SmartAntennaService.GetNestedErrorMessages(e).join(", ");
            result.push(this.generateDeadLetterMessage(deviceType, deviceId, null, msg, originalPayload));
        }
        return result;
    }
    
    /**

     * 
     * @param {EventMessage} originalPayload
     * @returns {ResultSet}
     */
    processEventObj(originalPayload) {
        /** @type {ResultSet} */
        let result = [];
        let payload = null;
        let deviceId = null;
        let deviceType = null;
        let assetId = null;

        let remappedPayload = this._event_transformer.remapKeyIdToStr(originalPayload);
        payload = clone(remappedPayload, false); // JSON object string this was parsed from ensures it's not circular
        
        // console.log('~~~~~111~~~~~', JSON.stringify(payload));
        /**
         * Make sure every date-tame value is string 
         * It should be changed in the future
         * by Rick 20-09-2019
         * 
         */
        const parsedPayload = JSON.parse(JSON.stringify(payload));
        
        try {
            // Initial validation logic for all events in the payload

            this._event_transformer.validateEventHeader(parsedPayload);

            let events;
            if(payload.body.event) {
                events = [payload.body.event];
            } else if(payload.body.events) {
                events = payload.body.events;
                if(events.length > 1) {
                    LOG.verbose(`Processing ${events.length} events`);
                }
            } else {
                throw new InvalidMessageException("Message contains no 'event' or 'events' field");
            }

            if(events.length === 0) {
                throw new InvalidMessageException("Message contains 0 events");
            }

            // Reformat payload. Converts enums too, and adds AssetTimeZoneIANA, plus device type and id to header
            // Do this on the entire message, so it applies to all events
            this._event_transformer.reformatInboundMessage(payload);
            // console.log('~~~~~222~~~~~', JSON.stringify(payload));

            // Get some parameters from the header
            deviceId = payload.header.device_id;
            deviceType = payload.header.device_type;
            assetId = payload.header.AssetId;

            if(VelocityUtil.isNullOrUndefined(deviceId)) {
                throw new InvalidMessageException("Failed to determine device ID");
            }
            if(VelocityUtil.isNullOrUndefined(deviceType) || typeof deviceType !== 'string') {
                throw new InvalidMessageException("Failed to determine device type");
            }
            if(payload.header.message_type !== "Event") {
                throw new InvalidMessageException(`Cannot handle message type ${payload.header.message_type}`);
            }
            deviceType = deviceType.toLowerCase();

            //************************************************** */
            //************************************************** */
            //THIS IS STOP GAP SOLUTION TILL VAM FIXES THE FIRMWARE 
            //WHERE IT IS PUBLISHING DEVICETYPE = FM1
            //SINCE FM1 IS NOT PUBLISHING TO MQTT BROKER
            //************************************************** */
            //************************************************** */
            if (deviceType == "fm1") {
                deviceType = "vam";
                payload.header.device_type = "vam";
            }

            // For each event, build a new Kafka event message and publish it
            // If something goes wrong, publish to dead letter
            for(let eventBody of events) {
                let event = {
                    header: payload.header,
                    body: {
                        event: eventBody
                    }
                };
                // LOG.info(event);
                let eventType = null;
                try {
                    eventType = eventBody.metadata.event_type;
                    if(VelocityUtil.isNullOrUndefined(eventType)) {
                        throw new InvalidMessageException("Failed to determine event type");
                    }
                    this._event_transformer.validateEventContent(event.body.event);

                    //************************************************** */
                    //************************************************** */
                    //THIS IS STOP GAP SOLUTION TILL VAM FIXES THE FIRMWARE 
                    //WHERE IT IS PUBLISHING DEVICETYPE = FM1
                    //SINCE FM1 IS NOT PUBLISHING TO MQTT BROKER
                    //************************************************** */
                    //************************************************** */
                    if (eventBody.metadata.device_type == "fm1")
                    {
                        LOG.info("MSG STILL PUBLISHED AS FM1 BY ", deviceId);
                        eventBody.metadata.device_type = "vam";
                    }
                    // custom remapping event_type to other alt topic as defined in yaml
                    let destTopic = this._evtType2TopicObj[eventType];

                    // Temporary shenanigans. When we refactor the ER this won't be needed?
                    eventBody.metadata.event_type = this.remapToEventReceiverType(eventType);
                    eventBody.data.device_id = eventBody.metadata.device_id;
                    eventBody.data.assetId = assetId;

                    let msgString = JSON.stringify(event.body);

                    result.push({
                        action: "publish",
                        params: {
                            payload: msgString,
                            key: deviceId,
                            topic: destTopic || this._destinationTopic
                        },
                        details: {
                            deviceId: deviceId,
                            deviceType: deviceType,
                            eventType: eventType
                        }
                    });
                } catch(e) {
                    LOG.error(e.stack, "AJV Errors:", JSON.stringify(SmartAntennaService.GetValidationErrors(e)));
                    let msg = SmartAntennaService.GetNestedErrorMessages(e).join(", ");
                    result.push(this.generateDeadLetterMessage(deviceType, deviceId, eventType, msg, event));
                }
            }
        } catch (e) {
            LOG.error(e.stack, "AJV Errors:", JSON.stringify(SmartAntennaService.GetValidationErrors(e)));
            let msg = SmartAntennaService.GetNestedErrorMessages(e).join(", ");
            result.push(this.generateDeadLetterMessage(deviceType, deviceId, null, msg, originalPayload));
        }
        return result;
    }

    async processEvents(msgCtx) {
        try {
            let originalPayload = msgCtx.getProperty("payload");
            let contentType = msgCtx.getProperty("contentType");
            let results = null;

            // This should happen everywhere? What does this actually do though?
            msgCtx.setProperty(MessageContextProperties.MEP, MessageExchangePattern.OUT_ONLY);
            
            if (contentType.toLowerCase() == "application/cbor")
            {
                results = this.processEventObj(originalPayload);
            }
            else if (contentType.toLowerCase() =="application/json")
            {
                results = this.processEventJSONRaw(originalPayload);
            }
            else 
            {
                throw new InvalidMessageException("Unsupported payload content type", contentType);
            }
      
            for(let result of results) {
                if(result.action === "publish") {
                    await this._client.send({
                        transport: "kafka",
                        to: result.params.topic,
                        messageKey: result.params.key,
                        payload: Buffer.from(result.params.payload)
                    });
                    LOG.verbose(`Published ${result.details.deviceType}::${result.details.deviceId}::${result.details.eventType} event -> ${result.params.topic}`);
                    LOG.debug(result.params.payload);
                } else if(result.action === "error") {
                    LOG.error("Non-fatal error caught");
                    LOG.error(result.params.stack);
                }
            }
        } catch(e) {
            LOG.error("========== Unexpected Internal Error START ==========");
            LOG.error(e.stack);
            LOG.error("========== Unexpected Internal Error  END  ==========");
            LOG.error("Assuming inconsistent internal state. Crashing Process");
            process.exit(22);
        }
    }
    /**
     * 
     * @param {Error} e
     * @returns {Array<any>}
     */
    static GetValidationErrors(e) {
        let reasons = [];
        while(e != null && e instanceof Error) {
            if(e instanceof InvalidEventException) {
                reasons.push(e.reason);
            }
            if(e instanceof Exception) {
                e = e.inner;
            } else {
                break;
            }
        }
        return reasons;
    }

    /**
     * 
     * @param {Error} e
     * @returns {Array<string>}
     */
    static GetNestedErrorMessages(e) {
        let msgs = [];
        while(e != null && e instanceof Error) {
            let str = `${e.name}: ${e.message}`;
            if(e instanceof InvalidEventException) {
                str += `. AJV Errors => ${JSON.stringify(e.reason)}`;
            }
            msgs.push(str);
            if(e instanceof Exception) {
                e = e.inner;
            } else {
                break;
            }
        }
        return msgs;
    }
}

exports.SmartAntennaService = SmartAntennaService;


/**
 * @typedef {import("./types").EventMessage} EventMessage
 * 
 * @typedef EventDetails
 * @property {string} deviceType
 * @property {string} deviceId
 * @property {string} eventType
 * 
 * @typedef ResultEntryError
 * @property {'error'} action
 * @property {Error} params
 * @property {EventDetails} details
 * 
 * @typedef ResultEntryPublish
 * @property {'publish'} action
 * @property {{topic:string,payload:string,key?:string}} params
 * @property {EventDetails} details
 * 
 * 
 * @typedef {Array<ResultEntryError|ResultEntryPublish>} ResultSet
 */