
export interface EventMessageHeader {
    message_type: number;
    device_id: string;
    device_type: number;
    AssetId: string;
}

export interface EventMetadata {
    event_type: number;
    schema_version: number;
    timestamp: string;
    AssetTimeZone: number;
}

export interface EventEntry {
    metadata: EventMetadata;
    data: any;
}

export interface EventBodyOne {
    event: EventEntry;
}
export interface EventBodyMany {
    events: EventEntry[];
}

export interface EventMessage {
    header: EventMessageHeader;
    body: EventBodyOne;// | EventBodyMany;
}