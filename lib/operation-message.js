/** An error that keeps a legacy raw message alongside a translatable key. */
export class MarketMessageError extends Error {
    messageKey;
    messageParams;
    constructor(message, key, params) {
        super(message);
        this.name = 'MarketMessageError';
        this.messageKey = key;
        this.messageParams = params;
    }
}
export function messageFields(error) {
    if (!(error instanceof Error))
        return {};
    const candidate = error;
    return candidate.messageKey === undefined
        ? {}
        : { messageKey: candidate.messageKey, ...(candidate.messageParams === undefined ? {} : { messageParams: candidate.messageParams }) };
}
/** Keep the legacy raw value and its optional locale metadata in sync. */
export function writeOperationMessage(target, message, key, params) {
    target.message = message;
    if (key === undefined) {
        delete target.messageKey;
        delete target.messageParams;
    }
    else {
        target.messageKey = key;
        if (params === undefined)
            delete target.messageParams;
        else
            target.messageParams = params;
    }
}
/** Keep the legacy raw progress step and its optional locale metadata in sync. */
export function writeOperationStep(target, step, key, params) {
    target.step = step;
    if (key === undefined) {
        delete target.stepKey;
        delete target.stepParams;
    }
    else {
        target.stepKey = key;
        if (params === undefined)
            delete target.stepParams;
        else
            target.stepParams = params;
    }
}
