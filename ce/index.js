require('dotenv').config();
const request = require('request');
const lukeStore = require('../db');

// import json for formula, resource definitions, and transformations.
// seperated and stored in seperate files for better organization and version control
const formulaBodyJSON = require('./event-filtering-formula.json');
// common resource definitions
const contactModel = require('./contacts-resource-def.json');
const opportunityModel = require('./opportunities-resource-def.json');
const accountModel = require('./accounts-resource-def.json');
// transformations from vendor to common resource definitions
const closeioContactTransformation = require('./closeio/contacts-transformation.json');
const closeioOpportunityTransformation = require('./closeio/opportunities-transformation.json');
const closeioAccountTransformation = require('./closeio/accounts-transformation.json');
const hubspotContactTransformation = require('./hubpsotcrm/contacts-transformation.json');
const hubspotOpportunityTransformation = require('./hubpsotcrm/opportunities-transformation.json');
const hubspotAccountTransformation = require('./hubpsotcrm/accounts-transformation.json');

// Function to return the correct instance body for a given vendor, this is an area where individual nuances pertaining a vendor (Element) must be known - documentation for these nuances can be found here: https://developers.cloud-elements.com/docs/elements.html
// At the end of the authentication flow, the correct vendor code/token/whatever needs to be sent to Cloud Elements in order to successfully return an `Element Token` to be used to make API calls against the correct vendor instance
const createInstanceBody = (elementKey, code, appURL) => {
    let postInstanceBody = {};
    switch (elementKey) {
        case "hubspotcrm":
            postInstanceBody = {
                "element": {
                    "key": "hubspotcrm"
                },
                "providerData": {
                    "code": code
                },
                "configuration": {
                    "authentication.type": "oauth2",
                    "oauth.callback.url": (appURL || process.env.APP_URL) + "/hubspotcrm/auth",
                    "oauth.api.key": process.env.HUBSPOTCRM_KEY,
                    "oauth.api.secret": process.env.HUBSPOTCRM_SECRET,
                    "create.bulk.properties": "false",
                    "filter.response.nulls": true,
                    "event.notification.enabled": true,
                    "event.vendor.type": "polling",
                    "event.poller.refresh_interval": "1",
                    "event.poller.urls": "contacts\nopportunities\naccounts",
                    "event.poller.configuration": "{\"accounts\": {\"url\": \"/hubs/crm/accounts?where=lastmodifieddate='${date}'\",\"idField\": \"companyId\",\"filterByUpdatedDate\": true,\"datesConfiguration\": {\"updatedDateField\": \"properties.hs_lastmodifieddate\",\"updatedDateFormat\": \"milliseconds\",\"createdDateField\": \"properties.createdate\",\"createdDateFormat\": \"milliseconds\"},\"createdCheckTolerance\": 10},\"contacts\": {\"url\": \"/hubs/crm/contacts?where=lastmodifieddate='${date}'\",\"idField\": \"vid\",\"filterByUpdatedDate\": true,\"datesConfiguration\": {\"updatedDateField\": \"properties.lastmodifieddate\",\"updatedDateFormat\": \"milliseconds\",\"createdDateField\": \"properties.createdate\",\"createdDateFormat\": \"milliseconds\"},\"createdCheckTolerance\": 10},\"opportunities\": {\"url\": \"/hubs/crm/opportunities?where=lastmodifieddate='${date}'\",\"idField\": \"dealId\",\"filterByUpdatedDate\": true,\"datesConfiguration\": {\"updatedDateField\": \"properties.hs_lastmodifieddate\",\"updatedDateFormat\": \"milliseconds\",\"createdDateField\": \"properties.createdate\",\"createdDateFormat\": \"milliseconds\"},\"createdCheckTolerance\": 10}}",
                },
                "tags": [
                    "stride"
                ],
                "name": "STRIDE_HS_" + (new Date()).getTime()
            };
            break;
        case "closeio":
            postInstanceBody = {
                "element": {
                    "key": "closeio"
                },
                "configuration": {
                    "event.notification.enabled": true,
                    "event.vendor.type": "polling",
                    "event.poller.refresh_interval": "1",
                    "event.poller.configuration": "{\"contacts\":{\"url\":\"/hubs/crm/contacts?where=date_updated>'${gmtDate:yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX}'\",\"idField\":\"id\",\"datesConfiguration\":{\"updatedDateField\":\"date_updated\",\"updatedDateFormat\":\"yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX\",\"createdDateField\":\"date_created\",\"createdDateFormat\":\"yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX\"}}}",
                    "filter.response.nulls": "true",
                    "username": code,
                },
                "tags": [
                    "stride"
                ],
                "name": "STRIDE_CLOSEIO_" + (new Date()).getTime()
            };
            break;
        case "sfdc":
        case "salesforce":
            postInstanceBody = {
                "element": {
                    "key": elementKey
                },
                "providerData": {
                    "code": code
                },
                "configuration": {
                    "oauth.callback.url": (appURL || process.env.APP_URL) + "/" + elementKey + "/auth",
                    "oauth.api.key": process.env.SFDC_KEY,
                    "oauth.api.secret": process.env.SFDC_SECRET,
                    "event.notification.enabled": true,
                    "event.vendor.type": "polling",
                    // TODO: check correct polling configurations
                    // "event.poller.refresh_interval": "1",
                    //"event.objects": "Account,Contact,Opportunity,Lead",
                    //"event.helper.key": "sfdcPolling",
                    //"event.poller.urls": "Account|/hubs/crm/Account?where=LastModifiedDate>='${date}'&orderBy=Id&includeDeleted=true||LastModifiedDate|yyyy-MM-dd'T'HH:mm:ss.SSSZ"
                },
                "tags": [
                    "stride"
                ],
                "name": "STRIDE_SFDC_" + (new Date()).getTime()
            };
            break;
        default:
            break;
    }
    return postInstanceBody;
};

const getCRMLeads = (elementToken) => {
    var options = {
        method: 'GET',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/hubs/crm/leads',
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG + ", Element " + elementToken
        }
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log(body);
        return body;
    });
}

const getCRMOpportunities = (elementToken) => {
    var options = {
        method: 'GET',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/hubs/crm/opportunities',
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG + ", Element " + elementToken
        }
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log(body);
        return body;
    });
}

const getCRMLeadByID = (elementToken, leadID) => {
    var options = {
        method: 'GET',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/hubs/crm/leads/' + leadID,
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG + ", Element " + elementToken
        }
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log(body);
        return body;
    });
}

// Creates the event filtering formula template programmatically
// Since this template has no instance based configuration, it could easily be built manually in the Cloud Elements environment and its ID stored as a hard-coded value in this application's scope. However, it is built programmatically here for reference purposes.
const createFormula = (conversationId, flavor, callback) => {
    var options = {
        method: 'POST',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/formulas',
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG
        },
        body: formulaBodyJSON
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log("the formula body", body);
        lukeStore.saveFormula(body.id, conversationId, flavor);
        callback(body.id);
        //return body;
    });
}

// Creates an instance of the event filtering formula with the correct configuration values
// by storing the conversationId on the formula instance, events from the correct user's account are routed back to the server correctly so that messages are sent to the correct rooms
const createFormulaInstance = (formulaId, instanceId, conversationId, flavor, appUrl) => {
    var formulaInstanceBody = {
        "formula": {
            "id": formulaId,
            "name": "strideFormula",
            "active": true,
            "singleThreaded": false,
            "configuration": [{
                    "id": 14520,
                    "key": "create",
                    "name": "create",
                    "type": "value",
                    "required": true
                },
                {
                    "id": 14521,
                    "key": "object",
                    "name": "object",
                    "type": "value",
                    "required": true
                },
                {
                    "id": 14522,
                    "key": "source",
                    "name": "source",
                    "type": "elementInstance",
                    "required": true
                },
                {
                    "id": 14523,
                    "key": "update",
                    "name": "update",
                    "type": "value",
                    "required": true
                },
                {
                    "id": 14524,
                    "key": "url",
                    "name": "url",
                    "type": "value",
                    "required": true
                }
            ]
        },
        "name": flavor + "-strideFormula-" + conversationId,
        "settings": {},
        "active": true,
        "configuration": {
            "create": "true",
            "update": "true",
            "source": instanceId,
            "url": (appUrl || process.env.APP_URL) + '/' + flavor + '/ce-callback/' + conversationId,
            "object": "accounts,opportunities,contacts,deals"
        }
    };
    var options = {
        method: 'POST',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/formulas/' + formulaId + '/instances',
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG
        },
        body: formulaInstanceBody
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log(body);
        return body;
    });
}

// Creates the app-centric contact data model
// this lets us refer to all vendor contacts in the same manner and create cards and other app functionality from a uniform model
// Note: this only needs to be done once, and can even be done manually during setup, rather than programmatically, however having it done programmatically helps to account for future changes in the data models
const createDefinition = (definitionBody, definitionName, cb) => {
    var options = {
        method: 'POST',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/organizations/objects/' + definitionName + '/definitions',
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG
        },
        body: definitionBody
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log(body);
        cb(body);
    });
}

// Creates the vendor-to-common data model transformation programmatically, given a transformation JSON payload and common model definition name
const createSingleTransformation = (flavor, transformationBody, definitionName, cb) => {
    var options = {
        method: 'POST',
        url: 'https://' + (process.env.CE_ENV || 'api') + '.cloud-elements.com/elements/api-v2/organizations/elements/' + flavor + '/transformations/' + definitionName,
        json: true,
        headers: {
            'content-type': 'application/json',
            'authorization': "User " + process.env.CE_USER + ", Organization " + process.env.CE_ORG
        },
        body: transformationBody
    }
    request(options, (err, response, body) => {
        if (err) {
            console.log("ERROR! " + err);
            return
        }
        if (!response || response.statusCode >= 399) {
            console.log("UNHAPPINESS! " + response.statusCode);
            console.log(body);
        }
        console.log(body);
        cb(body);
    });
}

// Function to create all app-centric data models programmatically in the chosen Cloud Elements environment
const createDefinitions = (cb) => {
    console.log("ABOUT TO CREATE stride-crm-opportunities");
    createDefinition(opportunityModel, 'stride-crm-opportunities', () => {
        console.log("ABOUT TO CREATE stride-crm-contacts");
        createDefinition(contactModel, 'stride-crm-contacts', () => {
            console.log("ABOUT TO CREATE stride-crm-accounts");
            createDefinition(accountModel, 'stride-crm-accounts', cb);
        });
    });
}

// Function to create all of the vendor-to-common data model transformations programmatically in the chosen Cloud Elements environment
// Note: these transformations only need to be built once once and then they will persist within the Cloud Elements environment
//       this can even be done manually during setup, rather than programmatically, however having it done programmatically helps to account for optional future changes in the transformations
const postTransformations = (flavor, cb) => {
    switch (flavor) {
        case "sfdc":
            throw "not implemented";
        case "hubspotcrm":
            // Creates the Hubspot-to-common account transformation
            createSingleTransformation(flavor, hubspotAccountTransformation, 'stride-crm-accounts', () => {
                // Creates the Hubspot-to-common contact transformation
                createSingleTransformation(flavor, hubspotContactTransformation, 'stride-crm-contacts', () => {
                    // Creates the Hubspot-to-common opportunity transformation
                    createSingleTransformation(flavor, hubspotOpportunityTransformation, 'stride-crm-opportunities', cb);
                });
            });
            break;
        case "closeio":
            // Creates the CloseIO-to-common account transformation
            createSingleTransformation(flavor, closeioAccountTransformation, 'stride-crm-accounts', () => {
                // Creates the CloseIO-to-common contact transformation
                createSingleTransformation(flavor, closeioContactTransformation, 'stride-crm-contacts', () => {
                    // Creates the CloseIO-to-common opportunity transformation
                    createSingleTransformation(flavor, closeioOpportunityTransformation, 'stride-crm-opportunities', cb);
                });
            });
            break;
    }
}

const createAllTransformations = (cb) => {
    postTransformations("hubspotcrm", () => {
        postTransformations("closeio", cb);
    });
}

module.exports = {
    createInstanceBody: createInstanceBody,
    getCRMOpportunities: getCRMOpportunities,
    getCRMLeads: getCRMLeads,
    getCRMLeadsByID: getCRMLeadByID,
    createFormula: createFormula,
    createFormulaInstance: createFormulaInstance,
    createDefinitions: createDefinitions,
    postTransformations: postTransformations,
    createAllTransformations: createAllTransformations,
}