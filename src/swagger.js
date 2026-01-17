const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Test Fest Issue Tracker API',
            version: '1.0.0',
            description: 'API documentation for the Multi-User Test Fest Issue Tracker - a real-time collaborative issue tracking system for test fests with Jira integration and SSO authentication.',
            contact: {
                name: 'API Support',
                url: 'https://github.com/ericbrian/multi-user-test-fest-issue-tracker',
            },
            license: {
                name: 'ISC',
                url: 'https://opensource.org/licenses/ISC',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
            {
                url: '{protocol}://{host}',
                description: 'Custom server',
                variables: {
                    protocol: {
                        enum: ['http', 'https'],
                        default: 'https',
                    },
                    host: {
                        default: 'localhost:3000',
                    },
                },
            },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'connect.sid',
                    description: 'Session cookie authentication',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'User unique identifier',
                        },
                        name: {
                            type: 'string',
                            description: 'User full name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address',
                        },
                    },
                },
                Room: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Room unique identifier',
                        },
                        name: {
                            type: 'string',
                            description: 'Room name',
                        },
                        description: {
                            type: 'string',
                            nullable: true,
                            description: 'Room description',
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Creation timestamp',
                        },
                        created_by: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Creator user ID',
                        },
                        test_script_id: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true,
                            description: 'Associated test script ID',
                        },
                    },
                },
                Issue: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Issue unique identifier',
                        },
                        room_id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Room ID this issue belongs to',
                        },
                        script_id: {
                            type: 'integer',
                            description: 'Test script ID number',
                        },
                        description: {
                            type: 'string',
                            description: 'Issue description (sanitized)',
                        },
                        browser: {
                            type: 'string',
                            nullable: true,
                            description: 'Browser the tester is using',
                        },
                        os: {
                            type: 'string',
                            nullable: true,
                            description: 'Operating system the tester is using',
                        },
                        is_issue: {
                            type: 'boolean',
                            description: 'Whether this is marked as an issue',
                        },
                        is_annoyance: {
                            type: 'boolean',
                            description: 'Whether this is marked as an annoyance',
                        },
                        is_existing_upper_env: {
                            type: 'boolean',
                            description: 'Whether this exists in upper environment',
                        },
                        is_not_sure_how_to_test: {
                            type: 'boolean',
                            description: 'Whether tester is unsure how to test',
                        },
                        status: {
                            type: 'string',
                            nullable: true,
                            description: 'Current status tag',
                        },
                        jira_key: {
                            type: 'string',
                            nullable: true,
                            description: 'Associated Jira ticket key',
                        },
                        created_by: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Creator user ID',
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Creation timestamp',
                        },
                        files: {
                            type: 'array',
                            items: {
                                type: 'string',
                            },
                            description: 'Array of file paths for uploaded images',
                        },
                        createdBy: {
                            $ref: '#/components/schemas/User',
                        },
                    },
                },
                ScriptTemplate: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Test script unique identifier',
                        },
                        name: {
                            type: 'string',
                            description: 'Test script name',
                        },
                        description: {
                            type: 'string',
                            nullable: true,
                            description: 'Test script description',
                        },
                    },
                },
                RoomScriptLine: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Test script line unique identifier',
                        },
                        test_script_id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Parent test script ID',
                        },
                        line_number: {
                            type: 'integer',
                            description: 'Line number in the test script',
                        },
                        content: {
                            type: 'string',
                            description: 'Line content/instruction',
                        },
                        progress: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    user_id: {
                                        type: 'string',
                                        format: 'uuid',
                                    },
                                    is_checked: {
                                        type: 'boolean',
                                    },
                                    checked_at: {
                                        type: 'string',
                                        format: 'date-time',
                                        nullable: true,
                                    },
                                    notes: {
                                        type: 'string',
                                        nullable: true,
                                    },
                                },
                            },
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Error message',
                        },
                        details: {
                            type: 'string',
                            description: 'Additional error details (development only)',
                        },
                    },
                },
            },
        },
        security: [
            {
                cookieAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.js', './server.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
