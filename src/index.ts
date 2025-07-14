import {config} from './config/env'
import app from './app'

app.listen(config.port, () => {
    console.log(`🚀 Running at http://127.0.0.1:${config.port}/api/v1 [${config.env}]`);
});

