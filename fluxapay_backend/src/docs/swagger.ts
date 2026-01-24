import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Fluxapay API',
            version: '1.0.0',
            description: 'API documentation for Fluxapay Backend',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        tags: [
            {
                name: 'Merchants',
                description: 'Merchant authentication and management',
            },
            {
                name: 'KYC',
                description: 'Know Your Customer verification',
            },
            {
                name: 'KYC Admin',
                description: 'Admin endpoints for KYC management',
            },
        ],
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // Path to the API docs
};

export const specs = swaggerJsdoc(options);
