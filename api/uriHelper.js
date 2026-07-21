// After an extended conversation with Gemini it came up with this,
// Express middlewear that (having precomputed maps from operationIds
// to paths) adds the helper functions to the res object to make
// them available to use in any request handler.
//
// Still seems kind of stupid we have to write our own code
// to generate the URIs from the spec, but both Copilot and
// Gemini came up with similar solutions that didn't involve
// any external library.
//
// After this I should search further to see if someone
// has already done this.

/**
 * Creates an Express middleware that provides pre-compiled URI generation functions.
 * @param {Object} spec - The parsed OpenAPI specification object.
 * @returns {Function} Express middleware function.
 */
export default function uriHelperMiddleware(spec) {
  const lookupMap = new Map();

  // 1. Build the lookup map once during application boot
  if (spec && spec.paths) {
    for (const [pathPattern, methods] of Object.entries(spec.paths)) {
      for (const routeConfig of Object.values(methods)) {
        if (routeConfig && routeConfig.operationId) {
          lookupMap.set(routeConfig.operationId, pathPattern);
        }
      }
    }
  }

  // Helper function to handle parameter injection
  function resolvePath(operationId, params) {
    const pathPattern = lookupMap.get(operationId);

    if (!pathPattern) {
      throw new Error(`OperationId "${operationId}" was not found in the pre-compiled lookup map.`);
    }

    return pathPattern.replace(/{([^}]+)}/g, (_, key) => {
      if (params[key] === undefined || params[key] === null) {
        throw new Error(`Missing required path parameter "${key}" for operation "${operationId}".`);
      }
      return encodeURIComponent(String(params[key]));
    });
  }

  // 2. Return the actual Express middleware function
  return (req, res, next) => {
    // Inject the methods directly onto the response object
    res.relativeUri = (operationId, params = {}) => {
      return resolvePath(operationId, params);
    };

    res.absoluteUri = (operationId, params = {}) => {
      const relativePath = resolvePath(operationId, params);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      return `${baseUrl}${relativePath}`;
    };

    next();
  };
}