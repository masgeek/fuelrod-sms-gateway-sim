import {OpenApiGeneratorV3} from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import {Express} from 'express';
import {registry} from './openapi';

const generator = new OpenApiGeneratorV3(registry.definitions);

const spec = generator.generateDocument({
    openapi: '3.0.3',
    info: {
        title: 'FuelRod SMS Gateway Simulator',
        version: '1.0.0',
        description: 'Mock SMS gateway that accepts send requests, stores them in SQLite, and fires async callbacks with randomized delivery statuses.',
    },
    servers: [
        {url: '/', description: 'Current server'},
    ],
});

export function mountDocs(app: Express): void {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
        customSiteTitle: 'FuelRod SMS Gateway API',
    }));

    app.get('/api/docs.json', (_req, res) => {
        res.json(spec);
    });
}
