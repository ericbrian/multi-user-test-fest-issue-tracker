/**
 * Standardized API Error Response Utility
 * 
 * Provides consistent error response format across all API endpoints.
 * Follows best practices for REST API error handling.
 */

/**
 * Standard error response format
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Always false for errors
 * @property {string} error - Human-readable error message
 * @property {string} [code] - Machine-readable error code
 * @property {*} [details] - Additional error details (optional)
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} [path] - Request path (added by middleware)
 */

/**
 * Error codes for consistent error handling
 */
const ErrorCodes = {
    // Validation Errors (400)
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    INVALID_FILE: 'INVALID_FILE',

    // Authentication Errors (401)
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',

    // Authorization Errors (403)
    FORBIDDEN: 'FORBIDDEN',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

    // Not Found Errors (404)
    NOT_FOUND: 'NOT_FOUND',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

    // Conflict Errors (409)
    CONFLICT: 'CONFLICT',
    DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',

    // Rate Limiting (429)
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

    // Server Errors (500)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

    // Service-Specific Errors
    JIRA_NOT_CONFIGURED: 'JIRA_NOT_CONFIGURED',
    JIRA_API_ERROR: 'JIRA_API_ERROR',
};

/**
 * Create a standardized error response
 * @param {string} message - Human-readable error message
 * @param {string} [code] - Error code from ErrorCodes
 * @param {*} [details] - Additional error details
 * @returns {ErrorResponse}
 */
function createErrorResponse(message, code = null, details = null) {
    const response = {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
    };

    if (code) {
        response.code = code;
    }

    if (details !== null && details !== undefined) {
        response.details = details;
    }

    return response;
}

/**
 * Send a standardized error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {string} [code] - Error code
 * @param {*} [details] - Additional details
 */
function sendError(res, statusCode, message, code = null, details = null) {
    const errorResponse = createErrorResponse(message, code, details);

    // Add request path if available
    if (res.req && res.req.path) {
        errorResponse.path = res.req.path;
    }

    return res.status(statusCode).json(errorResponse);
}

/**
 * Pre-defined error response helpers
 */
const ApiError = {
    /**
     * 400 Bad Request - Validation error
     */
    badRequest(res, message, details = null) {
        return sendError(res, 400, message, ErrorCodes.VALIDATION_ERROR, details);
    },

    /**
     * 400 Bad Request - Invalid input
     */
    invalidInput(res, message, details = null) {
        return sendError(res, 400, message, ErrorCodes.INVALID_INPUT, details);
    },

    /**
     * 400 Bad Request - Missing required field
     */
    missingField(res, fieldName) {
        return sendError(
            res,
            400,
            `Missing required field: ${fieldName}`,
            ErrorCodes.MISSING_REQUIRED_FIELD,
            { field: fieldName }
        );
    },

    /**
     * 400 Bad Request - Invalid file
     */
    invalidFile(res, message, details = null) {
        return sendError(res, 400, message, ErrorCodes.INVALID_FILE, details);
    },

    /**
     * 401 Unauthorized
     */
    unauthorized(res, message = 'Authentication required') {
        return sendError(res, 401, message, ErrorCodes.UNAUTHORIZED);
    },

    /**
     * 403 Forbidden
     */
    forbidden(res, message = 'You do not have permission to access this resource') {
        return sendError(res, 403, message, ErrorCodes.FORBIDDEN);
    },

    /**
     * 403 Forbidden - Insufficient permissions
     */
    insufficientPermissions(res, message = 'Insufficient permissions') {
        return sendError(res, 403, message, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    },

    /**
     * 404 Not Found
     */
    notFound(res, resource = 'Resource') {
        return sendError(res, 404, `${resource} not found`, ErrorCodes.NOT_FOUND);
    },

    /**
     * 409 Conflict
     */
    conflict(res, message, details = null) {
        return sendError(res, 409, message, ErrorCodes.CONFLICT, details);
    },

    /**
     * 429 Too Many Requests
     */
    rateLimitExceeded(res, message = 'Rate limit exceeded. Please try again later.') {
        return sendError(res, 429, message, ErrorCodes.RATE_LIMIT_EXCEEDED);
    },

    /**
     * 500 Internal Server Error
     */
    internal(res, message = 'Internal server error', details = null) {
        // Don't leak details in production
        const safeDetails = process.env.NODE_ENV === 'production' ? null : details;
        return sendError(res, 500, message, ErrorCodes.INTERNAL_ERROR, safeDetails);
    },

    /**
     * 500 Internal Server Error - Database error
     */
    database(res, message = 'Database error occurred') {
        return sendError(res, 500, message, ErrorCodes.DATABASE_ERROR);
    },

    /**
     * 500 Internal Server Error - External service error
     */
    externalService(res, serviceName, message = null) {
        const errorMessage = message || `${serviceName} service error`;
        return sendError(res, 500, errorMessage, ErrorCodes.EXTERNAL_SERVICE_ERROR, { service: serviceName });
    },

    /**
     * Jira-specific errors
     */
    jira: {
        notConfigured(res) {
            return sendError(res, 500, 'Jira integration is not configured', ErrorCodes.JIRA_NOT_CONFIGURED);
        },

        authenticationFailed(res) {
            return sendError(res, 500, 'Jira authentication failed. Please check credentials.', ErrorCodes.JIRA_API_ERROR);
        },

        insufficientPermissions(res) {
            return sendError(res, 500, 'Insufficient Jira permissions.', ErrorCodes.JIRA_API_ERROR);
        },

        invalidRequest(res) {
            return sendError(res, 500, 'Invalid Jira request. Please check project configuration.', ErrorCodes.JIRA_API_ERROR);
        },

        failed(res) {
            return sendError(res, 500, 'Failed to create Jira issue. Please try again later.', ErrorCodes.JIRA_API_ERROR);
        },
    },
};

/**
 * Create a standardized success response
 * @param {*} data - Response data
 * @param {string} [message] - Optional success message
 * @returns {Object}
 */
function createSuccessResponse(data, message = null) {
    const response = {
        success: true,
        data,
    };

    if (message) {
        response.message = message;
    }

    return response;
}

/**
 * Send a standardized success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {number} [statusCode=200] - HTTP status code
 * @param {string} [message] - Optional success message
 */
function sendSuccess(res, data, statusCode = 200, message = null) {
    return res.status(statusCode).json(createSuccessResponse(data, message));
}

module.exports = {
    ErrorCodes,
    createErrorResponse,
    sendError,
    ApiError,
    createSuccessResponse,
    sendSuccess,
};
