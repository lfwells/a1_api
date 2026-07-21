import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';
import * as OpenApiValidator from 'express-openapi-validator';
import fs from 'node:fs'; //Gemini instead offerred import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'node:path'; //Gemini instead offered import { dirname, join } from 'path';

import uriHelperMiddleware from './uriHelper.js';
import { logger, morganStream } from './logger.js';
import apiKeyAliases from './apiKeyAliases.js';

//The short-term (really!) version of the data
import fakeDb from './data/fakeData.js';

//TODO Bring across (from example_server.js) the code to connect to MongoDB via mongoose
//TODO Work out how to insert the data into MongoDB (separately, since separate container?)
//TODO Swap the dodgy fakeData for queries on MongoDB

//So can have different MongoDB settings for development and on production server
const { MONGO_ROOT_USER : MONGO_USER, MONGO_ROOT_PASSWORD : MONGO_PASSWORD, MONGO_HOST, MONGO_PORT, MONGO_DATABASE } = process.env;
const mongoUri = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}`;
// console.log(`FMI, computed mongoUri is ${mongoUri}`);
// On production would like to inspect at least
console.log(`Computed mongoUri with credentials masked is mongodb://*****:*****@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}`);


const SWAGGER_PATH = '/docs';

// Resolve paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiYamlPath = path.join(__dirname, 'draft_openapi.yaml');
const openApiSpec = YAML.parse(fs.readFileSync(openApiYamlPath, 'utf8'));

const PORT = process.env.PORT || 5000;
const app = express();

const ITEMS_PER_PAGE = 20; //Deliberately fixed value; I could be convinced to vary it by collection type, but am not going to add a limit parameter


// Can I shift the morgan import into logger as well?

morgan.token('remote-user', (req) => { //remote-user is already part of the 'combined' Morgan log string
  return req.user && req.user.alias ? req.user.alias : 'anonymous';
});

// Suggestion from Gemini: Connect Morgan to Winston's file stream immediately
// Using the 'combined' format logs standard Apache-style data (IP, agent, path, status code)
app.use(morgan('combined', { stream: morganStream }));

app.use(cors()); //Since their development work will be outside the production server
app.use(express.json()); //Even though _currently_ I'm not expecting any payloads, JSON or otherwise


//ROUTE: Mount Swagger UI documentation route
// app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
//FIXME During API 'development' and planning just reprocess the YAML upon page refresh (noting that the OpenAPIBackend routing will not be properly live, working from the previously loaded API spec)
app.use(SWAGGER_PATH, swaggerUi.serve, (req, res, next) => {
    const freshDocument = YAML.parse(fs.readFileSync(openApiYamlPath, 'utf8'));
    swaggerUi.setup(freshDocument)(req, res, next);
});


// Set up OpenAPIValidator to intercept actual API requests early (but after the API doc pages)
app.use(
  OpenApiValidator.middleware({
    apiSpec: openApiSpec,
    validateApiSpec: true, //LET'S TRY THIS, ALTHOUGH I'M YET TO GET IT TO FAIL EVENT WHEN I THINK I'VE INTRODUCED AN ERROR :-(
    validateRequests: true, // Throws 400 automatically if 3.1 validation fails
    validateResponses: true, // Turn on in dev if you want to check outgoing data
    ignoreUndocumented: false, //Generate 404 for routes outside the spec

    // Native API Key Security Handlers
    validateSecurity: {
      handlers: {
        ApiKeyAuth: (req, scopes, schema) => {
          //Authentication is just lookup based
          const apiKey = req.headers['x-api-key'];
          const validAlias = apiKeyAliases.get(apiKey); //undefined if unknown API key
          if (!(apiKey && validAlias)) {
            throw { status: 401, message: 'Invalid or missing X-API-Key header' };
          }
          req.user = { 'alias': validAlias }; //attach 'authentication' flag
          return true;
        }
      }
    }
  })
);

// This prepares res.relativeUri and res.absoluteUri for all downstream routes
app.use(uriHelperMiddleware(openApiSpec));

//Version 1 will have to default back to plain old Express routes (next should map from operationIds)

const attachPaginationHeaders = (res, total, page, nPerPage) => {
  res.set({
    'X-Total-Count': total,
    'X-Page': page,
    'X-Per-Page': nPerPage
  })
}

//FIXME When using database have it apply the start and end (to determine total) and paginatino
/** Returns the filtered page of results and sets the appropriate headers in res. (Yeah, so very much _not_ a pure function */
const applyDateAndPageFilters = (res, reports, page, start, end) => {
  let filteredReports = reports.filter((report) =>
    (!start || report.reportDate.localeCompare(start) >= 0) && (!end || report.reportDate.localeCompare(end) <= 0)
  );
  const offset = (page - 1) * ITEMS_PER_PAGE;
  let paginated = filteredReports.slice(offset, offset + ITEMS_PER_PAGE);
  attachPaginationHeaders(res, filteredReports.length, page, ITEMS_PER_PAGE);
  return paginated;
}

app.get('/devices', (req, res) => { //getDevices
  //FIXME Once loading from actual document or Db must deal with pagination (idiot)
  const { page } = req.query;
  const deviceIDs = fakeDb.devices.map(device => device.id);
  let filteredResults = applyDateAndPageFilters(res, deviceIDs, page);
  return res.json(filteredResults);
});

app.get('/devices/:deviceId', (req, res, next) => { //getDeviceById
  //FIXME Temporary to see if 404 is handled correctly
  let device = fakeDb.devices.find(device => device.id === req.params.deviceId);

  if (!device) {
    console.log("Triggering 404?");
    next({ status: 404, message: `No device with ID '${req.params.deviceId}'` });
  } else {
    const deploymentUris = device.deployments.map((id) => res.absoluteUri('getDeploymentById', {deploymentId: id}))
    const { deployments, ...kept } = device;

    return res.json({ ...kept, deploymentUris} );
    // return res.json({
    //   id: 'example_device_1',
    //   model: 'example model 1',
    //   description: 'example longer description 1',
    //   deploymentUris: ["utas_tinyear_001_001","utas_tinyear_001_002"].map((id) => res.absoluteUri('getDeploymentById', {deploymentId: id}))
    // });
  }
});

//Perhaps temporary... :-/
const addDeploymentUris = (deployment, makeUri) => {
  if (! deployment.deviceUri) {
    deployment.deviceUri = makeUri('getDeviceById', { deviceId: deployment.deviceId } );
    deployment.healthUri = makeUri('getHealthByDeploymentId', { deploymentId: deployment.id });
    deployment.detectionsUri = makeUri('getHealthByDeploymentId', { deploymentId: deployment.id });
  }
};

app.get('/devices/:deviceId/deployments', (req, res, next) => { //getDeploymentsByDeviceId
  //FIXME Must support pagination (at least that'll be a common recipe, right?)

  //Very temporary until switch to using MongoDB
  if (! fakeDb.devices.find(device => device.id == req.params.deviceId)) {
    next({ status: 404, message: `No device with ID '${req.params.deviceId}'` });
  } else {
    let deviceDeps = fakeDb.deployments.filter((dep) => dep.deviceId === req.params.deviceId);
    //Inefficient to repeat this even if skips actual hydration after first run
    deviceDeps.forEach(dep => addDeploymentUris(dep, res.absoluteUri));
    console.log(`About to send back array of ${deviceDeps.length} items`);
    return res.json(deviceDeps);
  }
});

//TODO Implement v1 of getDeployments
app.get('/deployments', (req, res, next) => { //getDeployments
  //FIXME Must support pagination (at least that'll be a common recipe, right?)
  let { page } = req.query;

  console.log(`In /deployments, and typeof page is '${typeof page}'`);

  //Very temporary until switch to using MongoDB
  let allDeps = fakeDb.deployments; //currently this fake data has them as a flat array of deployments, not divided by device
  //Inefficient to repeat this even if skips actual hydration after first run
  allDeps.forEach(dep => addDeploymentUris(dep, res.absoluteUri));
  let filteredList = applyDateAndPageFilters(res, allDeps, page);
  console.log(`About to send back array of ${filteredList.length} items`);
  return res.json(filteredList);
});


//TODO Implement v1 of getDeploymentById
app.get('/deployments/:deploymentId', (req, res, next) => { //getDeploymentById
  let deployment = fakeDb.deployments.find(dep => dep.id == req.params.deploymentId);

  //Very temporary until switch to using MongoDB
  if (! deployment) {
    next({ status: 404, message: `No deployment with ID '${req.params.deploymentId}'` });
  } else {
    //Seems inefficient to repeat this even if skips actual hydration after first run
    addDeploymentUris(deployment, res.absoluteUri);
    return res.json(deployment);
  }
});


app.get('/deployments/:deploymentId/health', (req, res, next) => { //getHealthByDeploymentId
  //TODO Implement this... *sigh* with filtering AND pagination
  const { deploymentId } = req.params;
  const { page, start, end } = req.query;

  console.log(`Received params deploymentId=${deploymentId}, page=${page}, ${start}, ${end}`);

  //Very temporary until switch to using MongoDB
  //In fakeData the health reports _are_ accessible via deploymentId
  let healthReports = fakeDb.healthReports[req.params.deploymentId];
  if (! healthReports) {
    next({ status: 404, message: `No deployment with ID '${req.params.deploymentId}'` });
  } else {
    let filteredResultsPage = applyDateAndPageFilters(res, healthReports, page, start, end);
    res.json(filteredResultsPage);
  }
});


app.get('/deployments/:deploymentId/detections', (req, res, next) => { //getDetectionsByDeploymentId
  const { deploymentId } = req.params;
  const { page, start, end } = req.query;

  console.log(`Detections list received params deploymentId=${deploymentId}, page=${page}, start=${start}, end=${end}`);

  //Very temporary until switch to using MongoDB
  //In fakeData the detections _are_ accessible via deploymentId
  let detections = fakeDb.detections[deploymentId];

  if (! detections) {
    next({ status: 404, message: `No deployment with ID '${req.params.deploymentId}'` });
  } else {
    let filteredResultsPage = applyDateAndPageFilters(res, detections, page, start, end);
    res.json(filteredResultsPage);
  }
});


app.get('/sounds', (req, res) => { //getSounds
  return res.json(fakeDb.sounds);
  // [
  //   { species: 'Tasmanian masked owl', callType: 'screech' },
  //   { species: 'Chainsaw', callType: '' },
  //   { species: 'Examples only currently', callType: '' }
  // ]);
});

//END API

//Example custom error handlers
app.use((err, req, res, next) => {
  const status = err.status || 500;

  console.log('Error handler middleware was actually reached');

  //Add header hint if unauthorised
  if (status == 401) {
    //Suggested by Gemini; let's see where it takes us
    const openapiRoute = req.openapi?.openapiObject?.paths?.[req.route?.path]?.[req.method.toLowerCase()];
    const authHeaderExample = openapiRoute?.responses?.['401']?.headers?.['WWW-Authenticate']?.example;
    res.setHeader('WWW-Authenticate', authHeaderExample || 'ApiKey realm="Tiny Ear", header="X-API-Key"');
  }

  // Unified 404 Handler for BOTH missing spec paths and missing resources
  if (status === 404) {
    return res.status(404).json({
      status: 404,
      error: 'Not Found',
      message: err.message || 'The requested resource or endpoint could not be found.',
      path: req.path,
      timestamp: new Date().toISOString()
    });
  }

  // Fallback handler for all other exceptions (e.g., 400 validation, 500 crashes)
  res.status(status).json({
    status: status,
    error: status === 400 ? 'Validation Error' : 'Internal Server Error',
    message: err.message,
    errors: err.errors || []
  });
});


app.listen(PORT, () => {
  console.log(`🚀 Server listening at http://localhost:${PORT}`);
  console.log(`📄 interactive Documentation open at http://localhost:${PORT}${SWAGGER_PATH}`);
});

export default app; //<-- Necessary now this is a module, or not really?