import axios from 'axios';
import {config} from '../config/env';
import {logger} from '../utils/logger';

export interface CarrierInfo {
    country_code: string | null;
    network_name: string | null;
    network_code: number | null;
}

/**
 * Enrich carrier information for a given phone number using the Munywele API.
 *
 * @param phoneNumber The phone number to look up (e.g., +254720123456)
 * @returns CarrierInfo or null if lookup fails
 */
export async function enrichCarrierInfo(phoneNumber: string): Promise<CarrierInfo | null> {
    const url = `${config.fuelrod_api}/v1/map-network`

    try {

        logger.info(`Sending request to ${url} for ${phoneNumber}`);

        const response = await axios.post(url, {phone_number: phoneNumber}, {timeout: 5000});

        const data = response.data.data;

        return {
            country_code: data.country_code ?? null,
            network_name: data.network_name ?? null,
            network_code: data.network_code ?? 0,
        };
    } catch (error: any) {
        if (error.response) {
            logger.error(`API error:  ${error} url ${url} response ${error.response.data} status ${error.response.status} headers ${error.response.headers}`);
        } else {
            logger.error(`Request error: ${error.message} url ${url}`);
        }
        return null;
    }
}
