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
